"""
Save to Excel Node Handler

Saves input data to an Excel (.xlsx) file at the specified path.
"""

from typing import Dict, Any, List
from pathlib import Path
import polars as pl

from .base import BaseNodeHandler


class SaveExcelHandler(BaseNodeHandler):
    """Handler for saving data to Excel"""

    node_type = "save_excel"
    required_params = ["output_path"]
    requires_input = True
    min_inputs = 1
    max_inputs = 1

    async def execute(
        self,
        params: Dict[str, Any],
        inputs: List[pl.LazyFrame],
        session_path: Path,
        node_id: str
    ) -> pl.LazyFrame:
        """
        Save data to Excel file

        Parameters:
            output_path: Path to save the Excel file (.xlsx)
            sheet_name: Name of the worksheet (default: 'Sheet1')
            include_header: Whether to include column headers (default: True)
        """
        output_path = self.get_param(params, "output_path", "")
        sheet_name = self.get_param(params, "sheet_name", "Sheet1")
        include_header = self.get_param(params, "include_header", True, bool)

        if not inputs:
            raise ValueError("Save Excel node requires input data")

        lf = inputs[0]
        self.log_execution(node_id, f"Saving to Excel: {output_path}")

        try:
            if not output_path:
                output_path = str(session_path / f"{node_id}_output.xlsx")

            output_path_obj = Path(output_path)

            # Ensure parent directory exists
            output_path_obj.parent.mkdir(parents=True, exist_ok=True)

            # Collect LazyFrame to DataFrame
            df = lf.collect()

            # Write Excel
            df.write_excel(
                output_path,
                worksheet=sheet_name,
                include_header=include_header,
            )

            # Get file size
            file_size = output_path_obj.stat().st_size if output_path_obj.exists() else 0
            size_mb = round(file_size / (1024 * 1024), 2)

            self.log_execution(
                node_id,
                f"Saved {df.height} rows to Excel ({size_mb} MB)"
            )

            # Return the data as LazyFrame for downstream nodes
            return df.lazy()

        except Exception as e:
            self.log_execution(node_id, f"Error saving to Excel: {e}", "error")
            raise
