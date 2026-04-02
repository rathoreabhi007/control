"""
Reference File Service
Handles reading CSV and ZIP reference files with configurable delimiters and encodings.

Memory strategy:
  - CSV / TSV   : Polars lazy scan (scan_csv)  — streams the file, never loads it fully.
  - Parquet     : Polars lazy scan (scan_parquet) — row-group predicate pushdown.
  - ZIP + CSV   : pandas skiprows/nrows for browse; chunked read for search.
                  ZIP must be decompressed into memory first, so a full eager Polars
                  load is avoided by using pandas with nrows/chunksize instead.
"""
from __future__ import annotations

import concurrent.futures
import io
import math
import re
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Optional

import polars as pl
import pandas as pd

# Resolve project root (api/ directory)
_API_DIR = Path(__file__).parent
_PROJECT_ROOT = _API_DIR.parent

# Timeout (seconds) for a single Polars .collect() call.
# The subprocess itself has a 300-second router timeout; this gives a clean
# error message before that outer kill fires.
_COLLECT_TIMEOUT = 240


def _resolve_path(path_str: str) -> Path:
    """Resolve a file path relative to the project root if not absolute."""
    p = Path(path_str)
    if p.is_absolute():
        return p
    return (_PROJECT_ROOT / p).resolve()


def _assert_file_exists(path: Path) -> None:
    """Raise FileNotFoundError with a clear message if the path is missing."""
    if not path.exists():
        raise FileNotFoundError(f"Reference file not found: {path}")
    if not path.is_file():
        raise FileNotFoundError(f"Reference path is not a file: {path}")


# Polars only accepts "utf8" / "utf8-lossy"; pandas accepts the hyphenated forms.
# This map normalises common aliases for Polars.
_POLARS_ENCODING_MAP = {
    "utf-8":        "utf8",
    "utf-8-lossy":  "utf8-lossy",
    "utf8bom":      "utf8",       # Polars has no BOM-aware mode, strip BOM at read
    "utf-8-sig":    "utf8",
}


def _polars_encoding(enc: str) -> str:
    """Normalise a user-supplied encoding string to one Polars accepts."""
    return _POLARS_ENCODING_MAP.get(enc.lower(), enc)


def _collect_with_timeout(lf: pl.LazyFrame, timeout: int = _COLLECT_TIMEOUT) -> pl.DataFrame:
    """
    Run lf.collect() in a worker thread and raise TimeoutError if it takes
    longer than `timeout` seconds.  Uses threads because signal.alarm is
    UNIX-only and this backend runs on Windows.
    """
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(lf.collect)
        try:
            return future.result(timeout=timeout)
        except concurrent.futures.TimeoutError:
            raise TimeoutError(
                f"File read timed out after {timeout}s — "
                "the file may be too large, corrupted, or on a slow network drive"
            )


# ------------------------------------------------------------------ #
# ZIP helpers                                                          #
# ------------------------------------------------------------------ #

def _extract_zip_bytes(file_spec: dict) -> bytes:
    """Decompress and return the inner CSV bytes from a ZIP archive."""
    path = _resolve_path(file_spec["path"])
    _assert_file_exists(path)
    inner_file = file_spec.get("inner_file")
    if not inner_file:
        raise ValueError("ZIP format requires 'inner_file' in file spec")
    with zipfile.ZipFile(str(path)) as zf:
        with zf.open(inner_file) as f:
            return f.read()


def _count_zip_csv_rows(raw: bytes, has_header: bool) -> int:
    """Fast approximate row count by counting newlines in the raw bytes."""
    count = raw.count(b"\n")
    if raw and raw[-1:] != b"\n":
        count += 1  # last line has no trailing newline
    if has_header and count > 0:
        count -= 1
    return max(count, 0)


