"""
Config Validator Router
Handles Excel config file validation via subprocess execution.
Validates configs across sheets and produces a Validation sheet with errors.
"""
from fastapi import APIRouter, HTTPException
from pathlib import Path as _Path
import json as _json
from typing import Optional as _Optional
from datetime import datetime
import logging
import sys
import os

sys.path.insert(0, str(_Path(__file__).parent.parent))
from control_execution.control_runner import control_runner
from control_execution.task_persistence import TASK_STORAGE_DIR

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/config-validator", tags=["config-validator"])

# Results storage directory
RESULTS_DIR = TASK_STORAGE_DIR / "config_validator_results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/validate")
async def start_validation(request: dict):
    """
    Start config validation by invoking config_validator_script.py as a subprocess.

    Request body:
        - file_path: Path to the Excel config file on the server
    """
    try:
        file_path = request.get("file_path", "").strip()
        if not file_path:
            raise HTTPException(status_code=400, detail="file_path is required")

        control_type = request.get("control_type", "").strip()
        if not control_type:
            raise HTTPException(status_code=400, detail="control_type is required")
        if control_type not in ("QA", "COMP"):
            raise HTTPException(status_code=400, detail="control_type must be QA or COMP")

        # Validate file exists and is an Excel file
        path = _Path(file_path)
        if not path.exists():
            raise HTTPException(status_code=400, detail=f"File not found: {file_path}")
        if path.suffix.lower() not in (".xlsx", ".xls"):
            raise HTTPException(status_code=400, detail="File must be .xlsx or .xls")

        logger.info(f"[ConfigValidator] Starting validation for: {file_path} (control_type={control_type})")

        python_script_path = "api/config_validator_script.py"

        control_params = {
            "control_name": "config_validator",
            "task_name": f"Config Validation ({control_type}) - {path.name}",
            "run_env": "DEV",
            "expected_run_date": datetime.now().strftime("%Y-%m-%d"),
            "python_script_path": python_script_path,
            "script_arguments": [file_path, control_type],
            "environment_variables": {
                "FILE_PATH": file_path,
                "CONTROL_TYPE": control_type,
                "RESULTS_DIR": str(RESULTS_DIR),
            },
            "control_id": "config_validator",
        }

        result = control_runner.run_control_task(control_params)
        result["file_path"] = file_path
        result["control_type"] = control_type

        logger.info(f"[ConfigValidator] Task started: {result.get('task_id')}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ConfigValidator] Error starting validation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{task_id}/status")
async def get_validation_status(task_id: str):
    """Get status for a specific config validation task."""
    try:
        result = control_runner.get_task_status(task_id)
        return result
    except Exception as e:
        logger.error(f"[ConfigValidator] Error getting status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{task_id}/results")
async def get_validation_results(task_id: str):
    """
    Get validation results after completion.
    Reads the results JSON written by the subprocess script.
    """
    try:
        results_file = RESULTS_DIR / f"{task_id}.json"
        if not results_file.exists():
            raise HTTPException(
                status_code=404,
                detail=f"Results not found for task {task_id}. Task may still be running."
            )

        with open(results_file, "r", encoding="utf-8") as f:
            results = _json.load(f)

        results["task_id"] = task_id
        results["retrieved_at"] = datetime.now().isoformat()
        return results

    except HTTPException:
        raise
    except _json.JSONDecodeError as e:
        logger.error(f"[ConfigValidator] Invalid JSON in results file: {e}")
        raise HTTPException(status_code=500, detail="Results file is corrupted")
    except Exception as e:
        logger.error(f"[ConfigValidator] Error getting results: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{task_id}/logs")
async def get_validation_logs(
    task_id: str,
    log_type: str = "execution",
    lines: int = 200,
    from_line: int = 0
):
    """Get logs for a specific config validation task."""
    try:
        result = control_runner.get_task_logs(task_id, log_type, lines, from_line)
        return result
    except Exception as e:
        logger.error(f"[ConfigValidator] Error getting logs: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
async def get_validation_history(limit: int = 20):
    """Get recent config validation runs."""
    try:
        tasks = control_runner.task_persistence.get_all_tasks(limit=10000) or []
        enriched = []

        for t in tasks:
            state = control_runner.task_persistence.get_task_state(t.get("task_id"))
            if not state:
                continue
            if state.get("control_name") != "config_validator":
                continue
            enriched.append(state)

        # Sort: running first, then by updated_at desc
        def _sort_key(s):
            try:
                status = (s.get("status") or "").lower()
                is_running = status in ["running", "started"]
                updated_at = s.get("updated_at") or s.get("started_at") or ""
                return (1 if is_running else 0, updated_at)
            except Exception:
                return (0, "")

        enriched.sort(key=_sort_key, reverse=True)
        recent = enriched[:limit]

        # Check for results availability
        history = []
        for s in recent:
            task_id = s.get("task_id")
            results_file = RESULTS_DIR / f"{task_id}.json"
            has_results = results_file.exists()

            # Try to read summary from results
            validation_passed = None
            total_errors = None
            if has_results:
                try:
                    with open(results_file, "r", encoding="utf-8") as f:
                        res = _json.load(f)
                    validation_passed = res.get("validation_passed")
                    total_errors = res.get("summary", {}).get("total_errors")
                except Exception:
                    pass

            script_args = s.get("script_arguments", [])
            file_path = script_args[0] if script_args else "unknown"

            history.append({
                "task_id": task_id,
                "file_path": file_path,
                "task_name": s.get("task_name", "Config Validation"),
                "status": s.get("status") or "unknown",
                "validation_passed": validation_passed,
                "total_errors": total_errors,
                "has_results": has_results,
                "created_at": s.get("created_at"),
                "updated_at": s.get("updated_at"),
                "started_at": s.get("started_at"),
                "completed_at": s.get("completed_at") or s.get("ended_at"),
                "return_code": s.get("return_code"),
            })

        return {
            "history": history,
            "limit": limit,
            "retrieved_at": datetime.now().isoformat(),
        }

    except Exception as e:
        logger.error(f"[ConfigValidator] Error getting history: {e}")
        raise HTTPException(status_code=500, detail=str(e))
