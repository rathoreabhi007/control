"""
Transform Operations Package

This package provides data transformation operations for pandas DataFrames.
It includes various operations like SetValue, CopyField, MapValues, Formula, etc.

Usage:
    from transform_operations import TransformOperations
    
    # Initialize the transformer
    transformer = TransformOperations()
    
    # Execute an operation
    result_df = transformer.execute_operation(df, operation_args)
"""

from .transform_operations import TransformOperations

__version__ = "1.0.0"
__author__ = "Dashboard Team"
__all__ = ["TransformOperations"]
