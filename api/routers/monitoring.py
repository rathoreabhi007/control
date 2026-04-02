"""
System Monitoring Router
Handles CPU, memory, and system monitoring data
"""
from collections import deque
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from datetime import datetime, timedelta, timezone
from pathlib import Path
import re
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/monitoring", tags=["monitoring"])

RANGE_WINDOWS = {
    "1h": timedelta(hours=1),
    "6h": timedelta(hours=6),
    "12h": timedelta(hours=12),
    "24h": timedelta(hours=24),
}

CPU_RE = re.compile(r"CPU:\s+([\d.]+)%")
FREQ_RE = re.compile(r"Freq:\s+([\d.]+)MHz")
LOAD_RE = re.compile(r"Load:\s+([\d.]+)/([\d.]+)/([\d.]+)")
MEM_PERCENT_RE = re.compile(r"MEM:\s+([\d.]+)%")
MEM_USED_RE = re.compile(r"Used:\s+([\d.]+[A-Z]+)")
MEM_AVAIL_RE = re.compile(r"Avail:\s+([\d.]+[A-Z]+)")
MEM_TOTAL_RE = re.compile(r"Total:\s+([\d.]+[A-Z]+)")
SWAP_RE = re.compile(r"SWAP:\s+([\d.]+)%")
CORE_RE = re.compile(r"Per-Core:\s+\[(.*?)\]")


def parse_memory_value(mem_str: Optional[str]) -> float:
    """Parse memory string like '8.50GB' to bytes."""
    if not mem_str:
        return 0
    units = {"B": 1, "KB": 1024, "MB": 1024**2, "GB": 1024**3, "TB": 1024**4}
    match = re.match(r"([\d.]+)([A-Z]+)", mem_str.strip())
    if match:
        value, unit = match.groups()
        return float(value) * units.get(unit, 1)
    return 0


def parse_timestamp(timestamp_str: str) -> Optional[datetime]:
    """
    Parse timestamp in multiple formats and return timezone-aware UTC datetime.
    """
    try:
        if "T" in timestamp_str:
            parsed_dt = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
        else:
            parsed_dt = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S")

        if parsed_dt.tzinfo is None:
            parsed_dt = parsed_dt.replace(tzinfo=timezone.utc)
        return parsed_dt.astimezone(timezone.utc)
    except Exception as e:
        logger.warning(f"Failed to parse timestamp '{timestamp_str}': {e}")
        return None


def resolve_log_path(log_file: Optional[str]) -> Path:
    if log_file:
        return Path(log_file)

    default_log = Path("cpu_usage.log")
    if default_log.exists():
        return default_log
    return Path("api/cpu_usage.log")


def parse_monitoring_line(line: str) -> Optional[dict]:
    stripped = line.strip()
    if line.startswith("=") or not stripped or "Monitoring Started" in line:
        return None

    parts = stripped.split(" | ")
    if len(parts) < 3:
        return None

    timestamp_dt = parse_timestamp(parts[0].strip())
    if not timestamp_dt:
        return None

    cpu_match = CPU_RE.search(line)
    freq_match = FREQ_RE.search(line)
    load_match = LOAD_RE.search(line)
    mem_percent_match = MEM_PERCENT_RE.search(line)
    mem_used_match = MEM_USED_RE.search(line)
    mem_avail_match = MEM_AVAIL_RE.search(line)
    mem_total_match = MEM_TOTAL_RE.search(line)
    swap_match = SWAP_RE.search(line)
    core_match = CORE_RE.search(line)

    core_usage = []
    if core_match:
        core_str = core_match.group(1).strip()
        if core_str:
            try:
                core_usage = [float(x.strip().rstrip("%")) for x in core_str.split(",") if x.strip()]
            except Exception:
                core_usage = []

    return {
        "_timestamp_dt": timestamp_dt,
        "record": {
            "timestamp": timestamp_dt.isoformat(),
            "cpu_percent": float(cpu_match.group(1)) if cpu_match else 0,
            "frequency": float(freq_match.group(1)) if freq_match else 0,
            "load_1min": float(load_match.group(1)) if load_match else 0,
            "load_5min": float(load_match.group(2)) if load_match else 0,
            "load_15min": float(load_match.group(3)) if load_match else 0,
            "mem_percent": float(mem_percent_match.group(1)) if mem_percent_match else 0,
            "mem_used": parse_memory_value(mem_used_match.group(1) if mem_used_match else None),
            "mem_available": parse_memory_value(mem_avail_match.group(1) if mem_avail_match else None),
            "mem_total": parse_memory_value(mem_total_match.group(1) if mem_total_match else None),
            "swap_percent": float(swap_match.group(1)) if swap_match else 0,
            "core_usage": core_usage,
        },
    }


