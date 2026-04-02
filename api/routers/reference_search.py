"""
Reference File Search Router
Provides search and browse functionality for known reference files (CSV, ZIP).
File specifications are loaded from api/data/reference_search.json.
"""
from fastapi import APIRouter, HTTPException
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime
import logging
from pathlib import Path
import sys
import json
import subprocess

sys.path.insert(0, str(Path(__file__).parent.parent))
from .utils import make_json_safe

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/reference-search", tags=["reference-search"])


class MultiValueSearchRequest(BaseModel):
    column: str
    values: List[str]
    exact_match: bool = True
    page: int = 1
    page_size: int = 50
    limit: int = 5000
    # Folder-type filter fields (ignored for single-file specs)
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    file_regex: Optional[str] = None


SUBPROCESS_TIMEOUT = 300  # seconds

# Path to the file specs config
_API_DIR = Path(__file__).parent.parent
REFERENCE_FILES_CONFIG = _API_DIR / "data" / "reference_search.json"


# ------------------------------------------------------------------ #
# Helpers                                                              #
# ------------------------------------------------------------------ #

def _load_reference_files() -> dict:
    """Load reference file specs from JSON config. Returns dict keyed by file id."""
    if not REFERENCE_FILES_CONFIG.exists():
        logger.warning(f"Reference files config not found: {REFERENCE_FILES_CONFIG}")
        return {}
    try:
        with open(REFERENCE_FILES_CONFIG, "r", encoding="utf-8") as f:
            config = json.load(f)
        return {entry["id"]: entry for entry in config.get("files", [])}
    except Exception as e:
        logger.error(f"Failed to load reference files config: {e}")
        return {}


def _run_reference_subprocess(mode: str, request: dict):
    """Run the reference_sub.py subprocess and return the result."""
    script_path = Path(__file__).with_name("reference_sub.py")
    payload = {"mode": mode, "request": request}
    proc = subprocess.run(
        [sys.executable, str(script_path)],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        timeout=SUBPROCESS_TIMEOUT,
        check=False,
    )

    if proc.returncode != 0:
        logger.error(
            f"Reference subprocess failed ({mode}): stdout={proc.stdout[:500]} stderr={proc.stderr[:500]}"
        )
        raise HTTPException(
            status_code=500,
            detail=f"Reference file subprocess failed ({mode}): {proc.stderr[:300]}"
        )

    try:
        response = json.loads(proc.stdout)
    except json.JSONDecodeError:
        logger.error(f"Invalid JSON from reference subprocess ({mode}): {proc.stdout[:500]}")
        raise HTTPException(status_code=500, detail=f"Invalid subprocess response ({mode})")

    if not response.get("success", False):
        logger.error(f"Reference subprocess error ({mode}): {response}")
        raise HTTPException(
            status_code=500,
            detail=response.get("error", f"Subprocess error ({mode})")
        )

    return response.get("result")


# ------------------------------------------------------------------ #
# Endpoints                                                            #
# ------------------------------------------------------------------ #

@router.get("/files")
def list_files():
    """List all available reference files from the JSON config."""
    try:
        files_map = _load_reference_files()
        files = [
            {
                "id": spec["id"],
                "name": spec.get("name", spec["id"]),
                "description": spec.get("description", ""),
                "format": spec.get("format", "csv"),
                "category": spec.get("category", ""),
                "is_folder_type": bool(spec.get("folder_path")),
            }
            for spec in files_map.values()
        ]
        return {
            "success": True,
            "files": files,
            "total": len(files),
            "retrieved_at": datetime.now().isoformat(),
        }
    except Exception as e:
        logger.error(f"Error listing reference files: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files/{file_id}/columns")
