"""
ETL Task Router
Handles ETL step execution, status, output, and management
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from typing import Dict, Any, List
import logging
import sys
import asyncio
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from task_manager_v2 import (
    run_etl_task, get_task_status, get_task_output, stop_task,
    cleanup_completed_tasks, get_all_tasks, TASK_STORAGE_DIR
)
from .models import (
    ETLStepRequest, TaskResponse, StatusResponse, OutputResponse, StopResponse
)
from .utils import merge_previous_outputs_to_params, COMPLETENESS_STEPS, WORKFLOW_STEPS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["etl"])


@router.get("/steps")
async def get_available_steps():
    """Get all available ETL steps"""
    all_steps = {**COMPLETENESS_STEPS, **WORKFLOW_STEPS}
    return {
        "steps": all_steps,
        "total_steps": len(all_steps)
    }


@router.post("/run/{step_name}", response_model=TaskResponse)
async def run_etl_step(step_name: str, request: ETLStepRequest):
    """Run an ETL step with parameters and previous outputs"""
    try:
        logger.info(f"Received ETL request for step: {step_name}")
        
        # Validate step name against both completeness and workflow steps
        if step_name not in COMPLETENESS_STEPS and step_name not in WORKFLOW_STEPS:
            raise HTTPException(status_code=400, detail=f"Invalid step name: {step_name}")
        
        # Prepare parameters
        params = {}
        
        # Add default parameters if not provided
        if request.parameters:
            params.update(request.parameters.dict())
        else:
            # Use default parameters
            from .models import RunParameters
            default_params = RunParameters()
            params.update(default_params.dict())
        
        # Add custom parameters if provided
        if request.custom_params:
            params.update(request.custom_params)
        
        # Add step information
        params['step_name'] = step_name
        if step_name in COMPLETENESS_STEPS:
            params['step_display_name'] = COMPLETENESS_STEPS[step_name]
        else:
            params['step_display_name'] = WORKFLOW_STEPS[step_name]
        
        # Validate previous outputs (removed detailed logging)
        if request.previous_outputs:
            for node_id, output in request.previous_outputs.items():
                # Validate that previous outputs are successful
                if isinstance(output, dict):
                    if output.get('status') == 'failed' or output.get('fail_message'):
                        error_msg = f"Cannot run {step_name}: dependency {node_id} has failed - {output.get('fail_message', 'Unknown error')}"
                        logger.error(f"{error_msg}")
                        raise HTTPException(
                            status_code=400,
                            detail=error_msg
                        )
        
        # Merge previous outputs into params
        params = merge_previous_outputs_to_params(params, request.previous_outputs)
        
        # Start the ETL task
        result = run_etl_task(step_name, params)
        # Removed result logging
        
        return TaskResponse(
            task_id=result["task_id"],
            status=result["status"],
            pid=result.get("pid"),
            thread_id=result.get("thread_id"),
            step_name=step_name,
            server_hostname=result.get("server_hostname"),
            server_ip=result.get("server_ip"),
            server_id=result.get("server_id")
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting ETL task: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{task_id}", response_model=StatusResponse)
async def get_status(task_id: str):
    """Get the status of a running task"""
    try:
        # Removed detailed status logging
        result = get_task_status(task_id)
        return StatusResponse(**result)
    except Exception as e:
        logger.error(f"Error getting task status for {task_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/output/{task_id}")
async def get_output(task_id: str):
    """Get the output of a task"""
    try:
        # Removed detailed output logging
        result = get_task_output(task_id)
        return {"output": result}
    except Exception as e:
        logger.error(f"Error getting task output for {task_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stop/{task_id}", response_model=StopResponse)
async def stop_task_endpoint(task_id: str):
    """Stop a running task"""
    try:
        logger.info(f"Stopping task: {task_id}")
        result = stop_task(task_id)
        return StopResponse(**result)
    except Exception as e:
        logger.error(f"Error stopping task: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cleanup/now")
async def manual_cleanup():
    """Manually trigger cleanup of completed tasks"""
    try:
        logger.info("Manual cleanup triggered")
        result = cleanup_completed_tasks()
        return {
            "status": "success",
            "message": f"Manual cleanup completed: {result['tasks_cleaned']} tasks cleaned",
            "details": result
        }
    except Exception as e:
        logger.error(f"Error during manual cleanup: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tasks", response_model=List[Dict[str, Any]])
async def get_all_tasks_endpoint(limit: int = 100):
    """Get all tasks with optional limit"""
    try:
        tasks = get_all_tasks(limit)
        return tasks
    except Exception as e:
        logger.error(f"Error getting all tasks: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/etl/logs/{task_id}")
async def get_etl_task_logs(task_id: str, log_type: str = "execution", stream: bool = True):
    """
    Serve ETL task log file with streaming support
    This allows frontend to read logs in real-time as they're written
    
    Path: /api/etl/logs/{task_id}
    Query params:
        log_type: Type of log (execution, subprocess) - default: execution
        stream: If True, streams the file in chunks (default: True)
    """
    try:
        logger.info(f"[ETL Logs] Request for task_id: {task_id}, log_type: {log_type}")
        
        # Get task status to find log file path
        task_status = get_task_status(task_id)
        log_file_path = None
        
        # Try to get log file from task status first
        if task_status and task_status.get("log_file"):
            log_file_path = Path(task_status["log_file"])
            logger.info(f"[ETL Logs] Found log_file in task status: {log_file_path}")
            # Verify the file exists
            if not log_file_path.exists():
                logger.warning(f"[ETL Logs] Log file from task status doesn't exist: {log_file_path}")
                log_file_path = None
            else:
                logger.info(f"[ETL Logs] Using log file from task status: {log_file_path}")
        
        # If not found in task status, construct log file path based on standard location
        if not log_file_path:
            log_dir = TASK_STORAGE_DIR / "logs"
            logger.info(f"[ETL Logs] Constructing log path. Base directory: {log_dir}")
            
            # Try execution log first (default), then subprocess log
            if log_type == "execution":
                log_file_path = log_dir / "execution" / f"{task_id}_execution.log"
                logger.info(f"[ETL Logs] Trying execution log: {log_file_path}")
            elif log_type == "subprocess":
                log_file_path = log_dir / "subprocess" / f"{task_id}_subprocess.log"
                logger.info(f"[ETL Logs] Trying subprocess log: {log_file_path}")
            else:
                # Default to execution
                log_file_path = log_dir / "execution" / f"{task_id}_execution.log"
                logger.info(f"[ETL Logs] Default to execution log: {log_file_path}")
            
            # If execution log doesn't exist, try subprocess log as fallback
            if not log_file_path.exists() and log_type == "execution":
                subprocess_log = log_dir / "subprocess" / f"{task_id}_subprocess.log"
                logger.info(f"[ETL Logs] Execution log not found, trying subprocess fallback: {subprocess_log}")
                if subprocess_log.exists():
                    log_file_path = subprocess_log
                    logger.info(f"[ETL Logs] Using subprocess log as fallback: {log_file_path}")
                else:
                    logger.warning(f"[ETL Logs] Subprocess log also not found: {subprocess_log}")
            elif log_file_path.exists():
                logger.info(f"[ETL Logs] Found log file: {log_file_path}")
        
        # Security: Ensure path is within allowed directory
        if not str(log_file_path).startswith(str(TASK_STORAGE_DIR)):
            logger.error(f"[ETL Logs] Security check failed. Path: {log_file_path}, Allowed: {TASK_STORAGE_DIR}")
            raise HTTPException(status_code=403, detail="Invalid log path")
        
        if not log_file_path.exists():
            logger.error(f"[ETL Logs] Log file not found: {log_file_path}")
            logger.error(f"[ETL Logs] Absolute path: {log_file_path.absolute()}")
            logger.error(f"[ETL Logs] Parent directory exists: {log_file_path.parent.exists()}")
            if log_file_path.parent.exists():
                logger.error(f"[ETL Logs] Files in parent directory: {list(log_file_path.parent.iterdir())}")
            raise HTTPException(status_code=404, detail=f"Log file not found: {log_file_path.name}")
        
        logger.info(f"[ETL Logs] Successfully resolved log file: {log_file_path.absolute()}")
        
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
        logger.error(f"Error serving ETL log file: {e}")
        raise HTTPException(status_code=500, detail=str(e))

