"""
Control Tasks Router (Old API)
Legacy control task endpoints for backward compatibility
"""
from fastapi import APIRouter, HTTPException
from pathlib import Path
import json
from datetime import datetime
from typing import Optional
import logging
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from control_execution.control_runner import control_runner
from .models import (
    ControlTaskRequest, ControlTaskResponse, ControlStatusResponse, ControlLogsResponse
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/controls", tags=["controls"])


@router.post("/run", response_model=ControlTaskResponse)
async def run_control_task(request: ControlTaskRequest):
    """Run a control task with parameters in request body"""
    try:
        logger.info(f"Control task request received: {request.control_name}")
        logger.info(f"   Environment: {request.run_env}")
        logger.info(f"   Script: {request.python_script_path}")
        
        # Convert request to dict
        control_params = request.dict()
        
        # Use enhanced control runner for duplicate prevention
        result = control_runner.run_control_task(control_params)
        
        logger.info(f"Control task {result.get('task_id')} started with status: {result.get('status')}")
        
        return ControlTaskResponse(**result)
        
    except Exception as e:
        logger.error(f"Error starting control task: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stop")
async def stop_control_task(task_id: str, force: bool = False):
    """Stop a control task with task_id in request body"""
    try:
        logger.info(f"Stop control task request for: {task_id} (force={force})")
        
        result = control_runner.stop_control_task(task_id, force=force)
        
        logger.info(f"Control task {task_id} stop result: {result.get('status')}")
        
        return result
        
    except Exception as e:
        logger.error(f"Error stopping control task: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status", response_model=ControlStatusResponse)
async def get_control_status(task_id: str):
    """Get control task status with task_id as query parameter"""
    try:
        logger.info(f"Control status request for: {task_id}")
        
        result = control_runner.get_task_status(task_id)
        
        logger.info(f"Control task {task_id} status: {result.get('status')}")
        
        return ControlStatusResponse(**result)
        
    except Exception as e:
        logger.error(f"Error getting control task status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/logs", response_model=ControlLogsResponse)
async def get_control_logs(task_id: str, log_type: str = "execution", lines: int = 100):
    """Get control task logs with task_id as query parameter"""
    try:
        logger.info(f"Control logs request for: {task_id} (type: {log_type}, lines: {lines})")
        
        result = control_runner.get_task_logs(task_id, log_type, lines)
        
        logger.info(f"Control task {task_id} logs retrieved successfully")
        
        return ControlLogsResponse(**result)
        
    except Exception as e:
        logger.error(f"Error getting control task logs: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
async def get_control_history(task_id: str):
    """Get control task history with task_id as query parameter"""
    try:
        logger.info(f"Control history request for: {task_id}")
        
        # Get all log types for the task
        result = control_runner.log_manager.get_all_logs_for_task(task_id)
        
        logger.info(f"Control task {task_id} history retrieved successfully")
        
        return {
            "task_id": task_id,
            "history": result,
            "retrieved_at": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting control task history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tasks")
async def get_all_control_tasks(limit: int = 100):
    """Get all control tasks with optional limit"""
    try:
        logger.info(f"Control tasks list request (limit: {limit})")
        
        tasks = control_runner.task_persistence.get_all_tasks(limit)
        
        logger.info(f"Retrieved {len(tasks)} control tasks")
        
        return {
            "tasks": tasks,
            "total_count": len(tasks),
            "limit": limit,
            "retrieved_at": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting control tasks: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_control_stats():
    """Get control task statistics"""
    try:
        logger.info("Control stats request")
        
        stats = control_runner.task_persistence.get_task_statistics()
        log_stats = control_runner.log_manager.get_log_statistics()
        
        logger.info("Control stats retrieved successfully")
        
        return {
            "task_statistics": stats,
            "log_statistics": log_stats,
            "retrieved_at": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting control stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/config")
async def get_control_config():
    """Get control task configuration from control_ids.json"""
    try:
        logger.info("Control config request")
        
        # Load control_ids.json
        config_file = Path(__file__).parent.parent / "control_ids.json"
        
        if not config_file.exists():
            raise HTTPException(status_code=404, detail="Control configuration file not found")
        
        with open(config_file, 'r') as f:
            config = json.load(f)
        
        logger.info("Control config retrieved successfully")
        
        return {
            "config": config,
            "retrieved_at": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting control config: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cleanup")
async def cleanup_control_tasks():
    """Manually trigger cleanup of old control tasks and logs"""
    try:
        logger.info("Control cleanup request")
        
        result = control_runner.cleanup_old_tasks()
        
        logger.info("Control cleanup completed successfully")
        
        return {
            "status": "success",
            "message": "Control task cleanup completed",
            "details": result,
            "cleaned_at": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error during control cleanup: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/run-logs")
async def get_control_run_logs(
    control_run_date: Optional[str] = None,
    business_date: Optional[str] = None,
    reg_type: Optional[str] = None,
    control_type: Optional[str] = None,
    asset_type: Optional[str] = None,
    subcategory_type: Optional[str] = None,
    frequency: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 1000
):
    """
    Get control run logs with filtering capabilities
    Returns logs with all control run information including hierarchy
    First tries to load from test JSON file, otherwise uses real task data
    """
    try:
        logger.info(f"Control run logs request with filters")
        
        # If no date filter is provided, default to today's date
        today = datetime.now().strftime("%Y-%m-%d")
        use_today_filter = False
        if not control_run_date and not business_date:
            use_today_filter = True
            logger.info(f"No date filter provided, defaulting to today's date: {today}")
        
        # Try to load from test JSON file first (for testing)
        test_json_path = Path(__file__).parent.parent / "control_run_logs_test.json"
        run_logs = []
        is_test_data = False
        
        if test_json_path.exists():
            logger.info("Loading control run logs from test JSON file")
            try:
                with open(test_json_path, 'r') as f:
                    test_data = json.load(f)
                    run_logs = test_data.get("run_logs", [])
                is_test_data = True
                logger.info(f"Loaded {len(run_logs)} control run logs from test file")
            except Exception as e:
                logger.warning(f"Error loading test JSON file: {e}, falling back to real data")
                run_logs = []
        
        # If no test data or test file doesn't exist, use real task data
        if not run_logs:
            logger.info("Loading control run logs from real task data")
            # Get all control tasks
            all_tasks = control_runner.task_persistence.get_all_tasks(limit=limit * 2)  # Get more to filter
            
            # Transform tasks to control run logs format
            for task in all_tasks:
                # Extract control_name to derive hierarchy if possible
                control_name = task.get("control_name", "")
                
                # Try to parse control name or use defaults
                # Format might be like: "REG_TYPE_CONTROL_TYPE_ASSET_TYPE_SUBCATEGORY"
                parts = control_name.split("_") if control_name else []
                
                # Default values if not in control_name
                reg_type_val = reg_type if reg_type else (parts[0] if len(parts) > 0 else "Unknown")
                control_type_val = control_type if control_type else (parts[1] if len(parts) > 1 else "Unknown")
                asset_type_val = asset_type if asset_type else (parts[2] if len(parts) > 2 else "Unknown")
                subcategory_type_val = subcategory_type if subcategory_type else (parts[3] if len(parts) > 3 else "Unknown")
                
                # Get task state for full details
                task_state = control_runner.task_persistence.get_task_state(task.get("task_id"))
                if not task_state:
                    continue
                
                # Determine frequency from control_name or defaults
                frequency_val = frequency if frequency else ("Daily" if "DAILY" in control_name.upper() else "Monthly")
                
                # Get status
                status_val = task_state.get("status", "unknown")
                
                # Parse dates
                expected_run_date = task_state.get("expected_run_date", "")
                created_at = task_state.get("created_at", "")
                started_at = task_state.get("started_at", "")
                completed_at = task_state.get("completed_at", "")
                
                # Use expected_run_date as control_run_date if available
                control_run_date_val = control_run_date if control_run_date else expected_run_date
                business_date_val = business_date if business_date else expected_run_date
                
                # Build run log entry
                run_log = {
                    "task_id": task.get("task_id"),
                    "control_run_date": control_run_date_val,
                    "business_date": business_date_val,
                    "start_time": started_at or created_at,
                    "end_time": completed_at,
                    "reg_type": reg_type_val,
                    "control_type": control_type_val,
                    "asset_type": asset_type_val,
                    "subcategory_type": subcategory_type_val,
                    "frequency": frequency_val,
                    "status": status_val,
                    "failed_reason": task_state.get("error") if status_val == "failed" else None,
                    "control_name": control_name,
                    "run_env": task_state.get("run_env"),
                    "created_at": created_at,
                    "updated_at": task_state.get("updated_at")
                }
                
                # Apply ONLY date filters (other filters will be applied client-side)
                if control_run_date and control_run_date_val != control_run_date:
                    continue
                if business_date and business_date_val != business_date:
                    continue
                
                run_logs.append(run_log)
        
        # Apply ONLY date filters to test data if loaded from JSON (other filters will be applied client-side)
        if run_logs:
            filtered_logs = []
            for log in run_logs:
                # Apply date filters - use today's date if no filter provided
                if use_today_filter:
                    if log.get("control_run_date") != today:
                        continue
                else:
                    if control_run_date and log.get("control_run_date") != control_run_date:
                        continue
                    if business_date and log.get("business_date") != business_date:
                        continue
                
                filtered_logs.append(log)
            run_logs = filtered_logs
        
        # Sort by control_run_date descending (newest first)
        run_logs.sort(key=lambda x: x.get("control_run_date", ""), reverse=True)
        run_logs = run_logs[:limit]
        
        # Merge with control_ids.json to add "not_started" status for daily tasks
        # Determine the target date for checking daily tasks
        target_date = control_run_date if control_run_date else (business_date if business_date else today)
        
        try:
            # Load control_ids.json
            control_ids_path = Path(__file__).parent.parent / "control_ids.json"
            if control_ids_path.exists():
                with open(control_ids_path, 'r') as f:
                    control_config = json.load(f)
                    control_tasks = control_config.get("control_tasks", [])
                
                # Get enabled daily tasks
                daily_tasks = [
                    task for task in control_tasks
                    if task.get("enabled", False) and
                       (task.get("frequency", "").lower() == "daily" or task.get("frequency", "").lower() == "dail")
                ]
                
                # Create a set of matched control_ids from existing run_logs
                matched_control_ids = set()
                
                if is_test_data:
                    # For test data, match by control_name
                    for log in run_logs:
                        control_name = log.get("control_name", "")
                        for task in daily_tasks:
                            if (control_name == task.get("control_id") or
                                control_name == task.get("name")):
                                matched_control_ids.add(task.get("control_id"))
                                break
                else:
                    # For real tasks, check all tasks to get script_arguments and match with run_logs
                    all_tasks_for_check = control_runner.task_persistence.get_all_tasks(limit=10000)
                    for task_item in all_tasks_for_check:
                        task_state = control_runner.task_persistence.get_task_state(task_item.get("task_id"))
                        if task_state:
                            log_control_name = task_state.get("control_name", "")
                            script_args = task_state.get("script_arguments", [])
                            expected_date = task_state.get("expected_run_date", "")
                            
                            # Check if this task's expected_run_date matches target_date
                            if expected_date == target_date:
                                # Extract control_id from script_arguments (first element)
                                if script_args and len(script_args) > 0:
                                    script_control_id = script_args[0]
                                    for task in daily_tasks:
                                        if script_control_id == task.get("control_id"):
                                            matched_control_ids.add(task.get("control_id"))
                                            break
                                
                                # Also check by control_name
                                if log_control_name:
                                    for task in daily_tasks:
                                        if (log_control_name == task.get("control_id") or
                                            log_control_name == task.get("name")):
                                            matched_control_ids.add(task.get("control_id"))
                                            break
                    
                    # Also match existing run_logs by control_name
                    for log in run_logs:
                        control_name = log.get("control_name", "")
                        for task in daily_tasks:
                            if (control_name == task.get("control_id") or
                                control_name == task.get("name")):
                                matched_control_ids.add(task.get("control_id"))
                                break
                
                # Add "not_started" entries for unmatched daily tasks
                for task in daily_tasks:
                    control_id = task.get("control_id")
                    if control_id not in matched_control_ids:
                        # Check if this task should run on the target date (daily = every day)
                        # Create a not_started entry
                        not_started_log = {
                            "task_id": None,  # No task_id for not started tasks
                            "control_run_date": target_date,
                            "business_date": target_date,  # Assume same as control_run_date for daily
                            "start_time": None,
                            "end_time": None,
                            "reg_type": "Unknown",  # Default values
                            "control_type": "Unknown",
                            "asset_type": "Unknown",
                            "subcategory_type": "None",
                            "frequency": task.get("frequency", "Daily"),
                            "status": "not_started",
                            "failed_reason": None,
                            "control_name": control_id,  # Use control_id as control_name
                            "run_env": None,
                            "created_at": None,
                            "updated_at": None,
                            "control_id": control_id,  # Add control_id field
                            "name": task.get("name", ""),
                            "description": task.get("description", ""),
                            "priority": task.get("priority", 0),
                            "estimated_duration_minutes": task.get("estimated_duration_minutes", 0)
                        }
                        
                        # Apply ONLY date filters to not_started entries (other filters will be applied client-side)
                        if control_run_date and not_started_log["control_run_date"] != control_run_date:
                            continue
                        if business_date and not_started_log["business_date"] != business_date:
                            continue
                        
                        run_logs.append(not_started_log)
                
                logger.info(f"Added {len(daily_tasks) - len(matched_control_ids)} not_started entries for daily tasks")
        except Exception as e:
            logger.warning(f"Error merging control_ids.json: {e}")
        
        # Re-sort after adding not_started entries
        run_logs.sort(key=lambda x: x.get("control_run_date", ""), reverse=True)
        run_logs = run_logs[:limit]
        
        logger.info(f"Retrieved {len(run_logs)} control run logs (including not_started)")
        
        return {
            "run_logs": run_logs,
            "total_count": len(run_logs),
            "filters_applied": {
                "control_run_date": control_run_date,
                "business_date": business_date,
                # Note: Other filters (reg_type, control_type, asset_type, subcategory_type, frequency, status)
                # are applied client-side for better performance
            },
            "retrieved_at": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting control run logs: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/run-logs/hierarchy")
async def get_control_run_logs_hierarchy():
    """
    Get unique values for hierarchy filters (RegType, ControlType, AssetType, SubCategory)
    First tries to load from test JSON file, otherwise uses real task data
    """
    try:
        logger.info("Control run logs hierarchy request")
        
        reg_types = set()
        control_types = set()
        asset_types = set()
        subcategory_types = set()
        frequencies = set()
        statuses = set()
        
        # Try to load from test JSON file first
        test_json_path = Path(__file__).parent.parent / "control_run_logs_test.json"
        if test_json_path.exists():
            logger.info("Loading hierarchy from test JSON file")
            try:
                with open(test_json_path, 'r') as f:
                    test_data = json.load(f)
                    run_logs = test_data.get("run_logs", [])
                    
                for log in run_logs:
                    if log.get("reg_type"):
                        reg_types.add(log.get("reg_type"))
                    if log.get("control_type"):
                        control_types.add(log.get("control_type"))
                    if log.get("asset_type"):
                        asset_types.add(log.get("asset_type"))
                    if log.get("subcategory_type"):
                        subcategory_types.add(log.get("subcategory_type"))
                    if log.get("frequency"):
                        frequencies.add(log.get("frequency"))
                    if log.get("status"):
                        statuses.add(log.get("status"))
                # Add "not_started" status to the list since it's a synthetic status we add in run-logs endpoint
                statuses.add("not_started")
            except Exception as e:
                logger.warning(f"Error loading test JSON file: {e}, falling back to real data")
        
        # If no test data, use real task data
        if not reg_types:
            logger.info("Loading hierarchy from real task data")
            all_tasks = control_runner.task_persistence.get_all_tasks(limit=10000)
            
            for task in all_tasks:
                task_state = control_runner.task_persistence.get_task_state(task.get("task_id"))
                if not task_state:
                    continue
                
                control_name = task_state.get("control_name", "")
                parts = control_name.split("_") if control_name else []
                
                if len(parts) > 0:
                    reg_types.add(parts[0])
                if len(parts) > 1:
                    control_types.add(parts[1])
                if len(parts) > 2:
                    asset_types.add(parts[2])
                if len(parts) > 3:
                    subcategory_types.add(parts[3])
                
                # Frequency
                freq = "Daily" if "DAILY" in control_name.upper() else "Monthly"
                frequencies.add(freq)
                
                # Status
                status = task_state.get("status", "unknown")
                statuses.add(status)
        
        # Add "not_started" status to the list since it's a synthetic status we add in run-logs endpoint
        statuses.add("not_started")
        
        return {
            "reg_types": sorted(list(reg_types)),
            "control_types": sorted(list(control_types)),
            "asset_types": sorted(list(asset_types)),
            "subcategory_types": sorted(list(subcategory_types)),
            "frequencies": sorted(list(frequencies)),
            "statuses": sorted(list(statuses)),
            "retrieved_at": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting control run logs hierarchy: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

