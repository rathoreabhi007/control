"""
Control Runner Module
Main execution function for control tasks
Stateless design for Gunicorn compatibility
"""

import uuid
import logging
import os
import socket
import threading
import asyncio
from datetime import datetime
from typing import Dict, Any, Optional, Tuple
from pathlib import Path

from .task_persistence import TaskPersistence
from .subprocess_manager import ControlSubprocessManager
from .log_manager import ControlLogManager
from .task_validator import ControlTaskValidator

# Configure logging
logger = logging.getLogger(__name__)

class ControlTaskRunner:
    """Main control task execution system"""
    
    def __init__(self, task_storage_dir: Path = None, log_retention_days: int = 7):
        """
        Initialize control task runner
        
        Args:
            task_storage_dir: Directory for task storage
            log_retention_days: Days to retain logs
        """
        # Use absolute path to project root to ensure consistency regardless of working directory
        PROJECT_ROOT = Path(__file__).parent.parent.parent
        self.task_storage_dir = task_storage_dir or PROJECT_ROOT / "task_storage"
        self.log_retention_days = log_retention_days
        
        # Initialize components
        self.task_persistence = TaskPersistence()
        self.log_manager = ControlLogManager(
            log_directory=self.task_storage_dir / "control_logs",
            retention_days=log_retention_days
        )
        self.validator = ControlTaskValidator()
        
        # Active subprocess managers (for monitoring)
        self.active_managers = {}
        self.manager_lock = threading.Lock()
        
        # WebSocket manager (lazy import to avoid circular dependencies)
        self._websocket_manager = None
    
    def _get_websocket_manager(self):
        """Lazy load WebSocket manager to avoid circular imports"""
        if self._websocket_manager is None:
            try:
                from routers.websocket import manager
                self._websocket_manager = manager
            except ImportError:
                # WebSocket not available, return None
                pass
        return self._websocket_manager
    
    def _broadcast_task_update(self, task_id: str, status_data: dict):
        """Broadcast task status update via WebSocket (non-blocking)"""
        manager = self._get_websocket_manager()
        if manager:
            try:
                # Run async broadcast in event loop
                loop = None
                try:
                    loop = asyncio.get_event_loop()
                except RuntimeError:
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                
                if loop.is_running():
                    # If loop is running, schedule the coroutine
                    asyncio.create_task(manager.broadcast_task_update(task_id, status_data))
                else:
                    # If loop is not running, run it
                    loop.run_until_complete(manager.broadcast_task_update(task_id, status_data))
            except Exception as e:
                logger.debug(f"Failed to broadcast WebSocket update: {e}")
    
    def _broadcast_runs_update(self):
        """Broadcast all runs update via WebSocket (non-blocking)"""
        manager = self._get_websocket_manager()
        if manager:
            try:
                # Get recent runs
                tasks = self.task_persistence.get_all_tasks(limit=50) or []
                enriched = []
                for t in tasks:
                    state = self.task_persistence.get_task_state(t.get("task_id"))
                    if state:
                        enriched.append({
                            "task_id": state.get("task_id"),
                            "control_id": state.get("control_name"),
                            "control_name": state.get("task_name") or state.get("control_name") or "Unknown",
                            "task_name": state.get("task_name"),
                            "status": state.get("status") or "unknown",
                            "run_env": state.get("run_env"),
                            "expected_run_date": state.get("expected_run_date"),
                            "subprocess_pid": state.get("subprocess_pid"),
                            "created_at": state.get("created_at"),
                            "updated_at": state.get("updated_at"),
                            "started_at": state.get("started_at"),
                            "ended_at": state.get("completed_at") or state.get("ended_at"),
                            "completed_at": state.get("completed_at") or state.get("ended_at"),
                            "return_code": state.get("return_code"),
                            "running_time": state.get("running_time"),
                            "log_file_path": state.get("log_file_path"),
                        })
                
                # Sort: running tasks first, then by updated_at desc
                def _sort_key(s):
                    try:
                        status = (s.get("status") or "").lower()
                        is_running = status in ["running", "started"]
                        updated_at = s.get("updated_at") or s.get("started_at") or ""
                        if is_running:
                            return (1, s.get("started_at") or updated_at)
                        else:
                            return (0, updated_at)
                    except Exception:
                        return (0, "")
                
                enriched.sort(key=_sort_key, reverse=True)
                runs_data = enriched[:50]
                
                # Run async broadcast in event loop
                loop = None
                try:
                    loop = asyncio.get_event_loop()
                except RuntimeError:
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                
                if loop.is_running():
                    asyncio.create_task(manager.broadcast_all_runs_update(runs_data))
                else:
                    loop.run_until_complete(manager.broadcast_all_runs_update(runs_data))
            except Exception as e:
                logger.debug(f"Failed to broadcast runs update: {e}")
    
    def run_control_task(self, control_params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run a control task (stateless execution)
        
        Args:
            control_params: Control task parameters
            
        Returns:
            Dict with task execution result
        """
        try:
            import time
            logger.info("=" * 80)
            logger.info("[DEBUG] run_control_task method called")
            logger.info(f"[DEBUG] Control params received: {control_params}")
            
            # Generate unique task ID
            task_id = str(uuid.uuid4())
            logger.info(f"[DEBUG] Generated task_id: {task_id}")
            
            logger.info(f"Starting control task {task_id}")
            logger.info(f"   Control: {control_params.get('control_name', 'Unknown')}")
            logger.info(f"   Environment: {control_params.get('run_env', 'Unknown')}")
            
            time.sleep(0.1)
            
            # Sanitize parameters
            sanitized_params = self.validator.sanitize_control_params(control_params)
            
            # Validate parameters
            is_valid, errors, warnings = self.validator.validate_control_params(sanitized_params)
            
            if not is_valid:
                error_msg = f"Parameter validation failed: {'; '.join(errors)}"
                logger.error(f"{error_msg}")
                
                # Log validation errors
                self.log_manager.log_error(task_id, error_msg, "\n".join(errors))
                
                return {
                    "task_id": task_id,
                    "status": "failed",
                    "error": error_msg,
                    "validation_errors": errors,
                    "validation_warnings": warnings
                }
            
            # Log warnings if any
            if warnings:
                logger.warning(f"Validation warnings for task {task_id}: {'; '.join(warnings)}")
            
            # Create initial task state
            # Include server tracking for multi-server environments
            try:
                server_hostname = socket.gethostname()
                server_ip = socket.gethostbyname(server_hostname)
            except Exception:
                server_hostname = "unknown"
                server_ip = "unknown"
            
            # Start with sanitized params to preserve all passed fields (like control_id, user_comment, etc.)
            task_state = sanitized_params.copy()
            
            # Update with system fields
            task_state.update({
                "task_id": task_id,
                "control_name": sanitized_params["control_name"],  # Ensure this is set
                "task_name": sanitized_params.get("task_name", ""),
                "run_env": sanitized_params["run_env"],
                "expected_run_date": sanitized_params["expected_run_date"],
                "python_script_path": sanitized_params["python_script_path"],
                "script_arguments": sanitized_params.get("script_arguments", []),
                "environment_variables": sanitized_params.get("environment_variables", {}),
                "schedule": sanitized_params.get("schedule"),
                "status": "started",
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
                "started_at": datetime.now().isoformat(),
                "worker_pid": os.getpid(),
                "subprocess_pid": None,
                "validation_warnings": warnings,
                # Server tracking for multi-server environments
                "server_hostname": server_hostname,
                "server_ip": server_ip,
                "server_id": os.environ.get("SERVER_ID", server_hostname),
            })
            
            # Save task state immediately
            if not self.task_persistence.save_task_state(task_id, task_state):
                error_msg = "Failed to save task state"
                logger.error(f"{error_msg}")
                return {
                    "task_id": task_id,
                    "status": "failed",
                    "error": error_msg
                }
            
            # Broadcast initial task state via WebSocket
            self._broadcast_task_update(task_id, task_state)
            self._broadcast_runs_update()
            
            # Log task start
            self.log_manager.log_task_start(task_id, sanitized_params)
            
            # Start subprocess in a separate thread (non-blocking)
            # Use daemon=False to ensure thread doesn't cause server shutdown issues
            subprocess_thread = threading.Thread(
                target=self._start_subprocess_async,
                args=(task_id, sanitized_params),
                daemon=False,  # Changed to False to prevent premature shutdown
                name=f"ControlTask-{task_id}"
            )
            subprocess_thread.start()
            
            logger.info(f"Control task {task_id} started successfully")
            
            return {
                "task_id": task_id,
                "status": "started",
                "control_name": sanitized_params["control_name"],
                "run_env": sanitized_params["run_env"],
                "validation_warnings": warnings,
                "message": "Task started successfully"
            }
            
        except Exception as e:
            error_msg = f"Error starting control task: {e}"
            logger.error(f"{error_msg}")
            
            # Try to log error if we have a task_id
            try:
                if 'task_id' in locals():
                    self.log_manager.log_error(task_id, error_msg)
            except:
                pass
            
            return {
                "task_id": task_id if 'task_id' in locals() else None,
                "status": "failed",
                "error": error_msg
            }
    
    def _start_subprocess_async(self, task_id: str, control_params: Dict[str, Any]):
        """
        Start subprocess asynchronously (runs in separate thread)
        
        Args:
            task_id: Unique task identifier
            control_params: Control task parameters
        """
        subprocess_manager = None
        
        try:
            import time
            logger.info(f"[DEBUG] _start_subprocess_async called for task {task_id}")
            logger.info(f"[DEBUG] Control params: {control_params}")
            
            time.sleep(0.1)  # Small delay
            
            logger.info(f"[DEBUG] Step 1: Creating subprocess manager...")
            # Create subprocess manager
            subprocess_manager = ControlSubprocessManager(
                task_id=task_id,
                log_directory=self.task_storage_dir / "control_logs"
            )
            logger.info(f"[DEBUG] Step 2: Subprocess manager created")
            
            time.sleep(0.1)
            
            logger.info(f"[DEBUG] Step 3: Storing manager in active_managers...")
            # Store manager for monitoring
            with self.manager_lock:
                self.active_managers[task_id] = subprocess_manager
            logger.info(f"[DEBUG] Step 4: Manager stored")
            
            time.sleep(0.1)
            
            logger.info(f"[DEBUG] Step 5: About to call start_python_script...")
            logger.info(f"[DEBUG] Script path: {control_params.get('python_script_path')}")
            logger.info(f"[DEBUG] Script arguments: {control_params.get('script_arguments', [])}")
            logger.info(f"[DEBUG] Environment variables: {control_params.get('environment_variables', {})}")
            
            # Start Python script
            subprocess_pid, log_file_path = subprocess_manager.start_python_script(
                script_path=control_params["python_script_path"],
                script_arguments=control_params.get("script_arguments", []),
                environment_variables=control_params.get("environment_variables", {}),
                timeout=3600  # 1 hour timeout
            )
            
            logger.info(f"[DEBUG] Step 6: start_python_script returned successfully")
            logger.info(f"[DEBUG] Subprocess PID: {subprocess_pid}")
            logger.info(f"[DEBUG] Log file path: {log_file_path}")
            
            time.sleep(0.2)  # Give subprocess time to initialize
            
            logger.info(f"[DEBUG] Step 7: Updating task status to 'running'...")
            # Update task state with subprocess PID
            status_update = {
                "subprocess_pid": subprocess_pid,
                "log_file_path": log_file_path,
                "started_at": datetime.now().isoformat()
            }
            self.task_persistence.update_task_status(
                task_id, 
                "running", 
                status_update
            )
            logger.info(f"[DEBUG] Step 8: Task status updated")
            
            # Broadcast WebSocket update
            task_state = self.task_persistence.get_task_state(task_id)
            if task_state:
                self._broadcast_task_update(task_id, task_state)
            self._broadcast_runs_update()
            
            logger.info(f"Subprocess started for task {task_id} with PID: {subprocess_pid}")
            
            time.sleep(0.2)
            
            logger.info(f"[DEBUG] Step 9: About to start monitoring subprocess...")
            # Monitor subprocess (blocking call)
            self._monitor_subprocess(task_id, subprocess_manager)
            
        except KeyboardInterrupt:
            # Handle keyboard interrupt gracefully - don't crash the server
            logger.warning(f"Keyboard interrupt in subprocess thread for task {task_id}")
            try:
                status_update = {
                    "error": "Subprocess execution interrupted",
                    "stopped_at": datetime.now().isoformat()
                }
                # Update and get the updated task state (fixes race condition)
                task_state = self.task_persistence.update_task_status(
                    task_id,
                    "stopped",
                    status_update
                )
                # Broadcast WebSocket update with the updated task state
                if task_state:
                    self._broadcast_task_update(task_id, task_state)
                else:
                    # Fallback: try to get from disk if update failed
                    task_state = self.task_persistence.get_task_state(task_id)
                    if task_state:
                        self._broadcast_task_update(task_id, task_state)
                self._broadcast_runs_update()
            except Exception:
                pass  # Ignore errors during shutdown
        except Exception as e:
            error_msg = f"Error in subprocess execution: {e}"
            logger.error(f"{error_msg}")
            
            # Update task status to failed
            try:
                self.task_persistence.update_task_status(
                    task_id, 
                    "failed", 
                    {
                        "error": error_msg,
                        "failed_at": datetime.now().isoformat()
                    }
                )
            except Exception as update_error:
                logger.error(f"Failed to update task status: {update_error}")
            
            # Log error
            try:
                self.log_manager.log_error(task_id, error_msg)
            except Exception:
                pass  # Ignore logging errors
            
        finally:
            # Clean up manager
            if subprocess_manager:
                subprocess_manager.cleanup()
            
            with self.manager_lock:
                if task_id in self.active_managers:
                    del self.active_managers[task_id]
    
    def _monitor_subprocess(self, task_id: str, subprocess_manager: ControlSubprocessManager):
        """
        Monitor subprocess execution
        
        Args:
            task_id: Unique task identifier
            subprocess_manager: Subprocess manager instance
        """
        try:
            # Wait for process to complete (with timeout handling)
            # Use a timeout to prevent indefinite blocking
            try:
                # Poll the process instead of blocking wait to allow for better error handling
                import time
                max_wait_time = 3600 * 24  # 24 hours max
                start_wait = time.time()
                
                while True:
                    return_code = subprocess_manager.process.poll()
                    if return_code is not None:
                        # Process has finished
                        break
                    
                    # Check for timeout
                    if time.time() - start_wait > max_wait_time:
                        logger.warning(f"Process monitoring timeout for task {task_id}")
                        subprocess_manager.process.kill()
                        break
                    
                    # Sleep briefly before checking again
                    time.sleep(1)
                
                # Process has finished, get return code
                subprocess_manager.process.wait()
            except KeyboardInterrupt:
                # If interrupted, mark task as stopped but don't crash
                logger.warning(f"Monitoring interrupted for task {task_id}")
                # Update status (return value not needed here as we're returning immediately)
                self.task_persistence.update_task_status(
                    task_id,
                    "stopped",
                    {
                        "error": "Process monitoring was interrupted",
                        "stopped_at": datetime.now().isoformat()
                    }
                )
                return
            except Exception as wait_error:
                # Handle any errors during process.wait()
                logger.error(f"Error waiting for process in task {task_id}: {wait_error}", exc_info=True)
                # Try to get status anyway
                try:
                    subprocess_manager.process.poll()
                except:
                    pass
            
            # Get final status
            process_status = subprocess_manager.get_process_status()
            final_status = process_status["status"]
            
            # Update task state
            status_update = {
                "completed_at": datetime.now().isoformat(),
                "return_code": process_status["return_code"],
                "running_time": process_status["running_time"]
            }
            # Update and get the updated task state (fixes race condition where disk read might return stale data)
            task_state = self.task_persistence.update_task_status(
                task_id,
                final_status,
                status_update
            )
            
            # Broadcast WebSocket update with the updated task state
            if task_state:
                logger.info(f"Broadcasting task {task_id} completion with status: {task_state.get('status')}")
                self._broadcast_task_update(task_id, task_state)
            else:
                logger.warning(f"Failed to update task {task_id} status, trying to get from disk")
                # Fallback: try to get from disk if update failed
                task_state = self.task_persistence.get_task_state(task_id)
                if task_state:
                    self._broadcast_task_update(task_id, task_state)
            self._broadcast_runs_update()
            
            # Log task completion
            self.log_manager.log_task_end(
                task_id, 
                final_status,
                {
                    "return_code": process_status["return_code"],
                    "running_time": process_status["running_time"]
                }
            )
            
            # Close log file handles if they're still open
            if hasattr(subprocess_manager, 'subprocess_log_file') and subprocess_manager.subprocess_log_file:
                try:
                    if not subprocess_manager.subprocess_log_file.closed:
                        subprocess_manager.subprocess_log_file.close()
                except Exception as e:
                    logger.warning(f"Error closing subprocess log file: {e}")
            
            if hasattr(subprocess_manager, 'execution_log_file') and subprocess_manager.execution_log_file:
                try:
                    if not subprocess_manager.execution_log_file.closed:
                        subprocess_manager.execution_log_file.close()
                except Exception as e:
                    logger.warning(f"Error closing execution log file: {e}")
            
            logger.info(f"Task {task_id} completed with status: {final_status}")
            
        except KeyboardInterrupt:
            # Handle keyboard interrupt gracefully - don't crash the server
            logger.warning(f"Keyboard interrupt in monitoring thread for task {task_id}")
            try:
                status_update = {
                    "error": "Task monitoring interrupted",
                    "stopped_at": datetime.now().isoformat()
                }
                # Update and get the updated task state (fixes race condition)
                task_state = self.task_persistence.update_task_status(
                    task_id,
                    "stopped",
                    status_update
                )
                # Broadcast WebSocket update with the updated task state
                if task_state:
                    self._broadcast_task_update(task_id, task_state)
                else:
                    # Fallback: try to get from disk if update failed
                    task_state = self.task_persistence.get_task_state(task_id)
                    if task_state:
                        self._broadcast_task_update(task_id, task_state)
                self._broadcast_runs_update()
            except Exception:
                pass  # Ignore errors during shutdown
            return
        except Exception as e:
            error_msg = f"Error monitoring subprocess: {e}"
            logger.error(f"{error_msg}")
            
            # Update task status to failed
            try:
                self.task_persistence.update_task_status(
                    task_id, 
                    "failed", 
                    {
                        "error": error_msg,
                        "failed_at": datetime.now().isoformat()
                    }
                )
            except Exception as update_error:
                logger.error(f"Failed to update task status: {update_error}")
    
    def stop_control_task(self, task_id: str, force: bool = False) -> Dict[str, Any]:
        """
        Stop a running control task
        
        Args:
            task_id: Unique task identifier
            force: If True, force kill the process
            
        Returns:
            Dict with stop result
        """
        try:
            logger.info(f"Stopping control task {task_id} (force={force})")
            
            # Get current task state
            task_state = self.task_persistence.get_task_state(task_id)
            if not task_state:
                return {
                    "task_id": task_id,
                    "status": "not_found",
                    "error": "Task not found"
                }
            
            current_status = task_state.get("status", "unknown")
            
            # Check if task is running
            if current_status not in ["started", "running"]:
                return {
                    "task_id": task_id,
                    "status": "not_running",
                    "current_status": current_status,
                    "message": f"Task is not running (current status: {current_status})"
                }
            
            # Try to stop via active manager first
            subprocess_manager = None
            with self.manager_lock:
                subprocess_manager = self.active_managers.get(task_id)
            
            if subprocess_manager:
                # Stop via manager
                success = subprocess_manager.stop_process(force=force)
            else:
                # Try to stop by PID
                subprocess_pid = task_state.get("subprocess_pid")
                if subprocess_pid:
                    success = self._stop_process_by_pid(subprocess_pid, force=force)
                else:
                    success = False
            
            # Update task status
            final_status = "stopped" if success else "stop_failed"
            status_update = {
                "stopped_at": datetime.now().isoformat(),
                "force_stop": force,
                "stop_success": success
            }
            self.task_persistence.update_task_status(
                task_id,
                final_status,
                status_update
            )
            
            # Broadcast WebSocket update
            task_state = self.task_persistence.get_task_state(task_id)
            if task_state:
                self._broadcast_task_update(task_id, task_state)
            self._broadcast_runs_update()
            
            # Log task end
            self.log_manager.log_task_end(
                task_id, 
                final_status,
                {
                    "force_stop": force,
                    "stop_success": success
                }
            )
            
            if success:
                logger.info(f"Successfully stopped task {task_id}")
                return {
                    "task_id": task_id,
                    "status": "stopped",
                    "message": "Task stopped successfully"
                }
            else:
                logger.warning(f"Failed to stop task {task_id}")
                return {
                    "task_id": task_id,
                    "status": "stop_failed",
                    "error": "Failed to stop the process"
                }
            
        except Exception as e:
            error_msg = f"Error stopping control task: {e}"
            logger.error(f"{error_msg}")
            
            return {
                "task_id": task_id,
                "status": "error",
                "error": error_msg
            }
    
    def _stop_process_by_pid(self, pid: int, force: bool = False) -> bool:
        """
        Stop process by PID
        
        Args:
            pid: Process ID
            force: If True, force kill the process
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            import signal
            
            if force:
                os.kill(pid, signal.SIGKILL)
            else:
                os.kill(pid, signal.SIGTERM)
            
            return True
            
        except ProcessLookupError:
            # Process already dead
            return True
        except Exception as e:
            logger.warning(f"Error stopping process {pid}: {e}")
            return False
    
    def get_task_status(self, task_id: str) -> Dict[str, Any]:
        """
        Get task status
        
        Args:
            task_id: Unique task identifier
            
        Returns:
            Dict with task status
        """
        try:
            # Get task state from file
            # The subprocess updates its own status in the JSON file,
            # so we just return the file-based status (multi-server compatible)
            task_state = self.task_persistence.get_task_state(task_id)
            if not task_state:
                return {
                    "task_id": task_id,
                    "status": "not_found",
                    "error": "Task not found"
                }
            
            # NOTE: We no longer check subprocess_pid here because:
            # 1. The subprocess writes its own status to the JSON file
            # 2. PID checking only works on the local server, not multi-server
            # 3. The file-based status is the source of truth
            
            return task_state
            
        except Exception as e:
            error_msg = f"Error getting task status: {e}"
            logger.error(f"{error_msg}")
            
            return {
                "task_id": task_id,
                "status": "error",
                "error": error_msg
            }
    
    def get_task_logs(self, task_id: str, log_type: str = "execution", lines: int = 100) -> Dict[str, Any]:
        """
        Get task logs
        
        Args:
            task_id: Unique task identifier
            log_type: Type of log to retrieve
            lines: Number of recent lines to return
            
        Returns:
            Dict with log content
        """
        try:
            # Check if task exists
            task_state = self.task_persistence.get_task_state(task_id)
            if not task_state:
                # Return proper structure with all required fields for Pydantic model
                return {
                    "task_id": task_id,
                    "log_type": log_type,
                    "log_content": "",
                    "lines_requested": lines,
                    "retrieved_at": datetime.now().isoformat(),
                    "error": "Task not found"
                }
            
            # Get log content
            log_content = self.log_manager.get_log_content(task_id, log_type, lines)
            
            return {
                "task_id": task_id,
                "log_type": log_type,
                "log_content": log_content,
                "lines_requested": lines,
                "retrieved_at": datetime.now().isoformat()
            }
            
        except Exception as e:
            error_msg = f"Error getting task logs: {e}"
            logger.error(f"{error_msg}")
            
            # Return proper structure with all required fields for Pydantic model
            return {
                "task_id": task_id,
                "log_type": log_type,
                "log_content": "",
                "lines_requested": lines,
                "retrieved_at": datetime.now().isoformat(),
                "error": error_msg
            }
    
    def check_all_running_tasks(self) -> Dict[str, Any]:
        """
        Check all running tasks and update stale ones.
        
        FILE-BASED STATUS: The subprocess writes its own status to the JSON file
        when it completes or fails. We trust the file status as the source of truth.
        
        This function is now only used as a safety net to detect stale/orphaned tasks:
        - If a task is still marked as "running" but hasn't been updated in a long time,
          it may have crashed before writing its status. We default such tasks to "failed".
        
        Returns:
            Dict with number of stale tasks updated
        """
        try:
            tasks_updated = 0
            current_hostname = socket.gethostname()
            
            # Stale timeout: If task hasn't updated in 24 hours, consider it crashed
            stale_timeout_hours = 24
            stale_cutoff = datetime.now().timestamp() - (stale_timeout_hours * 60 * 60)
            
            # Get all tasks
            all_tasks = self.task_persistence.get_all_tasks(limit=10000) or []
            
            # Check each task that's marked as running
            for task_info in all_tasks:
                task_id = task_info.get("task_id")
                status = task_info.get("status", "").lower()
                
                # Only check tasks that are running or started
                if status not in ["running", "started"]:
                    continue
                
                # Get full task state
                task_state = self.task_persistence.get_task_state(task_id)
                if not task_state:
                    continue
                
                # FILE-BASED CHECK: The subprocess writes its own status.
                # If status is still "running", check if task is stale (no update for too long)
                updated_at_str = task_state.get("updated_at", "")
                if updated_at_str:
                    try:
                        updated_at = datetime.fromisoformat(updated_at_str).timestamp()
                        if updated_at > stale_cutoff:
                            # Task was updated recently, still running - skip
                            continue
                    except (ValueError, TypeError):
                        pass  # If we can't parse, check anyway
                
                # Task is stale (no update for 24+ hours while still "running")
                # The subprocess likely crashed before writing status - mark as failed
                logger.warning(f"Stale task detected: {task_id} (status: {status}, last update: {updated_at_str})")
                
                # Update task state - default to "failed" for crashed subprocess
                status_update = {
                    "status": "failed",
                    "failed_at": datetime.now().isoformat(),
                    "error": "Task marked as failed - subprocess did not update status (possible crash)",
                    "auto_detected_failure": True,
                    "detected_by_server": current_hostname
                }
                
                updated_state = self.task_persistence.update_task_status(
                    task_id,
                    "failed",
                    status_update
                )
                
                if updated_state:
                    tasks_updated += 1
                    # Broadcast WebSocket update
                    self._broadcast_task_update(task_id, updated_state)
                    
                    # Log task failure
                    self.log_manager.log_task_end(
                        task_id,
                        "failed",
                        {
                            "error": "Stale task - subprocess crashed",
                            "auto_detected": True
                        }
                    )
                    
                    logger.info(f"Marked stale task {task_id} as failed")
            
            # Broadcast runs update if any tasks were updated
            if tasks_updated > 0:
                self._broadcast_runs_update()
            
            return {
                "stale_tasks_updated": tasks_updated,
                "checked_at": datetime.now().isoformat(),
                "checked_by_server": current_hostname,
                "stale_timeout_hours": stale_timeout_hours
            }
            
        except Exception as e:
            logger.error(f"Error checking running tasks: {e}", exc_info=True)
            return {
                "stale_tasks_updated": 0,
                "error": str(e),
                "checked_at": datetime.now().isoformat()
            }
    
    def cleanup_old_tasks(self) -> Dict[str, Any]:
        """
        Clean up old completed tasks and logs
        
        Returns:
            Dict with cleanup statistics
        """
        try:
            # Clean up task files
            task_cleanup = self.task_persistence.cleanup_old_tasks(self.log_retention_days)
            
            # Clean up logs
            log_cleanup = self.log_manager.cleanup_old_logs()
            
            return {
                "task_cleanup": task_cleanup,
                "log_cleanup": log_cleanup,
                "cleanup_time": datetime.now().isoformat()
            }
            
        except Exception as e:
            error_msg = f"Error during cleanup: {e}"
            logger.error(f"{error_msg}")
            
            return {
                "error": error_msg
            }


# Global instance for API use
control_runner = ControlTaskRunner()
