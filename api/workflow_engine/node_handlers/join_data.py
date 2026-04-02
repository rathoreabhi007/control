"""
Join Data Node Handler

Joins two datasets based on keys.
"""

from typing import Dict, Any, List
from pathlib import Path
import polars as pl

from .base import BaseNodeHandler


class JoinDataHandler(BaseNodeHandler):
    """Handler for joining data"""

    node_type = "join"
    required_params = ["join_type", "left_key", "right_key"]
    requires_input = True
    min_inputs = 2
    max_inputs = 2

    async def execute(
        self,
        params: Dict[str, Any],
        inputs: List[pl.LazyFrame],
        session_path: Path,
        node_id: str
    ) -> pl.LazyFrame:
        """
        Join two datasets

        Parameters:
            join_type: Type of join (inner, left, right, outer)
            left_key: Column name(s) for left dataset key
            right_key: Column name(s) for right dataset key
            suffixes: Comma-separated suffixes for duplicate columns (default: '_x,_y')
        """
        join_type = self.get_param(params, "join_type", "inner")
        left_key = self.get_param(params, "left_key", "")
        right_key = self.get_param(params, "right_key", "")
        suffixes_str = self.get_param(params, "suffixes", "_left,_right")

        if len(inputs) < 2:
            raise ValueError("Join node requires exactly 2 inputs")

        left_lf = inputs[0]
        right_lf = inputs[1]

        self.log_execution(
            node_id,
            f"Joining data: {join_type} join on {left_key} = {right_key}"
        )

        try:
            # Parse key columns (support multiple keys)
            left_keys = [k.strip() for k in left_key.split(",") if k.strip()]
            right_keys = [k.strip() for k in right_key.split(",") if k.strip()]

            if len(left_keys) != len(right_keys):
                raise ValueError(
                    f"Number of left keys ({len(left_keys)}) must match "
                    f"right keys ({len(right_keys)})"
                )

            # Parse suffixes
            suffixes = suffixes_str.split(",")
            if len(suffixes) != 2:
                suffixes = ["_left", "_right"]
            suffix_left, suffix_right = suffixes[0].strip(), suffixes[1].strip()

            # Map join type to Polars
            join_type_map = {
                "inner": "inner",
                "left": "left",
                "right": "right",  # Will swap and use left join
                "outer": "full",
            }
            polars_join_type = join_type_map.get(join_type.lower(), "inner")

            # Handle right join by swapping
            if join_type.lower() == "right":
                left_lf, right_lf = right_lf, left_lf
                left_keys, right_keys = right_keys, left_keys
                polars_join_type = "left"

            # Perform the join
            if len(left_keys) == 1:
                # Single key join
                result = left_lf.join(
                    right_lf,
                    left_on=left_keys[0],
                    right_on=right_keys[0],
                    how=polars_join_type,
                    suffix=suffix_right,
                )
            else:
                # Multi-key join
                result = left_lf.join(
                    right_lf,
                    left_on=left_keys,
                    right_on=right_keys,
                    how=polars_join_type,
                    suffix=suffix_right,
                )

            # Get row count for logging
            row_count = result.select(pl.count()).collect().item()
            self.log_execution(node_id, f"Join result: {row_count} rows")

            return result

        except Exception as e:
            self.log_execution(node_id, f"Error joining data: {e}", "error")
            raise
