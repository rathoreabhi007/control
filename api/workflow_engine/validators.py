"""
Validators Module

Provides validation rules and execution for workflow node outputs.
Validation types:
- row_count_min/max: Ensure row count within bounds
- column_exists: Ensure specific columns exist
- null_percentage_max: Limit null values in columns
- expression: Custom Polars filter expressions
"""

import logging
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
from enum import Enum
import polars as pl

logger = logging.getLogger(__name__)


class ValidationType(str, Enum):
    """Supported validation types"""
    ROW_COUNT_MIN = "row_count_min"
    ROW_COUNT_MAX = "row_count_max"
    COLUMN_EXISTS = "column_exists"
    NULL_PERCENTAGE_MAX = "null_percentage_max"
    EXPRESSION = "expression"


@dataclass
class ValidationRule:
    """Single validation rule configuration"""
    type: ValidationType
    value: Any
    column: Optional[str] = None
    error_message: Optional[str] = None
    id: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type.value if isinstance(self.type, ValidationType) else self.type,
            "value": self.value,
            "column": self.column,
            "errorMessage": self.error_message
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ValidationRule":
        return cls(
            id=data.get("id"),
            type=data.get("type"),
            value=data.get("value"),
            column=data.get("column"),
            error_message=data.get("errorMessage") or data.get("error_message")
        )


@dataclass
class ValidationResult:
    """Result of a single validation check"""
    rule: ValidationRule
    passed: bool
    message: str
    actual_value: Any = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "rule": self.rule.to_dict(),
            "passed": self.passed,
            "message": self.message,
            "actualValue": self.actual_value
        }


@dataclass
class NodeValidationResult:
    """Aggregated validation results for a node"""
    node_id: str
    passed: bool
    results: List[ValidationResult] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "nodeId": self.node_id,
            "passed": self.passed,
            "results": [r.to_dict() for r in self.results]
        }


