"""
Save to CSV Node Handler

Saves input data to a CSV file at the specified path.
"""

from typing import Dict, Any, List
from pathlib import Path
import polars as pl

from .base import BaseNodeHandler


class SaveCSVHandler(BaseNodeHandler):
    """Handler for saving data to CSV"""

    node_type = "save_csv"
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
        Save data to CSV file

        Parameters:
            output_path: Path to save the CSV file
            delimiter: Field delimiter (default: ',')
            include_header: Whether to include column headers (default: True)
            encoding: File encoding (default: 'utf-8')
        """
        output_path = self.get_param(params, "output_path", "")
        delimiter = self.get_param(params, "delimiter", ",")
        include_header = self.get_param(params, "include_header", True, bool)
        # encoding param kept for metadata; Polars writes UTF-8 by default

        if not inputs:
            raise ValueError("Save CSV node requires input data")

        lf = inputs[0]
        self.log_execution(node_id, f"Saving to CSV: {output_path}")

        try:
            if not output_path:
                output_path = str(session_path / f"{node_id}_output.csv")

            output_path_obj = Path(output_path)

            # Ensure parent directory exists
            output_path_obj.parent.mkdir(parents=True, exist_ok=True)

            # Collect LazyFrame to DataFrame
            df = lf.collect()

            # Write CSV
            df.write_csv(
                output_path,
                separator=delimiter,
                include_header=include_header,
            )

            # Get file size
            file_size = output_path_obj.stat().st_size if output_path_obj.exists() else 0
            size_mb = round(file_size / (1024 * 1024), 2)

            self.log_execution(
                node_id,
                f"Saved {df.height} rows to CSV ({size_mb} MB)"
            )

            # Return the data as LazyFrame for downstream nodes
            return df.lazy()

        except Exception as e:
            self.log_execution(node_id, f"Error saving to CSV: {e}", "error")
            raise
