"""
Output Node Handler

Handles final data output (preview, download, save).
"""

from typing import Dict, Any, List
from pathlib import Path
import polars as pl
import json
from datetime import datetime

from .base import BaseNodeHandler


class OutputHandler(BaseNodeHandler):
    """Handler for data output"""

    node_type = "output"
    required_params = []
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
        Handle data output

        Parameters:
            output_type: Type of output (preview, download, save)
            max_rows: Maximum rows for preview (default: 1000)
        """
        output_type = self.get_param(params, "output_type", "preview")
        max_rows = self.get_param(params, "max_rows", 1000, int)

        if not inputs:
            raise ValueError("Output node requires input data")

        lf = inputs[0]
        self.log_execution(node_id, f"Output type: {output_type}, max_rows: {max_rows}")

        try:
            # Collect the data
            df = lf.collect()
            total_rows = df.height

            # For preview, limit rows
            if output_type == "preview":
                if max_rows and max_rows < total_rows:
                    df = df.head(max_rows)

            # Save output metadata
            output_metadata = {
                "output_type": output_type,
                "total_rows": total_rows,
                "displayed_rows": df.height,
                "columns": df.columns,
                "dtypes": {col: str(dtype) for col, dtype in zip(df.columns, df.dtypes)},
                "created_at": datetime.utcnow().isoformat(),
            }

            # Save metadata to session
            metadata_path = session_path / f"{node_id}_output_meta.json"
            with open(metadata_path, "w") as f:
                json.dump(output_metadata, f, indent=2)

            self.log_execution(
                node_id,
                f"Output: {df.height} of {total_rows} rows, {len(df.columns)} columns"
            )

            # Return the full LazyFrame for storage
            return lf

        except Exception as e:
            self.log_execution(node_id, f"Error in output: {e}", "error")
            raise
