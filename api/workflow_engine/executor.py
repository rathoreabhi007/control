"""
Workflow Executor

Orchestrates the execution of workflow nodes in topological order.
Manages data flow between nodes and handles errors.
"""

import asyncio
import logging
from typing import Dict, Any, List, Optional, Callable, Awaitable
from pathlib import Path
from datetime import datetime
import polars as pl
import json

from .session_manager import WorkflowSessionManager
from .node_handlers import get_handler

logger = logging.getLogger(__name__)


class WorkflowExecutor:
    """
    Executes workflow nodes in dependency order.

    Handles:
    - Topological sorting of nodes
    - Data flow between connected nodes
    - Per-node status callbacks
    - Error handling and recovery
    - Session management for temp data
    """

    def __init__(self):
        self.session_manager = WorkflowSessionManager()

    async def execute_workflow(
        self,
        user_id: str,
        workflow_id: Optional[str],
        workflow_name: Optional[str],
        nodes: List[Dict[str, Any]],
        edges: List[Dict[str, Any]],
        on_node_start: Optional[Callable[[str, str], Awaitable[None]]] = None,
        on_node_complete: Optional[Callable[[str, str, Dict], Awaitable[None]]] = None,
        on_node_error: Optional[Callable[[str, str, str], Awaitable[None]]] = None,
    ) -> Dict[str, Any]:
        """
        Execute entire workflow

        Args:
            user_id: User identifier for session isolation
            workflow_id: Optional workflow identifier
            workflow_name: Optional workflow name
            nodes: List of node definitions with id, data (type, parameters)
            edges: List of edge definitions with source, target
            on_node_start: Callback when node starts (node_id, status)
            on_node_complete: Callback when node completes (node_id, status, result)
            on_node_error: Callback when node fails (node_id, status, error)

        Returns:
            Dict with session_id, status, results per node
        """
        start_time = datetime.utcnow()

        # Create session for this execution
        session = self.session_manager.create_session(
            user_id=user_id,
            workflow_id=workflow_id,
            workflow_name=workflow_name
        )
        session_id = session["session_id"]
        session_path = Path(session["session_path"])

        logger.info(
            f"Starting workflow execution: user={user_id}, "
            f"workflow={workflow_id}, session={session_id}"
        )

        # Build execution order
        try:
            execution_order = self._topological_sort(nodes, edges)
        except Exception as e:
            logger.error(f"Failed to build execution order: {e}")
            return {
                "session_id": session_id,
                "status": "failed",
                "error": f"Invalid workflow structure: {e}",
                "results": {}
            }

        # Track node outputs (LazyFrames)
        node_outputs: Dict[str, pl.LazyFrame] = {}
        results: Dict[str, Dict[str, Any]] = {}

        workflow_status = "completed"
        error_message = None

        for node in execution_order:
            node_id = node["id"]
            node_type = node.get("data", {}).get("type", "unknown")
            params = node.get("data", {}).get("parameters", {})

            # Initialize log message
            node_start_time = datetime.utcnow()
            log_message = f"[{node_start_time.isoformat()}] Starting node execution: {node_type}\n"
            log_message += f"Parameters: {params}\n"

            logger.info(f"Executing node: {node_id} ({node_type})")

            # Notify start
            if on_node_start:
                try:
                    await on_node_start(node_id, "running")
                except Exception:
                    pass

            try:
                # Get input data from upstream nodes
                input_data = self._get_node_inputs(node_id, edges, node_outputs)
                
                # Log inputs
                input_sources = [
                    edge["source"] for edge in edges 
                    if edge["target"] == node_id
                ]
                log_message += f"Input sources: {input_sources}\n"

                # Get handler for this node type
                handler = get_handler(node_type)

                # Validate parameters
                param_errors = handler.validate_params(params)
                if param_errors:
                    raise ValueError(f"Invalid parameters: {', '.join(param_errors)}")

                # Validate inputs
                input_errors = handler.validate_inputs(input_data)
                if input_errors:
                    raise ValueError(f"Invalid inputs: {', '.join(input_errors)}")

                # Execute the node
                output = await handler.execute(
                    params=params,
                    inputs=input_data,
                    session_path=session_path,
                    node_id=node_id
                )

                # Store output for downstream nodes
                node_outputs[node_id] = output

                # Collect and save to temp file
                output_path = self.session_manager.get_node_output_path(
                    user_id, session_id, node_id
                )
                df = output.collect()
                df.write_parquet(output_path)

                # Update session metadata
                self.session_manager.update_node_output(
                    user_id=user_id,
                    session_id=session_id,
                    node_id=node_id,
                    row_count=df.height,
                    columns=df.columns,
                    status="completed"
                )
                
                # Calculate node execution time
                node_exec_time = (datetime.utcnow() - node_start_time).total_seconds()
                
                # Update logs
                log_message += f"[{datetime.utcnow().isoformat()}] Completed: {df.height} rows, {len(df.columns)} columns\n"
                log_message += f"Execution time: {node_exec_time:.2f}s\n"
                self.session_manager.save_node_logs(
                    user_id, session_id, node_id, log_message, append=False
                )

                # Record result
                results[node_id] = {
                    "status": "completed",
                    "row_count": df.height,
                    "columns": df.columns,
                    "output_path": str(output_path),
                    "completed_at": datetime.utcnow().isoformat()
                }

                logger.info(
                    f"Node {node_id} completed: {df.height} rows, "
                    f"{len(df.columns)} columns"
                )

                # Notify completion
                if on_node_complete:
                    try:
                        await on_node_complete(node_id, "completed", results[node_id])
                    except Exception:
                        pass

            except Exception as e:
                error_str = str(e)
                logger.error(f"Node {node_id} failed: {error_str}")
                
                # Update logs with failure
                log_message += f"[{datetime.utcnow().isoformat()}] FAILED: {error_str}\n"
                self.session_manager.save_node_logs(
                    user_id, session_id, node_id, log_message, append=False
                )

                # Record failure
                results[node_id] = {
                    "status": "failed",
                    "error": error_str,
                    "failed_at": datetime.utcnow().isoformat()
                }

                # Update session
                self.session_manager.update_node_output(
                    user_id=user_id,
                    session_id=session_id,
                    node_id=node_id,
                    row_count=0,
                    columns=[],
                    status="failed"
                )

                # Notify error
                if on_node_error:
                    try:
                        await on_node_error(node_id, "failed", error_str)
                    except Exception:
                        pass

                # Mark workflow as failed and stop
                workflow_status = "failed"
                error_message = f"Node {node_id} failed: {error_str}"
                break

        # Calculate execution time
        end_time = datetime.utcnow()
        execution_time = (end_time - start_time).total_seconds()

        # Save execution summary
        summary = {
            "session_id": session_id,
            "workflow_id": workflow_id,
            "workflow_name": workflow_name,
            "user_id": user_id,
            "status": workflow_status,
            "error": error_message,
            "started_at": start_time.isoformat(),
            "completed_at": end_time.isoformat(),
            "execution_time_seconds": execution_time,
            "nodes_executed": len(results),
            "nodes_total": len(nodes),
            "results": results
        }

        # Save summary to session
        summary_path = session_path / "execution_summary.json"
        with open(summary_path, "w") as f:
            json.dump(summary, f, indent=2)

        logger.info(
            f"Workflow execution completed: status={workflow_status}, "
            f"time={execution_time:.2f}s, nodes={len(results)}/{len(nodes)}"
        )

        return summary

    def _topological_sort(
        self,
        nodes: List[Dict[str, Any]],
        edges: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Sort nodes in execution order using Kahn's algorithm.

        Ensures upstream nodes execute before downstream nodes.

        Raises:
            ValueError: If the graph has a cycle
        """
        # Build node lookup
        node_map = {n["id"]: n for n in nodes}

        # Build adjacency list and in-degree count
        in_degree = {n["id"]: 0 for n in nodes}
        adjacency: Dict[str, List[str]] = {n["id"]: [] for n in nodes}

        for edge in edges:
            source = edge.get("source")
            target = edge.get("target")

            if source in adjacency and target in in_degree:
                adjacency[source].append(target)
                in_degree[target] += 1

        # Initialize queue with nodes that have no dependencies
        queue = [node_id for node_id, degree in in_degree.items() if degree == 0]
        result = []

        while queue:
            # Get node with no remaining dependencies
            node_id = queue.pop(0)
            result.append(node_map[node_id])

            # Remove this node's edges
            for neighbor_id in adjacency[node_id]:
                in_degree[neighbor_id] -= 1
                if in_degree[neighbor_id] == 0:
                    queue.append(neighbor_id)

        # Check for cycles
        if len(result) != len(nodes):
            remaining = [n["id"] for n in nodes if n["id"] not in [r["id"] for r in result]]
            raise ValueError(f"Workflow contains a cycle involving nodes: {remaining}")

        return result

    def _get_node_inputs(
        self,
        node_id: str,
        edges: List[Dict[str, Any]],
        node_outputs: Dict[str, pl.LazyFrame]
    ) -> List[pl.LazyFrame]:
        """
        Get input LazyFrames from upstream nodes.

        Returns inputs in the order they were connected.
        """
        inputs = []

        # Find all edges pointing to this node
        incoming_edges = [
            edge for edge in edges
            if edge.get("target") == node_id
        ]

        # Sort by edge creation order (source handle if available)
        for edge in incoming_edges:
            source_id = edge.get("source")
            if source_id in node_outputs:
                inputs.append(node_outputs[source_id])

        return inputs

    async def get_node_data(
        self,
        user_id: str,
        session_id: str,
        node_id: str,
        page: int = 1,
        page_size: int = 100,
        sort_column: Optional[str] = None,
        sort_descending: bool = False
    ) -> Dict[str, Any]:
        """
        Get paginated data from a node's output.

        Args:
            user_id: User identifier
            session_id: Session identifier
            node_id: Node identifier
            page: Page number (1-indexed)
            page_size: Rows per page
            sort_column: Optional column to sort by
            sort_descending: Sort direction

        Returns:
            Dict with data, columns, pagination info
        """
        output_path = self.session_manager.get_node_output_path(
            user_id, session_id, node_id
        )

        if not output_path.exists():
            raise FileNotFoundError(f"Node output not found: {node_id}")

        # Use lazy loading
        lf = pl.scan_parquet(output_path)

        # Get total count
        total_rows = lf.select(pl.count()).collect().item()

        # Apply sorting if requested
        if sort_column:
            lf = lf.sort(sort_column, descending=sort_descending)

        # Apply pagination
        offset = (page - 1) * page_size
        df = lf.slice(offset, page_size).collect()

        # Convert to JSON-serializable format
        data = df.to_dicts()
        columns = df.columns
        dtypes = {col: str(dtype) for col, dtype in zip(df.columns, df.dtypes)}

        return {
            "data": data,
            "columns": columns,
            "dtypes": dtypes,
            "total_rows": total_rows,
            "page": page,
            "page_size": page_size,
            "total_pages": (total_rows + page_size - 1) // page_size
        }

    async def download_node_data(
        self,
        user_id: str,
        session_id: str,
        node_id: str,
        format: str = "parquet"
    ) -> Path:
        """
        Get path to downloadable file for a node's output.

        Args:
            user_id: User identifier
            session_id: Session identifier
            node_id: Node identifier
            format: Output format (parquet, csv)

        Returns:
            Path to the file
        """
        output_path = self.session_manager.get_node_output_path(
            user_id, session_id, node_id
        )

        if not output_path.exists():
            raise FileNotFoundError(f"Node output not found: {node_id}")

        if format == "parquet":
            return output_path

        elif format == "csv":
            # Convert to CSV
            csv_path = output_path.with_suffix(".csv")
            if not csv_path.exists():
                df = pl.read_parquet(output_path)
                df.write_csv(csv_path)
            return csv_path

        else:
            raise ValueError(f"Unsupported format: {format}")
    
    async def execute_single_node(
        self,
        user_id: str,
        session_id: str,
        node_id: str,
        node_config: Dict[str, Any],
        use_cached_inputs: bool = True
    ) -> Dict[str, Any]:
        """
        Execute a single node using cached upstream data.
        
        This allows re-running a specific node without re-executing
        the entire workflow. Uses previously saved outputs from
        upstream nodes.
        
        Args:
            user_id: User identifier
            session_id: Session identifier (must have previous execution)
            node_id: Node to execute
            node_config: Node configuration with type, parameters
            use_cached_inputs: Whether to use cached upstream outputs
            
        Returns:
            Dict with execution result
        """
        start_time = datetime.utcnow()
        
        # Get session path
        session_path = self.session_manager.get_session_path(user_id, session_id)
        if not session_path:
            raise FileNotFoundError(f"Session not found: {session_id}")
        
        logger.info(f"Executing single node: {node_id} in session {session_id}")
        
        node_type = node_config.get("type", "unknown")
        params = node_config.get("parameters", {})
        upstream_node_ids = node_config.get("upstream_nodes", [])
        
        try:
            # Load cached inputs from upstream nodes
            input_data: List[pl.LazyFrame] = []
            
            if use_cached_inputs and upstream_node_ids:
                for upstream_id in upstream_node_ids:
                    upstream_path = self.session_manager.get_node_output_path(
                        user_id, session_id, upstream_id
                    )
                    if upstream_path.exists():
                        input_data.append(pl.scan_parquet(upstream_path))
                    else:
                        logger.warning(f"Upstream output not found: {upstream_id}")
            
            # Get handler for this node type
            handler = get_handler(node_type)
            
            # Validate parameters
            param_errors = handler.validate_params(params)
            if param_errors:
                raise ValueError(f"Invalid parameters: {', '.join(param_errors)}")
            
            # Validate inputs
            input_errors = handler.validate_inputs(input_data)
            if input_errors:
                raise ValueError(f"Invalid inputs: {', '.join(input_errors)}")
            
            # Log start
            log_message = f"[{datetime.utcnow().isoformat()}] Starting node execution: {node_type}\n"
            log_message += f"Parameters: {params}\n"
            log_message += f"Input sources: {upstream_node_ids}\n"
            
            # Execute the node
            output = await handler.execute(
                params=params,
                inputs=input_data,
                session_path=session_path,
                node_id=node_id
            )
            
            # Save output
            output_path = self.session_manager.get_node_output_path(
                user_id, session_id, node_id
            )
            df = output.collect()
            df.write_parquet(output_path)
            
            # Update session metadata
            self.session_manager.update_node_output(
                user_id=user_id,
                session_id=session_id,
                node_id=node_id,
                row_count=df.height,
                columns=df.columns,
                status="completed"
            )
            
            # Calculate execution time
            execution_time = (datetime.utcnow() - start_time).total_seconds()
            
            # Log completion
            log_message += f"[{datetime.utcnow().isoformat()}] Completed: {df.height} rows, {len(df.columns)} columns\n"
            log_message += f"Execution time: {execution_time:.2f}s\n"
            
            # Save logs
            self.session_manager.save_node_logs(
                user_id, session_id, node_id, log_message, append=False
            )
            
            logger.info(f"Single node execution completed: {node_id}")
            
            return {
                "status": "completed",
                "node_id": node_id,
                "row_count": df.height,
                "columns": df.columns,
                "execution_time_seconds": execution_time,
                "output_path": str(output_path)
            }
            
        except Exception as e:
            error_str = str(e)
            execution_time = (datetime.utcnow() - start_time).total_seconds()
            
            logger.error(f"Single node execution failed: {node_id} - {error_str}")
            
            # Log failure
            log_message = f"[{datetime.utcnow().isoformat()}] FAILED: {error_str}\n"
            self.session_manager.save_node_logs(
                user_id, session_id, node_id, log_message, append=False
            )
            
            # Update session metadata
            self.session_manager.update_node_output(
                user_id=user_id,
                session_id=session_id,
                node_id=node_id,
                row_count=0,
                columns=[],
                status="failed"
            )
            
            return {
                "status": "failed",
                "node_id": node_id,
                "error": error_str,
                "execution_time_seconds": execution_time
            }