def _zip_csv_columns(raw: bytes, delimiter: str, encoding: str, has_header: bool) -> list:
    """Return column names without reading the full CSV body."""
    if has_header:
        df = pd.read_csv(
            io.BytesIO(raw), sep=delimiter, encoding=encoding, header=0, nrows=0
        )
        return list(df.columns)
    # No header — auto-numbered; read 1 row to learn the column count
    df = pd.read_csv(
        io.BytesIO(raw), sep=delimiter, encoding=encoding, header=None, nrows=1
    )
    return [str(c) for c in df.columns]


# ------------------------------------------------------------------ #
# Kept for use in get_file_metadata ZIP fallback only                 #
# ------------------------------------------------------------------ #

def _load_df(file_spec: dict) -> pl.DataFrame:
    """Eagerly load a reference file into a Polars DataFrame (ZIP metadata fallback)."""
    path = _resolve_path(file_spec["path"])
    _assert_file_exists(path)
    fmt = file_spec.get("format", "csv").lower()

    if fmt == "parquet":
        return pl.read_parquet(str(path))

    delimiter = file_spec.get("delimiter", ",")
    encoding = file_spec.get("encoding", "utf-8")
    has_header = file_spec.get("has_header", True)

    if fmt == "zip":
        inner_file = file_spec.get("inner_file")
        if not inner_file:
            raise ValueError("ZIP format requires 'inner_file' in file spec")
        with zipfile.ZipFile(str(path)) as zf:
            with zf.open(inner_file) as f:
                raw = f.read()
        return pl.read_csv(
            io.BytesIO(raw),
            separator=delimiter,
            encoding=_polars_encoding(encoding),
            has_header=has_header,
            infer_schema_length=1000,
            ignore_errors=True,
        )

    return pl.read_csv(
        str(path),
        separator=delimiter,
        encoding=_polars_encoding(encoding),
        has_header=has_header,
        infer_schema_length=1000,
        ignore_errors=True,
    )


def _sanitize(obj):
    """Replace NaN/Inf floats with None for JSON safety."""
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj


def _pd_to_records(df: "pd.DataFrame") -> list:
    """Convert a pandas DataFrame to a JSON-safe list of dicts."""
    return _sanitize(df.where(df.notna(), None).to_dict("records"))


def _validate_regex(query: str) -> None:
    """Raise ValueError with a readable message if query is not valid regex."""
    try:
        re.compile(query)
    except re.error as exc:
        raise ValueError(f"Invalid search regex '{query}': {exc}") from exc


