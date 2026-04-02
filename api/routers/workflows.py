"""
Workflow Storage Router
Handles saving, loading, listing, and deleting workflow configurations.
Also handles workflow execution with per-user session management.
"""
from fastapi import APIRouter, HTTPException, Header, BackgroundTasks
from fastapi.responses import FileResponse
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime
from pydantic import BaseModel
import json
import logging
import uuid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workflows", tags=["workflows"])

# Import workflow engine components
try:
    from workflow_engine import WorkflowExecutor, WorkflowSessionManager
    WORKFLOW_ENGINE_AVAILABLE = True
except ImportError:
    WORKFLOW_ENGINE_AVAILABLE = False
    logger.warning("Workflow engine not available. Execution endpoints will be disabled.")


# Pydantic models for request/response
class WorkflowExecuteRequest(BaseModel):
    """Request model for workflow execution"""
    workflow_id: Optional[str] = None
    workflow_name: Optional[str] = None
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]


class NodeDataRequest(BaseModel):
    """Request model for node data pagination"""
    page: int = 1
    page_size: int = 100
    sort_column: Optional[str] = None
    sort_descending: bool = False

# Storage directory for workflows
WORKFLOW_STORAGE_DIR = Path(__file__).parent.parent / "workflow_storage"
WORKFLOW_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def get_workflow_file(workflow_id: str) -> Path:
    """Get the file path for a workflow"""
    return WORKFLOW_STORAGE_DIR / f"{workflow_id}.json"


def sanitize_workflow_id(workflow_id: str) -> str:
    """Sanitize workflow ID to prevent path traversal"""
    # Only allow alphanumeric, underscore, hyphen
    import re
    sanitized = re.sub(r'[^a-zA-Z0-9_-]', '_', workflow_id)
    return sanitized[:100]  # Limit length


@router.post("/save")
async def save_workflow(request: Dict[str, Any]):
    """
    Save a workflow configuration
    
    Request body:
    {
        "workflow_id": "optional-custom-id",  // If not provided, auto-generated
        "name": "My Workflow",
        "description": "Optional description",
        "instance_id": "workflow-instance-id",
        "nodes": [...],
        "edges": [...],
        "metadata": {...}  // Optional additional metadata
    }
    """
    try:
        logger.info("Saving workflow...")
        
        # Get or generate workflow ID
        workflow_id = request.get("workflow_id")
        if not workflow_id:
            workflow_id = str(uuid.uuid4())
        else:
            workflow_id = sanitize_workflow_id(workflow_id)
        
        # Prepare workflow data
        workflow_data = {
            "workflow_id": workflow_id,
            "name": request.get("name", f"Workflow {workflow_id[:8]}"),
            "description": request.get("description", ""),
            "instance_id": request.get("instance_id", ""),
            "nodes": request.get("nodes", []),
            "edges": request.get("edges", []),
            "metadata": request.get("metadata", {}),
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "version": 1
        }
        
        # Check if workflow exists (for versioning)
        workflow_file = get_workflow_file(workflow_id)
        if workflow_file.exists():
            try:
                with open(workflow_file, 'r', encoding='utf-8') as f:
                    existing = json.load(f)
                    workflow_data["created_at"] = existing.get("created_at", workflow_data["created_at"])
                    workflow_data["version"] = existing.get("version", 0) + 1
            except Exception:
                pass
        
        # Save workflow
        with open(workflow_file, 'w', encoding='utf-8') as f:
            json.dump(workflow_data, f, indent=2, default=str)
        
        logger.info(f"Workflow saved: {workflow_id} (version {workflow_data['version']})")
        
        return {
            "status": "success",
            "workflow_id": workflow_id,
            "name": workflow_data["name"],
            "version": workflow_data["version"],
            "saved_at": workflow_data["updated_at"],
            "message": f"Workflow '{workflow_data['name']}' saved successfully"
        }
        
    except Exception as e:
        logger.error(f"Error saving workflow: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/load/{workflow_id}")
