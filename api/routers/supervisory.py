"""
Supervisory Dashboard Router
Provides aggregated data views for supervisory monitoring with filtering and age bucket analysis
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List, Optional, Tuple
import polars as pl
import pyarrow.parquet as pq
import logging
from datetime import datetime
from pathlib import Path
import json
import uuid
import os
import subprocess
import sys

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/supervisory", tags=["supervisory"])

# Configuration
DATA_FILE = "dummy_controls_data.parquet"
CACHE_TTL = 3600
SAVED_FILTERS_FILE = os.path.join(Path(__file__).parent.parent, "data", "supervisory_saved_filters.json")
AGGREGATION_SUBPROCESS_TIMEOUT_SECONDS = 300

# Cache for filter options
_filter_options_cache = {
    "data": None,
    "timestamp": None
}

# Column mappings (display name -> actual column name in parquet)
FILTER_COLUMNS = {
    "regulation": "Regulation",
    "asset_class": "AssetClass",
    "control_type": "Control Type",
    "data_type": "Data Type",
    "sub_control_type": "Sub-ControlType",
    "remediation_status": "RemediationStatus",
    "explain_issue": "ExplainIssue",
    "explain_issue_notification": "ExplainIssueNotification",
    "explain_issue_detail": "ExplainIssueDetail"
}

AGE_BUCKETS_BY_SET = {
    "CFTC": ["0-3", "3-7", "7-14", "14-30", "30-60"],
    "EMIR": ["0-2", "3-10", "11-30", "31-50"],
}

AGE_BUCKET_COLUMNS = AGE_BUCKETS_BY_SET["CFTC"]
DEFAULT_BUCKET_SET = "CFTC"
AGE_BUCKET_SET_COLUMN_CANDIDATES = {
    "CFTC": {
        "0-3": ["0-3", "CFTC_0-3", "0-3_CFTC", "CFTC_0_3", "0_3_CFTC"],
        "3-7": ["3-7", "CFTC_3-7", "3-7_CFTC", "CFTC_3_7", "3_7_CFTC"],
        "7-14": ["7-14", "CFTC_7-14", "7-14_CFTC", "CFTC_7_14", "7_14_CFTC"],
        "14-30": ["14-30", "CFTC_14-30", "14-30_CFTC", "CFTC_14_30", "14_30_CFTC"],
        "30-60": ["30-60", "CFTC_30-60", "30-60_CFTC", "CFTC_30_60", "30_60_CFTC"],
    },
    "EMIR": {
        "0-2": ["0-2", "EMIR_0-2", "0-2_EMIR", "EMIR_0_2", "0_2_EMIR"],
        "3-10": ["3-10", "EMIR_3-10", "3-10_EMIR", "EMIR_3_10", "3_10_EMIR"],
        "11-30": ["11-30", "EMIR_11-30", "11-30_EMIR", "EMIR_11_30", "11_30_EMIR"],
        "31-50": ["31-50", "EMIR_31-50", "31-50_EMIR", "EMIR_31_50", "31_50_EMIR"],
    },
}

# Preselected filters for first dashboard load to keep initial query lightweight.
# Values are sanitized against available options at runtime.
DEFAULT_INITIAL_FILTERS = {
    "regulation": ["CFTC-P45"],
    "asset_class": ["FX"],
    "data_type": ["TRADESTATE"],
}

# Remediation plans that indicate "unremediated" status
UNREMEDIATED_PLANS = [
    'Investigate and fix root cause',
    'Manual override and re-process',
    'Update configuration',
    'Escalate to support team',
    'Patch deployment scheduled'
]

REMEDIATED_PLANS = ['No action required']


class AggregationRequest(BaseModel):
    filters: Optional[Dict[str, List[str]]] = None
    group_by: Optional[List[str]] = None
    bucket_set: str = DEFAULT_BUCKET_SET
    include_remediation_split: bool = True  # Whether to split by remediation status


class DetailsRequest(BaseModel):
    filters: Optional[Dict[str, List[str]]] = None
    page: int = 1
    page_size: int = 50
    sort_column: Optional[str] = None
    sort_direction: str = "desc"
    bucket: Optional[str] = None
    bucket_scope: Optional[str] = None
    bucket_set: str = DEFAULT_BUCKET_SET
    merge_columns: Optional[List[str]] = None  # Columns to group together for merged cell display
    search_term: Optional[str] = None
    search_column: Optional[str] = None


class SavedFilterRequest(BaseModel):
    name: str
    filters: Dict[str, List[str]]
    group_by: List[str]
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None


class TrendRequest(BaseModel):
    filters: Optional[Dict[str, List[str]]] = None
    group_by: Optional[List[str]] = None


def get_data_file_path() -> str:
    """Get the path to the data file"""
    # Check multiple possible locations
    possible_paths = [
        Path(DATA_FILE),  # Current directory
        Path("..") / DATA_FILE,  # Parent directory
        Path(__file__).parent.parent.parent / DATA_FILE,  # Project root
    ]

    for path in possible_paths:
        if path.exists():
            return str(path.resolve())

    # Default to project root
    return str(Path(__file__).parent.parent.parent / DATA_FILE)


def is_cache_valid() -> bool:
    """Check if filter options cache is still valid"""
    if _filter_options_cache["data"] is None or _filter_options_cache["timestamp"] is None:
        return False
    elapsed = (datetime.now() - _filter_options_cache["timestamp"]).total_seconds()
    return elapsed < CACHE_TTL


def ensure_age_buckets(lazy_df: pl.LazyFrame, bucket_set: str = DEFAULT_BUCKET_SET) -> pl.LazyFrame:
    """Ensure logical age bucket columns exist and are derived from ErrorAge for the selected set."""
    schema = lazy_df.collect_schema()
    if "ErrorAge" not in schema:
        raise HTTPException(status_code=400, detail="Missing required column: ErrorAge")

    selected_set = (bucket_set or DEFAULT_BUCKET_SET).upper()
    age_col = pl.col("ErrorAge")
    if selected_set == "EMIR":
        expressions = [
            (age_col <= 2).cast(pl.Int64).alias("0-2"),
            ((age_col > 2) & (age_col <= 10)).cast(pl.Int64).alias("3-10"),
            ((age_col > 10) & (age_col <= 30)).cast(pl.Int64).alias("11-30"),
            ((age_col > 30) & (age_col <= 50)).cast(pl.Int64).alias("31-50"),
        ]
        return lazy_df.with_columns(expressions)

    expressions = [
        (age_col <= 3).cast(pl.Int64).alias("0-3"),
        ((age_col > 3) & (age_col <= 7)).cast(pl.Int64).alias("3-7"),
        ((age_col > 7) & (age_col <= 14)).cast(pl.Int64).alias("7-14"),
        ((age_col > 14) & (age_col <= 30)).cast(pl.Int64).alias("14-30"),
        ((age_col > 30) & (age_col <= 60)).cast(pl.Int64).alias("30-60"),
    ]
    return lazy_df.with_columns(expressions)


def resolve_age_bucket_column_map(schema_names: set, bucket_set: str) -> Optional[Dict[str, str]]:
    """Find the physical columns for a bucket set. Returns logical->physical map or None."""
    candidates = AGE_BUCKET_SET_COLUMN_CANDIDATES.get(bucket_set, {})
    bucket_columns = AGE_BUCKETS_BY_SET.get(bucket_set, AGE_BUCKET_COLUMNS)
    column_map: Dict[str, str] = {}
    for bucket in bucket_columns:
        physical = next((name for name in candidates.get(bucket, []) if name in schema_names), None)
        if not physical:
            return None
        column_map[bucket] = physical
    return column_map


def get_available_bucket_sets(schema_names: set) -> List[str]:
    """Return bucket sets that can be served from this dataset."""
    available: List[str] = []
    
    # Debug: log schema names
    schema_list = list(schema_names)
    logger.info(f"Checking bucket sets against schema columns: {schema_list}")
    
    for bucket_set in AGE_BUCKETS_BY_SET.keys():
        if resolve_age_bucket_column_map(schema_names, bucket_set):
            available.append(bucket_set)

    # Any configured set can be derived from ErrorAge if explicit columns are not present.
    # Perform CASE-INSENSITIVE check for ErrorAge
    schema_lower = {name.lower() for name in schema_names}
    if "errorage" in schema_lower:
        logger.info("Found ErrorAge column (case-insensitive match). supporting all bucket sets.")
        for bucket_set in AGE_BUCKETS_BY_SET.keys():
            if bucket_set not in available:
                available.append(bucket_set)
    else:
        logger.warning(f"ErrorAge column NOT found in schema: {schema_list}")
        
    logger.info(f"Available bucket sets determined: {available}")
    return available


def apply_age_bucket_set(lazy_df: pl.LazyFrame, bucket_set: str) -> Tuple[pl.LazyFrame, str, List[str]]:
    """Normalize requested bucket set into canonical AGE_BUCKET_COLUMNS."""
    schema = lazy_df.collect_schema()
    schema_names = set(schema.names())
    normalized_set = (bucket_set or DEFAULT_BUCKET_SET).upper()
    available_sets = get_available_bucket_sets(schema_names)
    
    logger.info(f"apply_age_bucket_set requested: '{bucket_set}', normalized: '{normalized_set}'")
    logger.info(f"Available sets for this dataset: {available_sets}")

    selected_set = normalized_set if normalized_set in available_sets else DEFAULT_BUCKET_SET
    if selected_set not in available_sets and available_sets:
        selected_set = available_sets[0]
        logger.warning(f"Requested set '{normalized_set}' not available. Falling back to '{selected_set}'")
    
    logger.info(f"Final selected bucket set: '{selected_set}'")

    selected_buckets = AGE_BUCKETS_BY_SET.get(selected_set, AGE_BUCKET_COLUMNS)
    column_map = resolve_age_bucket_column_map(schema_names, selected_set)
    if column_map:
        logger.info(f"Using existing physical columns for {selected_set}: {column_map}")
        return lazy_df.with_columns([pl.col(column_map[b]).alias(b) for b in selected_buckets]), selected_set, selected_buckets

    # Case-insensitive check for ErrorAge
    schema_lower = {name.lower() for name in schema_names}
    if "errorage" in schema_lower:
        logger.info(f"Deriving {selected_set} from ErrorAge column")
        # Ensure we use the correct casing for the ErrorAge column locally
        error_age_col_name = next((name for name in schema_names if name.lower() == "errorage"), "ErrorAge")
        if error_age_col_name != "ErrorAge":
             logger.info(f"Renaming/aliasing {error_age_col_name} to ErrorAge for calculation")
             lazy_df = lazy_df.with_columns(pl.col(error_age_col_name).alias("ErrorAge"))
             
        return ensure_age_buckets(lazy_df, selected_set), selected_set, selected_buckets

    error_msg = f"No age bucket columns available for set: {bucket_set} (Available: {available_sets})"
    logger.error(error_msg)
    raise HTTPException(status_code=400, detail=error_msg)


def ensure_remediation_status(lazy_df: pl.LazyFrame) -> pl.LazyFrame:
    """Ensure RemediationStatus exists (derived from RemediationPlan if needed)."""
    schema = lazy_df.collect_schema()
    if "RemediationStatus" in schema:
        return lazy_df
    if "RemediationPlan" not in schema:
        raise HTTPException(status_code=400, detail="Missing required column: RemediationPlan")

    return lazy_df.with_columns([
        pl.when(pl.col("RemediationPlan") == "No action required")
        .then(pl.lit("Remediated"))
        .otherwise(pl.lit("Unremediated"))
        .alias("RemediationStatus")
    ])


def load_saved_filters() -> List[Dict[str, Any]]:
    """Load saved filters from disk."""
    if not os.path.exists(SAVED_FILTERS_FILE):
        return []
    try:
        with open(SAVED_FILTERS_FILE, "r") as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
            return []
    except Exception as e:
        logger.error(f"Failed to load saved filters: {e}")
        return []


def write_saved_filters(filters: List[Dict[str, Any]]) -> None:
    """Persist saved filters to disk."""
    try:
        os.makedirs(os.path.dirname(SAVED_FILTERS_FILE), exist_ok=True)
        with open(SAVED_FILTERS_FILE, "w") as f:
            json.dump(filters, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to write saved filters: {e}")
        raise HTTPException(status_code=500, detail="Failed to save filter")


def get_default_initial_filters(filter_options: Dict[str, List[str]]) -> Dict[str, List[str]]:
    """Return valid startup filters based on configured defaults and available options."""
    defaults: Dict[str, List[str]] = {}
    for key, configured_values in DEFAULT_INITIAL_FILTERS.items():
        available_values = set(filter_options.get(key, []))
        valid_values = [v for v in configured_values if v in available_values]
        defaults[key] = valid_values
    return defaults


def _load_lazy_frame(file_path: str) -> pl.LazyFrame:
    return pl.scan_parquet(file_path)


def _run_supervisory_subprocess(file_path: str, mode: str, request_payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    script_path = Path(__file__).with_name("supervisory_sub.py")
    payload: Dict[str, Any] = {
        "file_path": file_path,
        "mode": mode,
    }
    if request_payload is not None:
        payload["request"] = request_payload

    proc = subprocess.run(
        [sys.executable, str(script_path)],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        timeout=AGGREGATION_SUBPROCESS_TIMEOUT_SECONDS,
        check=False,
    )

    if proc.returncode != 0:
        logger.error(
            f"Supervisory subprocess failed (mode={mode}):\nstdout={proc.stdout}\nstderr={proc.stderr}"
        )
        raise HTTPException(status_code=500, detail=f"Supervisory subprocess failed ({mode})")

    try:
        result = json.loads(proc.stdout)
    except json.JSONDecodeError:
        logger.error(f"Invalid JSON from supervisory subprocess (mode={mode}): {proc.stdout}")
        raise HTTPException(status_code=500, detail=f"Invalid subprocess response ({mode})")

    if not result.get("success", False):
        logger.error(f"Supervisory subprocess returned error payload (mode={mode}): {result}")
        raise HTTPException(status_code=500, detail=result.get("error", f"Supervisory subprocess error ({mode})"))

    return result


def precompute_filter_options() -> None:
    """
    Eagerly populate _filter_options_cache so the first client request
    is served from memory instead of scanning the parquet file.
    Called once at module-load time (import side-effect).
    """
    global _filter_options_cache
    try:
        file_path = get_data_file_path()
        if not Path(file_path).exists():
            logger.warning(f"Precompute skipped – data file not found: {file_path}")
            return

        result = _run_supervisory_subprocess(file_path, mode="filter_options")

        _filter_options_cache["data"] = result
        _filter_options_cache["timestamp"] = datetime.now()
        logger.info("Supervisory filter options precomputed successfully")
    except Exception as e:
        logger.warning(f"Precompute filter options failed (will compute on first request): {e}")


# Do not warm cache at module import time.
# In Linux multi-worker deployments (e.g., gunicorn with preload/fork),
# import-time Polars collect() can lead to worker hangs.
# Warm cache from app startup inside each worker instead.


@router.get("/filter-options")
def get_filter_options() -> Dict[str, Any]:
    """
    Get unique values for all filter columns
    Returns cached results if available and valid
    """
    global _filter_options_cache

    try:
        # Return cached data if valid
        if is_cache_valid():
            cached = _filter_options_cache["data"] or {}
            if "bucket_sets" in cached and "default_bucket_set" in cached:
                logger.info("Returning cached filter options")
                return cached

        file_path = get_data_file_path()
        logger.info(f"Computing filter options from: {file_path}")

        if not Path(file_path).exists():
            raise HTTPException(status_code=404, detail=f"Data file not found: {file_path}")

        result = _run_supervisory_subprocess(file_path, mode="filter_options")

        # Update cache
        _filter_options_cache["data"] = result
        _filter_options_cache["timestamp"] = datetime.now()

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting filter options: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/aggregations")
def get_aggregations(request: AggregationRequest) -> Dict[str, Any]:
    """
    Get aggregated counts with age bucket breakdown
    Filters are applied before aggregation
    Returns both unremediated and total counts when include_remediation_split is True
    """
    try:
        file_path = get_data_file_path()
        logger.info(f"Getting aggregations from: {file_path}")

        if not Path(file_path).exists():
            raise HTTPException(status_code=404, detail=f"Data file not found: {file_path}")

        return _run_supervisory_subprocess(
            file_path=file_path,
            mode="aggregations",
            request_payload=request.model_dump(),
        )

    except HTTPException:
        raise
    except subprocess.TimeoutExpired:
        logger.error("Aggregation subprocess timed out")
        raise HTTPException(status_code=504, detail="Aggregation timed out")
    except Exception as e:
        logger.error(f"Error getting aggregations: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/details")
def get_details(request: DetailsRequest) -> Dict[str, Any]:
    """
    Get detailed records with pagination for drill-down views
    """
    try:
        file_path = get_data_file_path()
        logger.info(f"Getting details from: {file_path}")

        if not Path(file_path).exists():
            raise HTTPException(status_code=404, detail=f"Data file not found: {file_path}")

        return _run_supervisory_subprocess(
            file_path=file_path,
            mode="details",
            request_payload=request.model_dump(),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting details: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/trends")
def get_trends(request: TrendRequest) -> Dict[str, Any]:
    """
    Get month/day trend tables and stacked chart data for remediation analysis.
    """
    try:
        file_path = get_data_file_path()
        logger.info(f"Getting trends from: {file_path}")

        if not Path(file_path).exists():
            raise HTTPException(status_code=404, detail=f"Data file not found: {file_path}")

        return _run_supervisory_subprocess(
            file_path=file_path,
            mode="trends",
            request_payload=request.model_dump(),
        )

    except HTTPException:
        raise
    except subprocess.TimeoutExpired:
        logger.error("Trend subprocess timed out")
        raise HTTPException(status_code=504, detail="Trend analytics timed out")
    except Exception as e:
        logger.error(f"Error getting trends: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cache/clear")
def clear_cache() -> Dict[str, Any]:
    """Clear the filter options cache"""
    global _filter_options_cache
    _filter_options_cache = {"data": None, "timestamp": None}
    logger.info("Supervisory dashboard filter options cache cleared")
    return {"success": True, "message": "Filter options cache cleared"}


@router.get("/initial-load")
def get_initial_load() -> Dict[str, Any]:
    """
    Combined endpoint: returns filter options AND default aggregations in a single
    request, eliminating one HTTP round-trip on first page load.
    """
    try:
        # 1. Get filter options (uses cache if available)
        filter_result = get_filter_options()

        # 2. Compute default aggregations using the default initial filters
        default_filters = filter_result.get("default_initial_filters", {})
        default_bucket_set = filter_result.get("default_bucket_set", DEFAULT_BUCKET_SET)

        agg_request = AggregationRequest(
            filters=default_filters,
            bucket_set=default_bucket_set,
            include_remediation_split=True
        )
        agg_result = get_aggregations(agg_request)

        # 3. Merge into a single response
        return {
            **filter_result,
            "default_aggregations": agg_result,
            "retrieved_at": datetime.now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in initial-load: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/saved-filters")
def list_saved_filters() -> Dict[str, Any]:
    """List all saved filter presets (shared across users)."""
    saved = load_saved_filters()
    return {"success": True, "filters": saved}


@router.post("/saved-filters")
def save_filter(request: SavedFilterRequest) -> Dict[str, Any]:
    """Save a new filter preset."""
    saved = load_saved_filters()
    now = datetime.now().isoformat()
    new_item = {
        "id": str(uuid.uuid4()),
        "name": request.name,
        "filters": request.filters,
        "group_by": request.group_by,
        "created_by": request.created_by or "anonymous",
        "created_by_name": request.created_by_name or request.created_by or "anonymous",
        "created_at": now
    }
    saved.insert(0, new_item)
    write_saved_filters(saved)
    return {"success": True, "filter": new_item}


@router.delete("/saved-filters/{filter_id}")
def delete_saved_filter(filter_id: str) -> Dict[str, Any]:
    """Delete a saved filter preset by id."""
    saved = load_saved_filters()
    updated = [item for item in saved if item.get("id") != filter_id]
    if len(updated) == len(saved):
        raise HTTPException(status_code=404, detail="Saved filter not found")
    write_saved_filters(updated)
    return {"success": True, "message": "Deleted"}
