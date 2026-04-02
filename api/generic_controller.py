#!/usr/bin/env python3
"""
Generic Controller - Executes control tasks based on parameters from frontend
Called as a subprocess with virtual environment
"""

import sys
import os
import json
import logging
import time
import socket
from datetime import datetime
from pathlib import Path

# Configure UTF-8 encoding for Windows compatibility
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)

def load_control_config():
    """Load control IDs configuration from JSON file"""
    config_file = Path(__file__).parent / "control_ids.json"
    
    try:
        with open(config_file, 'r') as f:
            config = json.load(f)
        return config
    except FileNotFoundError:
        logger.error(f"Control config file not found: {config_file}")
        return None
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in control config file: {e}")
        return None

def get_task_info_by_name(task_name, config):
    """Get task information by name from control_ids.json"""
    if not config:
        return None
    
    for task in config.get("control_tasks", []):
        if task.get("name") == task_name:
            return task
    return None


def _update_task_status(status: str, result: dict = None, error: str = None):
    """
    Write task status to JSON file - subprocess updates its own state.
    This enables multi-server compatibility by storing status in file
    rather than relying on PID checking.
    
    Similar to etl_worker.py's _save_result() pattern.
    """
    task_file_path = os.environ.get('TASK_FILE_PATH')
    if not task_file_path:
        logger.warning("TASK_FILE_PATH not set, cannot update task status")
        return False
    
    try:
        # Read existing task state
        with open(task_file_path, 'r', encoding='utf-8') as f:
            task_state = json.load(f)
        
        # Update status and timestamp
        task_state["status"] = status
        task_state["updated_at"] = datetime.now().isoformat()
        
        # Add server tracking for multi-server environments
        try:
            task_state["server_hostname"] = socket.gethostname()
            task_state["server_ip"] = socket.gethostbyname(socket.gethostname())
            task_state["server_id"] = os.environ.get("SERVER_ID", socket.gethostname())
        except Exception as e:
            logger.warning(f"Could not get server info: {e}")
        
        # Handle completion
        if status == "completed":
            task_state["completed_at"] = datetime.now().isoformat()
            if result:
                task_state["result"] = result
        
        # Handle failure
        elif status == "failed":
            task_state["failed_at"] = datetime.now().isoformat()
            if error:
                task_state["error"] = error
        
        # Handle stopped/interrupted
        elif status == "stopped":
            task_state["stopped_at"] = datetime.now().isoformat()
            if error:
                task_state["error"] = error
        
        # Atomic write - write to temp file then rename
        temp_file = task_file_path + ".tmp"
        with open(temp_file, 'w', encoding='utf-8') as f:
            json.dump(task_state, f, indent=2, default=str)
        
        # Atomic replace
        if os.path.exists(task_file_path):
            os.replace(temp_file, task_file_path)
        else:
            os.rename(temp_file, task_file_path)
        
        logger.info(f"Updated task status to: {status}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to update task status: {e}")
        return False


