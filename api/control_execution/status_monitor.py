"""
Status Monitor Module
Background process to monitor control tasks and update their status
Runs independently of Gunicorn workers
"""

import time
import logging
import os
import signal
import sys
from datetime import datetime
from typing import Dict, Any, List
from pathlib import Path
import glob
import threading

from .task_persistence import TaskPersistence
from .log_manager import ControlLogManager
from .subprocess_manager import check_process_by_pid

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('task_storage/control_logs/status_monitor.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class ControlStatusMonitor:
    """Background monitor for control tasks"""
    
    def __init__(self, 
                 task_storage_dir: Path = None, 
                 log_retention_days: int = 7,
                 check_interval: int = 5):
        """
        Initialize status monitor
        
        Args:
            task_storage_dir: Directory for task storage
            log_retention_days: Days to retain logs
            check_interval: Seconds between status checks
        """
        self.task_storage_dir = task_storage_dir or Path("task_storage")
        self.log_retention_days = log_retention_days
        self.check_interval = check_interval
        self.running = False
        self.monitor_thread = None
        
        # Initialize components
        self.task_persistence = TaskPersistence()
        self.log_manager = ControlLogManager(
            log_directory=self.task_storage_dir / "control_logs",
            retention_days=log_retention_days
        )
        
        # Statistics
        self.stats = {
            "started_at": None,
            "checks_performed": 0,
            "tasks_updated": 0,
            "processes_checked": 0,
            "last_check_time": None,
            "errors": 0
        }
        
        # Setup signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        logger.info(f"Received signal {signum}, shutting down gracefully...")
        self.stop()
        sys.exit(0)
    
    def start(self):
        """Start the status monitor"""
        if self.running:
            logger.warning("Status monitor is already running")
            return
        
        logger.info("Starting Control Status Monitor")
        logger.info(f"   Check interval: {self.check_interval} seconds")
        logger.info(f"   Task storage: {self.task_storage_dir}")
        logger.info(f"   Log retention: {self.log_retention_days} days")
        
        self.running = True
        self.stats["started_at"] = datetime.now().isoformat()
        
        # Start monitor thread
        self.monitor_thread = threading.Thread(
            target=self._monitor_loop,
            daemon=False,
            name="ControlStatusMonitor"
        )
        self.monitor_thread.start()
        
        logger.info("Status monitor started successfully")
    
    def stop(self):
        """Stop the status monitor"""
        if not self.running:
            logger.warning("Status monitor is not running")
            return
        
        logger.info("Stopping Control Status Monitor...")
        self.running = False
        
        if self.monitor_thread and self.monitor_thread.is_alive():
            self.monitor_thread.join(timeout=10)
        
        logger.info("Status monitor stopped")
        self._log_final_stats()
    
    def _monitor_loop(self):
        """Main monitoring loop"""
        logger.info("Status monitor loop started")
        
        while self.running:
            try:
                self._check_all_tasks()
                self.stats["checks_performed"] += 1
                self.stats["last_check_time"] = datetime.now().isoformat()
                
                # Sleep for check interval
                time.sleep(self.check_interval)
                
            except Exception as e:
                self.stats["errors"] += 1
                logger.error(f"Error in monitor loop: {e}")
                time.sleep(self.check_interval)  # Continue monitoring despite errors
        
        logger.info("Status monitor loop ended")
    
    def _check_all_tasks(self):
        """Check all control tasks and update their status"""
        try:
            # Get all task files
            task_files = list(self.task_storage_dir.glob("control_tasks/*.json"))
            
            if not task_files:
                return
            
            logger.debug(f"Checking {len(task_files)} control tasks")
            
            for task_file in task_files:
                try:
                    task_id = task_file.stem
                    self._check_single_task(task_id)
                    self.stats["processes_checked"] += 1
                    
                except Exception as e:
                    logger.warning(f"Error checking task {task_file.stem}: {e}")
            
        except Exception as e:
            logger.error(f"Error checking all tasks: {e}")
    
    def _check_single_task(self, task_id: str):
        """Check a single task and update its status if needed"""
        try:
            # Get current task state
            task_state = self.task_persistence.get_task_state(task_id)
            if not task_state:
                return
            
            current_status = task_state.get("status", "unknown")
            subprocess_pid = task_state.get("subprocess_pid")
            
            # Only check running tasks
            if current_status not in ["started", "running"]:
                return
            
            # Check if subprocess is still alive
            if subprocess_pid:
                is_running = check_process_by_pid(subprocess_pid)
                
                if not is_running:
                    # Process finished, determine final status
                    final_status = self._determine_final_status(task_id)
                    
                    # Update task status
                    self.task_persistence.update_task_status(
                        task_id,
                        final_status,
                        {
                            "completed_at": datetime.now().isoformat(),
                            "auto_detected_completion": True,
                            "monitor_detected": True
                        }
                    )
                    
                    # Log task completion
                    self.log_manager.log_task_end(
                        task_id,
                        final_status,
                        {
                            "auto_detected": True,
                            "monitor_detected": True
                        }
                    )
                    
                    self.stats["tasks_updated"] += 1
                    logger.info(f"Task {task_id} status updated to: {final_status}")
            
        except Exception as e:
            logger.warning(f"Error checking task {task_id}: {e}")
    
    def _determine_final_status(self, task_id: str) -> str:
        """
        Determine final status based on log content
        
        Args:
            task_id: Task identifier
            
        Returns:
            Final status (completed, failed, etc.)
        """
        try:
            # Check execution log for clues
            execution_log = self.log_manager.get_log_content(task_id, "execution", lines=50)
            
            if not execution_log or "No execution log found" in execution_log:
                return "completed"  # Default to completed if no log
            
            # Look for error indicators in the log
            error_indicators = [
                "error", "exception", "failed", "traceback", 
                "critical", "fatal", "abort", "terminated"
            ]
            
            log_lower = execution_log.lower()
            for indicator in error_indicators:
                if indicator in log_lower:
                    return "failed"
            
            # Look for success indicators
            success_indicators = [
                "completed", "success", "finished", "done", 
                "process completed", "execution finished"
            ]
            
            for indicator in success_indicators:
                if indicator in log_lower:
                    return "completed"
            
            # Default to completed if no clear indicators
            return "completed"
            
        except Exception as e:
            logger.warning(f"Error determining final status for {task_id}: {e}")
            return "completed"  # Default to completed on error
    
    def get_monitor_stats(self) -> Dict[str, Any]:
        """Get monitor statistics"""
        return {
            **self.stats,
            "running": self.running,
            "check_interval": self.check_interval,
            "uptime_seconds": (
                (datetime.now() - datetime.fromisoformat(self.stats["started_at"])).total_seconds()
                if self.stats["started_at"] else 0
            )
        }
    
    def _log_final_stats(self):
        """Log final statistics"""
        logger.info("=" * 60)
        logger.info("CONTROL STATUS MONITOR FINAL STATISTICS")
        logger.info("=" * 60)
        logger.info(f"   Started at: {self.stats['started_at']}")
        logger.info(f"   Checks performed: {self.stats['checks_performed']}")
        logger.info(f"   Tasks updated: {self.stats['tasks_updated']}")
        logger.info(f"   Processes checked: {self.stats['processes_checked']}")
        logger.info(f"   Errors encountered: {self.stats['errors']}")
        logger.info(f"   Last check: {self.stats['last_check_time']}")
        logger.info("=" * 60)
    
    def cleanup_old_tasks(self):
        """Clean up old completed tasks and logs"""
        try:
            logger.info("Starting cleanup of old tasks and logs...")
            
            # Clean up task files
            task_cleanup = self.task_persistence.cleanup_old_tasks(self.log_retention_days)
            
            # Clean up logs
            log_cleanup = self.log_manager.cleanup_old_logs()
            
            logger.info(f"Cleanup completed:")
            logger.info(f"   Tasks cleaned: {task_cleanup.get('tasks_cleaned', 0)}")
            logger.info(f"   Logs cleaned: {log_cleanup.get('logs_cleaned', 0)}")
            
            return {
                "task_cleanup": task_cleanup,
                "log_cleanup": log_cleanup,
                "cleanup_time": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")
            return {"error": str(e)}


def main():
    """Main function to run status monitor as standalone process"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Control Status Monitor")
    parser.add_argument("--check-interval", type=int, default=5, 
                       help="Seconds between status checks (default: 5)")
    parser.add_argument("--retention-days", type=int, default=7,
                       help="Days to retain logs (default: 7)")
    parser.add_argument("--task-storage", type=str, default="task_storage",
                       help="Task storage directory (default: task_storage)")
    
    args = parser.parse_args()
    
    # Create and start monitor
    monitor = ControlStatusMonitor(
        task_storage_dir=Path(args.task_storage),
        log_retention_days=args.retention_days,
        check_interval=args.check_interval
    )
    
    try:
        monitor.start()
        
        # Keep running until interrupted
        while monitor.running:
            time.sleep(1)
            
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received")
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
    finally:
        monitor.stop()


if __name__ == "__main__":
    main()
