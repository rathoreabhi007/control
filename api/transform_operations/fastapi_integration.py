"""
FastAPI Integration Example for TransformOperations.

This file shows how to integrate the TransformOperations class
with a FastAPI backend (similar to your existing main_v3.py structure).
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import pandas as pd
from transform_operations import TransformOperations

# Initialize FastAPI app
app = FastAPI(title="Transform Operations API", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize the transformer
transformer = TransformOperations()

# Pydantic models for request/response
class TransformRequest(BaseModel):
    data: List[Dict[str, Any]]
    operation: Dict[str, Any]

class BatchTransformRequest(BaseModel):
    data: List[Dict[str, Any]]
    operations: List[Dict[str, Any]]

class ValidateRequest(BaseModel):
    operation: Dict[str, Any]
    sample_data: Optional[List[Dict[str, Any]]] = None

class TransformResponse(BaseModel):
    success: bool
    data: Optional[List[Dict[str, Any]]] = None
    columns: Optional[List[str]] = None
    error: Optional[str] = None
    operations_applied: Optional[int] = None

class ValidationResponse(BaseModel):
    success: bool
    valid: Optional[bool] = None
    sample_result: Optional[List[Dict[str, Any]]] = None
    new_column: Optional[str] = None
    operation: Optional[str] = None
    error: Optional[str] = None

# API Endpoints

@app.get("/transform/operations")
async def get_supported_operations():
    """Get list of supported transformation operations."""
    try:
        operations = transformer.get_supported_operations()
        return {
            "operations": operations,
            "status": "success"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/transform/execute", response_model=TransformResponse)
async def execute_transformation(request: TransformRequest):
    """
    Execute a transformation operation.
    
    Expected JSON payload:
    {
        "data": [
            {"id": 1, "name": "John", "age": 25, "salary": 50000},
            {"id": 2, "name": "Jane", "age": 30, "salary": 60000}
        ],
        "operation": {
            "NewFieldName": "bonus",
            "Operation": "Formula",
            "formulastring": "A * 0.1",
            "Inputs": "salary",
            "types": "float"
        }
    }
    """
    try:
        # Convert data to DataFrame
        df = pd.DataFrame(request.data)
        
        # Execute the transformation
        result_df = transformer.execute_operation(df, request.operation)
        
        # Convert result back to JSON
        result_data = result_df.to_dict('records')
        
        return TransformResponse(
            success=True,
            data=result_data,
            columns=list(result_df.columns)
        )
        
    except Exception as e:
        return TransformResponse(
            success=False,
            error=str(e)
        )

@app.post("/transform/batch", response_model=TransformResponse)
async def execute_batch_transformations(request: BatchTransformRequest):
    """
    Execute multiple transformation operations in sequence.
    
    Expected JSON payload:
    {
        "data": [...],
        "operations": [
            {
                "NewFieldName": "status",
                "Operation": "SetValue",
                "Inputs": "Active",
                "types": "str"
            },
            {
                "NewFieldName": "bonus",
                "Operation": "Formula",
                "formulastring": "A * 0.1",
                "Inputs": "salary",
                "types": "float"
            }
        ]
    }
    """
    try:
        # Convert data to DataFrame
        df = pd.DataFrame(request.data)
        
        # Execute each operation in sequence
        for operation in request.operations:
            df = transformer.execute_operation(df, operation)
        
        # Convert result back to JSON
        result_data = df.to_dict('records')
        
        return TransformResponse(
            success=True,
            data=result_data,
            columns=list(df.columns),
            operations_applied=len(request.operations)
        )
        
    except Exception as e:
        return TransformResponse(
            success=False,
            error=str(e)
        )

@app.post("/transform/validate", response_model=ValidationResponse)
async def validate_operation(request: ValidateRequest):
    """
    Validate an operation without executing it.
    
    Expected JSON payload:
    {
        "operation": {
            "NewFieldName": "bonus",
            "Operation": "Formula",
            "formulastring": "A * 0.1",
            "Inputs": "salary",
            "types": "float"
        },
        "sample_data": [
            {"id": 1, "name": "John", "age": 25, "salary": 50000}
        ]
    }
    """
    try:
        operation = request.operation
        
        # Validate operation structure
        required_keys = ['NewFieldName', 'Operation', 'Inputs']
        missing_keys = [key for key in required_keys if key not in operation]
        
        if missing_keys:
            return ValidationResponse(
                success=False,
                error=f"Missing required operation keys: {missing_keys}"
            )
        
        # Check if operation is supported
        if operation['Operation'] not in transformer.get_supported_operations():
            return ValidationResponse(
                success=False,
                error=f"Unsupported operation: {operation['Operation']}"
            )
        
        # If sample data is provided, test the operation
        if request.sample_data:
            try:
                df = pd.DataFrame(request.sample_data)
                result_df = transformer.execute_operation(df, operation)
                
                return ValidationResponse(
                    success=True,
                    valid=True,
                    sample_result=result_df.to_dict('records'),
                    new_column=operation['NewFieldName']
                )
            except Exception as e:
                return ValidationResponse(
                    success=True,
                    valid=False,
                    error=f"Operation failed with sample data: {str(e)}"
                )
        
        return ValidationResponse(
            success=True,
            valid=True,
            operation=operation['Operation'],
            new_column=operation['NewFieldName']
        )
        
    except Exception as e:
        return ValidationResponse(
            success=False,
            error=str(e)
        )

@app.get("/transform/examples")
async def get_operation_examples():
    """Get example operations for frontend testing."""
    examples = {
        'SetValue': {
            'NewFieldName': 'status',
            'Operation': 'SetValue',
            'Inputs': 'Active',
            'types': 'str'
        },
        'CopyField': {
            'NewFieldName': 'employee_name',
            'Operation': 'CopyField',
            'Inputs': 'name',
            'types': 'str'
        },
        'MapValues': {
            'NewFieldName': 'dept_code',
            'Operation': 'MapValues',
            'Inputs': 'department',
            'mapping': {'IT': 'I001', 'HR': 'H001', 'Finance': 'F001'},
            'types': 'str'
        },
        'Formula': {
            'NewFieldName': 'bonus',
            'Operation': 'Formula',
            'formulastring': 'A * 0.1',
            'Inputs': 'salary',
            'types': 'float'
        },
        'Concatenate': {
            'NewFieldName': 'full_name',
            'Operation': 'Concatenate',
            'Inputs': 'first_name,last_name',
            'separator': ' ',
            'types': 'str'
        },
        'Conditional': {
            'NewFieldName': 'seniority',
            'Operation': 'Conditional',
            'Inputs': 'age',
            'comparator': '>=',
            'value': 30,
            'true_value': 'Senior',
            'false_value': 'Junior',
            'types': 'str'
        }
    }
    return {
        "examples": examples,
        "status": "success"
    }

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "transform-operations"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