def main(control_id, task_info, run_env, expected_run_date):
    """Main execution function"""
    # Get script name
    script_name = Path(__file__).name
    script_path = Path(__file__).absolute()
    
    # Note: All logs from this script are captured by the subprocess manager
    # and written to: task_storage/control_logs/{task_id}_execution.log
    task_id = os.environ.get('TASK_ID', 'Not set')
    log_file_name = f"{task_id}_execution.log" if task_id != 'Not set' else "unknown_execution.log"
    
    logger.info("=" * 80)
    logger.info(f"Generic controller started")
    logger.info(f"   Script Name: {script_name}")
    logger.info(f"   Script Path: {script_path}")
    logger.info(f"   Log File: task_storage/control_logs/{log_file_name}")
    logger.info(f"   Control ID: {control_id}")
    logger.info(f"   Task Name: {task_info.get('name', 'Unknown')}")
    logger.info(f"   Description: {task_info.get('description', 'No description')}")
    logger.info(f"   Run Environment: {run_env}")
    logger.info(f"   Expected Run Date: {expected_run_date}")
    logger.info(f"   Process ID: {os.getpid()}")
    logger.info(f"   Task ID: {os.environ.get('TASK_ID', 'Not set')}")
    logger.info("=" * 80)
    
    # Log all environment variables
    logger.info("Environment Variables:")
    logger.info("-" * 80)
    env_vars = dict(os.environ)
    # Sort for easier reading
    for key in sorted(env_vars.keys()):
        # Mask sensitive information (passwords, tokens, keys)
        value = env_vars[key]
        if any(sensitive in key.lower() for sensitive in ['password', 'token', 'secret', 'key', 'api_key']):
            value = "***MASKED***"
        logger.info(f"   {key} = {value}")
    logger.info("-" * 80)
    
    # Dummy logs for testing
    logger.info("Starting control task processing...")
    logger.info("Step 1: Initializing data extraction process")
    logger.info("Step 2: Connecting to source database")
    logger.warning("Warning: Connection timeout set to 30 seconds (default)")
    logger.info("Step 3: Executing data extraction query")
    logger.info("Step 4: Processing extracted data")
    logger.warning("Warning: Large dataset detected, processing may take longer")
    logger.info("Step 5: Validating data integrity")
    logger.info("Step 6: Transforming data according to business rules")
    
    # Dummy error statement (non-fatal)
    logger.error("Error: Sample error message for testing - This is a dummy error that does not stop execution")
    logger.info("Continuing execution despite dummy error...")
    
    # Your control logic here
    # For now, simulating work with periodic logs
    logger.info("Processing control task...")
    try:
        # Simulate work with periodic logging
        for i in range(10):
            logger.info(f"Processing batch {i+1}/10...")
            time.sleep(10)  # Sleep for 10 seconds per batch (total 100 seconds)
            
            # Add some dummy warnings/errors at intervals
            if i == 3:
                logger.warning("Warning: Batch 4 processing slower than expected")
            if i == 6:
                logger.error("Error: Dummy error in batch 7 - continuing execution")
            if i == 8:
                logger.warning("Warning: Memory usage at 75% - monitoring closely")
    except KeyboardInterrupt:
        logger.warning("Task interrupted by user")
        logger.error("Error: Task was stopped before completion")
        result = {
            "status": "stopped",
            "message": "Task was interrupted",
            "control_id": control_id,
            "task_name": task_info.get('name', 'Unknown')
        }
        # Update task status in JSON file for multi-server compatibility
        _update_task_status("stopped", error="Task was interrupted by user")
        return result

    logger.info("Step 7: Loading data into target system")
    logger.info("Step 8: Verifying data load success")
    logger.info("Step 9: Generating execution report")
    logger.info("Step 10: Cleaning up temporary files")
    logger.info("=" * 80)
    logger.info(f"Generic controller completed for control_id: {control_id}")
    logger.info(f"Task Name: {task_info.get('name', 'Unknown')}")
    logger.info("=" * 80)
    
    result = {
        "status": "success",
        "message": "Generic controller completed successfully",
        "control_id": control_id,
        "task_name": task_info.get('name', 'Unknown')
    }
    
    # Update task status in JSON file for multi-server compatibility
    _update_task_status("completed", result=result)
    
    return result

