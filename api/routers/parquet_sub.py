"""
Subprocess worker for parquet service operations.
Reads JSON payload from stdin and writes JSON response to stdout.
"""

from __future__ import annotations

import json
import math
import traceback
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))
from parquet_service import parquet_service  # noqa: E402


def _sanitize(obj):
    """Recursively replace NaN/Inf floats with None so json.dumps never raises."""
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj


def run_operation(payload: dict) -> dict:
    mode = payload.get("mode")
    request = payload.get("request", {})

    if mode == "metadata":
        return parquet_service.get_file_metadata(request["file_path"])
    if mode == "read_paginated":
        return parquet_service.read_parquet_paginated(
            file_path=request["file_path"],
            page=request.get("page", 1),
            page_size=request.get("page_size", 100),
            sort_column=request.get("sort_column"),
            sort_direction=request.get("sort_direction", "asc"),
            filters=request.get("filters"),
        )
    if mode == "column_stats":
        return parquet_service.get_column_statistics(
            request["file_path"],
            request["column_name"],
        )
    if mode == "column_values":
        return parquet_service.get_column_unique_values(
            file_path=request["file_path"],
            column_name=request["column_name"],
            limit=request.get("limit", 5000),
            search_term=request.get("search_term"),
        )
    if mode == "search":
        return parquet_service.search_in_file(
            file_path=request["file_path"],
            query=request["query"],
            column=request.get("column"),
            limit=request.get("limit", 5000),
        )

    raise ValueError(f"Unsupported mode: {mode}")


def main() -> int:
    # Redirect sys.stdout to stderr so any library prints don't corrupt the JSON output.
    _stdout = sys.stdout
    sys.stdout = sys.stderr
    try:
        payload = json.loads(input())
        result = run_operation(payload)
        print(json.dumps({"success": True, "result": _sanitize(result)}, default=str), file=_stdout)
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