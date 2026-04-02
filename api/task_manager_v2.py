import uuid
import threading
import logging
import json
import os
import time
import asyncio
import socket
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from pathlib import Path
from etl_subprocess_manager import ETLSubprocessManager
from enhanced_etl import (
    # Completeness Control Steps
    reading_config_comp, read_src_comp, read_tgt_comp,
    pre_harmonisation_src_comp, harmonisation_src_comp, enrichment_file_search_src_comp,
    enrichment_src_comp, data_transform_src_comp,
    pre_harmonisation_tgt_comp, harmonisation_tgt_comp, enrichment_file_search_tgt_comp,
    enrichment_tgt_comp, data_transform_tgt_comp,
    combine_data_comp, apply_rules_comp, output_rules_comp, break_rolling_comp,
    # Legacy ETL functions
    extract, transform, load, validate, enrich, aggregate,
    # Workflow Tool ETL functions
    read_csv, read_parquet, read_excel, convert_parquet, filter_data, join_data, aggregate_data, data_output
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
TASK_STORAGE_DIR = Path("task_storage")
TASK_STORAGE_DIR.mkdir(exist_ok=True)
TASK_TTL_HOURS = 24  # Tasks expire after 24 hours
MAX_CONCURRENT_TASKS = 25  # Limit concurrent tasks

# Thread lock for task operations
task_lock = threading.Lock()

# Store reference to main event loop for WebSocket broadcasting from worker threads
_main_event_loop = None
_event_loop_initialized = False

def set_main_event_loop(loop):
    """Set the main event loop for WebSocket broadcasting"""
    global _main_event_loop, _event_loop_initialized
    _main_event_loop = loop
    _event_loop_initialized = True
    logger.info("Main event loop registered for WebSocket broadcasting")

def get_or_init_event_loop():
    """
    Get or initialize the main event loop (lazy initialization)
    This allows the app to work when wrapped in another FastAPI app
    """
    global _main_event_loop, _event_loop_initialized
    
    if _main_event_loop is not None and _main_event_loop.is_running():
        return _main_event_loop
    
    # Try to get the current running event loop
    try:
        loop = asyncio.get_running_loop()
        if loop.is_running():
            _main_event_loop = loop
            _event_loop_initialized = True
            logger.info("Main event loop auto-registered for WebSocket broadcasting (lazy init)")
            return loop
    except RuntimeError:
        pass
    
    # Try to get event loop (may not be running yet)
    try:
        loop = asyncio.get_event_loop()
        if loop and not loop.is_closed():
            _main_event_loop = loop
            _event_loop_initialized = True
            logger.info("Main event loop auto-registered for WebSocket broadcasting (fallback)")
            return loop
    except RuntimeError:
        pass
    
    return None

def initialize_event_loop():
    """
    Explicitly initialize the event loop (call this from wrapper FastAPI app)
    Returns True if successful, False otherwise
    """
    loop = get_or_init_event_loop()
    if loop:
        set_main_event_loop(loop)
        return True
    return False

# Complete ETL function mapping (same as before)
etl_map = {
    # Completeness Control Steps
    'reading_config_comp': reading_config_comp,
    'read_src_comp': read_src_comp,
    'read_tgt_comp': read_tgt_comp,
    'pre_harmonisation_src_comp': pre_harmonisation_src_comp,
    'harmonisation_src_comp': harmonisation_src_comp,
    'enrichment_file_search_src_comp': enrichment_file_search_src_comp,
    'enrichment_src_comp': enrichment_src_comp,
    'data_transform_src_comp': data_transform_src_comp,
    'pre_harmonisation_tgt_comp': pre_harmonisation_tgt_comp,
    'harmonisation_tgt_comp': harmonisation_tgt_comp,
    'enrichment_file_search_tgt_comp': enrichment_file_search_tgt_comp,
    'enrichment_tgt_comp': enrichment_tgt_comp,
    'data_transform_tgt_comp': data_transform_tgt_comp,
    'combine_data_comp': combine_data_comp,
    'apply_rules_comp': apply_rules_comp,
    'output_rules_comp': output_rules_comp,
    'break_rolling_comp': break_rolling_comp,
    
    # Legacy ETL functions for backward compatibility
    'extract': extract,
    'transform': transform,
    'load': load,
    'validate': validate,
    'enrich': enrich,
    'aggregate': aggregate,
    
    # Workflow Tool ETL functions
    'read_csv': read_csv,
    'read_parquet': read_parquet,
    'read_excel': read_excel,
    'convert_parquet': convert_parquet,
    'filter': filter_data,
    'join': join_data,
    'aggregate': aggregate_data,
    'output': data_output
}

class TaskStatus:
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


def create_task_record(task_id: str, step_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new task record with server tracking information"""
    # Get server information for multi-server tracking
    server_hostname = socket.gethostname()
    try:
        server_ip = socket.gethostbyname(server_hostname)
    except (socket.gaierror, OSError):
        # Fallback if hostname resolution fails
        server_ip = "unknown"
    # Allow server_id to be configured via environment variable, fallback to hostname
    server_id = os.environ.get("SERVER_ID", server_hostname)
    
    return {
        "task_id": task_id,
        "step_name": step_name,
        "status": TaskStatus.PENDING,
        "created_at": datetime.now().isoformat(),
        "started_at": None,
        "completed_at": None,
        "params": params,
        "result": None,
        "error": None,
        "pid": None,
        "thread_id": None,
        "result_file": None,
        "log_file": None,
        # Server tracking fields for multi-server architecture
        "server_hostname": server_hostname,
        "server_ip": server_ip,
        "server_id": server_id
    }

def save_task_to_disk(task_id: str, task_data: Dict[str, Any]):
    """Save task data to disk as JSON file with error handling"""
    try:
        task_file = TASK_STORAGE_DIR / f"{task_id}.json"
        temp_file = task_file.with_suffix('.tmp')
        
        # Write to temporary file first (atomic operation)
        with open(temp_file, 'w') as f:
            json.dump(task_data, f, indent=2, default=str)
        
        # Atomic move to final location (replace works on Windows even if target exists)
        temp_file.replace(task_file)
        logger.debug(f"Saved task {task_id} to disk")
        
    except Exception as e:
        logger.error(f"Error saving task {task_id} to disk: {e}")
        # Clean up temp file if it exists
        if temp_file.exists():
            temp_file.unlink()

def load_task_from_disk(task_id: str) -> Optional[Dict[str, Any]]:
    """Load task data from disk JSON file with error handling"""
    try:
        task_file = TASK_STORAGE_DIR / f"{task_id}.json"
        if not task_file.exists():
            return None
        
        with open(task_file, 'r') as f:
            task_data = json.load(f)
        
        logger.debug(f"Loaded task {task_id} from disk")
        return task_data
        
    except Exception as e:
        logger.error(f"Error loading task {task_id} from disk: {e}")
        return None

def _broadcast_etl_task_update(task_id: str, task_data: Dict[str, Any]):
    """Broadcast ETL task status update via WebSocket (non-blocking)"""
    logger.info(f"_broadcast_etl_task_update CALLED for task {task_id}")
    
    try:
        from routers.websocket import manager
        
        # Format status data for WebSocket
        status = task_data.get("status", "unknown")
        status_data = {
            "status": status,
            "step_name": task_data.get("step_name"),
            "error": task_data.get("error"),
            "created_at": task_data.get("created_at"),
            "started_at": task_data.get("started_at"),
            "completed_at": task_data.get("completed_at")
        }
        
        logger.info(f"Broadcasting WebSocket update for task {task_id}: status={status}")
        logger.debug(f"Status data being broadcast: {status_data}")
        
        # Run async broadcast in event loop
        # Since we're in a worker thread, we need to schedule it on the main event loop
        global _main_event_loop
        
        # Lazy initialization: try to get event loop if not set
        if _main_event_loop is None:
            logger.warning(f"Main event loop is None, attempting lazy initialization...")
            _main_event_loop = get_or_init_event_loop()
            if _main_event_loop is None:
                logger.error(f"Lazy initialization FAILED - event loop still None!")
                logger.error(f"This means WebSocket broadcasts will NOT work!")
                logger.error(f"Task {task_id} status update will NOT be sent to frontend!")
            else:
                logger.info(f"Event loop initialized via lazy init: {_main_event_loop}")
        
        # Check if we have a valid, running event loop
        if _main_event_loop is not None:
            try:
                # Check if loop is still valid and running
                if _main_event_loop.is_closed():
                    logger.warning(f"Main event loop is closed, trying to reinitialize")
                    _main_event_loop = get_or_init_event_loop()
                
                if _main_event_loop is not None and not _main_event_loop.is_closed():
                    # Use the stored main event loop to schedule the coroutine
                    # This works even from worker threads
                    try:
                        future = asyncio.run_coroutine_threadsafe(
                            manager.broadcast_task_update(task_id, status_data),
                            _main_event_loop
                        )
                        logger.info(f"Scheduled WebSocket broadcast for task {task_id} on main event loop (future created)")
                        # Optionally wait for result to catch errors
                        try:
                            result = future.result(timeout=5)  # Wait max 5 seconds
                            logger.debug(f"WebSocket broadcast completed for task {task_id}")
                        except Exception as e:
                            logger.error(f"WebSocket broadcast failed for task {task_id}: {e}", exc_info=True)
                        return
                    except Exception as e:
                        logger.error(f"Failed to schedule broadcast on event loop: {e}", exc_info=True)
                        _main_event_loop = None  # Reset to try fallback
            except (RuntimeError, AttributeError) as e:
                logger.warning(f"Error using main event loop: {e}, trying fallback")
                _main_event_loop = None  # Reset to try again
        
        # Fallback: Try to get/create an event loop
        try:
            # Try to get the running loop (only works if we're in an async context)
            loop = asyncio.get_running_loop()
            if loop and not loop.is_closed():
                # We're in an async context, can use create_task
                asyncio.create_task(manager.broadcast_task_update(task_id, status_data))
                logger.debug(f"Scheduled WebSocket broadcast for task {task_id} on current running loop")
                return
        except RuntimeError:
            # No running loop, try to get the event loop
            try:
                loop = asyncio.get_event_loop()
                if loop and not loop.is_closed():
                    if loop.is_running():
                        asyncio.create_task(manager.broadcast_task_update(task_id, status_data))
                        logger.debug(f"Scheduled WebSocket broadcast for task {task_id} on event loop")
                    else:
                        loop.run_until_complete(manager.broadcast_task_update(task_id, status_data))
                        logger.debug(f"Broadcast WebSocket update for task {task_id} on event loop")
                    return
            except RuntimeError:
                pass
        
        # If we get here, no event loop is available
        logger.error(f"CRITICAL: No event loop available to broadcast task {task_id} update!")
        logger.error(f"main_loop exists: {_main_event_loop is not None}")
        logger.error(f"main_loop closed: {_main_event_loop.is_closed() if _main_event_loop else 'N/A'}")
        logger.error(f"This means the status update for task {task_id} will NOT reach the frontend!")
        logger.error(f"The event loop was NOT initialized properly. This is critical for wrapped apps!")
        
        # Try one more time with a new thread-safe approach
        logger.warning(f"Attempting emergency event loop initialization...")
        try:
            # Try to get any available event loop
            import threading
            import queue
            
            # Create a queue to pass the result
            result_queue = queue.Queue()
            
            def try_broadcast_in_new_loop():
                """Try to create a new event loop and broadcast"""
                try:
                    new_loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(new_loop)
                    new_loop.run_until_complete(manager.broadcast_task_update(task_id, status_data))
                    new_loop.close()
                    result_queue.put(True)
                    logger.info(f"Emergency broadcast succeeded for task {task_id}")
                except Exception as e:
                    logger.error(f"Emergency broadcast failed: {e}", exc_info=True)
                    result_queue.put(False)
            
            # Try in a separate thread
            thread = threading.Thread(target=try_broadcast_in_new_loop, daemon=True)
            thread.start()
            thread.join(timeout=2)  # Wait max 2 seconds
            
            if not result_queue.empty():
                success = result_queue.get()
                if success:
                    logger.info(f"Emergency broadcast completed for task {task_id}")
                    return
        except Exception as e:
            logger.error(f"Emergency broadcast attempt failed: {e}", exc_info=True)
        
    except ImportError:
        # WebSocket not available, skip
        logger.debug("WebSocket manager not available")
    except Exception as e:
        logger.error(f"Failed to broadcast ETL task update for {task_id}: {e}", exc_info=True)

def etl_worker_thread(task_id: str, step_name: str, params: Dict[str, Any]):
    """Supervisor thread that launches ETL in a subprocess and monitors it"""
    thread_id = threading.current_thread().ident
    logger.info(f"Starting ETL step: {step_name} for task: {task_id} via subprocess (supervisor thread: {thread_id})")

    params_file = TASK_STORAGE_DIR / f"{task_id}_params.json"
    result_file = TASK_STORAGE_DIR / f"{task_id}_result.json"
    log_dir = TASK_STORAGE_DIR / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Persist params for worker
        with open(params_file, 'w', encoding='utf-8') as f:
            json.dump(params, f, indent=2, default=str)

        # Start subprocess (same venv as API via sys.executable and inherited env)
        manager = ETLSubprocessManager(task_id=task_id, log_directory=log_dir)
        pid, exec_log_file = manager.start_etl_task(
            step_name=step_name,
            params_file=str(params_file),
            result_file=str(result_file),
            timeout=6 * 3600
        )

        # Mark as running with subprocess PID
        with task_lock:
            task_data = load_task_from_disk(task_id)
            if not task_data:
                logger.error(f"Task {task_id} not found in disk storage")
                return
            task_data.update({
                "status": TaskStatus.RUNNING,
                "started_at": datetime.now().isoformat(),
                "thread_id": thread_id,
                "pid": pid,
                "result_file": str(result_file),
                "log_file": exec_log_file
            })
            save_task_to_disk(task_id, task_data)

        _broadcast_etl_task_update(task_id, task_data)

        # Monitor subprocess until completion
        while True:
            status = manager.get_status()
            state = status.get("status")
            if state in ("completed", "failed", "error", "not_started"):
                break
            time.sleep(1)

        # Read result (if present)
        result_data = None
        if result_file.exists():
            try:
                with open(result_file, 'r', encoding='utf-8') as rf:
                    result_data = json.load(rf)
            except Exception as e:
                logger.warning(f"Failed to read result file for task {task_id}: {e}")

        completed_ok = (status.get("status") == "completed" and
                        isinstance(result_data, dict) and
                        result_data.get("status") == "success")

        with task_lock:
            task_data = load_task_from_disk(task_id)
            if task_data:
                if completed_ok:
                    task_data.update({
                        "status": TaskStatus.COMPLETED,
                        "completed_at": datetime.now().isoformat(),
                        "result": result_data,
                        "error": None
                    })
                    logger.info(f"Task {task_id} marked as COMPLETED (status={task_data.get('status')})")
                else:
                    error_msg = None
                    if isinstance(result_data, dict):
                        error_msg = result_data.get("fail_message") or result_data.get("error")
                    error_msg = error_msg or f"Subprocess finished with status: {status.get('status')}"
                    task_data.update({
                        "status": TaskStatus.FAILED,
                        "completed_at": datetime.now().isoformat(),
                        "result": result_data,
                        "error": error_msg
                    })
                    logger.info(f"Task {task_id} marked as FAILED (status={task_data.get('status')})")
                save_task_to_disk(task_id, task_data)

        # Broadcast using the updated in-memory task_data (fixes potential race condition)
        if task_data:
            logger.info(f"About to broadcast ETL task {task_id} update with status: {task_data.get('status')}")
            logger.info(f"Task data keys: {list(task_data.keys())}")
            _broadcast_etl_task_update(task_id, task_data)
            logger.info(f"Broadcast function returned for task {task_id}")
        else:
            logger.error(f"Cannot broadcast: task_data is None for task {task_id}")
        logger.info(f"ETL step {step_name} finished for task: {task_id} with status {task_data.get('status') if task_data else 'unknown'}")

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error supervising ETL subprocess {step_name} for task {task_id}: {error_msg}")
        task_data = None
        with task_lock:
            task_data = load_task_from_disk(task_id)
            if task_data:
                task_data.update({
                    "status": TaskStatus.FAILED,
                    "completed_at": datetime.now().isoformat(),
                    "result": None,
                    "error": error_msg
                })
                save_task_to_disk(task_id, task_data)
        # Broadcast using the updated in-memory task_data (fixes potential race condition)
        if task_data:
            logger.info(f"Broadcasting ETL task {task_id} error update with status: {task_data.get('status')}")
            _broadcast_etl_task_update(task_id, task_data)
        time.sleep(1)

def run_etl_task(step_name: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Start an ETL task supervised by a lightweight thread that launches a subprocess"""
    if params is None:
        params = {}
    
    # Check concurrent task limit
    with task_lock:
        running_tasks = get_running_tasks_count()
        if running_tasks >= MAX_CONCURRENT_TASKS:
            raise Exception(f"Maximum concurrent tasks limit reached ({MAX_CONCURRENT_TASKS})")
    
    # Generate unique task ID
    task_id = str(uuid.uuid4())
    
    # Ensure task ID is unique
    while load_task_from_disk(task_id) is not None:
        task_id = str(uuid.uuid4())
    
    logger.info(f"Starting ETL task: {step_name} with ID: {task_id}")
    
    # Create task record
    task_data = create_task_record(task_id, step_name, params)
    
    # Save to disk and cache
    with task_lock:
        save_task_to_disk(task_id, task_data)
    
    # Start worker thread
    thread = threading.Thread(
        target=etl_worker_thread,
        args=(task_id, step_name, params),
        daemon=True
    )
    thread.start()
    
    logger.info(f"ETL task {task_id} supervisor started in thread: {thread.ident}")
    
    # Get server information from task record
    server_hostname = task_data.get("server_hostname")
    server_ip = task_data.get("server_ip")
    server_id = task_data.get("server_id")
    
    return {
        "task_id": task_id,
        "status": "started",
        "pid": None,  # Subprocess PID will be available shortly via status endpoint
        "thread_id": thread.ident,
        "server_hostname": server_hostname,
        "server_ip": server_ip,
        "server_id": server_id
    }

def get_task_status(task_id: str) -> Dict[str, Any]:
    """Get the current status of a task"""
    logger.info(f"Getting status for task: {task_id}")
    
    task_data = load_task_from_disk(task_id)
    
    if not task_data:
        logger.warning(f"Task {task_id} not found")
        return {"status": "not_found", "output": None}
    
    status = task_data.get("status", "unknown")
    result = task_data.get("result")
    error = task_data.get("error")
    
    # Removed detailed status logging - only log if not found
    if status == "not_found":
        logger.warning(f"Task {task_id} not found")
    
    return {
        "status": status,
        "output": result if status == TaskStatus.COMPLETED else None,
        "error": error if status == TaskStatus.FAILED else None,
        "step_name": task_data.get("step_name"),
        "created_at": task_data.get("created_at"),
        "started_at": task_data.get("started_at"),
        "completed_at": task_data.get("completed_at"),
        "server_hostname": task_data.get("server_hostname"),
        "server_ip": task_data.get("server_ip"),
        "server_id": task_data.get("server_id"),
        "pid": task_data.get("pid")
    }

def get_task_output(task_id: str) -> Any:
    """Get the output of a completed task"""
    # Removed detailed logging - only log errors
    
    task_data = load_task_from_disk(task_id)
    
    if not task_data:
        logger.warning(f"Task {task_id} not found")
        return "Task not found"
    
    status = task_data.get("status", "unknown")
    result = task_data.get("result")
    error = task_data.get("error")
    
    if status == TaskStatus.RUNNING:
        return "Task still running"
    elif status == TaskStatus.COMPLETED:
        return result
    elif status == TaskStatus.FAILED:
        logger.error(f"Task {task_id} failed: {error}")
        return f"Task failed: {error}"
    else:
        return f"Task status: {status}"

def stop_task(task_id: str) -> Dict[str, Any]:
    """Stop a running task (mark as cancelled)"""
    logger.info(f"Stopping task: {task_id}")
    
    with task_lock:
        task_data = load_task_from_disk(task_id)
        if not task_data:
            return {"status": "not_found", "task_id": task_id}
        
        if task_data.get("status") == TaskStatus.RUNNING:
            task_data.update({
                "status": TaskStatus.CANCELLED,
                "completed_at": datetime.now().isoformat(),
                "error": "Task cancelled by user"
            })
            save_task_to_disk(task_id, task_data)
            logger.info(f"Task {task_id} marked as cancelled")
            return {"status": "cancelled", "task_id": task_id}
        else:
            return {"status": "not_running", "task_id": task_id}

def get_running_tasks_count() -> int:
    """Get count of currently running tasks"""
    count = 0
    for task_file in TASK_STORAGE_DIR.glob("*.json"):
        try:
            with open(task_file, 'r') as f:
                task_data = json.load(f)
                if task_data.get("status") == TaskStatus.RUNNING:
                    count += 1
        except Exception as e:
            logger.warning(f"Error reading task file {task_file}: {e}")
    return count

def cleanup_completed_tasks() -> Dict[str, Any]:
    """Clean up old completed tasks and data files at 23 GMT daily"""
    logger.info("=" * 80)
    logger.info("STARTING COMPREHENSIVE CLEANUP")
    logger.info("=" * 80)
    
    # Get current time in UTC
    current_time = datetime.utcnow()
    logger.info(f"Current UTC time: {current_time.strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"Current hour: {current_time.hour}")
    
    # Clean up tasks older than TTL
    cutoff_time = current_time - timedelta(hours=TASK_TTL_HOURS)
    logger.info(f"Cutoff time (TTL={TASK_TTL_HOURS}h): {cutoff_time.strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"Task storage directory: {TASK_STORAGE_DIR}")
    
    cleaned_tasks = []
    cleaned_data_files = []
    
    with task_lock:
        # Clean up task JSON files
        task_files = list(TASK_STORAGE_DIR.glob("*.json"))
        logger.info(f"Found {len(task_files)} task files to scan")
        
        tasks_scanned = 0
        for task_file in task_files:
            try:
                tasks_scanned += 1
                with open(task_file, 'r') as f:
                    task_data = json.load(f)
                
                # Check if task is old and completed/failed/cancelled
                created_at = datetime.fromisoformat(task_data.get("created_at", "1970-01-01T00:00:00"))
                status = task_data.get("status")
                
                logger.debug(f"Task {task_data.get('task_id', 'unknown')}: created={created_at.strftime('%Y-%m-%d %H:%M:%S')}, status={status}")
                
                if (created_at < cutoff_time and 
                    status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]):
                    
                    task_id = task_data.get("task_id")
                    if task_id:
                        # Remove file
                        task_file.unlink()
                        cleaned_tasks.append(task_id)
                        logger.info(f"Cleaned up old task: {task_id} (age: {(current_time - created_at).days} days)")
            
            except Exception as e:
                logger.warning(f"Error processing task file {task_file}: {e}")
        
        logger.info(f"Scanned {tasks_scanned} task files")
        
        # Clean up data files from the data directory
        data_dir = Path("data")
        if data_dir.exists():
            data_files = list(data_dir.glob("*.csv"))
            logger.info(f"Found {len(data_files)} data files to scan")
            
            data_files_scanned = 0
            for data_file in data_files:
                try:
                    data_files_scanned += 1
                    # Get file modification time
                    file_mtime = datetime.fromtimestamp(data_file.stat().st_mtime)
                    
                    logger.debug(f"Data file {data_file.name}: modified={file_mtime.strftime('%Y-%m-%d %H:%M:%S')}")
                    
                    # If file is older than TTL, delete it
                    if file_mtime < cutoff_time:
                        file_age_days = (current_time - file_mtime).days
                        data_file.unlink()
                        cleaned_data_files.append(data_file.name)
                        logger.info(f"Cleaned up old data file: {data_file.name} (age: {file_age_days} days)")
                
                except Exception as e:
                    logger.warning(f"Error processing data file {data_file}: {e}")
            
            logger.info(f"Scanned {data_files_scanned} data files")
        else:
            logger.warning(f"Data directory does not exist: {data_dir}")
        
    
    logger.info("=" * 80)
    logger.info(f"COMPREHENSIVE CLEANUP COMPLETED")
    logger.info(f"   Removed {len(cleaned_tasks)} old task files")
    logger.info(f"   Removed {len(cleaned_data_files)} old data files")
    logger.info("   Cache cleared: False (file-based only)")
    logger.info(f"   Cleanup time: {current_time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Log details of cleaned tasks (first 10)
    if cleaned_tasks:
        logger.info(f"   Cleaned task IDs (showing first 10):")
        for task_id in cleaned_tasks[:10]:
            logger.info(f"      - {task_id}")
        if len(cleaned_tasks) > 10:
            logger.info(f"      ... and {len(cleaned_tasks) - 10} more")
    
    # Log details of cleaned data files (first 10)
    if cleaned_data_files:
        logger.info(f"   Cleaned data files (showing first 10):")
        for file_name in cleaned_data_files[:10]:
            logger.info(f"      - {file_name}")
        if len(cleaned_data_files) > 10:
            logger.info(f"      ... and {len(cleaned_data_files) - 10} more")
    
    logger.info("=" * 80)
    
    return {
        "tasks_cleaned": len(cleaned_tasks),
        "data_files_cleaned": len(cleaned_data_files),
        "cleaned_task_ids": cleaned_tasks,
        "cleaned_data_files": cleaned_data_files,
        "cleanup_time": current_time.isoformat(),
        "cache_cleared": False
    }

def get_all_tasks(limit: int = 100) -> List[Dict[str, Any]]:
    """Get all tasks with optional limit"""
    tasks = []
    
    for task_file in sorted(TASK_STORAGE_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        if len(tasks) >= limit:
            break
            
        try:
            with open(task_file, 'r') as f:
                task_data = json.load(f)
                # Return only essential info
                tasks.append({
                    "task_id": task_data.get("task_id"),
                    "step_name": task_data.get("step_name"),
                    "status": task_data.get("status"),
                    "created_at": task_data.get("created_at"),
                    "completed_at": task_data.get("completed_at")
                })
        except Exception as e:
            logger.warning(f"Error reading task file {task_file}: {e}")
    
    return tasks

def get_system_stats() -> Dict[str, Any]:
    """Get system statistics including cache health"""
    total_tasks = 0
    running_tasks = 0
    completed_tasks = 0
    failed_tasks = 0
    
    for task_file in TASK_STORAGE_DIR.glob("*.json"):
        try:
            with open(task_file, 'r') as f:
                task_data = json.load(f)
                total_tasks += 1
                status = task_data.get("status")
                
                if status == TaskStatus.RUNNING:
                    running_tasks += 1
                elif status == TaskStatus.COMPLETED:
                    completed_tasks += 1
                elif status == TaskStatus.FAILED:
                    failed_tasks += 1
        except Exception as e:
            logger.warning(f"Error reading task file {task_file}: {e}")
    
    return {
        "total_tasks": total_tasks,
        "running_tasks": running_tasks,
        "completed_tasks": completed_tasks,
        "failed_tasks": failed_tasks,
        "max_concurrent_tasks": MAX_CONCURRENT_TASKS,
        "task_ttl_hours": TASK_TTL_HOURS,
        "storage_directory": str(TASK_STORAGE_DIR),
        "cache_type": "file_only",
        "cache_stats": None
    }
