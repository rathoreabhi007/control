"""
Aggregate Data Node Handler

Aggregates data by grouping and applying functions.
"""

from typing import Dict, Any, List
from pathlib import Path
import polars as pl

from .base import BaseNodeHandler


class AggregateHandler(BaseNodeHandler):
    """Handler for aggregating data"""

    node_type = "aggregate"
    required_params = ["group_by", "aggregations"]
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
        Aggregate data by groups

        Parameters:
            group_by: Comma-separated column names to group by
            aggregations: Comma-separated aggregation expressions
                Format: function:column
                Functions: sum, count, mean, avg, min, max, first, last, std, var
                Examples: "sum:amount,count:id,mean:value"
            sort_by: Optional sort expression (e.g., "date DESC")
        """
        group_by_str = self.get_param(params, "group_by", "")
        aggregations_str = self.get_param(params, "aggregations", "")
        sort_by_str = self.get_param(params, "sort_by", "")

        if not inputs:
            raise ValueError("Aggregate node requires input data")

        lf = inputs[0]
        self.log_execution(
            node_id,
            f"Aggregating: group by [{group_by_str}], agg [{aggregations_str}]"
        )

        try:
            # Parse group by columns
            group_by_cols = [c.strip() for c in group_by_str.split(",") if c.strip()]

            if not group_by_cols:
                raise ValueError("At least one group by column is required")

            # Parse aggregations
            agg_exprs = self._parse_aggregations(aggregations_str)

            if not agg_exprs:
                raise ValueError("At least one aggregation is required")

            # Perform groupby and aggregation
            result = lf.group_by(group_by_cols).agg(agg_exprs)

            # Apply sorting if specified
            if sort_by_str:
                result = self._apply_sort(result, sort_by_str)

            # Get row count for logging
            row_count = result.select(pl.count()).collect().item()
            self.log_execution(node_id, f"Aggregation result: {row_count} groups")

            return result

        except Exception as e:
            self.log_execution(node_id, f"Error aggregating data: {e}", "error")
            raise

    def _parse_aggregations(self, agg_str: str) -> List[pl.Expr]:
        """
        Parse aggregation string into Polars expressions

        Format: "function:column,function:column,..."
        Supported functions:
            sum, count, mean, avg, min, max, first, last, std, var, median, n_unique
        """
        agg_exprs = []

        for agg in agg_str.split(","):
            agg = agg.strip()
            if not agg:
                continue

            if ":" in agg:
                parts = agg.split(":", 1)
                func_name = parts[0].strip().lower()
                col_name = parts[1].strip()

                col = pl.col(col_name)
                alias = f"{func_name}_{col_name}"

                if func_name == "sum":
                    agg_exprs.append(col.sum().alias(alias))
                elif func_name == "count":
                    agg_exprs.append(col.count().alias(alias))
                elif func_name in ("mean", "avg"):
                    agg_exprs.append(col.mean().alias(alias))
                elif func_name == "min":
                    agg_exprs.append(col.min().alias(alias))
                elif func_name == "max":
                    agg_exprs.append(col.max().alias(alias))
                elif func_name == "first":
                    agg_exprs.append(col.first().alias(alias))
                elif func_name == "last":
                    agg_exprs.append(col.last().alias(alias))
                elif func_name == "std":
                    agg_exprs.append(col.std().alias(alias))
                elif func_name == "var":
                    agg_exprs.append(col.var().alias(alias))
                elif func_name == "median":
                    agg_exprs.append(col.median().alias(alias))
                elif func_name == "n_unique":
                    agg_exprs.append(col.n_unique().alias(alias))
                else:
                    raise ValueError(f"Unknown aggregation function: {func_name}")
            else:
                # Default to count if no function specified
                agg_exprs.append(pl.col(agg).count().alias(f"count_{agg}"))

        return agg_exprs

    def _apply_sort(self, lf: pl.LazyFrame, sort_str: str) -> pl.LazyFrame:
        """
        Apply sorting to result

        Format: "column [ASC|DESC], column [ASC|DESC], ..."
        """
        sort_exprs = []
        descending = []

        for sort_item in sort_str.split(","):
            sort_item = sort_item.strip()
            if not sort_item:
                continue

            parts = sort_item.split()
            col_name = parts[0]

            # Check for DESC/ASC
            is_desc = False
            if len(parts) > 1:
                direction = parts[1].upper()
                is_desc = direction == "DESC"

            sort_exprs.append(col_name)
            descending.append(is_desc)

        if sort_exprs:
            return lf.sort(sort_exprs, descending=descending)

        return lf
