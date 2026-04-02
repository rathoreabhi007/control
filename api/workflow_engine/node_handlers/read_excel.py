"""
Read Excel Node Handler

Reads Excel files into a LazyFrame for processing.
"""

from typing import Dict, Any, List, Optional
from pathlib import Path
import polars as pl

from .base import BaseNodeHandler


class ReadExcelHandler(BaseNodeHandler):
    """Handler for reading Excel files"""

    node_type = "read_excel"
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
        Read Excel file into LazyFrame

        Parameters:
            file_path: Path to the Excel file
            sheet_name: Name of sheet to read (optional, defaults to first)
            header_row: Row number for headers (default: 0)
            skip_rows: Number of rows to skip after header (default: 0)
        """
        file_path = self.get_param(params, "file_path")
        sheet_name = self.get_param(params, "sheet_name", None)
        header_row = self.get_param(params, "header_row", 0, int)
        skip_rows = self.get_param(params, "skip_rows", 0, int)

        self.log_execution(node_id, f"Reading Excel: {file_path}")

        # Validate file exists
        file_path_obj = Path(file_path)
        if not file_path_obj.exists():
            raise FileNotFoundError(f"Excel file not found: {file_path}")

        try:
            # Polars read_excel returns DataFrame, convert to LazyFrame
            read_kwargs = {
                "source": file_path,
                "engine": "calamine",  # Fast Rust-based engine
            }

            # Handle sheet selection
            if sheet_name:
                read_kwargs["sheet_name"] = sheet_name
            else:
                read_kwargs["sheet_id"] = 1  # First sheet

            # Read Excel file
            df = pl.read_excel(**read_kwargs)

            # Handle header row if not 0
            if header_row > 0:
                # Skip rows before header
                df = df.slice(header_row)
                # Use first row as header
                new_columns = df.row(0)
                df = df.slice(1)
                df.columns = [str(c) for c in new_columns]

            # Skip additional rows if specified
            if skip_rows > 0:
                df = df.slice(skip_rows)

            # Convert to LazyFrame
            lf = df.lazy()

            # Get row count for logging
            row_count = df.height
            self.log_execution(node_id, f"Loaded {row_count} rows from Excel")

            return lf

        except Exception as e:
            self.log_execution(node_id, f"Error reading Excel: {e}", "error")
            raise