class ReferenceFileService:
    """Service for reading known reference files with configurable specs."""

    # ------------------------------------------------------------------ #
    # Internal lazy-frame builders                                         #
    # ------------------------------------------------------------------ #

    def _csv_lazy(self, file_spec: dict) -> pl.LazyFrame:
        path = _resolve_path(file_spec["path"])
        _assert_file_exists(path)
        return pl.scan_csv(
            str(path),
            separator=file_spec.get("delimiter", ","),
            encoding=_polars_encoding(file_spec.get("encoding", "utf-8")),
            has_header=file_spec.get("has_header", True),
            infer_schema_length=1000,
            ignore_errors=True,
        )

    def _parquet_lazy(self, file_spec: dict) -> pl.LazyFrame:
        path = _resolve_path(file_spec["path"])
        _assert_file_exists(path)
        return pl.scan_parquet(str(path))

    @staticmethod
    def _build_search_expr(schema_names: list, query: str, column: Optional[str]):
        """Build a Polars boolean expression for regex/substring search."""
        _validate_regex(query)
        if column:
            return pl.col(column).cast(pl.Utf8).str.contains(query, literal=False)
        exprs = [
            pl.col(c).cast(pl.Utf8).str.contains(query, literal=False)
            for c in schema_names
        ]
        expr = exprs[0]
        for e in exprs[1:]:
            expr = expr | e
        return expr

    # ------------------------------------------------------------------ #
    # Metadata                                                             #
    # ------------------------------------------------------------------ #

    def get_file_metadata(self, file_spec: dict) -> dict:
        """
        Return column names and total row count for a reference file.
        Tries to read only the schema (fast) before falling back to full load.
        """
        path = _resolve_path(file_spec["path"])
        _assert_file_exists(path)
        fmt = file_spec.get("format", "csv").lower()

        spec_columns = file_spec.get("columns")

        if fmt == "parquet":
            try:
                lf = pl.scan_parquet(str(path))
                columns = lf.collect_schema().names()
                total_rows = _collect_with_timeout(lf.select(pl.len())).item()
            except Exception:
                df = pl.read_parquet(str(path))
                columns = df.columns
                total_rows = len(df)
        elif fmt == "zip":
            df = _load_df(file_spec)
            columns = df.columns
            total_rows = len(df)
        else:
            delimiter = file_spec.get("delimiter", ",")
            encoding = file_spec.get("encoding", "utf-8")
            has_header = file_spec.get("has_header", True)
            try:
                lf = pl.scan_csv(
                    str(path),
                    separator=delimiter,
                    encoding=_polars_encoding(encoding),
                    has_header=has_header,
                    infer_schema_length=1000,
                    ignore_errors=True,
                )
                columns = lf.collect_schema().names()
                total_rows = _collect_with_timeout(lf.select(pl.len())).item()
            except Exception:
                df = _load_df(file_spec)
                columns = df.columns
                total_rows = len(df)

        if spec_columns:
            columns = spec_columns

        return {
            "columns": columns,
            "total_rows": total_rows,
            "file_format": fmt,
            "path": str(path),
        }

    # ------------------------------------------------------------------ #
    # Paginated browsing                                                   #
    # ------------------------------------------------------------------ #

    def read_file_paginated(
        self,
        file_spec: dict,
        page: int = 1,
        page_size: int = 50,
        sort_column: Optional[str] = None,
        sort_direction: str = "asc",
    ) -> dict:
        """
        Return a page of rows from the reference file, with optional sorting.

        CSV / Parquet: Polars lazy scan — only page_size rows ever in memory for
        the unsorted case; sorted case still streams but Polars sorts in chunks.
        ZIP + CSV    : pandas skiprows+nrows (no sort) or full load (with sort).
        """
        fmt = file_spec.get("format", "csv").lower()
        offset = (page - 1) * page_size
        descending = sort_direction.lower() == "desc"

        if fmt == "zip":
            return self._browse_zip_csv(
                file_spec, page, page_size, offset, sort_column, descending
            )

        lf = self._parquet_lazy(file_spec) if fmt == "parquet" else self._csv_lazy(file_spec)

        columns = lf.collect_schema().names()
        # Streaming count — O(1) memory
        total_rows = _collect_with_timeout(lf.select(pl.len())).item()

        if sort_column and sort_column in columns:
            lf = lf.sort(sort_column, descending=descending, nulls_last=True)

        # Only page_size rows collected into RAM
        page_df = _collect_with_timeout(lf.slice(offset, page_size))
        total_pages = (total_rows + page_size - 1) // page_size if total_rows > 0 else 0

        return {
            "data": _sanitize(page_df.to_dicts()),
            "columns": columns,
            "pagination": {
                "current_page": page,
                "page_size": page_size,
                "total_rows": total_rows,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_previous": page > 1,
            },
        }

    def _browse_zip_csv(
        self,
        file_spec: dict,
        page: int,
        page_size: int,
        offset: int,
        sort_column: Optional[str],
        descending: bool,
    ) -> dict:
        """
        Paginated browse for ZIP+CSV using pandas.
        No sort  → pandas skiprows (int) + nrows  — reads only the page window.
        With sort → full pandas load + sort + iloc slice (unavoidable for ZIP).
        """
        raw = _extract_zip_bytes(file_spec)
        delimiter = file_spec.get("delimiter", ",")
        encoding = file_spec.get("encoding", "utf-8")
        has_header = file_spec.get("has_header", True)

        total_rows = _count_zip_csv_rows(raw, has_header)
        total_pages = (total_rows + page_size - 1) // page_size if total_rows > 0 else 0
        columns = _zip_csv_columns(raw, delimiter, encoding, has_header)

        if sort_column and sort_column in columns:
            # Full load required for sorting
            full_pd = pd.read_csv(
                io.BytesIO(raw), sep=delimiter, encoding=encoding,
                header=0 if has_header else None, dtype=str,
            )
            if not has_header:
                full_pd.columns = columns
            full_pd = full_pd.sort_values(
                sort_column, ascending=not descending, na_position="last"
            )
            page_pd = full_pd.iloc[offset: offset + page_size]
        else:
            # Efficient: skip header (1 row) + offset data rows as a single integer
            skip_count = (offset + 1) if has_header else offset
            page_pd = pd.read_csv(
                io.BytesIO(raw), sep=delimiter, encoding=encoding,
                header=None, names=columns,
                skiprows=skip_count, nrows=page_size, dtype=str,
            )

        return {
            "data": _pd_to_records(page_pd),
            "columns": columns,
            "pagination": {
                "current_page": page,
                "page_size": page_size,
                "total_rows": total_rows,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_previous": page > 1,
            },
        }

    # ------------------------------------------------------------------ #
    # Search                                                               #
    # ------------------------------------------------------------------ #

    def search_in_file(
        self,
        file_spec: dict,
        query: str,
        column: Optional[str] = None,
        limit: int = 5000,
        offset: int = 0,
        page_size: Optional[int] = None,
    ) -> dict:
        """
        Search for a query string (regex supported) across all or a specific column.

        offset / page_size enable server-side pagination so the caller receives
        only one page of results instead of the full result set.
        Omit page_size (or pass None) to get all results up to `limit` — used
        internally by search_across_folder when aggregating across multiple files.

        CSV / Parquet: two Polars lazy scans —
          1st scan: streaming count  (O(1) memory)
          2nd scan: slice to page    (O(page_size) memory)
        ZIP + CSV   : pandas chunked read capped at `limit` rows, then paged in RAM.
        """
        # Validate regex up-front so callers get a readable error, not a Polars crash
        _validate_regex(query)

        effective_page = page_size if page_size is not None else limit
        fmt = file_spec.get("format", "csv").lower()

        if fmt == "zip":
            return self._search_zip_csv(
                file_spec, query, column, limit, offset, effective_page
            )

        lf = self._parquet_lazy(file_spec) if fmt == "parquet" else self._csv_lazy(file_spec)
        schema_names = lf.collect_schema().names()

        if column and column not in schema_names:
            return {"results": [], "total_found": 0, "results_limited": False, "limit_applied": limit}
        if not schema_names:
            return {"results": [], "total_found": 0, "results_limited": False, "limit_applied": limit}

        filter_expr = self._build_search_expr(schema_names, query, column)
        filtered_lf = lf.filter(filter_expr)

        # 1st lazy scan: accurate total count, O(1) memory
        total_found = _collect_with_timeout(filtered_lf.select(pl.len())).item()
        results_limited = total_found > limit

        # Cap pagination to `limit` so we never deliver more than allowed
        effective_total = min(total_found, limit)
        safe_offset = min(offset, effective_total)
        safe_size = min(effective_page, effective_total - safe_offset)

        if safe_size <= 0:
            return {
                "results": [],
                "total_found": effective_total,
                "results_limited": results_limited,
                "limit_applied": limit,
            }

        # 2nd lazy scan: collect only the requested window, O(page_size) memory
        page_df = _collect_with_timeout(filtered_lf.slice(safe_offset, safe_size))
        return {
            "results": _sanitize(page_df.to_dicts()),
            "total_found": effective_total,
            "results_limited": results_limited,
            "limit_applied": limit,
        }

    def _search_zip_csv(
        self,
        file_spec: dict,
        query: str,
        column: Optional[str],
        limit: int,
        offset: int,
        page_size: int,
    ) -> dict:
        """
        Chunked pandas search inside a ZIP+CSV.
        Reads CHUNK_SIZE rows at a time, applies the filter, and accumulates
        matching rows up to `limit`.  Never holds more than limit + CHUNK_SIZE
        rows in memory simultaneously.
        """
        raw = _extract_zip_bytes(file_spec)
        delimiter = file_spec.get("delimiter", ",")
        encoding = file_spec.get("encoding", "utf-8")
        has_header = file_spec.get("has_header", True)

        CHUNK = 50_000
        collected: list["pd.DataFrame"] = []
        total_collected = 0
        total_found = 0
        columns_out: Optional[list] = None

        for chunk in pd.read_csv(
            io.BytesIO(raw), sep=delimiter, encoding=encoding,
            header=0 if has_header else None, chunksize=CHUNK, dtype=str,
        ):
            if columns_out is None:
                columns_out = list(chunk.columns)

            if column:
                if column not in chunk.columns:
                    return {
                        "results": [], "total_found": 0,
                        "results_limited": False, "limit_applied": limit,
                    }
                mask = chunk[column].str.contains(query, na=False, regex=True)
            else:
                # Column-wise vectorised OR — much faster than row-wise apply
                mask = chunk.apply(
                    lambda s: s.str.contains(query, na=False, regex=True)
                ).any(axis=1)

            filtered = chunk[mask]
            total_found += len(filtered)

            if total_collected < limit:
                take = min(len(filtered), limit - total_collected)
                collected.append(filtered.head(take))
                total_collected += take

        results_limited = total_found > limit
        result_df = pd.concat(collected, ignore_index=True) if collected else pd.DataFrame()

        safe_offset = min(offset, len(result_df))
        page_pd = result_df.iloc[safe_offset: safe_offset + page_size]

        return {
            "results": _pd_to_records(page_pd),
            "total_found": min(total_found, limit),
            "results_limited": results_limited,
            "limit_applied": limit,
        }

    # ------------------------------------------------------------------ #
    # Multi-value search (Excel paste)                                     #
    # ------------------------------------------------------------------ #

    def search_multiple_values(
        self,
        file_spec: dict,
        values: list,
        column: str,
        limit: int = 5000,
        exact_match: bool = True,
        offset: int = 0,
        page_size: Optional[int] = None,
    ) -> dict:
        """
        Search a specific column for any of the provided values (Excel paste mode).

        CSV / Parquet: Polars lazy scan with is_in() or str.contains() OR-chain.
        ZIP + CSV    : pandas chunked read.
        offset / page_size control server-side pagination (same rules as search_in_file).
        """
        if not values:
            return {
                "results": [], "total_found": 0,
                "results_limited": False, "limit_applied": limit,
                "values_searched": 0,
            }

        effective_page = page_size if page_size is not None else limit
        str_values = [str(v).strip() for v in values if str(v).strip()]
        fmt = file_spec.get("format", "csv").lower()

        if fmt == "zip":
            return self._search_multi_zip_csv(
                file_spec, str_values, column, limit, exact_match, offset, effective_page
            )

        lf = self._parquet_lazy(file_spec) if fmt == "parquet" else self._csv_lazy(file_spec)
        schema_names = lf.collect_schema().names()

        if column not in schema_names:
            return {
                "results": [], "total_found": 0, "results_limited": False,
                "limit_applied": limit,
                "error": f"Column '{column}' not found in file",
                "values_searched": len(values),
            }

        col_expr = pl.col(column).cast(pl.Utf8)
        if exact_match:
            filter_expr = col_expr.is_in(str_values)
        else:
            masks = [col_expr.str.contains(v, literal=True) for v in str_values]
            filter_expr = masks[0]
            for m in masks[1:]:
                filter_expr = filter_expr | m

        filtered_lf = lf.filter(filter_expr)

        # 1st scan: count
        total_found = _collect_with_timeout(filtered_lf.select(pl.len())).item()
        results_limited = total_found > limit

        effective_total = min(total_found, limit)
        safe_offset = min(offset, effective_total)
        safe_size = min(effective_page, effective_total - safe_offset)

        if safe_size <= 0:
            return {
                "results": [], "total_found": effective_total,
                "results_limited": results_limited, "limit_applied": limit,
                "values_searched": len(values),
            }

        # 2nd scan: page data
        page_df = _collect_with_timeout(filtered_lf.slice(safe_offset, safe_size))
        return {
            "results": _sanitize(page_df.to_dicts()),
            "total_found": effective_total,
            "results_limited": results_limited,
            "limit_applied": limit,
            "values_searched": len(values),
        }

    def _search_multi_zip_csv(
        self,
        file_spec: dict,
        str_values: list,
        column: str,
        limit: int,
        exact_match: bool,
        offset: int,
        page_size: int,
    ) -> dict:
        raw = _extract_zip_bytes(file_spec)
        delimiter = file_spec.get("delimiter", ",")
        encoding = file_spec.get("encoding", "utf-8")
        has_header = file_spec.get("has_header", True)

        CHUNK = 50_000
        collected: list["pd.DataFrame"] = []
        total_collected = 0
        total_found = 0

        # Pre-build partial-match regex once (re.escape prevents injection)
        partial_pattern = "|".join(map(re.escape, str_values)) if not exact_match else None

        for chunk in pd.read_csv(
            io.BytesIO(raw), sep=delimiter, encoding=encoding,
            header=0 if has_header else None, chunksize=CHUNK, dtype=str,
        ):
            if column not in chunk.columns:
                return {
                    "results": [], "total_found": 0, "results_limited": False,
                    "limit_applied": limit,
                    "error": f"Column '{column}' not found",
                    "values_searched": len(str_values),
                }

            col_series = chunk[column].str.strip()
            mask = (
                col_series.isin(str_values)
                if exact_match
                else col_series.str.contains(partial_pattern, na=False, regex=True)
            )

            filtered = chunk[mask]
            total_found += len(filtered)

            if total_collected < limit:
                take = min(len(filtered), limit - total_collected)
                collected.append(filtered.head(take))
                total_collected += take

        results_limited = total_found > limit
        result_df = pd.concat(collected, ignore_index=True) if collected else pd.DataFrame()

        safe_offset = min(offset, len(result_df))
        page_pd = result_df.iloc[safe_offset: safe_offset + page_size]

        return {
            "results": _pd_to_records(page_pd),
            "total_found": min(total_found, limit),
            "results_limited": results_limited,
            "limit_applied": limit,
            "values_searched": len(str_values),
        }

    # ------------------------------------------------------------------ #
    # Folder-based discovery                                               #
    # ------------------------------------------------------------------ #

    def discover_files_in_folder(
        self,
        folder_path: str,
        file_pattern: str = ".*",
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        date_group_index: int = 1,
        date_format: str = "%Y%m%d",
    ) -> list:
        """
        Scan a folder and return files whose names match file_pattern (regex).
        Optionally filter by date range extracted from a capture group in the pattern.
        date_from / date_to are ISO strings (YYYY-MM-DD).
        """
        folder = _resolve_path(folder_path)
        if not folder.exists() or not folder.is_dir():
            return []

        try:
            pattern = re.compile(file_pattern)
        except re.error:
            return []

        dt_from = None
        dt_to = None
        if date_from:
            try:
                dt_from = datetime.strptime(date_from, "%Y-%m-%d")
            except ValueError:
                pass
        if date_to:
            try:
                dt_to = datetime.strptime(date_to, "%Y-%m-%d")
            except ValueError:
                pass

        found = []
        for f in sorted(folder.iterdir()):
            if not f.is_file():
                continue
            m = pattern.search(f.name)
            if not m:
                continue

            file_date = None
            try:
                if m.lastindex and m.lastindex >= date_group_index:
                    date_str = m.group(date_group_index)
                    file_date = datetime.strptime(date_str, date_format)
            except (ValueError, IndexError):
                pass

            if dt_from and file_date and file_date < dt_from:
                continue
            if dt_to and file_date and file_date > dt_to:
                continue

            found.append({
                "path": str(f),
                "name": f.name,
                "date": file_date.strftime("%Y-%m-%d") if file_date else None,
            })

        return found

    # ------------------------------------------------------------------ #
    # Cross-folder search                                                  #
    # ------------------------------------------------------------------ #

    def search_across_folder(
        self,
        file_spec: dict,
        query: str,
        column: Optional[str] = None,
        limit: int = 5000,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        file_regex: Optional[str] = None,
    ) -> dict:
        """
        Search across all files in a folder that match the discovery criteria.
        Results from all matching files are combined up to limit.
        Pagination of the combined results is handled by the router.
        """
        folder_path = file_spec.get("folder_path", "")
        file_pattern = file_regex if file_regex else file_spec.get("file_pattern", ".*")
        date_group_index = file_spec.get("date_group_index", 1)
        date_format_str = file_spec.get("date_format", "%Y%m%d")

        discovered = self.discover_files_in_folder(
            folder_path=folder_path,
            file_pattern=file_pattern,
            date_from=date_from,
            date_to=date_to,
            date_group_index=date_group_index,
            date_format=date_format_str,
        )

        if not discovered:
            return {
                "results": [],
                "total_found": 0,
                "results_limited": False,
                "limit_applied": limit,
                "files_searched": 0,
                "files_available": 0,
            }

        all_results = []
        files_searched = 0
        for file_info in discovered:
            if len(all_results) >= limit:
                break
            single_spec = {**file_spec, "path": file_info["path"]}
            remaining = limit - len(all_results)
            try:
                # page_size=None → service returns all matches up to remaining
                result = self.search_in_file(
                    file_spec=single_spec,
                    query=query,
                    column=column,
                    limit=remaining,
                )
                all_results.extend(result.get("results", []))
                files_searched += 1
            except Exception:
                pass

        results_limited = len(all_results) >= limit
        return {
            "results": all_results[:limit],
            "total_found": len(all_results),
            "results_limited": results_limited,
            "limit_applied": limit,
            "files_searched": files_searched,
            "files_available": len(discovered),
        }

    # ------------------------------------------------------------------ #
    # Cross-folder multi-value search                                      #
    # ------------------------------------------------------------------ #

    def search_multiple_values_across_folder(
        self,
        file_spec: dict,
        values: list,
        column: str,
        limit: int = 5000,
        exact_match: bool = True,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        file_regex: Optional[str] = None,
    ) -> dict:
        """
        Search multiple values (Excel paste mode) across all files in a folder.
        Mirrors search_across_folder but delegates to search_multiple_values per file.
        """
        folder_path = file_spec.get("folder_path", "")
        file_pattern = file_regex if file_regex else file_spec.get("file_pattern", ".*")
        date_group_index = file_spec.get("date_group_index", 1)
        date_format_str = file_spec.get("date_format", "%Y%m%d")

        discovered = self.discover_files_in_folder(
            folder_path=folder_path,
            file_pattern=file_pattern,
            date_from=date_from,
            date_to=date_to,
            date_group_index=date_group_index,
            date_format=date_format_str,
        )

        if not discovered:
            return {
                "results": [],
                "total_found": 0,
                "results_limited": False,
                "limit_applied": limit,
                "values_searched": len(values),
                "files_searched": 0,
                "files_available": 0,
            }

        all_results = []
        files_searched = 0
        for file_info in discovered:
            if len(all_results) >= limit:
                break
            single_spec = {**file_spec, "path": file_info["path"]}
            remaining = limit - len(all_results)
            try:
                result = self.search_multiple_values(
                    file_spec=single_spec,
                    values=values,
                    column=column,
                    limit=remaining,
                    exact_match=exact_match,
                )
                all_results.extend(result.get("results", []))
                files_searched += 1
            except Exception:
                pass

        results_limited = len(all_results) >= limit
        return {
            "results": all_results[:limit],
            "total_found": len(all_results),
            "results_limited": results_limited,
            "limit_applied": limit,
            "values_searched": len(values),
            "files_searched": files_searched,
            "files_available": len(discovered),
        }


# Singleton instance
reference_file_service = ReferenceFileService()
