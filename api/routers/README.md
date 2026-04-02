# API Routers Structure

The backend has been refactored to use FastAPI's `APIRouter` for better code organization and maintainability.

## Structure

```
api/
├── main_v2.py              # Main FastAPI application
├── routers/
│   ├── __init__.py        # Router package initialization
│   ├── models.py          # Shared Pydantic models
│   ├── utils.py           # Shared utility functions
│   ├── system.py          # System & health endpoints
│   ├── etl.py             # ETL task endpoints
│   ├── controls.py        # Legacy control task endpoints
│   ├── control_runs.py    # New control-runs endpoints
│   ├── data.py            # Parquet/data endpoints
│   └── monitoring.py      # System monitoring endpoints
```

## Router Details

### `system.py` - System & Health
- `GET /` - Root endpoint
- `GET /health` - Health check with system stats
- `GET /stats` - System statistics

### `etl.py` - ETL Tasks
- `GET /steps` - List available ETL steps
- `POST /run/{step_name}` - Run an ETL step
- `GET /status/{task_id}` - Get task status
- `GET /output/{task_id}` - Get task output
- `POST /stop/{task_id}` - Stop a task
- `POST /cleanup/now` - Manual cleanup
- `GET /tasks` - List all tasks

### `controls.py` - Legacy Control Tasks
- `POST /api/controls/run` - Run control task
- `POST /api/controls/stop` - Stop control task
- `GET /api/controls/status` - Get control status
- `GET /api/controls/logs` - Get control logs
- `GET /api/controls/history` - Get control history
- `GET /api/controls/tasks` - List all control tasks
- `GET /api/controls/stats` - Get control statistics
- `GET /api/controls/config` - Get control configuration
- `POST /api/controls/cleanup` - Cleanup old tasks
- `GET /api/controls/run-logs` - Get control run logs
- `GET /api/controls/run-logs/hierarchy` - Get hierarchy filters

### `control_runs.py` - New Control Runs API
- `GET /api/control-runs/controls` - List available controls
- `POST /api/control-runs/start` - Start a control run
- `GET /api/control-runs/{task_id}/status` - Get run status
- `GET /api/control-runs/{task_id}/logs` - Get run logs
- `GET /api/control-runs/history` - Get run history

### `data.py` - Parquet/Data Operations
- `GET /data/metadata` - Get file metadata
- `GET /data/records` - Get paginated records
- `GET /data/column-stats` - Get column statistics
- `GET /data/column-values` - Get unique column values
- `GET /data/search` - Search data
- `POST /data/cache/clear` - Clear cache
- `GET /csv/*` - Legacy CSV endpoints (redirect to Parquet)

### `monitoring.py` - System Monitoring
- `GET /monitoring/servers` - List available monitoring servers
- `GET /monitoring` - Get system monitoring data

## Benefits

1. **Better Organization**: Each router handles a specific domain
2. **Easier Maintenance**: Changes to one area don't affect others
3. **Team Collaboration**: Multiple developers can work on different routers
4. **Clearer Structure**: Easy to find and understand code
5. **Scalability**: Easy to add new routers or endpoints

## Adding New Endpoints

To add a new endpoint:

1. **If it fits an existing router**: Add it to the appropriate router file
2. **If it's a new domain**: Create a new router file in `routers/`
3. **Import and include** the router in `main_v2.py`:
   ```python
   from routers import new_router
   app.include_router(new_router.router)
   ```

## Shared Resources

- **Models**: `routers/models.py` - All Pydantic models
- **Utils**: `routers/utils.py` - Shared utility functions
- **Constants**: `routers/utils.py` - Step name constants

