"""
Pivot Table Node Handler

Reshapes data by pivoting rows into columns with aggregation.
"""

from typing import Dict, Any, List
from pathlib import Path
import polars as pl

from .base import BaseNodeHandler


class PivotTableHandler(BaseNodeHandler):
    """Handler for pivot table operations"""

    node_type = "pivot_table"
    required_params = ["index", "columns", "values"]
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
        Pivot data to reshape rows into columns

        Parameters:
            index: Comma-separated column names for row index
            columns: Column name to pivot on (creates new columns from unique values)
            values: Comma-separated column names for values
            aggregate_function: Aggregation function (sum, mean, count, min, max, first, last)
        """
        index_str = self.get_param(params, "index", "")
        columns_col = self.get_param(params, "columns", "")
        values_str = self.get_param(params, "values", "")
        agg_func = self.get_param(params, "aggregate_function", "sum")

        if not inputs:
            raise ValueError("Pivot Table node requires input data")

        lf = inputs[0]
        self.log_execution(
            node_id,
            f"Pivoting: index=[{index_str}], columns={columns_col}, "
            f"values=[{values_str}], agg={agg_func}"
        )

        try:
            # Parse comma-separated column names
            index_cols = [c.strip() for c in index_str.split(",") if c.strip()]
            values_cols = [c.strip() for c in values_str.split(",") if c.strip()]

            if not index_cols:
                raise ValueError("At least one index column is required")
            if not columns_col:
                raise ValueError("Pivot column is required")
            if not values_cols:
                raise ValueError("At least one value column is required")

            # Collect LazyFrame since pivot requires eager execution
            df = lf.collect()

            # Validate columns exist
            for col in index_cols + [columns_col] + values_cols:
                if col not in df.columns:
                    raise ValueError(f"Column '{col}' not found in data. Available: {df.columns}")

            # Map aggregate function string to Polars aggregate
            agg_map = {
                "sum": "sum",
                "mean": "mean",
                "count": "count",
                "min": "min",
                "max": "max",
                "first": "first",
                "last": "last",
            }

            polars_agg = agg_map.get(agg_func.lower(), "sum")

            # Perform pivot
            result = df.pivot(
                on=columns_col,
                index=index_cols,
                values=values_cols,
                aggregate_function=polars_agg,
            )

            self.log_execution(
                node_id,
                f"Pivot result: {result.height} rows, {len(result.columns)} columns"
            )

            return result.lazy()

        except Exception as e:
            self.log_execution(node_id, f"Error in pivot table: {e}", "error")
            raise
