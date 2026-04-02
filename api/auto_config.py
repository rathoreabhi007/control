#!/usr/bin/env python
"""
AutoConfig Deployment Script
This script is executed with a control-id as the first argument.

Usage:
    python auto_config.py <control_id>
"""
import sys
import os
import json
import time
import socket
import logging
from datetime import datetime
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def _update_task_status(status: str, result: dict = None, error: str = None):
    """
    Write task status to JSON file - subprocess updates its own state.
    This enables multi-server compatibility by storing status in file
    rather than relying on PID checking.
    
    Similar to generic_controller.py's _update_task_status() pattern.
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


def main():
    """Main entry point for auto_config deployment"""
    
    # Get control_id from command line arguments
    if len(sys.argv) < 2:
        logger.error("Usage: python auto_config.py <control_id>")
        _update_task_status("failed", error="Missing control_id argument")
        sys.exit(1)
    
    control_id = sys.argv[1]
    
    logger.info("=" * 60)
    logger.info(f"AutoConfig Deployment Started")
    logger.info(f"   Control ID: {control_id}")
    logger.info("=" * 60)
    
    try:
        # TODO: Add your auto_config deployment logic here
        # This is a placeholder that simulates some work
        
        logger.info("Step 1: Initializing configuration...")
        time.sleep(1)
        
        logger.info("Step 2: Validating control_id...")
        time.sleep(1)
        
        logger.info(f"Step 3: Processing control '{control_id}'...")
        time.sleep(2)
        
        logger.info("Step 4: Applying configuration...")
        time.sleep(1)
        
        logger.info("Step 5: Finalizing deployment...")
        time.sleep(1)
        
        logger.info("=" * 60)
        logger.info(f"AutoConfig Deployment Completed Successfully")
        logger.info(f"   Control ID: {control_id}")
        logger.info("=" * 60)
        
        # Update task status in JSON file for multi-server compatibility
        result = {
            "status": "success",
            "message": "AutoConfig deployment completed successfully",
            "control_id": control_id
        }
        _update_task_status("completed", result=result)
        
        sys.exit(0)
        
    except KeyboardInterrupt:
        logger.warning("=" * 60)
        logger.warning(f"AutoConfig Deployment Interrupted")
        logger.warning(f"   Control ID: {control_id}")
        logger.warning("=" * 60)
        _update_task_status("stopped", error="Deployment was interrupted by user")
        sys.exit(1)
        
    except Exception as e:
        logger.error("=" * 60)
        logger.error(f"AutoConfig Deployment Failed")
        logger.error(f"   Error: {str(e)}")
        logger.error("=" * 60)
        
        # Update task status in JSON file for multi-server compatibility
        _update_task_status("failed", error=str(e))
        
        sys.exit(1)


if __name__ == "__main__":
    main()

