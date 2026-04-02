"""
Convert to Parquet Node Handler

Converts input data to Parquet format and saves to specified location.
"""

from typing import Dict, Any, List
from pathlib import Path
import polars as pl

from .base import BaseNodeHandler


class ConvertParquetHandler(BaseNodeHandler):
    """Handler for converting data to Parquet"""

    node_type = "convert_parquet"
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
        Convert data to Parquet format

        Parameters:
            output_path: Path to save the Parquet file
            compression: Compression algorithm (snappy, gzip, brotli, none)
            partition_by: Comma-separated columns for partitioning (optional)
        """
        output_path = self.get_param(params, "output_path", "")
        compression = self.get_param(params, "compression", "snappy")
        partition_by_str = self.get_param(params, "partition_by", "")

        if not inputs:
            raise ValueError("Convert Parquet node requires input data")

        lf = inputs[0]
        self.log_execution(node_id, f"Converting to Parquet: {output_path}")

        try:
            # Validate output path
            if not output_path:
                # Use session path as default
                output_path = str(session_path / f"{node_id}_output.parquet")

            output_path_obj = Path(output_path)

            # Ensure parent directory exists
            output_path_obj.parent.mkdir(parents=True, exist_ok=True)

            # Map compression
            compression_map = {
                "snappy": "snappy",
                "gzip": "gzip",
                "brotli": "brotli",
                "none": "uncompressed",
                "uncompressed": "uncompressed",
            }
            polars_compression = compression_map.get(
                compression.lower(),
                "snappy"
            )

            # Collect LazyFrame to DataFrame
            df = lf.collect()

            # Handle partitioning
            if partition_by_str:
                partition_cols = [
                    c.strip() for c in partition_by_str.split(",") if c.strip()
                ]
                # Validate partition columns exist
                valid_cols = [c for c in partition_cols if c in df.columns]

                if valid_cols:
                    # Write partitioned parquet (creates directory structure)
                    df.write_parquet(
                        output_path,
                        compression=polars_compression,
                        use_pyarrow=True,
                        pyarrow_options={"partition_cols": valid_cols}
                    )
                else:
                    # No valid partition columns, write without partitioning
                    df.write_parquet(output_path, compression=polars_compression)
            else:
                # Write non-partitioned parquet
                df.write_parquet(output_path, compression=polars_compression)

            # Get file size
            file_size = output_path_obj.stat().st_size if output_path_obj.exists() else 0
            size_mb = round(file_size / (1024 * 1024), 2)

            self.log_execution(
                node_id,
                f"Saved {df.height} rows to Parquet ({size_mb} MB)"
            )

            # Return the data as LazyFrame for downstream nodes
            return df.lazy()

        except Exception as e:
            self.log_execution(node_id, f"Error converting to Parquet: {e}", "error")
            raise