def downsample_records(data: list, max_points: int) -> list:
    """Reduce payload size while preserving chronology."""
    if len(data) <= max_points:
        return data
    step = max(1, len(data) // max_points)
    sampled = data[::step]
    return sampled[-max_points:]


@router.get("/servers")
def get_available_servers():
    """
    Get list of available monitoring log files (servers)
    Looks for files matching pattern: *cpu_usage.log or *_monitoring.log
    """
    try:
        # Look for monitoring log files in current directory and api directory
        search_paths = [Path("."), Path("api")]
        log_files = []
        
        for search_path in search_paths:
            if not search_path.exists():
                continue
            
            # Find all CPU monitoring log files
            for pattern in ["*cpu_usage.log", "*_monitoring.log", "cpu_usage*.log"]:
                for log_file in search_path.glob(pattern):
                    if log_file.is_file():
                        # Extract server name from filename
                        filename = log_file.stem
                        
                        # Parse server name
                        if filename == "cpu_usage":
                            server_name = "Local Server"
                        elif "_cpu_usage" in filename:
                            server_name = filename.replace("_cpu_usage", "").replace("_", " ").title()
                        elif "_monitoring" in filename:
                            server_name = filename.replace("_monitoring", "").replace("_", " ").title()
                        else:
                            server_name = filename.replace("_", " ").title()
                        
                        log_files.append({
                            "server_name": server_name,
                            "log_file": str(log_file),
                            "filename": log_file.name,
                            "size_mb": round(log_file.stat().st_size / (1024 * 1024), 2),
                            "modified_at": datetime.fromtimestamp(log_file.stat().st_mtime).isoformat()
                        })
        
        # Remove duplicates and sort by name
        unique_files = {f["log_file"]: f for f in log_files}
        sorted_files = sorted(unique_files.values(), key=lambda x: x["server_name"])
        
        logger.info(f"Found {len(sorted_files)} monitoring log files")
        
        return {
            "success": True,
            "servers": sorted_files,
            "total": len(sorted_files)
        }
        
    except Exception as e:
        logger.error(f"Error listing monitoring servers: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("")
def get_system_monitoring(
    range: str = "1h",
    log_file: Optional[str] = None,
    max_points: int = Query(default=1200, ge=100, le=10000),
):
    """
    Get system monitoring data (CPU, Memory, etc.)
    Reads from specified log file and returns parsed data
    
    Query Parameters:
        range: Time range (1h, 6h, 12h, 24h, all)
        log_file: Path to log file (optional, defaults to cpu_usage.log)
    """
    try:
        log_path = resolve_log_path(log_file)
        
        if not log_path.exists():
            return {
                "success": False,
                "error": f"Monitoring log file not found: {log_path}. Please ensure the monitoring script is running.",
                "data": [],
                "range": range
            }

        requested_range = (range or "1h").lower()
        if requested_range not in RANGE_WINDOWS and requested_range != "all":
            logger.warning(f"Unknown range '{range}', defaulting to 1h")
            requested_range = "1h"

        cutoff = None
        if requested_range in RANGE_WINDOWS:
            cutoff = datetime.now(timezone.utc) - RANGE_WINDOWS[requested_range]

        record_buffer = deque(maxlen=max_points) if requested_range == "all" else []
        total_parsed = 0

        with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                parsed = parse_monitoring_line(line)
                if not parsed:
                    continue

                total_parsed += 1
                if cutoff and parsed["_timestamp_dt"] < cutoff:
                    continue

                record = parsed["record"]
                if requested_range == "all":
                    record_buffer.append(record)
                else:
                    record_buffer.append(record)

        data = list(record_buffer)
        if requested_range != "all":
            data = downsample_records(data, max_points)
        
        logger.info(
            f"Monitoring data fetched: returned={len(data)}, parsed={total_parsed}, "
            f"range={requested_range}, max_points={max_points}, log={log_path.name}"
        )
        return {
            "success": True,
            "data": data,
            "range": requested_range,
            "log_file": str(log_path),
            "log_filename": log_path.name,
            "total_records": len(data),
            "total_parsed": total_parsed,
            "max_points": max_points,
            "retrieved_at": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error fetching monitoring data: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

