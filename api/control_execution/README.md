# Control Task Execution System

A stateless control task execution system designed for Gunicorn compatibility.

## Architecture

This system is designed to be **stateless** and **worker-agnostic**, making it compatible with Gunicorn's multi-worker architecture:

- **No shared state** between workers
- **File-based persistence** for task state
- **External subprocess execution** (not tied to workers)
- **Separate logging system** with 7-day retention
- **Background status monitoring**

## Components

### Core Modules

1. **`task_persistence.py`** - File-based task state management
2. **`subprocess_manager.py`** - External Python subprocess handling
3. **`log_manager.py`** - Separate logging with 7-day retention
4. **`task_validator.py`** - Parameter validation
5. **`control_runner.py`** - Main execution function
6. **`status_monitor.py`** - Background status monitoring

### API Endpoints

All endpoints are prefixed with `/api/controls/`:

- `POST /api/controls/run` - Run control task
- `POST /api/controls/stop` - Stop control task
- `GET /api/controls/status` - Get task status
- `GET /api/controls/logs` - Get task logs
- `GET /api/controls/history` - Get task history
- `GET /api/controls/tasks` - List all tasks
- `GET /api/controls/stats` - Get statistics
- `POST /api/controls/cleanup` - Manual cleanup

## Usage

### Running a Control Task

```python
# Example request body for POST /api/controls/run
{
    "control_name": "data_processing_pipeline",
    "run_env": "PROD",
    "expected_run_date": "2024-01-16",
    "python_script_path": "/path/to/script.py",
    "script_arguments": ["--config", "prod_config.json"],
    "environment_variables": {
        "ENV": "PROD",
        "DB_HOST": "prod-db.example.com"
    }
}
```

### Getting Task Status

```python
# GET /api/controls/status?task_id=550e8400-e29b-41d4-a716-446655440000
{
    "task_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "running",
    "control_name": "data_processing_pipeline",
    "run_env": "PROD",
    "subprocess_pid": 12345,
    "created_at": "2024-01-15T14:30:25Z",
    "started_at": "2024-01-15T14:30:26Z"
}
```

### Getting Task Logs

```python
# GET /api/controls/logs?task_id=550e8400-e29b-41d4-a716-446655440000&log_type=execution&lines=100
{
    "task_id": "550e8400-e29b-41d4-a716-446655440000",
    "log_type": "execution",
    "log_content": "2024-01-15 14:30:25 - Starting data processing...",
    "lines_requested": 100,
    "retrieved_at": "2024-01-15T14:30:26Z"
}
```

## File Structure

```
task_storage/
├── control_tasks/              # Task state files
│   ├── {task_id}.json         # Task configuration and status
│   └── {task_id}_status.json  # Real-time status updates
└── control_logs/              # Execution logs
    ├── execution/             # Main execution logs
    ├── subprocess/            # Subprocess output
    ├── error/                 # Error logs
    ├── audit/                 # Audit trail
    └── archived/              # Archived logs (compressed)
```

## Background Monitoring

The system includes a background status monitor that:

- Checks task status every 5 seconds
- Updates completed/failed tasks automatically
- Runs independently of the main API
- Can be started with: `python start_control_monitor.py`

## Testing

Run the test script to verify the system:

```bash
cd api
python test_control_system.py
```

## Key Features

### Gunicorn Compatibility
- **Stateless design** - No shared state between workers
- **File-based persistence** - Task state survives worker restarts
- **External subprocesses** - Independent of worker lifecycle

### Logging
- **Separate log system** - Independent of main API logs
- **7-day retention** - Automatic cleanup
- **Multiple log types** - Execution, subprocess, error, audit
- **Archival system** - Compressed storage for old logs

### Monitoring
- **Real-time status updates** - Background monitoring
- **Process health checks** - Automatic detection of completed tasks
- **Statistics tracking** - Comprehensive monitoring data

### Validation
- **Parameter validation** - Comprehensive input checking
- **Security checks** - Path validation, environment variable checks
- **Warning system** - Non-blocking warnings for potential issues

## Environment Variables

The system runs subprocesses with the **same environment as the API**, ensuring:

- **Same Python executable** - Uses `sys.executable` from the API process
- **Same virtual environment** - Inherits `VIRTUAL_ENV` or `CONDA_DEFAULT_ENV`
- **Same Python path** - Inherits `PYTHONPATH` for module resolution
- **Same dependencies** - All installed packages are available

### Automatically Set Variables

- `TASK_ID` - Automatically set to the task ID
- `TASK_START_TIME` - Task start timestamp
- `PYTHONUNBUFFERED=1` - Ensures real-time output

### Inherited Environment

- `PYTHONPATH` - Python module search path
- `VIRTUAL_ENV` - Virtual environment path (if using venv)
- `CONDA_DEFAULT_ENV` - Conda environment name (if using conda)
- `CONDA_PREFIX` - Conda environment prefix (if using conda)
- All other environment variables from the API process

## Error Handling

- **Graceful degradation** - System continues working despite individual task failures
- **Comprehensive logging** - All errors are logged with context
- **Status tracking** - Failed tasks are properly marked and tracked
- **Cleanup mechanisms** - Automatic cleanup of failed/completed tasks

## Performance

- **Non-blocking execution** - Tasks run in separate threads
- **Efficient monitoring** - Minimal overhead status checks
- **File-based storage** - Fast I/O operations
- **Lazy loading** - Logs are read on-demand