def get_columns(file_id: str):
    """
    Get column names for a reference file.
    Returns columns from the JSON spec if defined, otherwise reads from the file itself.
    """
    try:
        files_map = _load_reference_files()
        if file_id not in files_map:
            raise HTTPException(status_code=404, detail=f"File '{file_id}' not found in config")

        spec = files_map[file_id]

        # Use columns from spec if available (fast path, no file I/O)
        spec_columns = spec.get("columns")
        if spec_columns:
            return {
                "success": True,
                "columns": spec_columns,
                "file_id": file_id,
                "source": "spec",
                "retrieved_at": datetime.now().isoformat(),
            }

        # Otherwise read metadata from the file via subprocess
        metadata = _run_reference_subprocess("metadata", {"file_spec": spec})
        return {
            "success": True,
            "columns": metadata.get("columns", []),
            "total_rows": metadata.get("total_rows", 0),
            "file_id": file_id,
            "source": "file",
            "retrieved_at": datetime.now().isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting columns for {file_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files/{file_id}/discover")
def discover_file_entries(
    file_id: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    file_regex: Optional[str] = None,
):
    """
    For folder-type file specs, list actual files matching the pattern.
    Supports optional date range (YYYY-MM-DD) and regex override for filename matching.
    Returns is_folder_type=False for single-file specs.
    """
    try:
        files_map = _load_reference_files()
        if file_id not in files_map:
            raise HTTPException(status_code=404, detail=f"File '{file_id}' not found in config")

        spec = files_map[file_id]
        if not spec.get("folder_path"):
            return {
                "success": True,
                "is_folder_type": False,
                "files": [],
                "total": 0,
                "retrieved_at": datetime.now().isoformat(),
            }

        result = _run_reference_subprocess(
            "discover_files",
            {
                "folder_path": spec["folder_path"],
                "file_pattern": file_regex or spec.get("file_pattern", ".*"),
                "date_from": date_from,
                "date_to": date_to,
                "date_group_index": spec.get("date_group_index", 1),
                "date_format": spec.get("date_format", "%Y%m%d"),
            },
        )
        return {
            "success": True,
            "is_folder_type": True,
            "files": result.get("files", []),
            "total": result.get("total", 0),
            "retrieved_at": datetime.now().isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error discovering files for {file_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files/{file_id}/data")
def browse_file(
    file_id: str,
    page: int = 1,
    page_size: int = 50,
    sort_column: Optional[str] = None,
    sort_direction: str = "asc",
):
    """
    Browse reference file data with pagination.
    Service handles offset calculation — only page_size rows returned for CSV/Parquet.
    """
    try:
        files_map = _load_reference_files()
        if file_id not in files_map:
            raise HTTPException(status_code=404, detail=f"File '{file_id}' not found in config")

        spec = files_map[file_id]

        if spec.get("folder_path"):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"'{file_id}' is a folder-type spec — use the /search endpoint "
                    "with a date or regex filter to load its data"
                ),
            )

        result = _run_reference_subprocess(
            "read_paginated",
            {
                "file_spec": spec,
                "page": page,
                "page_size": page_size,
                "sort_column": sort_column,
                "sort_direction": sort_direction,
            },
        )

        response = {
            "success": True,
            "results": result.get("data", []),
            "columns": result.get("columns", []),
            "pagination": result.get("pagination", {}),
            "total_matches": result.get("pagination", {}).get("total_rows", 0),
            "file_id": file_id,
            "file_name": spec.get("name", file_id),
            "mode": "browse",
            "retrieved_at": datetime.now().isoformat(),
        }

        return make_json_safe(response)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error browsing file {file_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files/{file_id}/search")
def search_file(
    file_id: str,
    query: str,
    column: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    limit: int = 5000,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    file_regex: Optional[str] = None,
):
    """
    Search a reference file for a query string (regex supported).

    Single-file specs: pagination is pushed into the service subprocess — only
    page_size rows are transferred per request (offset computed from page).

    Folder-type specs: the service aggregates results from all matching files up to
    limit; the router then handles Python-side pagination of the combined list.
    """
    try:
        if not query or not query.strip():
            raise HTTPException(status_code=400, detail="Search query cannot be empty")

        files_map = _load_reference_files()
        if file_id not in files_map:
            raise HTTPException(status_code=404, detail=f"File '{file_id}' not found in config")

        spec = files_map[file_id]
        spec_columns = spec.get("columns")
        is_folder_type = bool(spec.get("folder_path"))

        if is_folder_type:
            # Folder search: service returns all matches up to limit from all files;
            # router slices the combined list for the requested page.
            search_result = _run_reference_subprocess(
                "search_folder",
                {
                    "file_spec": spec,
                    "query": query.strip(),
                    "column": column,
                    "limit": limit,
                    "date_from": date_from,
                    "date_to": date_to,
                    "file_regex": file_regex,
                },
            )
            all_results = search_result.get("results", [])
            total_matches = len(all_results)
            start = (page - 1) * page_size
            paginated = all_results[start: start + page_size]
            total_pages = (total_matches + page_size - 1) // page_size if total_matches > 0 else 0

        else:
            # Single-file search: pass offset + page_size to the service so it
            # returns only the requested window.  No Python-side pagination needed.
            offset = (page - 1) * page_size
            search_result = _run_reference_subprocess(
                "search",
                {
                    "file_spec": spec,
                    "query": query.strip(),
                    "column": column,
                    "limit": limit,
                    "offset": offset,
                    "page_size": page_size,
                },
            )
            paginated = search_result.get("results", [])
            total_matches = search_result.get("total_found", 0)
            total_pages = (total_matches + page_size - 1) // page_size if total_matches > 0 else 0

        # Derive column list
        if spec_columns:
            columns = spec_columns
        elif paginated:
            columns = list(paginated[0].keys())
        else:
            columns = []

        response = {
            "success": True,
            "results": paginated,
            "columns": columns,
            "total_matches": total_matches,
            "query": query.strip(),
            "searched_column": column,
            "pagination": {
                "current_page": page,
                "page_size": page_size,
                "total_rows": total_matches,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_previous": page > 1,
            },
            "results_limited": search_result.get("results_limited", False),
            "limit_applied": search_result.get("limit_applied", limit),
            "file_id": file_id,
            "file_name": spec.get("name", file_id),
            "mode": "search",
            "retrieved_at": datetime.now().isoformat(),
        }

        if is_folder_type:
            response["files_searched"] = search_result.get("files_searched", 0)
            response["files_available"] = search_result.get("files_available", 0)

        return make_json_safe(response)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching file {file_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/files/{file_id}/search-multi")
def search_file_multi(file_id: str, body: MultiValueSearchRequest):
    """
    Search a reference file for multiple values in a specific column (Excel paste mode).
    Pagination is pushed into the service — only page_size rows transferred per request.
    """
    try:
        if not body.values:
            raise HTTPException(status_code=400, detail="Values list cannot be empty")
        if not body.column:
            raise HTTPException(status_code=400, detail="Column is required for multi-value search")

        clean_values = [v.strip() for v in body.values if v and v.strip()]
        if not clean_values:
            raise HTTPException(status_code=400, detail="No valid values provided after cleaning")

        files_map = _load_reference_files()
        if file_id not in files_map:
            raise HTTPException(status_code=404, detail=f"File '{file_id}' not found in config")

        spec = files_map[file_id]
        is_folder_type = bool(spec.get("folder_path"))

        if is_folder_type:
            # Folder search: aggregate across all matching files up to limit,
            # then the router handles Python-side pagination of the combined list.
            search_result = _run_reference_subprocess(
                "search_multi_folder",
                {
                    "file_spec": spec,
                    "values": clean_values,
                    "column": body.column,
                    "limit": body.limit,
                    "exact_match": body.exact_match,
                    "date_from": body.date_from,
                    "date_to": body.date_to,
                    "file_regex": body.file_regex,
                },
            )
            all_results = search_result.get("results", [])
            total_matches = len(all_results)
            start = (body.page - 1) * body.page_size
            paginated = all_results[start: start + body.page_size]
            total_pages = (total_matches + body.page_size - 1) // body.page_size if total_matches > 0 else 0
        else:
            # Single-file: push offset + page_size into the service so only
            # page_size rows are transferred per request.
            offset = (body.page - 1) * body.page_size
            search_result = _run_reference_subprocess(
                "search_multi",
                {
                    "file_spec": spec,
                    "values": clean_values,
                    "column": body.column,
                    "limit": body.limit,
                    "exact_match": body.exact_match,
                    "offset": offset,
                    "page_size": body.page_size,
                },
            )
            paginated = search_result.get("results", [])
            total_matches = search_result.get("total_found", 0)
            total_pages = (
                (total_matches + body.page_size - 1) // body.page_size
                if total_matches > 0
                else 0
            )

        spec_columns = spec.get("columns")
        if spec_columns:
            columns = spec_columns
        elif paginated:
            columns = list(paginated[0].keys())
        else:
            columns = []

        response = {
            "success": True,
            "results": paginated,
            "columns": columns,
            "total_matches": total_matches,
            "searched_column": body.column,
            "values_searched": len(clean_values),
            "exact_match": body.exact_match,
            "pagination": {
                "current_page": body.page,
                "page_size": body.page_size,
                "total_rows": total_matches,
                "total_pages": total_pages,
                "has_next": body.page < total_pages,
                "has_previous": body.page > 1,
            },
            "results_limited": search_result.get("results_limited", False),
            "limit_applied": search_result.get("limit_applied", body.limit),
            "file_id": file_id,
            "file_name": spec.get("name", file_id),
            "mode": "search_multi",
            "retrieved_at": datetime.now().isoformat(),
        }

        if is_folder_type:
            response["files_searched"] = search_result.get("files_searched", 0)
            response["files_available"] = search_result.get("files_available", 0)

        return make_json_safe(response)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in multi-value search for {file_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
