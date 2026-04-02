"""
ETL API v2 - Main Application
Organized with APIRouter for better code structure

Note: When wrapping this app in another FastAPI app, call initialize_app()
from the wrapper's startup event to ensure event loop is registered.
Alternatively, lazy initialization will handle it automatically on first use.
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from contextlib import asynccontextmanager
from pathlib import Path
import uvicorn
import logging
import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

# Import routers
from routers import (
    system,
    etl,
    controls,
    control_runs,
    auto_config,
    data,
    monitoring,
    websocket,
    workflows,
    users
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Startup logging
logger.info("=" * 80)
logger.info("ETL API SERVER v2 STARTING UP")
logger.info("   Architecture: File-based JSON persistence")
logger.info("   Organization: APIRouter-based modular structure")
logger.info("=" * 80)

# Global scheduler instance
scheduler = AsyncIOScheduler()


async def cleanup_workflow_sessions():
    """Scheduled task to cleanup expired workflow sessions"""
    try:
        from workflow_engine import WorkflowSessionManager
        session_manager = WorkflowSessionManager()
        stats = session_manager.cleanup_expired_sessions()
        if stats["cleaned"] > 0:
            logger.info(f"Workflow session cleanup: {stats}")
    except ImportError:
        pass  # Workflow engine not available
    except Exception as e:
        logger.error(f"Error in workflow session cleanup: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown events"""
    # Startup
    logger.info("Starting scheduled tasks...")

    # Add workflow session cleanup job (runs every hour)
    scheduler.add_job(
        cleanup_workflow_sessions,
        trigger=IntervalTrigger(hours=1),
        id="workflow_session_cleanup",
        name="Cleanup expired workflow sessions",
        replace_existing=True
    )

    # Start the scheduler
    scheduler.start()
    logger.info("Scheduler started with workflow cleanup job (hourly)")

    # Warm supervisory cache during worker startup (not module import time)
    # to avoid Polars collect/fork hangs in Linux multi-worker deployments.
    try:
        precompute_supervisory_filter_options()
        logger.info("Supervisory filter cache warmup completed")
    except Exception as e:
        logger.warning(f"Supervisory filter cache warmup skipped: {e}")

    yield

    # Shutdown
    logger.info("Shutting down scheduler...")
    scheduler.shutdown(wait=False)
    logger.info("Scheduler shut down")


# Create FastAPI app with lifespan
app = FastAPI(
    title="ETL API v2",
    description="API for running ETL tasks with file-based task management",
    version="2.0.0",
    lifespan=lifespan
)

# Middleware to initialize event loop on first request
# This works even when the app is wrapped in another FastAPI app
class EventLoopInitMiddleware(BaseHTTPMiddleware):
    """Middleware to ensure event loop is initialized on first request"""
    _initialized = False
    
    async def dispatch(self, request: Request, call_next):
        # Initialize event loop on first request (only once)
        if not EventLoopInitMiddleware._initialized:
            try:
                from task_manager_v2 import set_main_event_loop
                # Capture the running event loop from the async context
                loop = asyncio.get_running_loop()
                set_main_event_loop(loop)
                EventLoopInitMiddleware._initialized = True
                logger.info("Main event loop captured and registered for WebSocket broadcasting (via middleware)")
            except Exception as e:
                logger.warning(f"Could not capture event loop in middleware: {e}")
                # Fallback to lazy initialization
                try:
                    from task_manager_v2 import initialize_event_loop
                    initialize_event_loop()
                except Exception:
                    pass
        return await call_next(request)

# Add middleware (runs on every request, but only initializes once)
app.add_middleware(EventLoopInitMiddleware)

def initialize_app():
    """
    Explicitly initialize the app (call this from wrapper FastAPI app's startup)
    
    Usage in wrapper app:
        from main_v2 import app, initialize_app
        
        @app.on_event("startup")  # or lifespan
        async def startup():
            initialize_app()
    """
    try:
        from task_manager_v2 import initialize_event_loop
        success = initialize_event_loop()
        if success:
            logger.info("ETL API v2 initialized successfully")
        else:
            logger.warning("Event loop initialization deferred (will use lazy init)")
        return success
    except Exception as e:
        logger.warning(f"Could not initialize app: {e}")
        return False

# Add CORS middleware
# OPTIONS requests are CORS preflight requests sent by browsers before POST/PUT/DELETE
# requests when frontend and backend are on different origins (e.g., localhost:3000 vs localhost:8000)
# This is normal browser behavior and required for cross-origin requests with custom headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins (configure specific origins for production)
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],  # Explicit methods (OPTIONS needed for preflight)
    allow_headers=["*"],  # Allows all headers
    max_age=3600,  # Cache preflight response for 1 hour (reduces repeated OPTIONS requests)
)

# Import AI Assistant and Judgments routers
from routers.ai_assistant import router as ai_assistant_router
from routers.judgments import router as judgments_router
from routers.config_search import router as config_search_router
from routers.config_validator import router as config_validator_router
from routers.supervisory import router as supervisory_router
from routers.supervisory import precompute_filter_options as precompute_supervisory_filter_options
from routers.reference_search import router as reference_search_router
from routers.file_monitoring import router as file_monitoring_router

# Include routers
app.include_router(system.router)
app.include_router(etl.router)
app.include_router(controls.router)
app.include_router(control_runs.router)
app.include_router(auto_config.router)
app.include_router(data.router)
app.include_router(monitoring.router)
app.include_router(websocket.router)
app.include_router(workflows.router)
app.include_router(users.router)
app.include_router(ai_assistant_router)
app.include_router(judgments_router)
app.include_router(config_search_router)
app.include_router(config_validator_router)
app.include_router(supervisory_router)
app.include_router(reference_search_router)
app.include_router(file_monitoring_router)

# Static file serving configuration
# Note: When wrapped in another FastAPI app, static mounts don't work
# Instead, use the API endpoints in control_runs.py which work in both scenarios:
#   - /api/control-runs/logs/{task_id}/{log_type} (for log files)
#   - /api/control-runs/task-state/{task_id} (for task state JSON)
PROJECT_ROOT = Path(__file__).parent.parent
TASK_STORAGE_DIR = PROJECT_ROOT / "task_storage"

# Ensure task_storage directory exists
TASK_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

logger.info(f"Log files available via API endpoints (works when app is wrapped)")
logger.info(f"   Access logs at: /api/control-runs/logs/{{task_id}}/{{log_type}}")
logger.info(f"   Access task state at: /api/control-runs/task-state/{{task_id}}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
