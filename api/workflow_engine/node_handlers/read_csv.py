"""
Read CSV Node Handler

Reads CSV files into a LazyFrame for processing.
"""

from typing import Dict, Any, List
from pathlib import Path
import polars as pl

from .base import BaseNodeHandler


class ReadCSVHandler(BaseNodeHandler):
    """Handler for reading CSV files"""

    node_type = "read_csv"
    required_params = ["file_path"]
    requires_input = False
    min_inputs = 0
    max_inputs = 0

    async def execute(
        self,
        params: Dict[str, Any],
        inputs: List[pl.LazyFrame],
        session_path: Path,
        node_id: str
    ) -> pl.LazyFrame:
        """
        Read CSV file into LazyFrame

        Parameters:
            file_path: Path to the CSV file
            delimiter: Field delimiter (default: ',')
            encoding: File encoding (default: 'utf-8')
            header: Whether file has header row (default: True)
            skip_rows: Number of rows to skip (default: 0)
        """
        file_path = self.get_param(params, "file_path")
        delimiter = self.get_param(params, "delimiter", ",")
        encoding = self.get_param(params, "encoding", "utf-8")
        has_header = self.get_param(params, "header", True, bool)
        skip_rows = self.get_param(params, "skip_rows", 0, int)

        self.log_execution(node_id, f"Reading CSV: {file_path}")

        # Validate file exists
        file_path_obj = Path(file_path)
        if not file_path_obj.exists():
            raise FileNotFoundError(f"CSV file not found: {file_path}")

        # Map encoding names
        encoding_map = {
            "utf-8": "utf8",
            "utf8": "utf8",
            "latin-1": "utf8-lossy",
            "latin1": "utf8-lossy",
            "cp1252": "utf8-lossy",
        }
        polars_encoding = encoding_map.get(encoding.lower(), "utf8")

        try:
            # Use scan_csv for lazy loading
            lf = pl.scan_csv(
                file_path,
                separator=delimiter,
                encoding=polars_encoding,
                has_header=has_header,
                skip_rows=skip_rows,
                infer_schema_length=10000,
                ignore_errors=True,
            )

            # Get row count for logging
            row_count = lf.select(pl.count()).collect().item()
            self.log_execution(node_id, f"Loaded {row_count} rows from CSV")

            return lf

        except Exception as e:
            self.log_execution(node_id, f"Error reading CSV: {e}", "error")
            raise
