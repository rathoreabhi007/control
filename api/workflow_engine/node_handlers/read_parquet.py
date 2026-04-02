"""
Read Parquet Node Handler

Reads Parquet files into a LazyFrame for processing.
"""

from typing import Dict, Any, List, Optional
from pathlib import Path
import polars as pl

from .base import BaseNodeHandler


class ReadParquetHandler(BaseNodeHandler):
    """Handler for reading Parquet files"""

    node_type = "read_parquet"
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
        Read Parquet file into LazyFrame

        Parameters:
            file_path: Path to the Parquet file
            columns: Comma-separated list of columns to load (optional)
            filters: Row filter expression (optional)
        """
        file_path = self.get_param(params, "file_path")
        columns_str = self.get_param(params, "columns", "")
        filters_str = self.get_param(params, "filters", "")

        self.log_execution(node_id, f"Reading Parquet: {file_path}")

        # Validate file exists
        file_path_obj = Path(file_path)
        if not file_path_obj.exists():
            raise FileNotFoundError(f"Parquet file not found: {file_path}")

        # Parse columns if specified
        columns: Optional[List[str]] = None
        if columns_str:
            columns = [c.strip() for c in columns_str.split(",") if c.strip()]

        try:
            # Use scan_parquet for lazy loading
            lf = pl.scan_parquet(file_path)

            # Select specific columns if requested
            if columns:
                # Verify columns exist
                available_cols = lf.columns
                valid_cols = [c for c in columns if c in available_cols]
                if valid_cols:
                    lf = lf.select(valid_cols)
                else:
                    self.log_execution(
                        node_id,
                        f"Warning: None of requested columns found. Available: {available_cols}",
                        "warning"
                    )

            # Apply filters if specified
            if filters_str:
                lf = self._apply_filter(lf, filters_str, node_id)

            # Get row count for logging
            row_count = lf.select(pl.count()).collect().item()
            self.log_execution(node_id, f"Loaded {row_count} rows from Parquet")

            return lf

        except Exception as e:
            self.log_execution(node_id, f"Error reading Parquet: {e}", "error")
            raise

    def _apply_filter(
        self,
        lf: pl.LazyFrame,
        filter_str: str,
        node_id: str
    ) -> pl.LazyFrame:
        """
        Apply a simple filter expression

        Supports basic comparisons like:
            column > 100
            column == "value"
            column != 0
        """
        try:
            # Parse simple filter expressions
            filter_str = filter_str.strip()

            # Handle common operators
            for op in [">=", "<=", "!=", "==", ">", "<"]:
                if op in filter_str:
                    parts = filter_str.split(op)
                    if len(parts) == 2:
                        col_name = parts[0].strip()
                        value = parts[1].strip().strip('"').strip("'")

                        # Try to convert to number
                        try:
                            value = float(value)
                            if value == int(value):
                                value = int(value)
                        except ValueError:
                            pass

                        # Build filter expression
                        col = pl.col(col_name)
                        if op == ">":
                            return lf.filter(col > value)
                        elif op == "<":
                            return lf.filter(col < value)
                        elif op == ">=":
                            return lf.filter(col >= value)
                        elif op == "<=":
                            return lf.filter(col <= value)
                        elif op == "==":
                            return lf.filter(col == value)
                        elif op == "!=":
                            return lf.filter(col != value)

            self.log_execution(
                node_id,
                f"Could not parse filter: {filter_str}",
                "warning"
            )
            return lf

        except Exception as e:
            self.log_execution(node_id, f"Error applying filter: {e}", "warning")
            return lf
