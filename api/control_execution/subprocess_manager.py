"""
Subprocess Manager Module
External subprocess handling for Python control tasks
Designed for Gunicorn compatibility - subprocesses are independent of workers
"""

import subprocess
import os
import signal
import sys
import logging
import time
import threading
from typing import Dict, Any, Optional, Tuple
from pathlib import Path
from datetime import datetime

# Configure logging
logger = logging.getLogger(__name__)

class ControlSubprocessManager:
    """Manages external Python subprocess execution for control tasks"""
    
    def __init__(self, task_id: str, log_directory: Path):
        """
        Initialize subprocess manager
        
        Args:
            task_id: Unique task identifier
            log_directory: Directory for log files
        """
        self.task_id = task_id
        self.log_directory = log_directory
        self.process = None
        self.start_time = None
        self.log_file = None
        
        # Ensure log directory exists
        self.log_directory.mkdir(parents=True, exist_ok=True)
    
    def start_python_script(self, 
                           script_path: str, 
                           script_arguments: list = None, 
                           environment_variables: dict = None,
                           timeout: int = 3600) -> Tuple[int, str]:
        """
        Start Python script in external subprocess with same environment as API
        
        Args:
            script_path: Path to Python script
            script_arguments: List of script arguments
            environment_variables: Environment variables for subprocess
            timeout: Process timeout in seconds (default: 1 hour)
            
        Returns:
            Tuple of (subprocess_pid, log_file_path)
        """
        try:
            # Resolve script path - handle relative paths
            if not os.path.isabs(script_path):
                # If relative path, resolve relative to project root (parent of api directory)
                project_root = Path(__file__).parent.parent.parent
                script_path = str(project_root / script_path)
            
            # Validate script path
            if not os.path.exists(script_path):
                raise FileNotFoundError(f"Script not found: {script_path}")
            
            # Prepare arguments
            if script_arguments is None:
                script_arguments = []
            
            # Create log file path in the 'subprocess' subdirectory (for stdout/stderr capture)
            # This matches the log_manager's expected structure
            subprocess_log_dir = self.log_directory / "subprocess"
            subprocess_log_dir.mkdir(parents=True, exist_ok=True)
            self.log_file = subprocess_log_dir / f"{self.task_id}_subprocess.log"
            
            # Also create a symlink/copy in execution directory for backward compatibility
            # The actual execution logs from generic_controller.py will be in subprocess log
            execution_log_dir = self.log_directory / "execution"
            execution_log_dir.mkdir(parents=True, exist_ok=True)
            execution_log_file = execution_log_dir / f"{self.task_id}_execution.log"
            
            # Prepare environment - inherit from current API process
            env = os.environ.copy()
            if environment_variables:
                env.update(environment_variables)
            
            # Add task-specific environment variables
            # Import CONTROL_TASKS_DIR to build task file path
            from .task_persistence import CONTROL_TASKS_DIR
            task_file_path = str(CONTROL_TASKS_DIR / f"{self.task_id}.json")
            
            env.update({
                "TASK_ID": self.task_id,
                "TASK_FILE_PATH": task_file_path,  # For subprocess to update its own status
                "TASK_START_TIME": datetime.now().isoformat(),
                "PYTHONUNBUFFERED": "1",  # Ensure real-time output
                "PYTHONPATH": os.environ.get("PYTHONPATH", ""),  # Inherit Python path
                "VIRTUAL_ENV": os.environ.get("VIRTUAL_ENV", ""),  # Inherit virtual env
                "CONDA_DEFAULT_ENV": os.environ.get("CONDA_DEFAULT_ENV", ""),  # Inherit conda env
                "CONDA_PREFIX": os.environ.get("CONDA_PREFIX", "")  # Inherit conda prefix
            })
            
            # Use the same Python executable as the current process
            python_executable = sys.executable
            cmd = [python_executable, script_path] + script_arguments
            
            logger.info(f"Starting subprocess for task {self.task_id}")
            logger.info(f"   Command: {' '.join(cmd)}")
            logger.info(f"   Python executable: {python_executable}")
            logger.info(f"   Subprocess log: {self.log_file}")
            logger.info(f"   Execution log: {execution_log_file}")
            logger.info(f"   Timeout: {timeout} seconds")
            logger.info(f"   Virtual env: {env.get('VIRTUAL_ENV', 'None')}")
            logger.info(f"   Conda env: {env.get('CONDA_DEFAULT_ENV', 'None')}")
            logger.info(f"   Python path: {env.get('PYTHONPATH', 'None')}")
            
            # Start subprocess - write to both subprocess and execution logs
            logger.info(f"[DEBUG] Step 1: About to open log files for task {self.task_id}")
            logger.info(f"[DEBUG] Subprocess log path: {self.log_file}")
            logger.info(f"[DEBUG] Execution log path: {execution_log_file}")
            
            # Open both log files for writing (keep them open while subprocess runs)
            try:
                logger.info(f"[DEBUG] Step 2: Opening subprocess log file...")
                subprocess_log_f = open(self.log_file, 'w', encoding='utf-8')
                logger.info(f"[DEBUG] Step 3: Subprocess log file opened successfully")
                
                logger.info(f"[DEBUG] Step 4: Opening execution log file...")
                execution_log_f = open(execution_log_file, 'w', encoding='utf-8')
                logger.info(f"[DEBUG] Step 5: Execution log file opened successfully")
                
                # Store file handles so they can be closed later
                self.subprocess_log_file = subprocess_log_f
                self.execution_log_file = execution_log_f
                logger.info(f"[DEBUG] Step 6: File handles stored in instance variables")
                
                time.sleep(0.1)  # Small delay to ensure files are ready
                
            except Exception as file_error:
                logger.error(f"[DEBUG] Error opening log files: {file_error}", exc_info=True)
                raise
            
            try:
                logger.info(f"[DEBUG] Step 7: Writing initial header to log files...")
                # Write initial log entry to both files
                initial_header = f"=== Control Task Execution Started ===\n"
                initial_header += f"Task ID: {self.task_id}\n"
                initial_header += f"Start Time: {datetime.now().isoformat()}\n"
                initial_header += f"Command: {' '.join(cmd)}\n"
                initial_header += f"Python Executable: {python_executable}\n"
                initial_header += f"Working Directory: {os.path.dirname(script_path)}\n"
                initial_header += f"Virtual Environment: {env.get('VIRTUAL_ENV', 'None')}\n"
                initial_header += f"Conda Environment: {env.get('CONDA_DEFAULT_ENV', 'None')}\n"
                initial_header += f"Python Path: {env.get('PYTHONPATH', 'None')}\n"
                initial_header += f"Custom Environment Variables: {environment_variables}\n"
                initial_header += "=" * 50 + "\n\n"
                
                subprocess_log_f.write(initial_header)
                execution_log_f.write(initial_header)
                subprocess_log_f.flush()
                execution_log_f.flush()
                logger.info(f"[DEBUG] Step 8: Initial header written and flushed")
                
                time.sleep(0.1)  # Small delay
                
                logger.info(f"[DEBUG] Step 9: About to start subprocess with Popen...")
                logger.info(f"[DEBUG] Command: {cmd}")
                logger.info(f"[DEBUG] Working directory: {os.path.dirname(script_path)}")
                
                # Start the subprocess with PIPE (can't use custom TeeWriter directly with Popen)
                # We'll use a thread to read from PIPE and write to both files
                # Important: Use creationflags on Windows to prevent subprocess from inheriting signals
                creation_flags = 0
                if sys.platform == 'win32':
                    # On Windows, use CREATE_NEW_PROCESS_GROUP to prevent signal propagation
                    import subprocess as sp
                    creation_flags = sp.CREATE_NEW_PROCESS_GROUP
                
                self.process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    env=env,
                    cwd=os.path.dirname(script_path),
                    bufsize=1,  # Line buffered
                    universal_newlines=True,
                    encoding='utf-8',
                    errors='replace',
                    creationflags=creation_flags if sys.platform == 'win32' else 0,
                    start_new_session=True if sys.platform != 'win32' else False  # New session on Unix to prevent signal propagation
                )
                
                logger.info(f"[DEBUG] Step 10: Subprocess.Popen completed, PID: {self.process.pid}")
                
                # Start a thread to read from subprocess stdout and write to both log files
                def write_to_both_files():
                    try:
                        logger.info(f"[DEBUG] Thread started: Reading from subprocess stdout...")
                        # Use iter with sentinel to handle EOF properly
                        for line in iter(self.process.stdout.readline, ''):
                            if not line:
                                break
                            try:
                                if subprocess_log_f and not subprocess_log_f.closed:
                                    subprocess_log_f.write(line)
                                    subprocess_log_f.flush()
                                if execution_log_f and not execution_log_f.closed:
                                    execution_log_f.write(line)
                                    execution_log_f.flush()
                            except Exception as write_err:
                                logger.error(f"[DEBUG] Error writing to log files: {write_err}")
                        
                        # Ensure stdout is fully read and closed
                        try:
                            if self.process.stdout:
                                self.process.stdout.close()
                        except:
                            pass
                        
                        logger.info(f"[DEBUG] Thread finished: Subprocess stdout closed")
                    except Exception as thread_err:
                        logger.error(f"[DEBUG] Error in write thread: {thread_err}", exc_info=True)
                    finally:
                        # Ensure log files are flushed
                        try:
                            if subprocess_log_f and not subprocess_log_f.closed:
                                subprocess_log_f.flush()
                            if execution_log_f and not execution_log_f.closed:
                                execution_log_f.flush()
                        except:
                            pass
                
                logger.info(f"[DEBUG] Step 11: Starting thread to write subprocess output to both files...")
                output_thread = threading.Thread(target=write_to_both_files, daemon=True)
                self.output_thread = output_thread  # Store reference for cleanup
                output_thread.start()
                logger.info(f"[DEBUG] Step 12: Output thread started")
                
                time.sleep(0.2)  # Give subprocess a moment to start
                
                self.start_time = time.time()
                subprocess_pid = self.process.pid
                
                logger.info(f"Subprocess started for task {self.task_id} with PID: {subprocess_pid}")
                logger.info(f"[DEBUG] Step 13: Process PID obtained: {subprocess_pid}")
                logger.info(f"[DEBUG] Step 14: About to return from start_python_script")
                
                # Return the execution log path (for backward compatibility and main log viewing)
                return subprocess_pid, str(execution_log_file)
                
            except Exception as e:
                logger.error(f"[DEBUG] Error in subprocess startup: {e}", exc_info=True)
                # Close files on error
                try:
                    if subprocess_log_f and not subprocess_log_f.closed:
                        subprocess_log_f.close()
                except Exception as close_err:
                    logger.error(f"[DEBUG] Error closing subprocess log: {close_err}")
                
                try:
                    if execution_log_f and not execution_log_f.closed:
                        execution_log_f.close()
                except Exception as close_err:
                    logger.error(f"[DEBUG] Error closing execution log: {close_err}")
                raise
            
        except Exception as e:
            logger.error(f"Error starting subprocess for task {self.task_id}: {e}")
            raise
    
    def is_process_running(self) -> bool:
        """
        Check if subprocess is still running
        
        Returns:
            bool: True if process is running, False otherwise
        """
        if self.process is None:
            return False
        
        try:
            # Check if process is still alive
            return self.process.poll() is None
        except Exception as e:
            logger.warning(f"Error checking process status for task {self.task_id}: {e}")
            return False
    
    def get_process_status(self) -> Dict[str, Any]:
        """
        Get current process status
        
        Returns:
            Dict with process status information
        """
        try:
            if self.process is None:
                return {
                    "status": "not_started",
                    "pid": None,
                    "return_code": None,
                    "running_time": 0
                }
            
            is_running = self.is_process_running()
            return_code = self.process.returncode
            running_time = time.time() - self.start_time if self.start_time else 0
            
            if is_running:
                status = "running"
            elif return_code == 0:
                status = "completed"
            else:
                status = "failed"
            
            return {
                "status": status,
                "pid": self.process.pid,
                "return_code": return_code,
                "running_time": running_time,
                "log_file": str(self.log_file) if self.log_file else None
            }
            
        except Exception as e:
            logger.error(f"Error getting process status for task {self.task_id}: {e}")
            return {
                "status": "error",
                "error": str(e),
                "pid": None,
                "return_code": None,
                "running_time": 0
            }
    
    def stop_process(self, force: bool = False) -> bool:
        """
        Stop the subprocess
        
        Args:
            force: If True, force kill the process
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            if self.process is None:
                logger.warning(f"No process to stop for task {self.task_id}")
                return False
            
            if not self.is_process_running():
                logger.info(f"ℹ️ Process for task {self.task_id} is not running")
                return True
            
            logger.info(f"Stopping process for task {self.task_id} (force={force})")
            
            if force:
                # Force kill
                self.process.kill()
                logger.info(f"Force killed process for task {self.task_id}")
            else:
                # Graceful termination
                self.process.terminate()
                
                # Wait for graceful termination
                try:
                    self.process.wait(timeout=30)  # Wait up to 30 seconds
                    logger.info(f"Gracefully terminated process for task {self.task_id}")
                except subprocess.TimeoutExpired:
                    # Force kill if graceful termination fails
                    self.process.kill()
                    logger.warning(f"Force killed process for task {self.task_id} after timeout")
            
            # Log the termination to both log files
            termination_msg = f"\n=== Process Terminated ===\n"
            termination_msg += f"Termination Time: {datetime.now().isoformat()}\n"
            termination_msg += f"Force Kill: {force}\n"
            termination_msg += f"Final Return Code: {self.process.returncode}\n"
            termination_msg += "=" * 30 + "\n"
            
            # Write to open file handles if available, otherwise append to files
            if self.subprocess_log_file and not self.subprocess_log_file.closed:
                try:
                    self.subprocess_log_file.write(termination_msg)
                    self.subprocess_log_file.flush()
                except Exception as e:
                    logger.warning(f"Error writing termination to subprocess log: {e}")
            elif self.log_file and self.log_file.exists():
                with open(self.log_file, 'a', encoding='utf-8') as f:
                    f.write(termination_msg)
            
            if self.execution_log_file and not self.execution_log_file.closed:
                try:
                    self.execution_log_file.write(termination_msg)
                    self.execution_log_file.flush()
                except Exception as e:
                    logger.warning(f"Error writing termination to execution log: {e}")
            else:
                execution_log_file = self.log_directory / "execution" / f"{self.task_id}_execution.log"
                if execution_log_file.exists():
                    with open(execution_log_file, 'a', encoding='utf-8') as f:
                        f.write(termination_msg)
            
            return True
            
        except Exception as e:
            logger.error(f"Error stopping process for task {self.task_id}: {e}")
            return False
    
    def get_log_content(self, lines: int = 100) -> str:
        """
        Get recent log content
        
        Args:
            lines: Number of recent lines to return
            
        Returns:
            String with recent log content
        """
        try:
            if not self.log_file or not self.log_file.exists():
                return "No log file available"
            
            # Read last N lines
            with open(self.log_file, 'r') as f:
                all_lines = f.readlines()
                recent_lines = all_lines[-lines:] if len(all_lines) > lines else all_lines
                return ''.join(recent_lines)
                
        except Exception as e:
            logger.error(f"Error reading log for task {self.task_id}: {e}")
            return f"Error reading log: {e}"
    
    def cleanup(self):
        """Clean up resources"""
        try:
            if self.process and self.is_process_running():
                logger.warning(f"Process still running during cleanup for task {self.task_id}")
                self.stop_process(force=True)
            
            # Close log file handles if they're still open
            if self.subprocess_log_file and not self.subprocess_log_file.closed:
                try:
                    self.subprocess_log_file.close()
                except Exception as e:
                    logger.warning(f"Error closing subprocess log file: {e}")
            
            if self.execution_log_file and not self.execution_log_file.closed:
                try:
                    self.execution_log_file.close()
                except Exception as e:
                    logger.warning(f"Error closing execution log file: {e}")
            
            self.process = None
            self.subprocess_log_file = None
            self.execution_log_file = None
            logger.debug(f"Cleaned up subprocess manager for task {self.task_id}")
            
        except Exception as e:
            logger.error(f"Error during cleanup for task {self.task_id}: {e}")


def check_process_by_pid(pid: int) -> bool:
    """
    Check if a process is running by PID
    
    Args:
        pid: Process ID to check
        
    Returns:
        bool: True if process is running, False otherwise
    """
    try:
        # Send signal 0 to check if process exists
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, PermissionError):
        return False
    except Exception as e:
        logger.warning(f"Error checking process {pid}: {e}")
        return False


def get_process_info_by_pid(pid: int) -> Dict[str, Any]:
    """
    Get process information by PID
    
    Args:
        pid: Process ID
        
    Returns:
        Dict with process information
    """
    try:
        if not check_process_by_pid(pid):
            return {
                "status": "not_found",
                "pid": pid,
                "return_code": None
            }
        
        # Try to get process info (platform specific)
        import psutil
        process = psutil.Process(pid)
        
        return {
            "status": "running",
            "pid": pid,
            "name": process.name(),
            "cmdline": process.cmdline(),
            "create_time": process.create_time(),
            "cpu_percent": process.cpu_percent(),
            "memory_info": process.memory_info()._asdict()
        }
        
    except ImportError:
        # psutil not available, use basic check
        return {
            "status": "running" if check_process_by_pid(pid) else "not_found",
            "pid": pid,
            "return_code": None
        }
    except Exception as e:
        logger.warning(f"Error getting process info for {pid}: {e}")
        return {
            "status": "error",
            "pid": pid,
            "error": str(e)
        }