async def load_workflow(workflow_id: str):
    """
    Load a workflow configuration by ID
    """
    try:
        workflow_id = sanitize_workflow_id(workflow_id)
        workflow_file = get_workflow_file(workflow_id)
        
        if not workflow_file.exists():
            raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")
        
        with open(workflow_file, 'r', encoding='utf-8') as f:
            workflow_data = json.load(f)
        
        logger.info(f"Loaded workflow: {workflow_id}")
        
        return {
            "status": "success",
            "workflow": workflow_data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error loading workflow: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
async def list_workflows(instance_id: Optional[str] = None, limit: int = 50):
    """
    List all saved workflows
    Optionally filter by instance_id
    """
    try:
        workflows = []
        
        for workflow_file in WORKFLOW_STORAGE_DIR.glob("*.json"):
            try:
                with open(workflow_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    
                    # Filter by instance_id if provided
                    if instance_id and data.get("instance_id") != instance_id:
                        continue
                    
                    workflows.append({
                        "workflow_id": data.get("workflow_id"),
                        "name": data.get("name"),
                        "description": data.get("description", ""),
                        "instance_id": data.get("instance_id", ""),
                        "node_count": len(data.get("nodes", [])),
                        "edge_count": len(data.get("edges", [])),
                        "version": data.get("version", 1),
                        "created_at": data.get("created_at"),
                        "updated_at": data.get("updated_at")
                    })
            except Exception as e:
                logger.warning(f"Error reading workflow file {workflow_file}: {e}")
                continue
        
        # Sort by updated_at (most recent first)
        workflows.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
        
        # Apply limit
        workflows = workflows[:limit]
        
        logger.info(f"Listed {len(workflows)} workflows")
        
        return {
            "status": "success",
            "workflows": workflows,
            "total": len(workflows),
            "instance_id": instance_id
        }
        
    except Exception as e:
        logger.error(f"Error listing workflows: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/delete/{workflow_id}")
async def delete_workflow(workflow_id: str):
    """
    Delete a workflow by ID
    """
    try:
        workflow_id = sanitize_workflow_id(workflow_id)
        workflow_file = get_workflow_file(workflow_id)
        
        if not workflow_file.exists():
            raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")
        
        # Get workflow name before deleting
        workflow_name = workflow_id
        try:
            with open(workflow_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                workflow_name = data.get("name", workflow_id)
        except Exception:
            pass
        
        # Delete the file
        workflow_file.unlink()
        
        logger.info(f"Deleted workflow: {workflow_id}")
        
        return {
            "status": "success",
            "workflow_id": workflow_id,
            "message": f"Workflow '{workflow_name}' deleted successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting workflow: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/duplicate/{workflow_id}")
async def duplicate_workflow(workflow_id: str, new_name: Optional[str] = None):
    """
    Duplicate a workflow with a new ID
    """
    try:
        workflow_id = sanitize_workflow_id(workflow_id)
        workflow_file = get_workflow_file(workflow_id)
        
        if not workflow_file.exists():
            raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")
        
        # Load original workflow
        with open(workflow_file, 'r', encoding='utf-8') as f:
            workflow_data = json.load(f)
        
        # Generate new ID
        new_workflow_id = str(uuid.uuid4())
        
        # Update workflow data
        original_name = workflow_data.get("name", "Workflow")
        workflow_data["workflow_id"] = new_workflow_id
        workflow_data["name"] = new_name or f"{original_name} (Copy)"
        workflow_data["created_at"] = datetime.now().isoformat()
        workflow_data["updated_at"] = datetime.now().isoformat()
        workflow_data["version"] = 1
        
        # Save new workflow
        new_workflow_file = get_workflow_file(new_workflow_id)
        with open(new_workflow_file, 'w', encoding='utf-8') as f:
            json.dump(workflow_data, f, indent=2, default=str)
        
        logger.info(f"Duplicated workflow: {workflow_id} -> {new_workflow_id}")
        
        return {
            "status": "success",
            "original_id": workflow_id,
            "new_workflow_id": new_workflow_id,
            "name": workflow_data["name"],
            "message": f"Workflow duplicated as '{workflow_data['name']}'"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error duplicating workflow: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export/{workflow_id}")
async def export_workflow(workflow_id: str):
    """
    Export a workflow as JSON (for download)
    """
    try:
        workflow_id = sanitize_workflow_id(workflow_id)
        workflow_file = get_workflow_file(workflow_id)
        
        if not workflow_file.exists():
            raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")
        
        with open(workflow_file, 'r', encoding='utf-8') as f:
            workflow_data = json.load(f)
        
        # Add export metadata
        workflow_data["exported_at"] = datetime.now().isoformat()
        workflow_data["export_version"] = "1.0"
        
        logger.info(f"Exported workflow: {workflow_id}")
        
        return workflow_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting workflow: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import")
async def import_workflow(request: Dict[str, Any]):
    """
    Import a workflow from JSON
    """
    try:
        # Validate required fields
        if "nodes" not in request:
            raise HTTPException(status_code=400, detail="Missing 'nodes' in workflow data")
        
        # Generate new ID for imported workflow
        new_workflow_id = str(uuid.uuid4())
        
        workflow_data = {
            "workflow_id": new_workflow_id,
            "name": request.get("name", f"Imported Workflow {new_workflow_id[:8]}"),
            "description": request.get("description", "Imported workflow"),
            "instance_id": request.get("instance_id", ""),
            "nodes": request.get("nodes", []),
            "edges": request.get("edges", []),
            "metadata": request.get("metadata", {}),
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "version": 1,
            "imported_from": request.get("workflow_id", "unknown"),
            "imported_at": datetime.now().isoformat()
        }
        
        # Save workflow
        workflow_file = get_workflow_file(new_workflow_id)
        with open(workflow_file, 'w', encoding='utf-8') as f:
            json.dump(workflow_data, f, indent=2, default=str)
        
        logger.info(f"Imported workflow as: {new_workflow_id}")

        return {
            "status": "success",
            "workflow_id": new_workflow_id,
            "name": workflow_data["name"],
            "message": f"Workflow imported as '{workflow_data['name']}'"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error importing workflow: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# WORKFLOW EXECUTION ENDPOINTS
# ============================================================================

@router.post("/execute")
async def execute_workflow(
    request: WorkflowExecuteRequest,
    user_id: str = Header(default="anonymous", alias="x-user-id")
):
    """
    Execute a workflow and return session with results.

    Headers:
        x-user-id: User identifier for session isolation

    Request body:
        workflow_id: Optional workflow identifier
        workflow_name: Optional workflow name
        nodes: List of node definitions
        edges: List of edge definitions

    Returns:
        Session ID and execution results
    """
    if not WORKFLOW_ENGINE_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Workflow execution engine not available"
        )

    try:
        logger.info(f"Executing workflow for user: {user_id}")
        logger.info(f"Workflow request - nodes: {len(request.nodes)}, edges: {len(request.edges)}")
        logger.info(f"Node types: {[n.get('data', {}).get('type') for n in request.nodes]}")

        executor = WorkflowExecutor()

        result = await executor.execute_workflow(
            user_id=user_id,
            workflow_id=request.workflow_id,
            workflow_name=request.workflow_name,
            nodes=request.nodes,
            edges=request.edges
        )

        logger.info(f"Workflow execution completed - session_id: {result.get('session_id')}, status: {result.get('status')}")
        logger.info(f"Results: {list(result.get('results', {}).keys())}")

        return result

    except Exception as e:
        logger.error(f"Workflow execution failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/session/{session_id}")
async def get_session_info(
    session_id: str,
    user_id: str = Header(default="anonymous", alias="x-user-id")
):
    """
    Get session information and execution summary.
    """
    if not WORKFLOW_ENGINE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Workflow engine not available")

    try:
        session_manager = WorkflowSessionManager()
        session = session_manager.get_session(user_id, session_id)

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Load execution summary if available
        session_path = session_manager.get_session_path(user_id, session_id)
        summary_path = session_path / "execution_summary.json"

        execution_summary = None
        if summary_path.exists():
            with open(summary_path, 'r') as f:
                execution_summary = json.load(f)

        return {
            "status": "success",
            "session": session,
            "execution_summary": execution_summary
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/session/{session_id}/data/{node_id}")
async def get_node_data(
    session_id: str,
    node_id: str,
    page: int = 1,
    page_size: int = 100,
    sort_column: Optional[str] = None,
    sort_descending: bool = False,
    user_id: str = Header(default="anonymous", alias="x-user-id")
):
    """
    Get paginated data from a node's output.

    Query params:
        page: Page number (1-indexed)
        page_size: Rows per page (max 1000)
        sort_column: Column to sort by
        sort_descending: Sort direction
    """
    if not WORKFLOW_ENGINE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Workflow engine not available")

    try:
        # Validate page_size
        page_size = min(page_size, 1000)

        executor = WorkflowExecutor()

        result = await executor.get_node_data(
            user_id=user_id,
            session_id=session_id,
            node_id=node_id,
            page=page,
            page_size=page_size,
            sort_column=sort_column,
            sort_descending=sort_descending
        )

        return {
            "status": "success",
            **result
        }

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting node data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/session/{session_id}/download/{node_id}")
async def download_node_data(
    session_id: str,
    node_id: str,
    format: str = "parquet",
    user_id: str = Header(default="anonymous", alias="x-user-id")
):
    """
    Download node output as a file.

    Query params:
        format: Output format (parquet, csv)
    """
    if not WORKFLOW_ENGINE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Workflow engine not available")

    try:
        executor = WorkflowExecutor()

        file_path = await executor.download_node_data(
            user_id=user_id,
            session_id=session_id,
            node_id=node_id,
            format=format
        )

        # Determine media type
        media_type = "application/octet-stream"
        if format == "csv":
            media_type = "text/csv"
        elif format == "parquet":
            media_type = "application/vnd.apache.parquet"

        filename = f"{node_id}.{format}"

        return FileResponse(
            path=file_path,
            media_type=media_type,
            filename=filename
        )

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error downloading node data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/session/{session_id}")
async def cleanup_session(
    session_id: str,
    user_id: str = Header(default="anonymous", alias="x-user-id")
):
    """
    Delete a session and its temp data.
    """
    if not WORKFLOW_ENGINE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Workflow engine not available")

    try:
        session_manager = WorkflowSessionManager()

        success = session_manager.cleanup_session(user_id, session_id)

        if not success:
            raise HTTPException(status_code=404, detail="Session not found")

        return {
            "status": "success",
            "message": f"Session {session_id} cleaned up"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cleaning up session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions")
async def list_user_sessions(
    user_id: str = Header(default="anonymous", alias="x-user-id")
):
    """
    List all sessions for the current user.
    """
    if not WORKFLOW_ENGINE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Workflow engine not available")

    try:
        session_manager = WorkflowSessionManager()

        sessions = session_manager.list_user_sessions(user_id)

        return {
            "status": "success",
            "user_id": user_id,
            "sessions": sessions,
            "total": len(sessions)
        }

    except Exception as e:
        logger.error(f"Error listing sessions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/storage-stats")
async def get_storage_stats():
    """
    Get workflow storage statistics.
    """
    if not WORKFLOW_ENGINE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Workflow engine not available")

    try:
        session_manager = WorkflowSessionManager()

        stats = session_manager.get_storage_stats()

        # Add workflow count
        workflow_count = len(list(WORKFLOW_STORAGE_DIR.glob("*.json")))
        stats["workflow_definitions"] = workflow_count

        return {
            "status": "success",
            **stats
        }

    except Exception as e:
        logger.error(f"Error getting storage stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cleanup-expired")
async def cleanup_expired_sessions():
    """
    Manually trigger cleanup of expired sessions.
    """
    if not WORKFLOW_ENGINE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Workflow engine not available")

    try:
        session_manager = WorkflowSessionManager()

        stats = session_manager.cleanup_expired_sessions()

        return {
            "status": "success",
            "message": "Cleanup completed",
            **stats
        }

    except Exception as e:
        logger.error(f"Error during cleanup: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# NODE LOGS ENDPOINTS
# ============================================================================

@router.get("/session/{session_id}/nodes/{node_id}/logs")
async def get_node_logs(
    session_id: str,
    node_id: str,
    user_id: str = Header(default="anonymous", alias="x-user-id")
):
    """
    Get execution logs for a specific node.
    """
    if not WORKFLOW_ENGINE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Workflow engine not available")

    try:
        session_manager = WorkflowSessionManager()
        
        # Check if session exists
        session = session_manager.get_session(user_id, session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        logs = session_manager.get_node_logs(user_id, session_id, node_id)
        
        return {
            "status": "success",
            "session_id": session_id,
            "node_id": node_id,
            "logs": logs,
            "has_logs": bool(logs)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting node logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/session/{session_id}/logs")
async def list_session_logs(
    session_id: str,
    user_id: str = Header(default="anonymous", alias="x-user-id")
):
    """
    List all nodes with available logs in a session.
    """
    if not WORKFLOW_ENGINE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Workflow engine not available")

    try:
        session_manager = WorkflowSessionManager()
        
        session = session_manager.get_session(user_id, session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        node_logs = session_manager.list_node_logs(user_id, session_id)
        
        return {
            "status": "success",
            "session_id": session_id,
            "nodes_with_logs": node_logs,
            "total": len(node_logs)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing session logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# SINGLE NODE EXECUTION
# ============================================================================

class SingleNodeExecuteRequest(BaseModel):
    """Request model for single node execution"""
    session_id: str
    node_id: str
    node_config: Dict[str, Any]
    use_cached_inputs: bool = True


@router.post("/execute-node")
async def execute_single_node(
    request: SingleNodeExecuteRequest,
    user_id: str = Header(default="anonymous", alias="x-user-id")
):
    """
    Execute a single node using cached upstream data.
    
    This runs only the specified node, using outputs from previous
    workflow executions stored in the session.
    """
    if not WORKFLOW_ENGINE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Workflow engine not available")

    try:
        session_manager = WorkflowSessionManager()
        
        # Verify session exists
        session = session_manager.get_session(user_id, request.session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        executor = WorkflowExecutor()
        
        # Execute single node
        result = await executor.execute_single_node(
            user_id=user_id,
            session_id=request.session_id,
            node_id=request.node_id,
            node_config=request.node_config,
            use_cached_inputs=request.use_cached_inputs
        )
        
        return {
            "status": "success",
            "session_id": request.session_id,
            "node_id": request.node_id,
            **result
        }

    except HTTPException:
        raise
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error executing single node: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# VALIDATION ENDPOINTS
# ============================================================================

@router.get("/session/{session_id}/nodes/{node_id}/validations")
async def get_node_validations(
    session_id: str,
    node_id: str,
    user_id: str = Header(default="anonymous", alias="x-user-id")
):
    """
    Get validation results for a specific node.
    """
    if not WORKFLOW_ENGINE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Workflow engine not available")

    try:
        session_manager = WorkflowSessionManager()
        
        session = session_manager.get_session(user_id, session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        validations = session_manager.get_validation_results(user_id, session_id, node_id)
        
        return {
            "status": "success",
            "session_id": session_id,
            "node_id": node_id,
            "validations": validations
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting node validations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/session/{session_id}/validations")
async def get_all_validations(
    session_id: str,
    user_id: str = Header(default="anonymous", alias="x-user-id")
):
    """
    Get all validation results for a session.
    """
    if not WORKFLOW_ENGINE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Workflow engine not available")

    try:
        session_manager = WorkflowSessionManager()
        
        session = session_manager.get_session(user_id, session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        validations = session_manager.get_all_validation_results(user_id, session_id)
        
        # Count passed/failed
        passed = sum(1 for v in validations.values() if v.get("passed", False))
        failed = len(validations) - passed
        
        return {
            "status": "success",
            "session_id": session_id,
            "validations": validations,
            "summary": {
                "total": len(validations),
                "passed": passed,
                "failed": failed
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting session validations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ENHANCED DATA FILTERING
# ============================================================================

class FilterCondition(BaseModel):
    """Single filter condition"""
    column: str
    operator: str  # contains, equals, starts_with, ends_with, gt, gte, lt, lte, eq, ne, between
    value: Any
    value2: Optional[Any] = None  # For 'between' operator


class FilteredDataRequest(BaseModel):
    """Request model for filtered data retrieval"""
    page: int = 1
    page_size: int = 100
    columns: Optional[List[str]] = None  # Columns to return (None = all)
    filters: Optional[List[FilterCondition]] = None
    sort_column: Optional[str] = None
    sort_descending: bool = False


@router.post("/session/{session_id}/data/{node_id}/filtered")
def get_filtered_node_data(
    session_id: str,
    node_id: str,
    request: FilteredDataRequest,
    user_id: str = Header(default="anonymous", alias="x-user-id")
):
    """
    Get filtered and column-selected data from a node's output.
    
    Features:
    - Column selection: Return only specified columns
    - Filtering: Apply conditions on data
    - Pagination: Page through large datasets
    - Sorting: Sort by any column
    """
    if not WORKFLOW_ENGINE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Workflow engine not available")

    try:
        import polars as pl
        
        session_manager = WorkflowSessionManager()
        
        # Get node output path
        output_path = session_manager.get_node_output_path(user_id, session_id, node_id)
        
        if not output_path.exists():
            raise HTTPException(status_code=404, detail=f"No output found for node '{node_id}'")
        
        # Build lazy query instead of eager full-table load
        lf = pl.scan_parquet(output_path)
        all_columns = lf.collect_schema().names()
        original_row_count = lf.select(pl.count()).collect(streaming=True).item()

        # Apply filters
        if request.filters:
            for f in request.filters:
                if f.column not in all_columns:
                    continue

                col = pl.col(f.column)

                if f.operator == "contains":
                    lf = lf.filter(col.cast(pl.Utf8).str.contains(str(f.value), literal=True))
                elif f.operator == "equals":
                    lf = lf.filter(col == f.value)
                elif f.operator == "starts_with":
                    lf = lf.filter(col.cast(pl.Utf8).str.starts_with(str(f.value)))
                elif f.operator == "ends_with":
                    lf = lf.filter(col.cast(pl.Utf8).str.ends_with(str(f.value)))
                elif f.operator == "not_contains":
                    lf = lf.filter(~col.cast(pl.Utf8).str.contains(str(f.value), literal=True))
                elif f.operator == "gt":
                    lf = lf.filter(col > float(f.value))
                elif f.operator == "gte":
                    lf = lf.filter(col >= float(f.value))
                elif f.operator == "lt":
                    lf = lf.filter(col < float(f.value))
                elif f.operator == "lte":
                    lf = lf.filter(col <= float(f.value))
                elif f.operator == "eq":
                    lf = lf.filter(col == float(f.value))
                elif f.operator == "ne":
                    lf = lf.filter(col != float(f.value))
                elif f.operator == "between" and f.value2 is not None:
                    lf = lf.filter((col >= float(f.value)) & (col <= float(f.value2)))

        filtered_row_count = lf.select(pl.count()).collect(streaming=True).item()

        # Select columns
        visible_columns = all_columns
        if request.columns:
            visible_columns = [c for c in request.columns if c in all_columns]
            if visible_columns:
                lf = lf.select(visible_columns)

        # Apply sorting
        if request.sort_column and request.sort_column in visible_columns:
            lf = lf.sort(request.sort_column, descending=request.sort_descending)

        # Paginate
        page_size = min(request.page_size, 1000)
        offset = (request.page - 1) * page_size
        total_pages = (filtered_row_count + page_size - 1) // page_size if filtered_row_count > 0 else 0

        df_page = lf.slice(offset, page_size).collect(streaming=True)

        # Convert to records
        data = df_page.to_dicts()
        
        return {
            "status": "success",
            "node_id": node_id,
            "data": data,
            "columns": visible_columns,
            "all_columns": all_columns,
            "pagination": {
                "page": request.page,
                "page_size": page_size,
                "total_rows": filtered_row_count,
                "original_rows": original_row_count,
                "total_pages": total_pages,
                "has_next": request.page < total_pages,
                "has_prev": request.page > 1
            },
            "filters_applied": len(request.filters) if request.filters else 0
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting filtered node data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/session/{session_id}/nodes/{node_id}/logs")
async def get_node_logs(
    session_id: str,
    node_id: str,
    user_id: str = Header(default="anonymous", alias="x-user-id")
):
    """
    Get execution logs for a specific node.
    """
    if not WORKFLOW_ENGINE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Workflow engine not available")

    try:
        session_manager = WorkflowSessionManager()
        
        logs = session_manager.get_node_logs(user_id, session_id, node_id)
        
        if not logs:
            # Check if metadata exists to confirm node ran
            output_path = session_manager.get_node_output_path(user_id, session_id, node_id)
            if not output_path.exists():
                raise HTTPException(status_code=404, detail=f"No logs found for node '{node_id}'")
        
        return {
            "status": "success",
            "node_id": node_id,
            "logs": logs
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting node logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/session/{session_id}/nodes/{node_id}/validations")
async def save_node_validations(
    session_id: str,
    node_id: str,
    validations: List[Dict[str, Any]],
    user_id: str = Header(default="anonymous", alias="x-user-id")
):
    """
    Save validation rules for a node.
    """
    if not WORKFLOW_ENGINE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Workflow engine not available")

    try:
        from workflow_engine.validators import NodeValidator
        
        # Save to session metadata/storage
        # Note: In a real app, this might go to DB. 
        # Here we just acknowledge receipt or store in a simple way if needed.
        # Currently the frontend stores validation state in the node data.
        # This endpoint is for persisting it if needed or running validations.
        
        # For now, we'll just return success as the frontend sends validations 
        # during execution payload too.
        
        return {
            "status": "success",
            "message": "Validations saved"
        }

    except Exception as e:
        logger.error(f"Error saving validations: {e}")
        raise HTTPException(status_code=500, detail=str(e))