class NodeValidator:
    """Validates node output against configured rules"""
    
    def __init__(self):
        self.validators = {
            ValidationType.ROW_COUNT_MIN.value: self._validate_row_count_min,
            ValidationType.ROW_COUNT_MAX.value: self._validate_row_count_max,
            ValidationType.COLUMN_EXISTS.value: self._validate_column_exists,
            ValidationType.NULL_PERCENTAGE_MAX.value: self._validate_null_percentage,
            ValidationType.EXPRESSION.value: self._validate_expression,
        }
    
    def validate(
        self,
        node_id: str,
        output: pl.LazyFrame,
        rules: List[ValidationRule]
    ) -> NodeValidationResult:
        """
        Validate node output against all configured rules.
        
        Args:
            node_id: Node identifier
            output: LazyFrame output from the node
            rules: List of validation rules to check
            
        Returns:
            NodeValidationResult with all validation results
        """
        results = []
        all_passed = True
        
        # Collect the output for validation
        try:
            df = output.collect()
        except Exception as e:
            logger.error(f"Failed to collect output for validation: {e}")
            return NodeValidationResult(
                node_id=node_id,
                passed=False,
                results=[ValidationResult(
                    rule=ValidationRule(type="error", value=""),
                    passed=False,
                    message=f"Failed to collect output: {str(e)}"
                )]
            )
        
        for rule in rules:
            rule_type = rule.type if isinstance(rule.type, str) else rule.type.value
            validator = self.validators.get(rule_type)
            
            if validator:
                try:
                    result = validator(df, rule)
                    results.append(result)
                    if not result.passed:
                        all_passed = False
                except Exception as e:
                    logger.error(f"Validation error for rule {rule_type}: {e}")
                    results.append(ValidationResult(
                        rule=rule,
                        passed=False,
                        message=f"Validation error: {str(e)}"
                    ))
                    all_passed = False
            else:
                logger.warning(f"Unknown validation type: {rule_type}")
        
        return NodeValidationResult(
            node_id=node_id,
            passed=all_passed,
            results=results
        )
    
    def _validate_row_count_min(
        self,
        df: pl.DataFrame,
        rule: ValidationRule
    ) -> ValidationResult:
        """Validate minimum row count"""
        min_rows = int(rule.value)
        actual_rows = df.height
        passed = actual_rows >= min_rows
        
        message = rule.error_message or (
            f"Row count validation passed: {actual_rows} >= {min_rows}" if passed
            else f"Row count too low: {actual_rows} < {min_rows}"
        )
        
        return ValidationResult(
            rule=rule,
            passed=passed,
            message=message,
            actual_value=actual_rows
        )
    
    def _validate_row_count_max(
        self,
        df: pl.DataFrame,
        rule: ValidationRule
    ) -> ValidationResult:
        """Validate maximum row count"""
        max_rows = int(rule.value)
        actual_rows = df.height
        passed = actual_rows <= max_rows
        
        message = rule.error_message or (
            f"Row count validation passed: {actual_rows} <= {max_rows}" if passed
            else f"Row count too high: {actual_rows} > {max_rows}"
        )
        
        return ValidationResult(
            rule=rule,
            passed=passed,
            message=message,
            actual_value=actual_rows
        )
    
    def _validate_column_exists(
        self,
        df: pl.DataFrame,
        rule: ValidationRule
    ) -> ValidationResult:
        """Validate that a column exists"""
        column_name = str(rule.value).strip()
        columns = df.columns
        passed = column_name in columns
        
        message = rule.error_message or (
            f"Column '{column_name}' exists" if passed
            else f"Column '{column_name}' not found. Available columns: {', '.join(columns[:10])}"
        )
        
        return ValidationResult(
            rule=rule,
            passed=passed,
            message=message,
            actual_value=columns
        )
    
    def _validate_null_percentage(
        self,
        df: pl.DataFrame,
        rule: ValidationRule
    ) -> ValidationResult:
        """Validate null percentage in a column"""
        column = rule.column
        max_percentage = float(rule.value)
        
        if not column or column not in df.columns:
            return ValidationResult(
                rule=rule,
                passed=False,
                message=f"Column '{column}' not found for null percentage check"
            )
        
        total_rows = df.height
        if total_rows == 0:
            return ValidationResult(
                rule=rule,
                passed=True,
                message="No rows to validate",
                actual_value=0.0
            )
        
        null_count = df.select(pl.col(column).is_null().sum()).item()
        actual_percentage = (null_count / total_rows) * 100
        passed = actual_percentage <= max_percentage
        
        message = rule.error_message or (
            f"Null percentage OK: {actual_percentage:.2f}% <= {max_percentage}%" if passed
            else f"Too many nulls in '{column}': {actual_percentage:.2f}% > {max_percentage}%"
        )
        
        return ValidationResult(
            rule=rule,
            passed=passed,
            message=message,
            actual_value=round(actual_percentage, 2)
        )
    
    def _validate_expression(
        self,
        df: pl.DataFrame,
        rule: ValidationRule
    ) -> ValidationResult:
        """Validate using custom Polars expression"""
        expression = str(rule.value).strip()
        
        try:
            # Parse and execute the expression
            # Expression should filter rows that PASS validation
            # If all rows pass, validation passes
            filtered = df.filter(pl.Expr.deserialize(expression.encode(), format="json"))
            passing_rows = filtered.height
            total_rows = df.height
            passed = passing_rows == total_rows
            
            message = rule.error_message or (
                f"Expression validation passed: all {total_rows} rows match" if passed
                else f"Expression validation failed: {total_rows - passing_rows} of {total_rows} rows don't match"
            )
            
            return ValidationResult(
                rule=rule,
                passed=passed,
                message=message,
                actual_value={"passing": passing_rows, "total": total_rows}
            )
        except Exception as e:
            # Try simpler eval-based approach for common expressions
            try:
                # Simple expression parser for common cases like "column_name > 0"
                result = self._eval_simple_expression(df, expression)
                return result
            except Exception:
                return ValidationResult(
                    rule=rule,
                    passed=False,
                    message=f"Failed to evaluate expression: {str(e)}"
                )
    
    def _eval_simple_expression(
        self,
        df: pl.DataFrame,
        expression: str
    ) -> ValidationResult:
        """
        Evaluate simple expressions like 'column > 0' or 'column != null'
        """
        import re
        
        # Parse simple comparison: column operator value
        match = re.match(r'(\w+)\s*(==|!=|>=|<=|>|<)\s*(.+)', expression.strip())
        if not match:
            raise ValueError(f"Cannot parse expression: {expression}")
        
        column, operator, value = match.groups()
        value = value.strip().strip('"\'')
        
        if column not in df.columns:
            return ValidationResult(
                rule=ValidationRule(type=ValidationType.EXPRESSION, value=expression),
                passed=False,
                message=f"Column '{column}' not found"
            )
        
        # Convert value to appropriate type
        try:
            value = float(value) if '.' in value else int(value)
        except ValueError:
            pass  # Keep as string
        
        # Build filter expression
        col_expr = pl.col(column)
        if operator == '>':
            filter_expr = col_expr > value
        elif operator == '>=':
            filter_expr = col_expr >= value
        elif operator == '<':
            filter_expr = col_expr < value
        elif operator == '<=':
            filter_expr = col_expr <= value
        elif operator == '==':
            filter_expr = col_expr == value
        elif operator == '!=':
            filter_expr = col_expr != value
        else:
            raise ValueError(f"Unknown operator: {operator}")
        
        filtered = df.filter(filter_expr)
        passing_rows = filtered.height
        total_rows = df.height
        passed = passing_rows == total_rows
        
        return ValidationResult(
            rule=ValidationRule(type=ValidationType.EXPRESSION, value=expression),
            passed=passed,
            message=f"Expression '{expression}': {passing_rows}/{total_rows} rows pass" if passed
                    else f"Expression '{expression}' failed: {total_rows - passing_rows} rows don't match",
            actual_value={"passing": passing_rows, "total": total_rows}
        )


# Global validator instance
validator = NodeValidator()


def validate_node_output(
    node_id: str,
    output: pl.LazyFrame,
    rules: List[Dict[str, Any]]
) -> NodeValidationResult:
    """
    Convenience function to validate node output.
    
    Args:
        node_id: Node identifier
        output: LazyFrame output
        rules: List of rule dictionaries from frontend
        
    Returns:
        NodeValidationResult
    """
    validation_rules = [ValidationRule.from_dict(r) for r in rules]
    return validator.validate(node_id, output, validation_rules)
