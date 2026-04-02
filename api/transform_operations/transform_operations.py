"""
TransformOperations class for data transformation operations.

This module provides a comprehensive set of data transformation operations
that can be applied to pandas DataFrames. Each operation takes a DataFrame
as input along with operation-specific arguments and returns a DataFrame
with an additional column containing the transformation result.
"""

import pandas as pd
import numpy as np
import re
from typing import Dict, Any, Union, List, Optional
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TransformOperations:
    """
    A class containing various data transformation operations for DataFrames.
    
    Each operation method takes a DataFrame and a dictionary of arguments,
    and returns a DataFrame with an additional column containing the result.
    """
    
    def __init__(self):
        """Initialize the TransformOperations class."""
        self.supported_operations = [
            'SetValue', 'CopyField', 'MapValues', 'Formula', 
            'Concatenate', 'Split', 'Replace', 'Conditional',
            'DateExtract', 'NumericOperation', 'StringOperation'
        ]
    
    def validate_arguments(self, args: Dict[str, Any], required_keys: List[str]) -> bool:
        """
        Validate that required keys are present in arguments dictionary.
        
        Args:
            args: Dictionary containing operation arguments
            required_keys: List of required keys
            
        Returns:
            bool: True if all required keys are present, False otherwise
        """
        missing_keys = [key for key in required_keys if key not in args]
        if missing_keys:
            logger.error(f"Missing required arguments: {missing_keys}")
            return False
        return True
    
    def set_value(self, df: pd.DataFrame, args: Dict[str, Any]) -> pd.DataFrame:
        """
        Set a constant value for all rows in a new column.
        
        Args:
            df: Input DataFrame
            args: Dictionary containing:
                - NewFieldName: Name of the new column
                - Operation: 'SetValue'
                - Inputs: Comma-separated value (the constant value to set)
                - types: Data type for the new column (optional)
                
        Returns:
            DataFrame with new column containing the constant value
        """
        required_keys = ['NewFieldName', 'Operation', 'Inputs']
        if not self.validate_arguments(args, required_keys):
            return df
        
        new_field_name = args['NewFieldName']
        value = args['Inputs']
        data_type = args.get('types', type(value))
        
        # Create a copy of the DataFrame to avoid modifying the original
        result_df = df.copy()
        
        # Set the constant value for all rows
        result_df[new_field_name] = value
        
        # Convert to specified data type if provided
        if data_type and data_type != type(value):
            try:
                result_df[new_field_name] = result_df[new_field_name].astype(data_type)
            except Exception as e:
                logger.warning(f"Could not convert to type {data_type}: {e}")
        
        logger.info(f"SetValue operation completed. Added column '{new_field_name}' with value '{value}'")
        return result_df
    
    def copy_field(self, df: pd.DataFrame, args: Dict[str, Any]) -> pd.DataFrame:
        """
        Copy values from an existing column to a new column.
        
        Args:
            df: Input DataFrame
            args: Dictionary containing:
                - NewFieldName: Name of the new column
                - Operation: 'CopyField'
                - Inputs: Comma-separated source field name
                - types: Data type for the new column (optional)
                
        Returns:
            DataFrame with new column containing copied values
        """
        required_keys = ['NewFieldName', 'Operation', 'Inputs']
        if not self.validate_arguments(args, required_keys):
            return df
        
        new_field_name = args['NewFieldName']
        source_field = args['Inputs']
        data_type = args.get('types')
        
        if source_field not in df.columns:
            logger.error(f"Source field '{source_field}' not found in DataFrame")
            return df
        
        # Create a copy of the DataFrame
        result_df = df.copy()
        
        # Copy the values
        result_df[new_field_name] = df[source_field]
        
        # Convert to specified data type if provided
        if data_type:
            try:
                result_df[new_field_name] = result_df[new_field_name].astype(data_type)
            except Exception as e:
                logger.warning(f"Could not convert to type {data_type}: {e}")
        
        logger.info(f"CopyField operation completed. Copied '{source_field}' to '{new_field_name}'")
        return result_df
    
    def map_values(self, df: pd.DataFrame, args: Dict[str, Any]) -> pd.DataFrame:
        """
        Map values from one column to new values based on a mapping dictionary.
        
        Args:
            df: Input DataFrame
            args: Dictionary containing:
                - NewFieldName: Name of the new column
                - Operation: 'MapValues'
                - Inputs: Comma-separated source field name
                - mapping: Dictionary with old->new value mappings
                - types: Data type for the new column (optional)
                
        Returns:
            DataFrame with new column containing mapped values
        """
        required_keys = ['NewFieldName', 'Operation', 'Inputs', 'mapping']
        if not self.validate_arguments(args, required_keys):
            return df
        
        new_field_name = args['NewFieldName']
        source_field = args['Inputs']
        mapping = args.get('mapping', {})
        data_type = args.get('types')
        
        if source_field not in df.columns:
            logger.error(f"Source field '{source_field}' not found in DataFrame")
            return df
        
        if not isinstance(mapping, dict):
            logger.error("Mapping must be a dictionary")
            return df
        
        # Create a copy of the DataFrame
        result_df = df.copy()
        
        # Apply the mapping
        result_df[new_field_name] = df[source_field].map(mapping)
        
        # Convert to specified data type if provided
        if data_type:
            try:
                result_df[new_field_name] = result_df[new_field_name].astype(data_type)
            except Exception as e:
                logger.warning(f"Could not convert to type {data_type}: {e}")
        
        logger.info(f"MapValues operation completed. Mapped '{source_field}' to '{new_field_name}'")
        return result_df
    
    def formula(self, df: pd.DataFrame, args: Dict[str, Any]) -> pd.DataFrame:
        """
        Apply a mathematical formula to create a new column.
        
        Args:
            df: Input DataFrame
            args: Dictionary containing:
                - NewFieldName: Name of the new column
                - Operation: 'Formula'
                - formulastring: Mathematical formula string (e.g., "A + B * 2")
                - Inputs: Comma-separated field names (e.g., "field1,field2")
                - types: Data type for the new column (optional)
                
        Returns:
            DataFrame with new column containing formula results
        """
        required_keys = ['NewFieldName', 'Operation', 'formulastring', 'Inputs']
        if not self.validate_arguments(args, required_keys):
            return df
        
        new_field_name = args['NewFieldName']
        formula_string = args['formulastring']
        field_names = [field.strip() for field in args['Inputs'].split(',')]
        data_type = args.get('types')
        
        # Validate that all required fields exist in the DataFrame
        missing_fields = [field for field in field_names if field not in df.columns]
        if missing_fields:
            logger.error(f"Missing fields in DataFrame: {missing_fields}")
            return df
        
        # Create a copy of the DataFrame
        result_df = df.copy()
        
        try:
            # Replace field names in formula with actual column references
            formula_expr = formula_string
            for i, field_name in enumerate(field_names):
                # Use A, B, C, etc. as variable names
                var_name = chr(65 + i)  # A, B, C, etc.
                formula_expr = formula_expr.replace(var_name, f"df['{field_name}']")
            
            # Evaluate the formula
            result_df[new_field_name] = eval(formula_expr)
            
            # Convert to specified data type if provided
            if data_type:
                try:
                    result_df[new_field_name] = result_df[new_field_name].astype(data_type)
                except Exception as e:
                    logger.warning(f"Could not convert to type {data_type}: {e}")
            
            logger.info(f"Formula operation completed. Applied formula '{formula_string}' to create '{new_field_name}'")
            
        except Exception as e:
            logger.error(f"Error evaluating formula '{formula_string}': {e}")
            return df
        
        return result_df
    
    def concatenate(self, df: pd.DataFrame, args: Dict[str, Any]) -> pd.DataFrame:
        """
        Concatenate values from multiple columns into a new column.
        
        Args:
            df: Input DataFrame
            args: Dictionary containing:
                - NewFieldName: Name of the new column
                - Operation: 'Concatenate'
                - Inputs: Comma-separated field names
                - separator: Separator string (optional, defaults to ' ')
                - types: Data type for the new column (optional)
                
        Returns:
            DataFrame with new column containing concatenated values
        """
        required_keys = ['NewFieldName', 'Operation', 'Inputs']
        if not self.validate_arguments(args, required_keys):
            return df
        
        new_field_name = args['NewFieldName']
        fields = [field.strip() for field in args['Inputs'].split(',')]
        separator = args.get('separator', ' ')
        data_type = args.get('types', str)
        
        # Validate that all fields exist
        missing_fields = [field for field in fields if field not in df.columns]
        if missing_fields:
            logger.error(f"Missing fields in DataFrame: {missing_fields}")
            return df
        
        # Create a copy of the DataFrame
        result_df = df.copy()
        
        # Concatenate the fields
        result_df[new_field_name] = df[fields].astype(str).agg(separator.join, axis=1)
        
        # Convert to specified data type if provided
        if data_type and data_type != str:
            try:
                result_df[new_field_name] = result_df[new_field_name].astype(data_type)
            except Exception as e:
                logger.warning(f"Could not convert to type {data_type}: {e}")
        
        logger.info(f"Concatenate operation completed. Concatenated {fields} to create '{new_field_name}'")
        return result_df
    
    def split(self, df: pd.DataFrame, args: Dict[str, Any]) -> pd.DataFrame:
        """
        Split a string column into multiple parts.
        
        Args:
            df: Input DataFrame
            args: Dictionary containing:
                - NewFieldName: Name of the new column (will be used as prefix)
                - Operation: 'Split'
                - Inputs: Comma-separated source field name
                - separator: Separator string (optional, defaults to ' ')
                - part: Which part to extract (0-based index, optional, defaults to 0)
                - types: Data type for the new column (optional)
                
        Returns:
            DataFrame with new column containing split values
        """
        required_keys = ['NewFieldName', 'Operation', 'Inputs']
        if not self.validate_arguments(args, required_keys):
            return df
        
        new_field_name = args['NewFieldName']
        source_field = args['Inputs']
        separator = args.get('separator', ' ')
        part = args.get('part', 0)  # Which part to extract (0-based index)
        data_type = args.get('types')
        
        if source_field not in df.columns:
            logger.error(f"Source field '{source_field}' not found in DataFrame")
            return df
        
        # Create a copy of the DataFrame
        result_df = df.copy()
        
        # Split the string and extract the specified part
        result_df[new_field_name] = df[source_field].astype(str).str.split(separator).str[part]
        
        # Convert to specified data type if provided
        if data_type:
            try:
                result_df[new_field_name] = result_df[new_field_name].astype(data_type)
            except Exception as e:
                logger.warning(f"Could not convert to type {data_type}: {e}")
        
        logger.info(f"Split operation completed. Split '{source_field}' to create '{new_field_name}'")
        return result_df
    
    def replace(self, df: pd.DataFrame, args: Dict[str, Any]) -> pd.DataFrame:
        """
        Replace values in a column based on a replacement mapping.
        
        Args:
            df: Input DataFrame
            args: Dictionary containing:
                - NewFieldName: Name of the new column
                - Operation: 'Replace'
                - Inputs: Comma-separated source field name
                - replacements: Dictionary with old->new value mappings
                - types: Data type for the new column (optional)
                
        Returns:
            DataFrame with new column containing replaced values
        """
        required_keys = ['NewFieldName', 'Operation', 'Inputs', 'replacements']
        if not self.validate_arguments(args, required_keys):
            return df
        
        new_field_name = args['NewFieldName']
        source_field = args['Inputs']
        replacements = args.get('replacements', {})
        data_type = args.get('types')
        
        if source_field not in df.columns:
            logger.error(f"Source field '{source_field}' not found in DataFrame")
            return df
        
        # Create a copy of the DataFrame
        result_df = df.copy()
        
        # Apply replacements
        result_df[new_field_name] = df[source_field].replace(replacements)
        
        # Convert to specified data type if provided
        if data_type:
            try:
                result_df[new_field_name] = result_df[new_field_name].astype(data_type)
            except Exception as e:
                logger.warning(f"Could not convert to type {data_type}: {e}")
        
        logger.info(f"Replace operation completed. Replaced values in '{source_field}' to create '{new_field_name}'")
        return result_df
    
    def conditional(self, df: pd.DataFrame, args: Dict[str, Any]) -> pd.DataFrame:
        """
        Apply conditional logic to create a new column.
        
        Args:
            df: Input DataFrame
            args: Dictionary containing:
                - NewFieldName: Name of the new column
                - Operation: 'Conditional'
                - Inputs: Comma-separated condition field name
                - comparator: Comparison operator (==, !=, >, <, >=, <=)
                - value: Value to compare against
                - true_value: Value when condition is true
                - false_value: Value when condition is false
                - types: Data type for the new column (optional)
                
        Returns:
            DataFrame with new column containing conditional results
        """
        required_keys = ['NewFieldName', 'Operation', 'Inputs', 'comparator', 'value', 'true_value', 'false_value']
        if not self.validate_arguments(args, required_keys):
            return df
        
        new_field_name = args['NewFieldName']
        condition_field = args['Inputs']
        comparator = args.get('comparator', '==')
        value = args.get('value')
        true_value = args.get('true_value')
        false_value = args.get('false_value')
        data_type = args.get('types')
        
        if condition_field not in df.columns:
            logger.error(f"Condition field '{condition_field}' not found in DataFrame")
            return df
        
        # Create a copy of the DataFrame
        result_df = df.copy()
        
        # Apply conditional logic
        if comparator == '==':
            condition = df[condition_field] == value
        elif comparator == '!=':
            condition = df[condition_field] != value
        elif comparator == '>':
            condition = df[condition_field] > value
        elif comparator == '<':
            condition = df[condition_field] < value
        elif comparator == '>=':
            condition = df[condition_field] >= value
        elif comparator == '<=':
            condition = df[condition_field] <= value
        else:
            logger.error(f"Unsupported comparator: {comparator}")
            return df
        
        result_df[new_field_name] = np.where(condition, true_value, false_value)
        
        # Convert to specified data type if provided
        if data_type:
            try:
                result_df[new_field_name] = result_df[new_field_name].astype(data_type)
            except Exception as e:
                logger.warning(f"Could not convert to type {data_type}: {e}")
        
        logger.info(f"Conditional operation completed. Applied condition to create '{new_field_name}'")
        return result_df
    
    def date_extract(self, df: pd.DataFrame, args: Dict[str, Any]) -> pd.DataFrame:
        """
        Extract date components from a date column.
        
        Args:
            df: Input DataFrame
            args: Dictionary containing:
                - NewFieldName: Name of the new column
                - Operation: 'DateExtract'
                - Inputs: Comma-separated source field name
                - component: Date component to extract (year, month, day, weekday, quarter)
                - types: Data type for the new column (optional)
                
        Returns:
            DataFrame with new column containing extracted date component
        """
        required_keys = ['NewFieldName', 'Operation', 'Inputs', 'component']
        if not self.validate_arguments(args, required_keys):
            return df
        
        new_field_name = args['NewFieldName']
        source_field = args['Inputs']
        component = args.get('component', 'year')
        data_type = args.get('types', int)
        
        if source_field not in df.columns:
            logger.error(f"Source field '{source_field}' not found in DataFrame")
            return df
        
        # Create a copy of the DataFrame
        result_df = df.copy()
        
        try:
            # Convert to datetime if not already
            if not pd.api.types.is_datetime64_any_dtype(df[source_field]):
                result_df[source_field] = pd.to_datetime(df[source_field])
            
            # Extract the specified component
            if component == 'year':
                result_df[new_field_name] = result_df[source_field].dt.year
            elif component == 'month':
                result_df[new_field_name] = result_df[source_field].dt.month
            elif component == 'day':
                result_df[new_field_name] = result_df[source_field].dt.day
            elif component == 'weekday':
                result_df[new_field_name] = result_df[source_field].dt.weekday
            elif component == 'quarter':
                result_df[new_field_name] = result_df[source_field].dt.quarter
            else:
                logger.error(f"Unsupported date component: {component}")
                return df
            
            # Convert to specified data type if provided
            if data_type:
                try:
                    result_df[new_field_name] = result_df[new_field_name].astype(data_type)
                except Exception as e:
                    logger.warning(f"Could not convert to type {data_type}: {e}")
            
            logger.info(f"DateExtract operation completed. Extracted {component} from '{source_field}' to create '{new_field_name}'")
            
        except Exception as e:
            logger.error(f"Error extracting date component: {e}")
            return df
        
        return result_df
    
    def numeric_operation(self, df: pd.DataFrame, args: Dict[str, Any]) -> pd.DataFrame:
        """
        Perform numeric operations on columns.
        
        Args:
            df: Input DataFrame
            args: Dictionary containing:
                - NewFieldName: Name of the new column
                - Operation: 'NumericOperation'
                - Inputs: Comma-separated field names
                - operation: Numeric operation (sum, mean, max, min, std)
                - types: Data type for the new column (optional)
                
        Returns:
            DataFrame with new column containing numeric operation results
        """
        required_keys = ['NewFieldName', 'Operation', 'Inputs', 'operation']
        if not self.validate_arguments(args, required_keys):
            return df
        
        new_field_name = args['NewFieldName']
        operation = args.get('operation', 'sum')
        fields = [field.strip() for field in args['Inputs'].split(',')]
        data_type = args.get('types', float)
        
        # Validate that all fields exist and are numeric
        missing_fields = [field for field in fields if field not in df.columns]
        if missing_fields:
            logger.error(f"Missing fields in DataFrame: {missing_fields}")
            return df
        
        # Create a copy of the DataFrame
        result_df = df.copy()
        
        try:
            # Select only numeric columns
            numeric_df = df[fields].select_dtypes(include=[np.number])
            
            # Apply the operation
            if operation == 'sum':
                result_df[new_field_name] = numeric_df.sum(axis=1)
            elif operation == 'mean':
                result_df[new_field_name] = numeric_df.mean(axis=1)
            elif operation == 'max':
                result_df[new_field_name] = numeric_df.max(axis=1)
            elif operation == 'min':
                result_df[new_field_name] = numeric_df.min(axis=1)
            elif operation == 'std':
                result_df[new_field_name] = numeric_df.std(axis=1)
            else:
                logger.error(f"Unsupported numeric operation: {operation}")
                return df
            
            # Convert to specified data type if provided
            if data_type:
                try:
                    result_df[new_field_name] = result_df[new_field_name].astype(data_type)
                except Exception as e:
                    logger.warning(f"Could not convert to type {data_type}: {e}")
            
            logger.info(f"NumericOperation completed. Applied {operation} to {fields} to create '{new_field_name}'")
            
        except Exception as e:
            logger.error(f"Error performing numeric operation: {e}")
            return df
        
        return result_df
    
    def string_operation(self, df: pd.DataFrame, args: Dict[str, Any]) -> pd.DataFrame:
        """
        Perform string operations on columns.
        
        Args:
            df: Input DataFrame
            args: Dictionary containing:
                - NewFieldName: Name of the new column
                - Operation: 'StringOperation'
                - Inputs: Comma-separated source field name
                - operation: String operation (upper, lower, length, strip, title)
                - types: Data type for the new column (optional)
                
        Returns:
            DataFrame with new column containing string operation results
        """
        required_keys = ['NewFieldName', 'Operation', 'Inputs', 'operation']
        if not self.validate_arguments(args, required_keys):
            return df
        
        new_field_name = args['NewFieldName']
        source_field = args['Inputs']
        operation = args.get('operation', 'upper')
        data_type = args.get('types')
        
        if source_field not in df.columns:
            logger.error(f"Source field '{source_field}' not found in DataFrame")
            return df
        
        # Create a copy of the DataFrame
        result_df = df.copy()
        
        try:
            # Apply string operation
            if operation == 'upper':
                result_df[new_field_name] = df[source_field].astype(str).str.upper()
            elif operation == 'lower':
                result_df[new_field_name] = df[source_field].astype(str).str.lower()
            elif operation == 'length':
                result_df[new_field_name] = df[source_field].astype(str).str.len()
            elif operation == 'strip':
                result_df[new_field_name] = df[source_field].astype(str).str.strip()
            elif operation == 'title':
                result_df[new_field_name] = df[source_field].astype(str).str.title()
            else:
                logger.error(f"Unsupported string operation: {operation}")
                return df
            
            # Convert to specified data type if provided
            if data_type:
                try:
                    result_df[new_field_name] = result_df[new_field_name].astype(data_type)
                except Exception as e:
                    logger.warning(f"Could not convert to type {data_type}: {e}")
            
            logger.info(f"StringOperation completed. Applied {operation} to '{source_field}' to create '{new_field_name}'")
            
        except Exception as e:
            logger.error(f"Error performing string operation: {e}")
            return df
        
        return result_df
    
    def execute_operation(self, df: pd.DataFrame, args: Dict[str, Any]) -> pd.DataFrame:
        """
        Execute a transformation operation based on the operation type.
        
        Args:
            df: Input DataFrame
            args: Dictionary containing operation arguments
            
        Returns:
            DataFrame with the transformation applied
        """
        operation = args.get('Operation', '').lower()
        
        operation_map = {
            'setvalue': self.set_value,
            'copyfield': self.copy_field,
            'mapvalues': self.map_values,
            'formula': self.formula,
            'concatenate': self.concatenate,
            'split': self.split,
            'replace': self.replace,
            'conditional': self.conditional,
            'dateextract': self.date_extract,
            'numericoperation': self.numeric_operation,
            'stringoperation': self.string_operation
        }
        
        if operation not in operation_map:
            logger.error(f"Unsupported operation: {operation}")
            return df
        
        return operation_map[operation](df, args)
    
    def get_supported_operations(self) -> List[str]:
        """
        Get list of supported operations.
        
        Returns:
            List of supported operation names
        """
        return self.supported_operations
