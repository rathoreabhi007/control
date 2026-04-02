# Transform Operations Package

This package provides a comprehensive set of data transformation operations for pandas DataFrames. It's designed to be used in both API backends and frontend applications for testing and applying data transformations.

## Features

- **SetValue**: Set a constant value for all rows
- **CopyField**: Copy values from one column to another
- **MapValues**: Map values based on a dictionary
- **Formula**: Apply mathematical formulas to columns
- **Concatenate**: Combine multiple columns into one
- **Split**: Split string columns into parts
- **Replace**: Replace values based on a mapping
- **Conditional**: Apply conditional logic
- **DateExtract**: Extract date components
- **NumericOperation**: Perform numeric operations (sum, mean, max, min, std)
- **StringOperation**: Perform string operations (upper, lower, length, strip, title)

## Installation

The package uses pandas and numpy, which are already included in the project's requirements.txt.

## Usage

### Basic Usage

```python
from transform_operations import TransformOperations
import pandas as pd

# Initialize the transformer
transformer = TransformOperations()

# Create sample data
df = pd.DataFrame({
    'id': [1, 2, 3],
    'name': ['John', 'Jane', 'Bob'],
    'salary': [50000, 60000, 70000]
})

# Set a constant value
args = {
    'NewFieldName': 'status',
    'Operation': 'SetValue',
    'Inputs': {'value': 'Active'},
    'types': str
}
result_df = transformer.set_value(df, args)
```

### Using the Generic Execute Method

```python
# Execute any operation using the generic method
args = {
    'NewFieldName': 'bonus',
    'Operation': 'Formula',
    'formulastring': 'A * 0.1',
    'Inputs': {'A': 'salary'},
    'types': float
}
result_df = transformer.execute_operation(df, args)
```

## Operation Arguments Structure

Each operation expects a dictionary with the following structure:

```python
{
    'NewFieldName': 'column_name',  # Name of the new column to create
    'Operation': 'OperationType',   # Type of operation to perform
    'Inputs': {                     # Operation-specific inputs
        # ... operation-specific parameters
    },
    'types': data_type,            # Optional: data type for the new column
    'formulastring': 'formula',    # For Formula operations
    'comparator': 'operator'       # For Conditional operations
}
```

## Supported Operations

### 1. SetValue
Set a constant value for all rows.

```python
{
    'NewFieldName': 'status',
    'Operation': 'SetValue',
    'Inputs': {'value': 'Active'},
    'types': str
}
```

### 2. CopyField
Copy values from one column to another.

```python
{
    'NewFieldName': 'employee_name',
    'Operation': 'CopyField',
    'Inputs': {'source_field': 'name'},
    'types': str
}
```

### 3. MapValues
Map values based on a dictionary.

```python
{
    'NewFieldName': 'dept_code',
    'Operation': 'MapValues',
    'Inputs': {
        'source_field': 'department',
        'mapping': {'IT': 'I001', 'HR': 'H001', 'Finance': 'F001'}
    },
    'types': str
}
```

### 4. Formula
Apply mathematical formulas to columns.

```python
{
    'NewFieldName': 'bonus',
    'Operation': 'Formula',
    'formulastring': 'A * 0.1',
    'Inputs': {'A': 'salary'},
    'types': float
}
```

### 5. Concatenate
Combine multiple columns into one.

```python
{
    'NewFieldName': 'full_name',
    'Operation': 'Concatenate',
    'Inputs': {
        'fields': ['first_name', 'last_name'],
        'separator': ' '
    },
    'types': str
}
```

### 6. Split
Split string columns into parts.

```python
{
    'NewFieldName': 'first_name',
    'Operation': 'Split',
    'Inputs': {
        'source_field': 'full_name',
        'separator': ' ',
        'part': 0
    },
    'types': str
}
```

### 7. Replace
Replace values based on a mapping.

```python
{
    'NewFieldName': 'clean_department',
    'Operation': 'Replace',
    'Inputs': {
        'source_field': 'department',
        'replacements': {'IT': 'Information Technology', 'HR': 'Human Resources'}
    },
    'types': str
}
```

### 8. Conditional
Apply conditional logic.

```python
{
    'NewFieldName': 'seniority',
    'Operation': 'Conditional',
    'Inputs': {
        'condition_field': 'age',
        'comparator': '>=',
        'value': 30,
        'true_value': 'Senior',
        'false_value': 'Junior'
    },
    'types': str
}
```

### 9. DateExtract
Extract date components.

```python
{
    'NewFieldName': 'hire_year',
    'Operation': 'DateExtract',
    'Inputs': {
        'source_field': 'hire_date',
        'component': 'year'  # year, month, day, weekday, quarter
    },
    'types': int
}
```

### 10. NumericOperation
Perform numeric operations.

```python
{
    'NewFieldName': 'total_compensation',
    'Operation': 'NumericOperation',
    'Inputs': {
        'operation': 'sum',  # sum, mean, max, min, std
        'fields': ['salary', 'bonus']
    },
    'types': float
}
```

### 11. StringOperation
Perform string operations.

```python
{
    'NewFieldName': 'name_upper',
    'Operation': 'StringOperation',
    'Inputs': {
        'source_field': 'name',
        'operation': 'upper'  # upper, lower, length, strip, title
    },
    'types': str
}
```

## API Integration

The package includes an example Flask API integration (`api_integration_example.py`) that shows how to:

- Execute single transformations
- Execute batch transformations
- Validate operations
- Get supported operations
- Get operation examples

### API Endpoints

- `GET /api/transform/operations` - Get supported operations
- `POST /api/transform/execute` - Execute a single transformation
- `POST /api/transform/batch` - Execute multiple transformations
- `POST /api/transform/validate` - Validate an operation
- `GET /api/transform/examples` - Get operation examples

## Testing

Run the test file to see examples of all operations:

```bash
cd api/transform_operations
python test_operations.py
```

## Error Handling

The package includes comprehensive error handling:

- Validates required arguments
- Checks for missing columns
- Handles data type conversion errors
- Provides detailed logging
- Returns original DataFrame on errors

## Logging

The package uses Python's logging module. Set the logging level to see detailed operation information:

```python
import logging
logging.basicConfig(level=logging.INFO)
```

## Future Enhancements

- Add more string operations (regex, substring, etc.)
- Add more date operations (date arithmetic, formatting)
- Add more numeric operations (rounding, statistical functions)
- Add validation operations
- Add data quality checks
- Add support for custom functions
