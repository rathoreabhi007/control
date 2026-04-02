"""
Control Runs Router (New API)
Clean, task-manager-agnostic endpoints for control runs
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse
from pathlib import Path as _Path
import json as _json
from typing import Optional as _Optional, List as _List
from datetime import datetime
import logging
import asyncio
import sys
import os
sys.path.insert(0, str(_Path(__file__).parent.parent))
from control_execution.control_runner import control_runner
from control_execution.task_persistence import CONTROL_LOGS_DIR, CONTROL_TASKS_DIR
from .models import ControlRunStartRequest, ControlRunStopRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/control-runs", tags=["control-runs"])

# Background task for periodic status checking
_status_check_task = None
_status_check_interval = 5  # Check every 5 seconds

async def _periodic_status_check():
    """
    Background task that periodically checks all running tasks and broadcasts status updates
    This runs independently and doesn't affect QA/completeness pages
    """
    logger.info("Periodic status check task started")
    while True:
        try:
            await asyncio.sleep(_status_check_interval)
            
            # Check all running tasks and broadcast updates
            # Run in executor to avoid blocking the event loop
            try:
                loop = asyncio.get_running_loop()
                # Run the sync function in a thread pool to avoid blocking
                # Use a timeout to prevent hanging
                try:
                    result = await asyncio.wait_for(
                        loop.run_in_executor(None, control_runner.check_all_running_tasks),
                        timeout=10.0  # 10 second timeout
                    )
                    if result and result.get("tasks_updated", 0) > 0:
                        logger.info(f"Status check: {result.get('tasks_updated')} task(s) updated")
                except asyncio.TimeoutError:
                    logger.warning(f"Status check timed out after 10 seconds")
                except Exception as executor_error:
                    logger.error(f"Error in executor for status check: {executor_error}", exc_info=True)
            except RuntimeError as loop_error:
                # Event loop issues - log but continue
                logger.warning(f"Event loop error in status check: {loop_error}")
            except Exception as check_error:
                logger.error(f"Error checking running tasks: {check_error}", exc_info=True)
                # Continue despite errors - don't let this crash the server
                
        except asyncio.CancelledError:
            logger.info("Periodic status check task cancelled (normal during shutdown)")
            break
        except Exception as e:
            # Catch ALL exceptions to prevent server crash
            logger.error(f"Unexpected error in periodic status check: {e}", exc_info=True)
            # Wait before retrying to avoid tight error loops
            try:
                await asyncio.sleep(_status_check_interval)
            except:
                # Even sleep can fail during shutdown, just break
                break

def _start_status_check_task():
    """Start the periodic status check task"""
    global _status_check_task
    if _status_check_task is None or _status_check_task.done():
        try:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                # No running loop, try to get event loop
                try:
                    loop = asyncio.get_event_loop()
                    if not loop.is_running():
                        logger.warning("No running event loop, status check will start on first request")
                        return
                except RuntimeError:
                    logger.warning("No event loop available, status check will start on first request")
                    return
            
            # Create task with proper error handling
            _status_check_task = loop.create_task(_periodic_status_check())
            
            # Add done callback to handle task completion/errors
            def task_done_callback(task):
                try:
                    if task.cancelled():
                        logger.info("Periodic status check task was cancelled (normal during shutdown)")
                        return  # Don't restart if cancelled (server is shutting down)
                    elif task.exception():
                        exc = task.exception()
                        logger.error(f"Periodic status check task raised exception: {exc}", exc_info=True)
                        # Only restart if it's not a cancellation and loop is still running
                        try:
                            if loop.is_running() and not loop.is_closed():
                                logger.info("Restarting periodic status check task after error")
                                # Clear the task reference and restart
                                global _status_check_task
                                _status_check_task = None
                                _start_status_check_task()
                        except Exception as restart_error:
                            logger.error(f"Failed to restart status check task: {restart_error}")
                except Exception as e:
                    logger.error(f"Error in task done callback: {e}", exc_info=True)
            
            _status_check_task.add_done_callback(task_done_callback)
            logger.info("Started periodic status check task for control-runs")
        except Exception as e:
            logger.error(f"Failed to start status check task: {e}", exc_info=True)

@router.get("/controls")
async def list_controls():
    """
    List available controls from control_ids.json
    """
    try:
        config_file = _Path(__file__).parent.parent / "control_ids.json"
        if not config_file.exists():
            raise HTTPException(status_code=404, detail="control_ids.json not found")
        with open(config_file, "r") as f:
            cfg = _json.load(f)
        controls = cfg.get("control_tasks", [])
        # Return minimal normalized shape
        return {
            "controls": [
                {
                    "control_id": c.get("control_id"),
                    "name": c.get("name"),
                    "description": c.get("description"),
                    "enabled": c.get("enabled", False),
                    "priority": c.get("priority"),
                    "estimated_duration_minutes": c.get("estimated_duration_minutes"),
                    "frequency": c.get("frequency"),
                }
                for c in controls
            ],
            "retrieved_at": datetime.now().isoformat(),
        }
    except Exception as e:
        logger.error(f"Error listing controls: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/start")
async def start_control_run(request: ControlRunStartRequest):
    """
    Start a control run by invoking generic_controller.py as a subprocess
    """
    try:
        logger.info("=" * 80)
        logger.info("[DEBUG] POST /api/control-runs/start endpoint called")
        logger.info(f"[DEBUG] Request received: control_id={request.control_id}, task_name={request.task_name}")
        logger.info(f"[DEBUG] run_env={request.run_env}, expected_run_date={request.expected_run_date}")
        
        import time
        time.sleep(0.1)
        
        control_id = request.control_id or "generic_controller"
        task_name = request.task_name or ""
        run_env = request.run_env
        expected_run_date = request.expected_run_date

        logger.info(f"[DEBUG] Step 1: Parsed parameters")
        logger.info(f"   control_id: {control_id}")
        logger.info(f"   task_name: {task_name}")
        logger.info(f"   run_env: {run_env}")
        logger.info(f"   expected_run_date: {expected_run_date}")

        python_script_path = "api/generic_controller.py"
        logger.info(f"[DEBUG] Step 2: Script path: {python_script_path}")

        control_params = {
            "control_name": control_id,
            "task_name": task_name,
            "run_env": run_env,
            "expected_run_date": expected_run_date,
            "python_script_path": python_script_path,
            "script_arguments": [
                control_id,
                run_env,
                expected_run_date,
                task_name,
            ],
            "environment_variables": {
                "ENV": run_env,
                "TASK_NAME": task_name,
                "CONTROL_ID": control_id,
                "expected_run_date": expected_run_date,
            },
        }
        
        logger.info(f"[DEBUG] Step 3: Control params prepared")
        logger.info(f"[DEBUG] Step 4: About to call control_runner.run_control_task...")
        time.sleep(0.1)

        result = control_runner.run_control_task(control_params)
        
        # Ensure status check task is running to monitor this new task
        _start_status_check_task()
        
        logger.info(f"[DEBUG] Step 5: run_control_task returned")
        logger.info(f"[DEBUG] Result: {result}")
        logger.info("=" * 80)
        
        return result
    except Exception as e:
        logger.error("=" * 80)
        logger.error(f"[DEBUG] Error starting control run: {e}", exc_info=True)
        logger.error("=" * 80)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{task_id}/status")
async def get_control_run_status(task_id: str):
    """
    Get status for a specific run (by task_id)
    """
    try:
        result = control_runner.get_task_status(task_id)
        return result
    except Exception as e:
        logger.error(f"Error getting run status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{task_id}/logs")
async def get_control_run_logs(task_id: str, log_type: str = "execution", lines: int = 200, from_line: int = 0):
    """
    Get logs for a specific run (execution/subprocess/error/audit)
    
    Query Parameters:
        log_type: Type of log (execution, subprocess, error, audit)
        lines: Number of lines to return
        from_line: Starting line number for incremental loading (0-based)
    """
    try:
        result = control_runner.get_task_logs(task_id, log_type, lines, from_line)
        return result
    except Exception as e:
        logger.error(f"Error getting run logs: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{task_id}/stop")
async def stop_control_run(task_id: str, request: ControlRunStopRequest = ControlRunStopRequest(force=False)):
    """
    Stop a running control run
    Accepts force parameter from request body (JSON)
    """
    try:
        # Parse force from request body
        force = request.force if request else False
        
        logger.info(f"Stop control run request for: {task_id} (force={force})")
        result = control_runner.stop_control_task(task_id, force=force)
        logger.info(f"Control run {task_id} stop result: {result.get('status')}")
        return result
    except Exception as e:
        logger.error(f"Error stopping control run: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/logs/{task_id}/{log_type}")
async def get_log_file(task_id: str, log_type: str = "execution", stream: bool = True):
    """
    Serve log file with streaming support
    This allows frontend to read logs in real-time as they're written
    
    Path: /api/control-runs/logs/{task_id}/{log_type}
    Query params:
        stream: If True, streams the file in chunks (default: True)
    Log types: execution, subprocess, error, audit
    """
    try:
        # Construct log file path
        log_file_path = CONTROL_LOGS_DIR / log_type / f"{task_id}_{log_type}.log"
        
        # Security: Ensure path is within allowed directory
        if not str(log_file_path).startswith(str(CONTROL_LOGS_DIR)):
            raise HTTPException(status_code=403, detail="Invalid log path")
        
        if not log_file_path.exists():
            raise HTTPException(status_code=404, detail=f"Log file not found: {log_file_path.name}")
        
        # Stream the file in chunks for better performance and real-time updates
        async def generate():
            try:
                # Use asyncio.to_thread to read file in chunks without blocking
                def read_file_chunks():
                    with open(log_file_path, 'rb') as f:
                        while True:
                            chunk = f.read(8192)  # Read 8KB chunks
                            if not chunk:
                                break
                            yield chunk
                
                # Read chunks in executor to avoid blocking
                loop = asyncio.get_event_loop()
                for chunk in read_file_chunks():
                    yield chunk
                    # Small delay to allow other tasks to run
                    await asyncio.sleep(0.001)
            except Exception as e:
                logger.error(f"Error streaming log file: {e}")
                yield f"\n[Error reading log file: {e}]\n".encode('utf-8')
        
        if stream:
            # Return streaming response
            return StreamingResponse(
                generate(),
                media_type="text/plain",
                headers={
                    "Cache-Control": "no-cache",
                    "X-Content-Type-Options": "nosniff",
                    "Transfer-Encoding": "chunked"
                }
            )
        else:
            # Return file response (non-streaming, for compatibility)
            return FileResponse(
                path=str(log_file_path),
                media_type="text/plain",
                filename=log_file_path.name,
                headers={
                    "Cache-Control": "no-cache",
                    "X-Content-Type-Options": "nosniff"
                }
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving log file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/task-state/{task_id}")
async def get_task_state_file(task_id: str):
    """
    Serve task state JSON file directly from file system
    This allows frontend to read task state directly without API processing
    
    Path: /api/control-runs/task-state/{task_id}
    """
    try:
        # Construct task state file path
        state_file_path = CONTROL_TASKS_DIR / f"{task_id}.json"
        
        # Security: Ensure path is within allowed directory
        if not str(state_file_path).startswith(str(CONTROL_TASKS_DIR)):
            raise HTTPException(status_code=403, detail="Invalid task state path")
        
        if not state_file_path.exists():
            raise HTTPException(status_code=404, detail=f"Task state file not found: {task_id}")
        
        # Return file with appropriate headers
        return FileResponse(
            path=str(state_file_path),
            media_type="application/json",
            filename=state_file_path.name,
            headers={
                "Cache-Control": "no-cache",
                "X-Content-Type-Options": "nosniff"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving task state file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
async def get_control_run_history(control_id: _Optional[str] = None, task_name: _Optional[str] = None, limit: int = 3):
    """
    Get the last N runs for a control_id (or all controls if control_id is None)
    If task_name is provided, filter by task_name (more specific than control_id)
    """
    # Ensure status check task is running
    _start_status_check_task()
    try:
        # Collect recent tasks and filter by control_id/task_name if provided
        tasks = control_runner.task_persistence.get_all_tasks(limit=10000) or []
        # Load task states to enrich
        enriched: _List[dict] = []
        for t in tasks:
            state = control_runner.task_persistence.get_task_state(t.get("task_id"))
            if not state:
                continue
            
            # If task_name is provided, match by task_name (most specific)
            if task_name:
                state_task_name = str(state.get("task_name", "")).strip()
                task_name_clean = str(task_name).strip()
                # Only match by task_name (control_name is the same "generic_controller" for all)
                # Use exact match (case-sensitive) to ensure precision
                if state_task_name == task_name_clean:
                    enriched.append(state)
                    logger.info(f"Matched task {state.get('task_id')} by task_name: '{task_name_clean}' (state.task_name='{state_task_name}', status={state.get('status')})")
                else:
                    logger.debug(f"No match: task_name='{task_name_clean}' vs state.task_name='{state_task_name}' for task {state.get('task_id')}")
            # Otherwise, match by control_id if provided
            elif control_id:
                if state.get("control_name") == control_id:
                    enriched.append(state)
            # If neither provided, include all
            else:
                enriched.append(state)

        # Sort: running tasks first (by started_at), then by updated_at desc
        def _sort_key(s):
            try:
                status = (s.get("status") or "").lower()
                is_running = status in ["running", "started"]
                updated_at = s.get("updated_at") or s.get("started_at") or ""
                # Running tasks get priority: use started_at for running, updated_at for others
                if is_running:
                    # For running tasks, sort by started_at (most recent first)
                    return (1, s.get("started_at") or updated_at)  # Prefix 1 for running tasks
                else:
                    # For non-running tasks, sort by updated_at (most recent first)
                    return (0, updated_at)  # Prefix 0 for non-running tasks
            except Exception:
                return (0, "")

        enriched.sort(key=_sort_key, reverse=True)
        recent = enriched[: max(0, min(limit, len(enriched)))]

        # Minimal history projection
        history = []
        for s in recent:
            task_name_from_state = s.get("task_name", "")
            control_name_from_state = s.get("control_name", "")
            status_from_state = s.get("status") or "unknown"
            
            history.append({
                "task_id": s.get("task_id"),
                "control_id": control_name_from_state,
                "control_name": task_name_from_state or control_name_from_state or "Unknown",
                "task_name": task_name_from_state,  # Include task_name explicitly
                "status": status_from_state,
                "run_env": s.get("run_env"),
                "expected_run_date": s.get("expected_run_date"),
                "subprocess_pid": s.get("subprocess_pid"),
                "created_at": s.get("created_at"),
                "updated_at": s.get("updated_at"),
                "started_at": s.get("started_at"),
                "ended_at": s.get("completed_at") or s.get("ended_at"),
                "completed_at": s.get("completed_at") or s.get("ended_at"),
                "return_code": s.get("return_code"),
                "running_time": s.get("running_time"),
                "log_file_path": s.get("log_file_path"),
            })
            
            logger.info(f"History item: task_id={s.get('task_id')}, task_name='{task_name_from_state}', control_name='{control_name_from_state}', status={status_from_state}")
        
        logger.info(f"History query: control_id={control_id}, task_name={task_name}, limit={limit}, found={len(history)} runs")
        if task_name and len(history) == 0:
            logger.warning(f"No runs found for task_name='{task_name}', control_id={control_id}")
        elif task_name and len(history) > 0:
            logger.info(f"Found {len(history)} run(s) for task_name='{task_name}'")

        return {
            "control_id": control_id,
            "task_name": task_name,
            "limit": limit,
            "runs": history,  # Frontend expects 'runs'
            "history": history,  # Keep for backwards compatibility
            "retrieved_at": datetime.now().isoformat(),
        }
    except Exception as e:
        logger.error(f"Error getting run history: {e}")
        raise HTTPException(status_code=500, detail=str(e))

