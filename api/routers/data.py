"""
Data/Parquet Router
Handles Parquet file operations and legacy CSV endpoints
"""
from fastapi import APIRouter, HTTPException
from typing import Optional
from datetime import datetime
import logging
import sys
from pathlib import Path
import json
import subprocess
sys.path.insert(0, str(Path(__file__).parent.parent))
from parquet_service import parquet_service
from .utils import make_json_safe

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["data"])
PARQUET_SUBPROCESS_TIMEOUT_SECONDS = 300


def _run_parquet_subprocess(mode: str, request: dict):
    script_path = Path(__file__).with_name("parquet_sub.py")
    payload = {"mode": mode, "request": request}
    proc = subprocess.run(
        [sys.executable, str(script_path)],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        timeout=PARQUET_SUBPROCESS_TIMEOUT_SECONDS,
        check=False,
    )
    if proc.returncode != 0:
        detail = f"Parquet subprocess failed ({mode})"
        try:
            err_payload = json.loads(proc.stdout)
            if isinstance(err_payload, dict) and err_payload.get("error"):
                detail = err_payload["error"]
        except Exception:
            pass
        logger.error(f"Parquet subprocess failed ({mode}): detail={detail} stderr={proc.stderr}")
        raise HTTPException(status_code=500, detail=detail)

    try:
        response = json.loads(proc.stdout)
    except json.JSONDecodeError:
        logger.error(f"Invalid JSON from parquet subprocess ({mode}): {proc.stdout}")
        raise HTTPException(status_code=500, detail=f"Invalid parquet subprocess response ({mode})")

    if not response.get("success", False):
        logger.error(f"Parquet subprocess error payload ({mode}): {response}")
        raise HTTPException(status_code=500, detail=response.get("error", f"Parquet subprocess error ({mode})"))

    return response.get("result")


@router.get("/data/metadata")
def get_file_metadata(file_path: str):
    """Get detailed metadata for a specific Parquet file using direct file path"""
    try:
        metadata = _run_parquet_subprocess("metadata", {"file_path": file_path})
        if metadata:
            result = {
                "success": True,
                "metadata": metadata,
                "retrieved_at": datetime.now().isoformat()
            }
        else:
            result = {
                "success": False,
                "error": f"File not found or inaccessible: {file_path}",
                "retrieved_at": datetime.now().isoformat()
            }
        return make_json_safe(result)
    except Exception as e:
        logger.error(f"Error getting file metadata: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/data/records")
def get_data_records(
    file_path: str,
    page: int = 1,
    page_size: int = 100,
    sort_column: Optional[str] = None,
    sort_direction: str = "asc"
):
    """Get Parquet data with pagination using Polars lazy loading - ONLY reads required page!"""
    try:
        logger.info(f"Fetching data with Polars (file: {file_path}, page: {page}, size: {page_size})")
        
        data = _run_parquet_subprocess(
            "read_paginated",
            {
                "file_path": file_path,
                "page": page,
                "page_size": page_size,
                "sort_column": sort_column,
                "sort_direction": sort_direction,
            },
        )
        
        result = {
            "success": True,
            "data": data.get("data", []),
            "columns": data.get("columns", []),
            "pagination": data.get("pagination", {}),
            "retrieved_at": datetime.now().isoformat(),
            "engine": "polars"
        }
        
        if "error" in data:
            result["error"] = data["error"]
            result["success"] = False
        
        return make_json_safe(result)
    except Exception as e:
        logger.error(f"Error getting data: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/data/column-stats")
def get_column_statistics(file_path: str, column_name: str):
    """Get statistics for a specific column in a Parquet file using Polars"""
    try:
        stats = _run_parquet_subprocess(
            "column_stats",
            {"file_path": file_path, "column_name": column_name},
        )
        if stats:
            result = {
                "success": True,
                "stats": stats,
                "retrieved_at": datetime.now().isoformat(),
                "engine": "polars"
            }
        else:
            result = {
                "success": False,
                "error": f"Column {column_name} not found in {file_path}",
                "retrieved_at": datetime.now().isoformat()
            }
        return make_json_safe(result)
    except Exception as e:
        logger.error(f"Error getting column statistics: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/data/column-values")
def get_column_unique_values(
    file_path: str,
    column_name: str,
    limit: int = 5000,
    search_term: Optional[str] = None
):
    """
    Get unique values for a specific column with optional limit and search
    Optimized for large datasets - streams only requested values
    """
    try:
        logger.info(f"Get unique values request: {column_name} from {file_path} (limit: {limit})")
        
        result = _run_parquet_subprocess(
            "column_values",
            {
                "file_path": file_path,
                "column_name": column_name,
                "limit": limit,
                "search_term": search_term,
            },
        )
        
        if "error" in result:
            result["success"] = False
        else:
            result["success"] = True
        
        result["retrieved_at"] = datetime.now().isoformat()
        result["engine"] = "polars"
        
        return make_json_safe(result)
        
    except Exception as e:
        logger.error(f"Error in get_column_unique_values endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/data/search")
def search_data(file_path: str, query: str, column: Optional[str] = None, limit: int = 5000):
    """Search for a term in Parquet file using Polars lazy loading"""
    try:
        if not query or len(query.strip()) == 0:
            raise HTTPException(status_code=400, detail="Search query cannot be empty")
        
        result = _run_parquet_subprocess(
            "search",
            {
                "file_path": file_path,
                "query": query.strip(),
                "column": column,
                "limit": limit,
            },
        )
        
        result["engine"] = "polars"
        return make_json_safe(result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching data: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/data/cache/clear")
def clear_data_cache():
    """Clear the Parquet service cache"""
    try:
        parquet_service.clear_cache()
        return {
            "success": True,
            "message": "Parquet service cache cleared successfully",
            "cleared_at": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error clearing cache: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# Legacy CSV endpoints for backward compatibility (redirect to Parquet)
@router.get("/csv/metadata")
def get_csv_file_metadata_legacy(file_path: str):
    """Legacy CSV endpoint - redirects to Parquet service"""
    return get_file_metadata(file_path)


@router.get("/csv/data")
def get_csv_data_legacy(
    file_path: str,
    page: int = 1,
    page_size: int = 100,
    sort_column: Optional[str] = None,
    sort_direction: str = "asc"
):
    """Legacy CSV endpoint - redirects to Parquet service"""
    return get_data_records(file_path, page, page_size, sort_column, sort_direction)


@router.get("/csv/column-stats")
def get_csv_column_statistics_legacy(file_path: str, column_name: str):
    """Legacy CSV endpoint - redirects to Parquet service"""
    return get_column_statistics(file_path, column_name)


@router.get("/csv/search")
def search_csv_data_legacy(file_path: str, query: str, column: Optional[str] = None, limit: int = 5000):
    """Legacy CSV endpoint - redirects to Parquet service"""
    return search_data(file_path, query, column, limit)


@router.post("/csv/cache/clear")
def clear_csv_cache_legacy():
    """Legacy CSV endpoint - redirects to Parquet service"""
    return clear_data_cache()