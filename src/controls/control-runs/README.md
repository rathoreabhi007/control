# Control Runs - Airflow-Style Execution System

An Airflow-inspired control execution system built with FastAPI backend and React frontend, designed for managing and monitoring control tasks with subprocess execution.

## 🎯 Overview

The Control Runs system provides a robust, production-ready framework for:
- **Config-driven controls**: Define controls in `control_ids.json`
- **Subprocess execution**: Run Python scripts in isolated processes with virtual environment support
- **Real-time monitoring**: Track status, logs, and metrics
- **Run history**: Store and retrieve last N runs per control
- **Airflow-like UI**: Clean, modern interface inspired by Apache Airflow

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                        │
│  ┌────────────┬───────────────┬──────────────┬────────────┐ │
│  │ Control    │ Run Modal     │ Log Viewer   │ Status     │ │
│  │ Cards      │               │              │ Badges     │ │
│  └────────────┴───────────────┴──────────────┴────────────┘ │
└─────────────────────────────────────────────────────────────┘
                           │ HTTP/REST API
┌─────────────────────────────────────────────────────────────┐
│                   Backend (FastAPI)                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              API Endpoints                              │ │
│  │  /api/control-runs/controls                            │ │
│  │  /api/control-runs/start                               │ │
│  │  /api/control-runs/{task_id}/status                    │ │
│  │  /api/control-runs/{task_id}/logs                      │ │
│  │  /api/control-runs/history                             │ │
│  └────────────────────────────────────────────────────────┘ │
│                           │                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         Control Execution Engine                        │ │
│  │  ┌──────────────┬──────────────┬──────────────────┐   │ │
│  │  │ Task Runner  │ Subprocess   │ Task Persistence │   │ │
│  │  │              │ Manager      │                  │   │ │
│  │  └──────────────┴──────────────┴──────────────────┘   │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────────┐
│              File System Persistence                         │
│  ┌────────────────┬──────────────┬────────────────────────┐ │
│  │ control_ids.   │ Task State   │ Logs                   │ │
│  │ json           │ (JSON files) │ (execution/subprocess) │ │
│  └────────────────┴──────────────┴────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 📁 File Structure

```
src/controls/control-runs/
├── page.js                          # Main control runs page
└── README.md                        # This file

src/components/ControlRuns/
├── StatusBadge.jsx                  # Status indicator component
├── ControlCard.jsx                  # Control card with recent runs
├── LogViewer.jsx                    # Log viewer modal
└── RunModal.jsx                     # Run configuration modal

api/
├── control_ids.json                 # Control definitions
├── generic_controller.py            # Generic control script
└── main_v2.py                       # FastAPI endpoints

api/control_execution/
├── control_runner.py                # Task execution orchestrator
├── subprocess_manager.py            # Subprocess lifecycle management
├── task_persistence.py              # Task state persistence
├── task_validator.py                # Parameter validation
└── log_manager.py                   # Log management
```

## 🚀 Quick Start

### 1. Define Controls

Edit `api/control_ids.json`:

```json
{
  "control_tasks": [
    {
      "control_id": "generic_controller",
      "name": "Data Extraction Process",
      "description": "Extract data from source systems",
      "enabled": true,
      "priority": 1,
      "estimated_duration_minutes": 30,
      "frequency": "Daily"
    }
  ]
}
```

### 2. Access the UI

Navigate to: `http://localhost:3000/control-runs`

Or click **CONTROL RUNS** from the homepage.

### 3. Start a Run

1. Click **Run** button on any control card
2. Select environment (DEV/UAT/PROD)
3. Choose expected run date
4. Click **Start Run**

### 4. Monitor Progress

- **Live status updates** every 5 seconds
- **View logs** in real-time with auto-refresh
- **Check history** for last 3 runs per control

## 🔌 API Endpoints

### GET `/api/control-runs/controls`

List all available controls from `control_ids.json`.

**Response:**
```json
{
  "controls": [
    {
      "control_id": "generic_controller",
      "name": "Data Extraction Process",
      "description": "Extract data from source systems",
      "enabled": true,
      "priority": 1,
      "estimated_duration_minutes": 30,
      "frequency": "Daily"
    }
  ],
  "total_count": 5
}
```

### POST `/api/control-runs/start`

Start a new control run.

**Request:**
```json
{
  "control_id": "generic_controller",
  "task_name": "Data Extraction Process",
  "run_env": "DEV",
  "expected_run_date": "2025-11-08"
}
```

**Response:**
```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "started",
  "control_name": "Data Extraction Process",
  "run_env": "DEV",
  "started_at": "2025-11-08T10:30:00"
}
```

### GET `/api/control-runs/{task_id}/status`

Get current status of a run.

**Response:**
```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "running",
  "control_name": "Data Extraction Process",
  "run_env": "DEV",
  "started_at": "2025-11-08T10:30:00",
  "subprocess_pid": 12345
}
```

### GET `/api/control-runs/{task_id}/logs`

Retrieve execution logs.

**Query Parameters:**
- `log_type`: `execution` | `subprocess` | `error` | `audit` (default: `execution`)
- `lines`: Number of lines to retrieve (default: 300)

**Response:**
```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "log_type": "execution",
  "log_content": "2025-11-08 10:30:00 - INFO - Generic controller started...",
  "lines_requested": 300,
  "retrieved_at": "2025-11-08T10:35:00"
}
```

### GET `/api/control-runs/history`

Get run history.

**Query Parameters:**
- `control_id`: Filter by control ID (optional)
- `limit`: Number of runs to retrieve (default: 3)

