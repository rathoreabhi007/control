"""
Shared Pydantic models for API endpoints
"""
from pydantic import BaseModel
from typing import Dict, Any, Optional, List


class RunParameters(BaseModel):
    expectedRunDate: str = "2024-01-01"
    inputConfigFilePath: str = "/path/to/config"
    inputConfigFilePattern: str = "*.json"
    rootFileDir: str = "/data"
    runEnv: str = "production"
    tempFilePath: str = "/tmp"


class ETLStepRequest(BaseModel):
    step_name: Optional[str] = None
    parameters: Optional[RunParameters] = None
    previous_outputs: Optional[Dict[str, Any]] = None
    custom_params: Optional[Dict[str, Any]] = None


class TaskResponse(BaseModel):
    task_id: str
    status: str
    pid: Optional[int] = None
    thread_id: Optional[int] = None
    step_name: str
    server_hostname: Optional[str] = None
    server_ip: Optional[str] = None
    server_id: Optional[str] = None


class StatusResponse(BaseModel):
    status: str
    output: Optional[Any] = None
    error: Optional[str] = None
    step_name: Optional[str] = None
    created_at: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    server_hostname: Optional[str] = None
    server_ip: Optional[str] = None
    server_id: Optional[str] = None
    pid: Optional[int] = None


class OutputResponse(BaseModel):
    output: Any


class StopResponse(BaseModel):
    status: str
    task_id: Optional[str] = None


class SystemStatsResponse(BaseModel):
    total_tasks: int
    running_tasks: int
    completed_tasks: int
    failed_tasks: int
    max_concurrent_tasks: int
    task_ttl_hours: int
    storage_directory: str


# Control Task Models
class ControlTaskRequest(BaseModel):
    control_name: str
    run_env: str
    expected_run_date: str
    python_script_path: str
    script_arguments: Optional[List[str]] = []
    environment_variables: Optional[Dict[str, str]] = {}
    schedule: Optional[str] = None


class ControlTaskResponse(BaseModel):
    task_id: str
    status: str
    control_name: Optional[str] = None
    run_env: Optional[str] = None
    validation_warnings: Optional[List[str]] = None
    message: Optional[str] = None
    error: Optional[str] = None


class ControlStatusResponse(BaseModel):
    task_id: str
    status: str
    control_name: Optional[str] = None
    run_env: Optional[str] = None
    expected_run_date: Optional[str] = None
    python_script_path: Optional[str] = None
    subprocess_pid: Optional[int] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None


class ControlLogsResponse(BaseModel):
    task_id: str
    log_type: str
    log_content: str
    lines_requested: int
    retrieved_at: str
    error: Optional[str] = None


class ControlRunStartRequest(BaseModel):
    control_id: str
    run_env: str
    expected_run_date: str  # YYYY-MM-DD
    task_name: Optional[str] = None


class ControlRunStopRequest(BaseModel):
    force: bool = False
