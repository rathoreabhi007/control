"""
Filter Data Node Handler

Filters rows based on conditions.
"""

from typing import Dict, Any, List
from pathlib import Path
import polars as pl
import re

from .base import BaseNodeHandler


class FilterDataHandler(BaseNodeHandler):
    """Handler for filtering data"""

    node_type = "filter"
    required_params = ["condition"]
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
        Filter data based on condition

        Parameters:
            condition: Filter condition expression
                Examples:
                - "column > 100"
                - "status == 'active'"
                - "amount >= 1000 AND category != 'test'"
            case_sensitive: Whether string comparisons are case-sensitive (default: False)
        """
        condition = self.get_param(params, "condition", "")
        case_sensitive = self.get_param(params, "case_sensitive", False, bool)

        if not inputs:
            raise ValueError("Filter node requires input data")

        lf = inputs[0]
        self.log_execution(node_id, f"Applying filter: {condition}")

        try:
            # Parse and apply the filter condition
            filter_expr = self._parse_condition(condition, case_sensitive)

            if filter_expr is not None:
                lf = lf.filter(filter_expr)

            # Get row count for logging
            row_count = lf.select(pl.count()).collect().item()
            self.log_execution(node_id, f"Filter result: {row_count} rows")

            return lf

        except Exception as e:
            self.log_execution(node_id, f"Error applying filter: {e}", "error")
            raise

    def _parse_condition(
        self,
        condition: str,
        case_sensitive: bool
    ) -> pl.Expr:
        """
        Parse a filter condition string into a Polars expression

        Supports:
            - Comparisons: >, <, >=, <=, ==, !=
            - Logical operators: AND, OR
            - String matching: LIKE, CONTAINS
            - Null checks: IS NULL, IS NOT NULL
        """
        condition = condition.strip()

        if not condition:
            return None

        # Handle AND/OR by splitting and combining
        if " AND " in condition.upper():
            parts = re.split(r'\s+AND\s+', condition, flags=re.IGNORECASE)
            exprs = [self._parse_simple_condition(p.strip(), case_sensitive) for p in parts]
            result = exprs[0]
            for expr in exprs[1:]:
                if expr is not None:
                    result = result & expr
            return result

        if " OR " in condition.upper():
            parts = re.split(r'\s+OR\s+', condition, flags=re.IGNORECASE)
            exprs = [self._parse_simple_condition(p.strip(), case_sensitive) for p in parts]
            result = exprs[0]
            for expr in exprs[1:]:
                if expr is not None:
                    result = result | expr
            return result

        return self._parse_simple_condition(condition, case_sensitive)

    def _parse_simple_condition(
        self,
        condition: str,
        case_sensitive: bool
    ) -> pl.Expr:
        """Parse a simple condition without AND/OR"""

        condition = condition.strip()

        # Handle IS NULL / IS NOT NULL
        if " IS NOT NULL" in condition.upper():
            col_name = condition.upper().replace(" IS NOT NULL", "").strip()
            col_name = self._find_original_column_name(condition, col_name)
            return pl.col(col_name).is_not_null()

        if " IS NULL" in condition.upper():
            col_name = condition.upper().replace(" IS NULL", "").strip()
            col_name = self._find_original_column_name(condition, col_name)
            return pl.col(col_name).is_null()

        # Handle CONTAINS
        if " CONTAINS " in condition.upper():
            parts = re.split(r'\s+CONTAINS\s+', condition, flags=re.IGNORECASE)
            if len(parts) == 2:
                col_name = parts[0].strip()
                value = parts[1].strip().strip('"').strip("'")
                col = pl.col(col_name)
                if case_sensitive:
                    return col.str.contains(value)
                else:
                    return col.str.to_lowercase().str.contains(value.lower())

        # Handle LIKE
        if " LIKE " in condition.upper():
            parts = re.split(r'\s+LIKE\s+', condition, flags=re.IGNORECASE)
            if len(parts) == 2:
                col_name = parts[0].strip()
                pattern = parts[1].strip().strip('"').strip("'")
                # Convert SQL LIKE to regex
                regex_pattern = pattern.replace("%", ".*").replace("_", ".")
                col = pl.col(col_name)
                if case_sensitive:
                    return col.str.contains(f"^{regex_pattern}$")
                else:
                    return col.str.to_lowercase().str.contains(f"^{regex_pattern.lower()}$")

        # Handle comparison operators
        for op in [">=", "<=", "!=", "==", ">", "<"]:
            if op in condition:
                parts = condition.split(op)
                if len(parts) == 2:
                    col_name = parts[0].strip()
                    value_str = parts[1].strip().strip('"').strip("'")

                    # Try to convert to number
                    value: Any = value_str
                    try:
                        value = float(value_str)
                        if value == int(value):
                            value = int(value)
                    except ValueError:
                        # Keep as string
                        pass

                    col = pl.col(col_name)

                    # Handle string comparison with case sensitivity
                    if isinstance(value, str) and not case_sensitive:
                        col = col.str.to_lowercase()
                        value = value.lower()

                    if op == ">":
                        return col > value
                    elif op == "<":
                        return col < value
                    elif op == ">=":
                        return col >= value
                    elif op == "<=":
                        return col <= value
                    elif op == "==":
                        return col == value
                    elif op == "!=":
                        return col != value

        raise ValueError(f"Could not parse condition: {condition}")

    def _find_original_column_name(self, original: str, upper_name: str) -> str:
        """Find the original case column name from the condition"""
        # Try to extract original column name preserving case
        words = original.split()
        if words:
            return words[0]
        return upper_name