**Response:**
```json
{
  "runs": [
    {
      "task_id": "550e8400-e29b-41d4-a716-446655440000",
      "control_id": "generic_controller",
      "control_name": "Data Extraction Process",
      "status": "success",
      "run_env": "DEV",
      "started_at": "2025-11-08T10:30:00",
      "completed_at": "2025-11-08T10:45:00"
    }
  ],
  "total_count": 1,
  "control_id": "generic_controller"
}
```

### POST `/api/control-runs/{task_id}/stop`

Stop a running task.

**Request:**
```json
{
  "force": false
}
```

**Response:**
```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "stopped",
  "message": "Task stopped successfully"
}
```

## 🎨 UI Features

### Control Cards
- **Control information**: Name, description, priority, duration, frequency
- **Quick run button**: Start a run with one click
- **Recent runs**: Last 3 runs with status, duration, and environment
- **Status badges**: Visual indicators for run status

### Log Viewer
- **Multiple log types**: Execution, subprocess, error, audit
- **Auto-refresh**: Updates every 3 seconds
- **Auto-scroll**: Follows new log entries
- **Download**: Save logs as text file
- **Full-screen modal**: Maximized viewing area

### Run History
- **Recent runs table**: Comprehensive list of all runs
- **Status filtering**: Filter by success, failed, running, stopped
- **Real-time updates**: Polls every 5 seconds
- **Quick log access**: View logs for any run

### Statistics Dashboard
- **Total controls**: Number of available controls
- **Running tasks**: Currently executing runs
- **Success/Failed counts**: Success rate tracking
- **Total runs**: Historical run count

## 🔧 Configuration

### Control Definition Schema

```json
{
  "control_id": "string",           // Must be "generic_controller"
  "name": "string",                 // Unique control name
  "description": "string",          // Control description
  "enabled": boolean,               // Enable/disable control
  "priority": number,               // Execution priority (1-N)
  "estimated_duration_minutes": number,  // Expected duration
  "frequency": "string"             // Execution frequency (Daily, Weekly, etc.)
}
```

### Environment Variables

The subprocess receives these environment variables:

- `CONTROL_ID`: Control identifier
- `ENV`: Run environment (DEV/UAT/PROD)
- `TASK_NAME`: Control name
- `expected_run_date`: Expected run date (YYYY-MM-DD)
- `TASK_ID`: Unique task identifier

### Generic Controller Arguments

Command-line arguments (priority over env vars):

```bash
python generic_controller.py <control_id> <run_env> <expected_run_date> <task_name>
```

## 📊 Status Values

| Status | Description | Color |
|--------|-------------|-------|
| `success` / `completed` | Run completed successfully | Green |
| `running` | Currently executing | Blue |
| `queued` / `pending` | Waiting to start | Gray |
| `failed` / `error` | Run failed | Red |
| `stopped` / `killed` | Manually stopped | Orange |
| `skipped` | Skipped execution | Yellow |

## 🛠️ Extending the System

### Adding a New Control

1. Add entry to `api/control_ids.json`
2. Implement logic in `api/generic_controller.py`
3. Control appears automatically in UI

### Custom Controller Script

To use a different Python script:

1. Create your script (e.g., `custom_controller.py`)
2. Update `python_script_path` in API call
3. Ensure script accepts same parameters

### Adding Log Types

1. Update `log_types` in `LogViewer.jsx`
2. Implement logging in controller script
3. Use `logger` with appropriate handlers

## 🐛 Troubleshooting

### Logs not showing
- Check log type (execution/subprocess/error/audit)
- Verify task ID is correct
- Ensure subprocess started successfully

### Run stuck in "running"
- Check subprocess logs for errors
- Verify Python script is not hanging
- Check task_storage for state files

### Controls not loading
- Verify `control_ids.json` is valid JSON
- Check FastAPI server is running
- Review browser console for API errors

## 📝 Best Practices

1. **Unique names**: Ensure each control has a unique name
2. **Error handling**: Implement try/catch in controller scripts
3. **Logging**: Use structured logging with timestamps
4. **Status updates**: Update task status at key points
5. **Resource cleanup**: Always clean up resources in finally blocks
6. **Parameter validation**: Validate all input parameters
7. **Timeout handling**: Set appropriate timeouts for long-running tasks

## 🔐 Security Considerations

- **Input validation**: All parameters are validated before execution
- **Path traversal protection**: Script paths are resolved and validated
- **Subprocess isolation**: Each run executes in isolated subprocess
- **Environment segregation**: DEV/UAT/PROD environments are strictly separated
- **Log sanitization**: Sensitive data should not be logged

## 📈 Performance

- **Concurrent runs**: Multiple controls can run simultaneously
- **Async execution**: Non-blocking subprocess management
- **Efficient polling**: Status updates cached and polled at optimal intervals
- **Log streaming**: Logs loaded incrementally (last N lines)
- **State persistence**: Minimal I/O with atomic file operations

## 🎯 Future Enhancements

- [ ] Scheduling (cron-like)
- [ ] Email notifications on failure
- [ ] Run dependencies (DAG support)
- [ ] Retry logic with exponential backoff
- [ ] Performance metrics dashboard
- [ ] Audit trail with user tracking
- [ ] Control versioning
- [ ] Bulk operations (run multiple controls)
- [ ] Advanced filtering and search
- [ ] Export run history to CSV/Excel

## 📚 Related Documentation

- [Generic Controller](../../api/generic_controller.py)
- [Control Execution Engine](../../api/control_execution/README.md)
- [API Documentation](../../api/main_v2.py)

---

Built with ❤️ using FastAPI and React

