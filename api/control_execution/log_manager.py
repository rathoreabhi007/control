"""
Log Manager Module
Separate logging system for control task execution with 7-day retention
"""

import logging
import os
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Any, List, Optional
import glob
import gzip
import shutil

# Configure logging
logger = logging.getLogger(__name__)

class ControlLogManager:
    """Manages logging for control task execution with retention policies"""
    
    def __init__(self, log_directory: Path, retention_days: int = 7):
        """
        Initialize log manager
        
        Args:
            log_directory: Directory for control task logs
            retention_days: Number of days to retain logs (default: 7)
        """
        self.log_directory = log_directory
        self.retention_days = retention_days
        self.retention_seconds = retention_days * 24 * 60 * 60
        
        # Ensure log directory exists
        self.log_directory.mkdir(parents=True, exist_ok=True)
        
        # Setup log rotation
        self._setup_log_rotation()
    
    def _setup_log_rotation(self):
        """Setup log rotation configuration"""
        try:
            # Create subdirectories for different log types
            (self.log_directory / "execution").mkdir(exist_ok=True)
            (self.log_directory / "subprocess").mkdir(exist_ok=True)
            (self.log_directory / "error").mkdir(exist_ok=True)
            (self.log_directory / "audit").mkdir(exist_ok=True)
            (self.log_directory / "archived").mkdir(exist_ok=True)
            
            logger.info(f"Log manager initialized with {self.retention_days}-day retention")
            
        except Exception as e:
            logger.error(f"Error setting up log rotation: {e}")
    
    def get_log_file_path(self, task_id: str, log_type: str = "execution") -> Path:
        """
        Get log file path for a task
        
        Args:
            task_id: Unique task identifier
            log_type: Type of log (execution, subprocess, error, audit)
            
        Returns:
            Path to log file
        """
        return self.log_directory / log_type / f"{task_id}_{log_type}.log"
    
    def create_task_logger(self, task_id: str) -> logging.Logger:
        """
        Create a dedicated logger for a task
        
        Args:
            task_id: Unique task identifier
            
        Returns:
            Configured logger instance
        """
        try:
            # Create logger
            task_logger = logging.getLogger(f"control_task_{task_id}")
            task_logger.setLevel(logging.INFO)
            
            # Clear existing handlers
            task_logger.handlers.clear()
            
            # Create file handler for execution log
            execution_log = self.get_log_file_path(task_id, "execution")
            file_handler = logging.FileHandler(execution_log)
            file_handler.setLevel(logging.INFO)
            
            # Create formatter
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
                datefmt='%Y-%m-%d %H:%M:%S'
            )
            file_handler.setFormatter(formatter)
            
            # Add handler to logger
            task_logger.addHandler(file_handler)
            
            # Prevent propagation to root logger
            task_logger.propagate = False
            
            logger.debug(f"Created task logger for {task_id}")
            return task_logger
            
        except Exception as e:
            logger.error(f"Error creating task logger for {task_id}: {e}")
            return logging.getLogger(f"control_task_{task_id}_fallback")
    
    def log_task_start(self, task_id: str, control_params: Dict[str, Any]) -> bool:
        """
        Log task start information
        
        Args:
            task_id: Unique task identifier
            control_params: Task parameters
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            audit_log = self.get_log_file_path(task_id, "audit")
            
            with open(audit_log, 'w') as f:
                f.write("=== Control Task Audit Log ===\n")
                f.write(f"Task ID: {task_id}\n")
                f.write(f"Start Time: {datetime.now().isoformat()}\n")
                f.write(f"Control Name: {control_params.get('control_name', 'Unknown')}\n")
                f.write(f"Run Environment: {control_params.get('run_env', 'Unknown')}\n")
                f.write(f"Expected Run Date: {control_params.get('expected_run_date', 'Unknown')}\n")
                f.write(f"Python Script: {control_params.get('python_script_path', 'Unknown')}\n")
                f.write(f"Script Arguments: {control_params.get('script_arguments', [])}\n")
                f.write(f"Environment Variables: {control_params.get('environment_variables', {})}\n")
                f.write("=" * 40 + "\n\n")
            
            logger.info(f"Logged task start for {task_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error logging task start for {task_id}: {e}")
            return False
    
    def log_task_end(self, task_id: str, status: str, additional_info: Optional[Dict[str, Any]] = None) -> bool:
        """
        Log task end information
        
        Args:
            task_id: Unique task identifier
            status: Final task status
            additional_info: Additional information to log
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            audit_log = self.get_log_file_path(task_id, "audit")
            
            with open(audit_log, 'a') as f:
                f.write(f"\n=== Task Completion ===\n")
                f.write(f"End Time: {datetime.now().isoformat()}\n")
                f.write(f"Final Status: {status}\n")
                if additional_info:
                    for key, value in additional_info.items():
                        f.write(f"{key}: {value}\n")
                f.write("=" * 30 + "\n")
            
            logger.info(f"Logged task end for {task_id} with status: {status}")
            return True
            
        except Exception as e:
            logger.error(f"Error logging task end for {task_id}: {e}")
            return False
    
    def log_error(self, task_id: str, error_message: str, error_details: Optional[str] = None) -> bool:
        """
        Log error information
        
        Args:
            task_id: Unique task identifier
            error_message: Error message
            error_details: Detailed error information
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            error_log = self.get_log_file_path(task_id, "error")
            
            with open(error_log, 'w') as f:
                f.write("=== Control Task Error Log ===\n")
                f.write(f"Task ID: {task_id}\n")
                f.write(f"Error Time: {datetime.now().isoformat()}\n")
                f.write(f"Error Message: {error_message}\n")
                if error_details:
                    f.write(f"Error Details:\n{error_details}\n")
                f.write("=" * 40 + "\n")
            
            logger.error(f"Logged error for {task_id}: {error_message}")
            return True
            
        except Exception as e:
            logger.error(f"Error logging error for {task_id}: {e}")
            return False
    
    def get_log_content(self, task_id: str, log_type: str = "execution", lines: int = 100, from_line: int = 0) -> str:
        """
        Get log content for a task
        
        Args:
            task_id: Unique task identifier
            log_type: Type of log to retrieve
            lines: Number of recent lines to return (or lines to return from from_line)
            from_line: Starting line number (0-based, for incremental loading)
            
        Returns:
            String with log content
        """
        try:
            log_file = self.get_log_file_path(task_id, log_type)
            
            if not log_file.exists():
                return f"No {log_type} log found for task {task_id}"
            
            # Read file with error handling for encoding issues
            try:
                with open(log_file, 'r', encoding='utf-8', errors='replace') as f:
                    all_lines = f.readlines()
            except UnicodeDecodeError:
                # Fallback to latin-1 if utf-8 fails
                with open(log_file, 'r', encoding='latin-1', errors='replace') as f:
                    all_lines = f.readlines()
            
            total_lines = len(all_lines)
            
            # If from_line is specified, return lines from that point
            if from_line > 0 and from_line < total_lines:
                recent_lines = all_lines[from_line:]
                return ''.join(recent_lines)
            
            # Otherwise, return last N lines
            if total_lines > lines:
                recent_lines = all_lines[-lines:]
            else:
                recent_lines = all_lines
            
            return ''.join(recent_lines)
                
        except PermissionError as e:
            logger.error(f"Permission denied reading {log_type} log for {task_id}: {e}")
            return f"Permission denied reading log file"
        except Exception as e:
            logger.error(f"Error reading {log_type} log for {task_id}: {e}", exc_info=True)
            return f"Error reading log: {str(e)}"
    
    def get_all_logs_for_task(self, task_id: str) -> Dict[str, str]:
        """
        Get all log types for a task
        
        Args:
            task_id: Unique task identifier
            
        Returns:
            Dict with all log types and their content
        """
        try:
            log_types = ["execution", "subprocess", "error", "audit"]
            logs = {}
            
            for log_type in log_types:
                logs[log_type] = self.get_log_content(task_id, log_type, lines=1000)
            
            return logs
            
        except Exception as e:
            logger.error(f"Error getting all logs for {task_id}: {e}")
            return {"error": str(e)}
    
    def cleanup_old_logs(self) -> Dict[str, Any]:
        """
        Clean up old logs based on retention policy
        
        Returns:
            Dict with cleanup statistics
        """
        try:
            cutoff_time = time.time() - self.retention_seconds
            cleaned_logs = []
            archived_logs = []
            
            # Clean up logs in all subdirectories
            for log_type in ["execution", "subprocess", "error", "audit"]:
                log_dir = self.log_directory / log_type
                
                for log_file in log_dir.glob("*.log"):
                    try:
                        file_mtime = log_file.stat().st_mtime
                        
                        if file_mtime < cutoff_time:
                            # Archive before deletion
                            archived_file = self._archive_log_file(log_file, log_type)
                            if archived_file:
                                archived_logs.append(archived_file)
                            
                            # Delete original file
                            log_file.unlink()
                            cleaned_logs.append(log_file.name)
                            
                    except Exception as e:
                        logger.warning(f"Error processing log file {log_file}: {e}")
            
            result = {
                "logs_cleaned": len(cleaned_logs),
                "logs_archived": len(archived_logs),
                "cleaned_log_files": cleaned_logs,
                "archived_log_files": archived_logs,
                "cleanup_time": datetime.now().isoformat(),
                "retention_days": self.retention_days
            }
            
            logger.info(f"Log cleanup completed: {len(cleaned_logs)} logs cleaned, {len(archived_logs)} archived")
            return result
            
        except Exception as e:
            logger.error(f"Error during log cleanup: {e}")
            return {"error": str(e)}
    
    def _archive_log_file(self, log_file: Path, log_type: str) -> Optional[str]:
        """
        Archive a log file before deletion
        
        Args:
            log_file: Path to log file
            log_type: Type of log
            
        Returns:
            Path to archived file or None if failed
        """
        try:
            # Create archive filename with timestamp
            timestamp = datetime.fromtimestamp(log_file.stat().st_mtime).strftime("%Y%m%d_%H%M%S")
            archive_name = f"{log_file.stem}_{timestamp}.log.gz"
            archive_path = self.log_directory / "archived" / log_type / archive_name
            
            # Ensure archive directory exists
            archive_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Compress and move file
            with open(log_file, 'rb') as f_in:
                with gzip.open(archive_path, 'wb') as f_out:
                    shutil.copyfileobj(f_in, f_out)
            
            logger.debug(f"Archived log file: {log_file.name} -> {archive_name}")
            return str(archive_path)
            
        except Exception as e:
            logger.warning(f"Error archiving log file {log_file}: {e}")
            return None
    
    def get_log_statistics(self) -> Dict[str, Any]:
        """
        Get statistics about log files
        
        Returns:
            Dict with log statistics
        """
        try:
            stats = {
                "total_log_files": 0,
                "total_size_bytes": 0,
                "log_types": {},
                "oldest_log": None,
                "newest_log": None,
                "retention_days": self.retention_days
            }
            
            oldest_time = float('inf')
            newest_time = 0
            
            for log_type in ["execution", "subprocess", "error", "audit"]:
                log_dir = self.log_directory / log_type
                type_stats = {
                    "count": 0,
                    "size_bytes": 0,
                    "oldest": None,
                    "newest": None
                }
                
                for log_file in log_dir.glob("*.log"):
                    try:
                        file_stat = log_file.stat()
                        type_stats["count"] += 1
                        type_stats["size_bytes"] += file_stat.st_size
                        
                        file_mtime = file_stat.st_mtime
                        if file_mtime < oldest_time:
                            oldest_time = file_mtime
                            stats["oldest_log"] = log_file.name
                        
                        if file_mtime > newest_time:
                            newest_time = file_mtime
                            stats["newest_log"] = log_file.name
                            
                    except Exception as e:
                        logger.warning(f"Error processing log file {log_file}: {e}")
                
                stats["log_types"][log_type] = type_stats
                stats["total_log_files"] += type_stats["count"]
                stats["total_size_bytes"] += type_stats["size_bytes"]
            
            return stats
            
        except Exception as e:
            logger.error(f"Error getting log statistics: {e}")
            return {"error": str(e)}
    
    def cleanup_archived_logs(self, archive_retention_days: int = 30) -> Dict[str, Any]:
        """
        Clean up old archived logs
        
        Args:
            archive_retention_days: Days to retain archived logs
            
        Returns:
            Dict with cleanup statistics
        """
        try:
            cutoff_time = time.time() - (archive_retention_days * 24 * 60 * 60)
            cleaned_archives = []
            
            archive_dir = self.log_directory / "archived"
            
            for archive_file in archive_dir.rglob("*.log.gz"):
                try:
                    file_mtime = archive_file.stat().st_mtime
                    
                    if file_mtime < cutoff_time:
                        archive_file.unlink()
                        cleaned_archives.append(archive_file.name)
                        
                except Exception as e:
                    logger.warning(f"Error processing archive file {archive_file}: {e}")
            
            result = {
                "archives_cleaned": len(cleaned_archives),
                "cleaned_archive_files": cleaned_archives,
                "cleanup_time": datetime.now().isoformat(),
                "archive_retention_days": archive_retention_days
            }
            
            logger.info(f"Archive cleanup completed: {len(cleaned_archives)} archives cleaned")
            return result
            
        except Exception as e:
            logger.error(f"Error during archive cleanup: {e}")
            return {"error": str(e)}
