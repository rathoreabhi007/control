import json
import logging
from datetime import datetime, date
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/file-monitoring", tags=["file-monitoring"])

BASE_DIR = Path(__file__).parent.parent
CONFIG_PATH = BASE_DIR / "file_monitoring.json"
STATUS_DIR = BASE_DIR / "file_status"


def _load_config() -> dict:
    if not CONFIG_PATH.exists():
        raise HTTPException(status_code=500, detail="file_monitoring.json config not found")
    with open(CONFIG_PATH, "r") as f:
        return json.load(f)


def _load_status_file(file_type: str, date_str: str) -> dict:
    """Load status file for given file_type and YYYYMMDD date string. Returns empty if missing."""
    STATUS_DIR.mkdir(parents=True, exist_ok=True)
    status_path = STATUS_DIR / f"{file_type}_status_{date_str}.json"
    if not status_path.exists():
        return {"files": []}
    try:
        with open(status_path, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error("Failed to load status file %s: %s", status_path, e)
        return {"files": []}


def _merge_status(config_entries: list, status_data: dict, monitoring_date: str) -> list:
    """Merge status file entries onto config entries by file_id. Synthesise not_received for missing entries."""
    status_by_id = {entry["file_id"]: entry for entry in status_data.get("files", [])}

    results = []
    for cfg in config_entries:
        if not cfg.get("enabled", True):
            continue
        file_id = cfg["file_id"]
        status_entry = status_by_id.get(file_id, {})

        results.append({
            "file_id": file_id,
            "display_name": cfg.get("display_name", cfg.get("file_name", file_id)),
            "file_name": cfg.get("file_name", ""),
            "regulation": cfg.get("regulation", "Unknown"),
            "asset_class": cfg.get("asset_class", "Unknown"),
            "sub_control_name": cfg.get("sub_control_name", "Unknown"),
            "control_name": cfg.get("control_name", "Unknown"),
            "frequency": cfg.get("frequency", "Daily"),
            "status": status_entry.get("status", "not_received"),
            "arrival_time": status_entry.get("arrival_time"),
            "note": status_entry.get("note"),
            "monitoring_date": monitoring_date,
        })

    return results


@router.get("/status")
def get_file_monitoring_status(
    file_type: str = Query(..., description="'input' or 'output'"),
    monitoring_date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format. Defaults to today."),
    limit: int = Query(5000, ge=1, le=10000),
):
    if file_type not in ("input", "output"):
        raise HTTPException(status_code=400, detail="file_type must be 'input' or 'output'")

    if monitoring_date is None:
        monitoring_date = date.today().isoformat()

    try:
        datetime.strptime(monitoring_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="monitoring_date must be in YYYY-MM-DD format")

    date_str = monitoring_date.replace("-", "")

    config = _load_config()
    config_key = "input_files" if file_type == "input" else "output_files"
    config_entries = config.get(config_key, [])

    status_data = _load_status_file(file_type, date_str)
    file_statuses = _merge_status(config_entries, status_data, monitoring_date)

    if limit:
        file_statuses = file_statuses[:limit]

    return {
        "file_statuses": file_statuses,
        "total_count": len(file_statuses),
        "monitoring_date": monitoring_date,
        "file_type": file_type,
        "retrieved_at": datetime.now().isoformat(),
    }


@router.get("/hierarchy")
def get_file_monitoring_hierarchy(
    file_type: str = Query("input", description="'input' or 'output'"),
):
    if file_type not in ("input", "output"):
        raise HTTPException(status_code=400, detail="file_type must be 'input' or 'output'")

    config = _load_config()
    config_key = "input_files" if file_type == "input" else "output_files"
    entries = [e for e in config.get(config_key, []) if e.get("enabled", True)]

    def unique_sorted(values):
        return sorted(set(v for v in values if v))

    return {
        "regulations": unique_sorted(e.get("regulation", "") for e in entries),
        "asset_classes": unique_sorted(e.get("asset_class", "") for e in entries),
        "sub_control_names": unique_sorted(e.get("sub_control_name", "") for e in entries),
        "control_names": unique_sorted(e.get("control_name", "") for e in entries),
        "frequencies": unique_sorted(e.get("frequency", "") for e in entries),
        "statuses": ["received", "not_received"],
    }


@router.get("/config")
def get_file_monitoring_config():
    config = _load_config()
    return config
