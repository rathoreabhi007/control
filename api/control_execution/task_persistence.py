"""
Task Persistence Module
File-based task state management for Gunicorn compatibility
All task state is persisted to files to ensure worker-agnostic operation
"""

import json
import os
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List
import glob
import time

# Configure logging
logger = logging.getLogger(__name__)

# Task storage configuration
# Use absolute path to project root to ensure consistency regardless of working directory
PROJECT_ROOT = Path(__file__).parent.parent.parent
TASK_STORAGE_DIR = PROJECT_ROOT / "task_storage"
CONTROL_TASKS_DIR = TASK_STORAGE_DIR / "control_tasks"
CONTROL_LOGS_DIR = TASK_STORAGE_DIR / "control_logs"

# Ensure directories exist
CONTROL_TASKS_DIR.mkdir(parents=True, exist_ok=True)
CONTROL_LOGS_DIR.mkdir(parents=True, exist_ok=True)

class TaskPersistence:
    """File-based task state management for stateless operation"""
    
    @staticmethod
    def save_task_state(task_id: str, task_state: Dict[str, Any]) -> bool:
        """
        Save task state to file (atomic operation)
        
        Args:
            task_id: Unique task identifier
            task_state: Task state dictionary
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            state_file = CONTROL_TASKS_DIR / f"{task_id}.json"
            temp_file = state_file.with_suffix('.tmp')
            
            # Add timestamp
            task_state["updated_at"] = datetime.now().isoformat()
            
            # Write to temporary file first (atomic operation)
            with open(temp_file, 'w') as f:
                json.dump(task_state, f, indent=2, default=str)
            
            # Atomic move to final location (handle Windows file exists error)
            try:
                if state_file.exists():
                    state_file.unlink()  # Remove existing file on Windows
                temp_file.rename(state_file)
            except OSError:
                # Fallback: use replace for cross-platform compatibility
                temp_file.replace(state_file)
            
            logger.debug(f"Saved task state for {task_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error saving task state for {task_id}: {e}")
            # Clean up temp file if it exists
            if temp_file.exists():
                temp_file.unlink()
            return False
    
    @staticmethod
    def get_task_state(task_id: str) -> Optional[Dict[str, Any]]:
        """
        Get task state from file
        
        Args:
            task_id: Unique task identifier
            
        Returns:
            Dict containing task state or None if not found
        """
        try:
            state_file = CONTROL_TASKS_DIR / f"{task_id}.json"
            if not state_file.exists():
                return None
            
            with open(state_file, 'r') as f:
                task_state = json.load(f)
            
            logger.debug(f"Loaded task state for {task_id}")
            return task_state
            
        except Exception as e:
            logger.error(f"Error loading task state for {task_id}: {e}")
            return None
    
    @staticmethod
    def update_task_status(task_id: str, status: str, additional_data: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        """
        Update task status (atomic operation)
        
        Args:
            task_id: Unique task identifier
            status: New status
            additional_data: Additional data to update
            
        Returns:
            Updated task state dict if successful, None otherwise
        """
        try:
            task_state = TaskPersistence.get_task_state(task_id)
            if not task_state:
                logger.warning(f"Task {task_id} not found for status update")
                return None
            
            # Update status and additional data
            task_state["status"] = status
            task_state["updated_at"] = datetime.now().isoformat()
            
            if additional_data:
                task_state.update(additional_data)
            
            # Save updated state
            if TaskPersistence.save_task_state(task_id, task_state):
                return task_state
            else:
                return None
            
        except Exception as e:
            logger.error(f"Error updating task status for {task_id}: {e}")
            return None
    
    @staticmethod
    def get_all_tasks(limit: int = 100) -> List[Dict[str, Any]]:
        """
        Get all control tasks with optional limit
        
        Args:
            limit: Maximum number of tasks to return
            
        Returns:
            List of task states
        """
        try:
            tasks = []
            task_files = list(CONTROL_TASKS_DIR.glob("*.json"))
            
            # Sort by modification time (newest first)
            task_files.sort(key=lambda x: x.stat().st_mtime, reverse=True)
            
            for task_file in task_files[:limit]:
                try:
                    with open(task_file, 'r') as f:
                        task_state = json.load(f)
                        # Return only essential info for listing
                        tasks.append({
                            "task_id": task_state.get("task_id"),
                            "control_name": task_state.get("control_name"),
                            "task_name": task_state.get("task_name"),
                            "control_id": task_state.get("control_id"),  # Important for display
                            "control_ids": task_state.get("control_ids"),
                            "user_comment": task_state.get("user_comment"),
                            "auto_flag": task_state.get("auto_flag"),
                            "status": task_state.get("status"),
                            "run_env": task_state.get("run_env"),
                            "expected_run_date": task_state.get("expected_run_date"),
                            "created_at": task_state.get("created_at"),
                            "updated_at": task_state.get("updated_at"),
                            "subprocess_pid": task_state.get("subprocess_pid")
                        })
                except Exception as e:
                    logger.warning(f"Error reading task file {task_file}: {e}")
            
            logger.debug(f"Retrieved {len(tasks)} control tasks")
            return tasks
            
        except Exception as e:
            logger.error(f"Error getting all tasks: {e}")
            return []
    
    @staticmethod
    def delete_task(task_id: str) -> bool:
        """
        Delete task state and logs
        
        Args:
            task_id: Unique task identifier
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            # Delete task state file
            state_file = CONTROL_TASKS_DIR / f"{task_id}.json"
            if state_file.exists():
                state_file.unlink()
            
            # Delete log files
            log_files = [
                CONTROL_LOGS_DIR / f"{task_id}_execution.log",
                CONTROL_LOGS_DIR / f"{task_id}_subprocess.log",
                CONTROL_LOGS_DIR / f"{task_id}_error.log"
            ]
            
            for log_file in log_files:
                if log_file.exists():
                    log_file.unlink()
            
            logger.info(f"Deleted task {task_id} and associated files")
            return True
            
        except Exception as e:
            logger.error(f"Error deleting task {task_id}: {e}")
            return False
    
    @staticmethod
    def cleanup_old_tasks(retention_days: int = 7) -> Dict[str, Any]:
        """
        Clean up old completed tasks and logs
        
        Args:
            retention_days: Number of days to retain tasks
            
        Returns:
            Dict with cleanup statistics
        """
        try:
            cutoff_time = time.time() - (retention_days * 24 * 60 * 60)
            cleaned_tasks = []
            cleaned_logs = []
            
            # Clean up task files
            for task_file in CONTROL_TASKS_DIR.glob("*.json"):
                try:
                    file_mtime = task_file.stat().st_mtime
                    if file_mtime < cutoff_time:
                        task_id = task_file.stem
                        task_state = TaskPersistence.get_task_state(task_id)
                        
                        # Only clean up completed/failed tasks
                        if task_state and task_state.get("status") in ["completed", "failed", "stopped"]:
                            TaskPersistence.delete_task(task_id)
                            cleaned_tasks.append(task_id)
                            
                except Exception as e:
                    logger.warning(f"Error processing task file {task_file}: {e}")
            
            # Clean up orphaned log files
            for log_file in CONTROL_LOGS_DIR.glob("*.log"):
                try:
                    file_mtime = log_file.stat().st_mtime
                    if file_mtime < cutoff_time:
                        log_file.unlink()
                        cleaned_logs.append(log_file.name)
                        
                except Exception as e:
                    logger.warning(f"Error processing log file {log_file}: {e}")
            
            result = {
                "tasks_cleaned": len(cleaned_tasks),
                "logs_cleaned": len(cleaned_logs),
                "cleaned_task_ids": cleaned_tasks,
                "cleaned_log_files": cleaned_logs,
                "cleanup_time": datetime.now().isoformat()
            }
            
            logger.info(f"Cleanup completed: {len(cleaned_tasks)} tasks, {len(cleaned_logs)} logs")
            return result
            
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")
            return {"error": str(e)}
    
    @staticmethod
    def get_task_statistics() -> Dict[str, Any]:
        """
        Get statistics about control tasks
        
        Returns:
            Dict with task statistics
        """
        try:
            total_tasks = 0
            running_tasks = 0
            completed_tasks = 0
            failed_tasks = 0
            stopped_tasks = 0
            
            for task_file in CONTROL_TASKS_DIR.glob("*.json"):
                try:
                    with open(task_file, 'r') as f:
                        task_state = json.load(f)
                        total_tasks += 1
                        status = task_state.get("status", "unknown")
                        
                        if status == "running":
                            running_tasks += 1
                        elif status == "completed":
                            completed_tasks += 1
                        elif status == "failed":
                            failed_tasks += 1
                        elif status == "stopped":
                            stopped_tasks += 1
                            
                except Exception as e:
                    logger.warning(f"Error reading task file {task_file}: {e}")
            
            return {
                "total_tasks": total_tasks,
                "running_tasks": running_tasks,
                "completed_tasks": completed_tasks,
                "failed_tasks": failed_tasks,
                "stopped_tasks": stopped_tasks,
                "storage_directory": str(CONTROL_TASKS_DIR),
                "logs_directory": str(CONTROL_LOGS_DIR)
            }
            
        except Exception as e:
            logger.error(f"Error getting task statistics: {e}")
            return {"error": str(e)}
