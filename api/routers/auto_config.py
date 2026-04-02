"""
AutoConfig Deployment Router
Handles auto_config.py subprocess execution with control-id input
Similar to control-runs but specifically for auto_config.py
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from pathlib import Path as _Path
import json as _json
from typing import Optional as _Optional
from datetime import datetime
import logging
import asyncio
import sys
sys.path.insert(0, str(_Path(__file__).parent.parent))
from control_execution.control_runner import control_runner
from control_execution.task_persistence import CONTROL_LOGS_DIR, CONTROL_TASKS_DIR
from .models import ControlRunStartRequest, ControlRunStopRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auto-config", tags=["auto-config"])


@router.get("/controls")
async def list_auto_config_controls():
    """
    List available controls from control_ids.json for auto-config deployment
    """
    try:
        config_file = _Path(__file__).parent.parent / "control_ids.json"
        if not config_file.exists():
            raise HTTPException(status_code=404, detail="control_ids.json not found")
        with open(config_file, "r") as f:
            cfg = _json.load(f)
        controls = cfg.get("control_tasks", [])
        # Return normalized shape for frontend dropdown
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
async def start_auto_config(request: dict):
    """
    Start an AutoConfig deployment by invoking auto_config.py as a subprocess
    
    Request body:
        - control_ids: List of control IDs to deploy (or comma-separated string)
        - control_id: Single control ID (for backwards compatibility)
        - user_comment: Optional free text comment from user
        - run_env: Environment (DEV/UAT/PROD)
        - expected_run_date: Date for the run
    """
    try:
        logger.info("=" * 80)
        logger.info("[AutoConfig] POST /api/auto-config/start endpoint called")
        
        # Support both control_ids (array/string) and control_id (single)
        control_ids = request.get('control_ids', [])
        if isinstance(control_ids, str):
            # Handle comma-separated string
            control_ids = [c.strip() for c in control_ids.split(',') if c.strip()]
        
        # Backwards compatibility: if control_id is provided, use it
        if not control_ids and request.get('control_id'):
            control_ids = [request.get('control_id')]
        
        if not control_ids:
            raise HTTPException(status_code=400, detail="control_id or control_ids is required")
        
        user_comment = request.get('user_comment', '').strip()
        auto_flag = request.get('auto_flag', False)
        logger.info(f"[AutoConfig] Request: control_ids={control_ids}, auto_flag={auto_flag}, comment='{user_comment[:50] if user_comment else '(none)'}")
        
        python_script_path = "api/auto_config.py"
        logger.info(f"[AutoConfig] Script path: {python_script_path}")
        
        # Join control IDs for display and passing to script
        control_ids_str = ','.join(control_ids)
        
        # Prepare control parameters
        control_params = {
            "control_name": "auto_config",
            "task_name": f"AutoConfig Deployment - {control_ids_str}" if len(control_ids) == 1 else f"AutoConfig Deployment - {len(control_ids)} controls",
            "run_env": request.get("run_env", "DEV"),
            "expected_run_date": request.get("expected_run_date", datetime.now().strftime("%Y-%m-%d")),
            "python_script_path": python_script_path,
            "script_arguments": [
                control_ids_str,  # Pass comma-separated control IDs as first argument
            ],
            "environment_variables": {
                "CONTROL_IDS": control_ids_str,  # New: comma-separated
                "CONTROL_ID": control_ids[0],    # Backwards compat: first ID
                "ENV": request.get("run_env", "DEV"),
                "USER_COMMENT": user_comment,
                "AUTO_FLAG": str(auto_flag).lower(),  # "true" or "false"
            },
            # Store in task state for tracking
            "control_id": control_ids_str,
            "control_ids": control_ids,
            "user_comment": user_comment,
            "auto_flag": auto_flag,
        }
        
        logger.info(f"[AutoConfig] Control params prepared with {len(control_ids)} control(s)")
        logger.info(f"[AutoConfig] About to call control_runner.run_control_task...")
        
        result = control_runner.run_control_task(control_params)
        
        # Add user_comment and control_ids to response
        result['user_comment'] = user_comment
        result['control_ids'] = control_ids
        
        logger.info(f"[AutoConfig] run_control_task returned")
        logger.info(f"[AutoConfig] Result: {result}")
        logger.info("=" * 80)
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("=" * 80)
        logger.error(f"[AutoConfig] Error starting auto config: {e}", exc_info=True)
        logger.error("=" * 80)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{task_id}/status")
async def get_auto_config_status(task_id: str):
    """
    Get status for a specific AutoConfig deployment (by task_id)
    """
    try:
        result = control_runner.get_task_status(task_id)
        return result
    except Exception as e:
        logger.error(f"[AutoConfig] Error getting run status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{task_id}/logs")
async def get_auto_config_logs(task_id: str, log_type: str = "execution", lines: int = 200, from_line: int = 0):
    """
    Get logs for a specific AutoConfig deployment (execution/subprocess/error/audit)
    
    Query Parameters:
        log_type: Type of log (execution, subprocess, error, audit)
        lines: Number of lines to return
        from_line: Starting line number for incremental loading (0-based)
    """
    try:
        result = control_runner.get_task_logs(task_id, log_type, lines, from_line)
        return result
    except Exception as e:
        logger.error(f"[AutoConfig] Error getting run logs: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{task_id}/stop")
async def stop_auto_config(task_id: str, request: ControlRunStopRequest = ControlRunStopRequest(force=False)):
    """
    Stop a running AutoConfig deployment
    Accepts force parameter from request body (JSON)
    """
    try:
        force = request.force if request else False
        
        logger.info(f"[AutoConfig] Stop request for: {task_id} (force={force})")
        result = control_runner.stop_control_task(task_id, force=force)
        logger.info(f"[AutoConfig] AutoConfig {task_id} stop result: {result.get('status')}")
        return result
    except Exception as e:
        logger.error(f"[AutoConfig] Error stopping auto config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/logs/{task_id}/{log_type}")
async def get_log_file(task_id: str, log_type: str = "execution", stream: bool = True):
    """
    Serve log file with streaming support
    This allows frontend to read logs in real-time as they're written
    
    Path: /api/auto-config/logs/{task_id}/{log_type}
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
                def read_file_chunks():
                    with open(log_file_path, 'rb') as f:
                        while True:
                            chunk = f.read(8192)  # Read 8KB chunks
                            if not chunk:
                                break
                            yield chunk
                
                loop = asyncio.get_event_loop()
                for chunk in read_file_chunks():
                    yield chunk
                    await asyncio.sleep(0.001)
            except Exception as e:
                logger.error(f"[AutoConfig] Error streaming log file: {e}")
                yield f"\n[Error reading log file: {e}]\n".encode('utf-8')
        
        if stream:
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
        logger.error(f"[AutoConfig] Error serving log file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
async def get_auto_config_history(control_id: _Optional[str] = None, limit: int = 10):
    """
    Get the last N AutoConfig deployments
    """
    try:
        # Collect recent tasks and filter by control_name = "auto_config"
        tasks = control_runner.task_persistence.get_all_tasks(limit=10000) or []
        enriched = []
        
        for t in tasks:
            state = control_runner.task_persistence.get_task_state(t.get("task_id"))
            if not state:
                continue
            
            # Filter for auto_config tasks
            if state.get("control_name") == "auto_config":
                # If control_id is provided, filter by it (check in script_arguments or env vars)
                if control_id:
                    script_args = state.get("script_arguments", [])
                    if script_args and len(script_args) > 0 and script_args[0] == control_id:
                        enriched.append(state)
                else:
                    enriched.append(state)
        
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
        recent = enriched[:max(0, min(limit, len(enriched)))]
        
        # Format history
        history = []
        for s in recent:
            script_args = s.get("script_arguments", [])
            control_id_from_args = script_args[0] if script_args and len(script_args) > 0 else "unknown"
            
            history.append({
                "task_id": s.get("task_id"),
                "control_id": control_id_from_args,
                "task_name": s.get("task_name", "AutoConfig Deployment"),
                "status": s.get("status") or "unknown",
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
        
        return {
            "control_id": control_id,
            "limit": limit,
            "runs": history,
            "history": history,
            "retrieved_at": datetime.now().isoformat(),
        }
    except Exception as e:
        logger.error(f"[AutoConfig] Error getting history: {e}")
        raise HTTPException(status_code=500, detail=str(e))