if __name__ == "__main__":
    """Entry point when called as subprocess"""
    try:
        logger.info("=" * 80)
        logger.info("[DEBUG] generic_controller.py __main__ block started")
        logger.info(f"[DEBUG] Python version: {sys.version}")
        logger.info(f"[DEBUG] Script path: {__file__}")
        logger.info(f"[DEBUG] Command line arguments: {sys.argv}")
        logger.info(f"[DEBUG] Environment variables (relevant):")
        logger.info(f"   TASK_ID: {os.environ.get('TASK_ID', 'Not set')}")
        logger.info(f"   CONTROL_ID: {os.environ.get('CONTROL_ID', 'Not set')}")
        logger.info(f"   ENV: {os.environ.get('ENV', 'Not set')}")
        logger.info(f"   run_env: {os.environ.get('run_env', 'Not set')}")
        logger.info(f"   expected_run_date: {os.environ.get('expected_run_date', 'Not set')}")
        logger.info(f"   TASK_NAME: {os.environ.get('TASK_NAME', 'Not set')}")
        logger.info("=" * 80)
        
        import time
        time.sleep(0.2)  # Small delay for debugging
        
        # Get parameters from command line arguments or environment variables
        # Priority: command line args > environment variables
        
        logger.info("[DEBUG] Step 1: Parsing command line arguments or environment variables...")
        # Method 1: Command line arguments (if provided)
        if len(sys.argv) >= 4:
            logger.info(f"[DEBUG] Using command line arguments (count: {len(sys.argv)})")
            control_id = sys.argv[1]
            run_env = sys.argv[2]
            expected_run_date_str = sys.argv[3]
            task_name = sys.argv[4] if len(sys.argv) >= 5 else None
            logger.info(f"[DEBUG] Parsed: control_id={control_id}, run_env={run_env}, expected_run_date={expected_run_date_str}, task_name={task_name}")
        else:
            logger.info(f"[DEBUG] Using environment variables (arg count: {len(sys.argv)})")
            # Method 2: Environment variables (set by frontend)
            control_id = os.environ.get('CONTROL_ID', 'generic_controller')
            run_env = os.environ.get('ENV', os.environ.get('run_env', ''))
            expected_run_date_str = os.environ.get('expected_run_date', '')
            task_name = os.environ.get('TASK_NAME', '')
            logger.info(f"[DEBUG] Parsed: control_id={control_id}, run_env={run_env}, expected_run_date={expected_run_date_str}, task_name={task_name}")
        
        time.sleep(0.1)
        
        if not run_env:
            logger.error("Run environment not provided")
            sys.exit(1)
        
        if not expected_run_date_str:
            logger.error("Expected run date not provided")
            sys.exit(1)
        
        # Parse expected run date
        try:
            expected_run_date = datetime.strptime(expected_run_date_str, '%Y-%m-%d')
        except ValueError:
            logger.error(f"Invalid date format: {expected_run_date_str}. Expected format: YYYY-MM-DD")
            sys.exit(1)
        
        # Load control configuration to get task info
        config = load_control_config()
        if not config:
            logger.error("Failed to load control configuration")
            sys.exit(1)
        
        # Get task info by name (if provided) or use first matching control_id
        if task_name:
            task_info = get_task_info_by_name(task_name, config)
            if not task_info:
                logger.warning(f"Task '{task_name}' not found in config, using first matching control_id")
                # Fallback to first matching control_id
                for task in config.get("control_tasks", []):
                    if task.get("control_id") == control_id:
                        task_info = task
                        break
        else:
            # Find first task with matching control_id
            task_info = None
            for task in config.get("control_tasks", []):
                if task.get("control_id") == control_id:
                    task_info = task
                    break
        
        if not task_info:
            logger.error(f"No task found for control_id: {control_id}")
            sys.exit(1)
        
        # Execute the main function
        result = main(control_id, task_info, run_env, expected_run_date)
        
        # Print result as JSON for subprocess communication
        print(json.dumps(result, indent=2))
        sys.exit(0)
        
    except Exception as e:
        logger.error(f"Error in generic_controller: {e}", exc_info=True)
        error_result = {
            "status": "error",
            "message": str(e),
            "control_id": control_id if 'control_id' in locals() else 'unknown'
        }
        # Update task status in JSON file for multi-server compatibility
        _update_task_status("failed", error=str(e))
        print(json.dumps(error_result, indent=2))
        sys.exit(1)

