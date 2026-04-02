"""
Subprocess worker for reference file service operations.
Reads JSON payload from stdin and writes JSON response to stdout.
Mirrors the pattern of parquet_sub.py.
"""
from __future__ import annotations

import json
import traceback
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))
from reference_file_service import reference_file_service  # noqa: E402


def run_operation(payload: dict) -> dict:
    mode = payload.get("mode")
    request = payload.get("request", {})
    file_spec = request.get("file_spec", {})

    if mode == "metadata":
        return reference_file_service.get_file_metadata(file_spec)

    if mode == "read_paginated":
        return reference_file_service.read_file_paginated(
            file_spec=file_spec,
            page=request.get("page", 1),
            page_size=request.get("page_size", 50),
            sort_column=request.get("sort_column"),
            sort_direction=request.get("sort_direction", "asc"),
        )

    if mode == "search":
        return reference_file_service.search_in_file(
            file_spec=file_spec,
            query=request["query"],
            column=request.get("column"),
            limit=request.get("limit", 5000),
            # offset + page_size enable server-side pagination;
            # omitted (None) when called from search_across_folder
            offset=request.get("offset", 0),
            page_size=request.get("page_size"),
        )

    if mode == "search_multi":
        return reference_file_service.search_multiple_values(
            file_spec=file_spec,
            values=request["values"],
            column=request["column"],
            limit=request.get("limit", 5000),
            exact_match=request.get("exact_match", True),
            offset=request.get("offset", 0),
            page_size=request.get("page_size"),
        )

    if mode == "discover_files":
        files = reference_file_service.discover_files_in_folder(
            folder_path=request.get("folder_path", ""),
            file_pattern=request.get("file_pattern", ".*"),
            date_from=request.get("date_from"),
            date_to=request.get("date_to"),
            date_group_index=request.get("date_group_index", 1),
            date_format=request.get("date_format", "%Y%m%d"),
        )
        return {"files": files, "total": len(files)}

    if mode == "search_folder":
        return reference_file_service.search_across_folder(
            file_spec=file_spec,
            query=request["query"],
            column=request.get("column"),
            limit=request.get("limit", 5000),
            date_from=request.get("date_from"),
            date_to=request.get("date_to"),
            file_regex=request.get("file_regex"),
        )

    if mode == "search_multi_folder":
        return reference_file_service.search_multiple_values_across_folder(
            file_spec=file_spec,
            values=request["values"],
            column=request["column"],
            limit=request.get("limit", 5000),
            exact_match=request.get("exact_match", True),
            date_from=request.get("date_from"),
            date_to=request.get("date_to"),
            file_regex=request.get("file_regex"),
        )

    raise ValueError(f"Unsupported mode: {mode}")


def main() -> int:
    # Redirect stdout to stderr so any library prints don't corrupt the JSON output.
    _stdout = sys.stdout
    sys.stdout = sys.stderr
    try:
        payload = json.loads(input())
        result = run_operation(payload)
        print(json.dumps({"success": True, "result": result}, default=str), file=_stdout)
        return 0
    except Exception as exc:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": str(exc),
                    "traceback": traceback.format_exc(),
                }
            ),
            file=_stdout,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
