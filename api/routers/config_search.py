"""
Config Search Router
Provides search functionality across configuration parquet files (COMP, QA)
"""
from fastapi import APIRouter, HTTPException
from typing import Optional, List
from datetime import datetime
import logging
from pathlib import Path
import sys
import json
import subprocess

sys.path.insert(0, str(Path(__file__).parent.parent))
from .utils import make_json_safe

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/config-search", tags=["config-search"])
PARQUET_SUBPROCESS_TIMEOUT_SECONDS = 300

# Base directory for search data
SEARCH_DATA_DIR = Path(__file__).parent.parent / "data" / "search_data"

# Available sheets (parquet files without extension)
AVAILABLE_SHEETS = ["InputFiles", "rules", "Enrichment", "FieldOperations", "OutputRule"]


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
        logger.error(f"Parquet subprocess failed ({mode}): stdout={proc.stdout} stderr={proc.stderr}")
        raise HTTPException(status_code=500, detail=f"Parquet subprocess failed ({mode})")

    try:
        response = json.loads(proc.stdout)
    except json.JSONDecodeError:
        logger.error(f"Invalid JSON from parquet subprocess ({mode}): {proc.stdout}")
        raise HTTPException(status_code=500, detail=f"Invalid parquet subprocess response ({mode})")

    if not response.get("success", False):
        logger.error(f"Parquet subprocess error payload ({mode}): {response}")
        raise HTTPException(status_code=500, detail=response.get("error", f"Parquet subprocess error ({mode})"))

    return response.get("result")


def get_available_types() -> List[str]:
    """Get list of available types (directories in search_data)"""
    types = []
    if SEARCH_DATA_DIR.exists():
        for item in SEARCH_DATA_DIR.iterdir():
            if item.is_dir() and item.name not in ["API", "__pycache__"]:
                # Check if directory has any parquet files
                parquet_files = list(item.glob("*.parquet"))
                if parquet_files:
                    types.append(item.name)
    return sorted(types)


def get_file_path(type_name: str, sheet_name: str) -> Path:
    """Build file path for a type and sheet combination"""
    return SEARCH_DATA_DIR / type_name / f"{sheet_name}.parquet"


@router.get("/types")
async def get_types():
    """Get available config types (COMP, QA, etc.)"""
    try:
        types = get_available_types()
        return {
            "success": True,
            "types": types,
            "retrieved_at": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting types: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sheets")
async def get_sheets(type_name: Optional[str] = None):
    """Get available sheets for a type (or all available sheets)"""
    try:
        if type_name:
            # Get sheets available for this specific type
            type_dir = SEARCH_DATA_DIR / type_name
            if not type_dir.exists():
                return {
                    "success": False,
                    "error": f"Type '{type_name}' not found",
                    "sheets": []
                }

            sheets = []
            for sheet in AVAILABLE_SHEETS:
                file_path = type_dir / f"{sheet}.parquet"
                if file_path.exists():
                    sheets.append(sheet)
        else:
            # Return all known sheets
            sheets = AVAILABLE_SHEETS.copy()

        return {
            "success": True,
            "sheets": sheets,
            "type": type_name,
            "retrieved_at": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting sheets: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/columns")
def get_columns(type_name: str, sheet: str):
    """Get column names for a specific type and sheet"""
    try:
        file_path = get_file_path(type_name, sheet)

        if not file_path.exists():
            return {
                "success": False,
                "error": f"File not found: {type_name}/{sheet}.parquet",
                "columns": []
            }

        metadata = _run_parquet_subprocess("metadata", {"file_path": str(file_path)})

        if metadata:
            return {
                "success": True,
                "columns": metadata.get("columns", []),
                "type": type_name,
                "sheet": sheet,
                "total_rows": metadata.get("total_rows", 0),
                "retrieved_at": datetime.now().isoformat()
            }
        else:
            return {
                "success": False,
                "error": "Could not read file metadata",
                "columns": []
            }
    except Exception as e:
        logger.error(f"Error getting columns: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("")
def search_config(
    type_name: str,
    sheet: str,
    query: str,
    column: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    limit: int = 5000
):
    """
    Search configuration data in parquet files

    Args:
        type_name: Config type (COMP, QA)
        sheet: Sheet name (InputFiles, rules, etc.)
        query: Search query (supports regex)
        column: Optional column to search in (None = search all columns)
        page: Page number for pagination
        page_size: Number of results per page
        limit: Maximum total results to return
    """
    try:
        if not query or len(query.strip()) == 0:
            raise HTTPException(status_code=400, detail="Search query cannot be empty")

        file_path = get_file_path(type_name, sheet)

        if not file_path.exists():
            return {
                "success": False,
                "error": f"File not found: {type_name}/{sheet}.parquet",
                "results": [],
                "columns": [],
                "total_matches": 0
            }

        # Use parquet service to search
        search_result = _run_parquet_subprocess(
            "search",
            {
                "file_path": str(file_path),
                "query": query.strip(),
                "column": column,
                "limit": limit,
            },
        )

        # Get columns for the response
        metadata = _run_parquet_subprocess("metadata", {"file_path": str(file_path)})
        columns = metadata.get("columns", []) if metadata else []

        # Apply pagination to results
        results = search_result.get("results", [])
        total_matches = len(results)

        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated_results = results[start_idx:end_idx]

        total_pages = (total_matches + page_size - 1) // page_size if total_matches > 0 else 0

        response = {
            "success": True,
            "results": paginated_results,
            "columns": columns,
            "total_matches": total_matches,
            "query": query.strip(),
            "type": type_name,
            "sheet": sheet,
            "searched_column": column,
            "pagination": {
                "current_page": page,
                "page_size": page_size,
                "total_rows": total_matches,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_previous": page > 1
            },
            "results_limited": search_result.get("results_limited", False),
            "limit_applied": search_result.get("limit_applied", limit),
            "retrieved_at": datetime.now().isoformat()
        }

        return make_json_safe(response)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching config: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/all-data")
def get_all_data(
    type_name: str,
    sheet: str,
    page: int = 1,
    page_size: int = 50,
    sort_column: Optional[str] = None,
    sort_direction: str = "asc"
):
    """
    Get all data from a config file with pagination (no search filter)
    Useful for browsing all records
    """
    try:
        file_path = get_file_path(type_name, sheet)

        if not file_path.exists():
            return {
                "success": False,
                "error": f"File not found: {type_name}/{sheet}.parquet",
                "data": [],
                "columns": []
            }

        # Use parquet service to read paginated data
        data = _run_parquet_subprocess(
            "read_paginated",
            {
                "file_path": str(file_path),
                "page": page,
                "page_size": page_size,
                "sort_column": sort_column,
                "sort_direction": sort_direction,
            },
        )

        response = {
            "success": True,
            "data": data.get("data", []),
            "columns": data.get("columns", []),
            "pagination": data.get("pagination", {}),
            "type": type_name,
            "sheet": sheet,
            "retrieved_at": datetime.now().isoformat()
        }

        if "error" in data:
            response["error"] = data["error"]
            response["success"] = False

        return make_json_safe(response)

    except Exception as e:
        logger.error(f"Error getting all data: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
