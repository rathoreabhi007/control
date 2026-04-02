"""
Session Manager for Workflow Execution

Manages per-user temporary folders for workflow data.
Provides automatic cleanup of expired sessions.
"""

import os
import shutil
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any, List
import uuid

logger = logging.getLogger(__name__)


class WorkflowSessionManager:
    """Manages per-user temp folders for workflow execution"""

    # Base directories relative to api folder
    BASE_DIR = Path(__file__).parent.parent
    TEMP_BASE = BASE_DIR / "data" / "workflow_temp"
    OUTPUT_BASE = BASE_DIR / "data" / "workflow_output"

    # Session configuration
    SESSION_TTL_HOURS = 24  # Auto-cleanup after 24 hours
    MAX_SESSIONS_PER_USER = 10  # Limit sessions per user

    def __init__(self):
        """Initialize session manager and ensure directories exist"""
        self.TEMP_BASE.mkdir(parents=True, exist_ok=True)
        self.OUTPUT_BASE.mkdir(parents=True, exist_ok=True)
        logger.info(f"WorkflowSessionManager initialized. Temp: {self.TEMP_BASE}")

    def create_session(
        self,
        user_id: str,
        workflow_id: Optional[str] = None,
        workflow_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a new workflow execution session

        Args:
            user_id: User identifier
            workflow_id: Optional workflow ID being executed
            workflow_name: Optional workflow name

        Returns:
            Dict with session_id and session_path
        """
        # Sanitize user_id
        safe_user_id = self._sanitize_id(user_id)

        # Check session limit per user
        self._enforce_session_limit(safe_user_id)

        # Generate session ID
        session_id = str(uuid.uuid4())
        session_path = self.TEMP_BASE / safe_user_id / session_id
        session_path.mkdir(parents=True, exist_ok=True)

        # Create metadata
        now = datetime.utcnow()
        metadata = {
            "session_id": session_id,
            "user_id": safe_user_id,
            "workflow_id": workflow_id,
            "workflow_name": workflow_name,
            "created_at": now.isoformat(),
            "expires_at": (now + timedelta(hours=self.SESSION_TTL_HOURS)).isoformat(),
            "last_accessed": now.isoformat(),
            "node_outputs": {},
            "status": "active"
        }

        # Save metadata
        metadata_path = session_path / "metadata.json"
        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=2)

        logger.info(f"Created session {session_id} for user {safe_user_id}")

        return {
            "session_id": session_id,
            "session_path": str(session_path),
            "expires_at": metadata["expires_at"]
        }

    def get_session(self, user_id: str, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Get session metadata

        Args:
            user_id: User identifier
            session_id: Session identifier

        Returns:
            Session metadata dict or None if not found
        """
        safe_user_id = self._sanitize_id(user_id)
        metadata_path = self.TEMP_BASE / safe_user_id / session_id / "metadata.json"

        if not metadata_path.exists():
            return None

        with open(metadata_path, "r") as f:
            metadata = json.load(f)

        # Update last accessed time
        metadata["last_accessed"] = datetime.utcnow().isoformat()
        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=2)

        return metadata

    def get_session_path(self, user_id: str, session_id: str) -> Optional[Path]:
        """Get the filesystem path for a session"""
        safe_user_id = self._sanitize_id(user_id)
        session_path = self.TEMP_BASE / safe_user_id / session_id

        if session_path.exists():
            return session_path
        return None

    def get_node_output_path(
        self,
        user_id: str,
        session_id: str,
        node_id: str
    ) -> Path:
        """
        Get path for storing/retrieving node output

        Args:
            user_id: User identifier
            session_id: Session identifier
            node_id: Node identifier

        Returns:
            Path to the node's output parquet file
        """
        safe_user_id = self._sanitize_id(user_id)
        safe_node_id = self._sanitize_id(node_id)
        return self.TEMP_BASE / safe_user_id / session_id / f"{safe_node_id}.parquet"

    def update_node_output(
        self,
        user_id: str,
        session_id: str,
        node_id: str,
        row_count: int,
        columns: List[str],
        status: str = "completed"
    ):
        """
        Update session metadata with node output info

        Args:
            user_id: User identifier
            session_id: Session identifier
            node_id: Node identifier
            row_count: Number of rows in output
            columns: List of column names
            status: Node execution status
        """
        safe_user_id = self._sanitize_id(user_id)
        metadata_path = self.TEMP_BASE / safe_user_id / session_id / "metadata.json"

        if not metadata_path.exists():
            logger.warning(f"Session metadata not found: {session_id}")
            return

        with open(metadata_path, "r") as f:
            metadata = json.load(f)

        metadata["node_outputs"][node_id] = {
            "status": status,
            "row_count": row_count,
            "columns": columns,
            "completed_at": datetime.utcnow().isoformat()
        }
        metadata["last_accessed"] = datetime.utcnow().isoformat()

        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=2)

    def list_user_sessions(self, user_id: str) -> List[Dict[str, Any]]:
        """
        List all sessions for a user

        Args:
            user_id: User identifier

        Returns:
            List of session metadata dicts
        """
        safe_user_id = self._sanitize_id(user_id)
        user_path = self.TEMP_BASE / safe_user_id

        if not user_path.exists():
            return []

        sessions = []
        for session_dir in user_path.iterdir():
            if not session_dir.is_dir():
                continue

            metadata_path = session_dir / "metadata.json"
            if metadata_path.exists():
                with open(metadata_path, "r") as f:
                    sessions.append(json.load(f))

        # Sort by created_at descending
        sessions.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return sessions

    def cleanup_session(self, user_id: str, session_id: str) -> bool:
        """
        Delete a session and its temp files

        Args:
            user_id: User identifier
            session_id: Session identifier

        Returns:
            True if cleaned up, False if not found
        """
        safe_user_id = self._sanitize_id(user_id)
        session_path = self.TEMP_BASE / safe_user_id / session_id

        if not session_path.exists():
            logger.warning(f"Session not found for cleanup: {session_id}")
            return False

        try:
            shutil.rmtree(session_path)
            logger.info(f"Cleaned up session {session_id} for user {safe_user_id}")
            return True
        except Exception as e:
            logger.error(f"Error cleaning up session {session_id}: {e}")
            return False

    def cleanup_expired_sessions(self) -> Dict[str, int]:
        """
        Remove all expired sessions across all users

        Returns:
            Dict with cleanup statistics
        """
        now = datetime.utcnow()
        stats = {
            "checked": 0,
            "cleaned": 0,
            "errors": 0,
            "bytes_freed": 0
        }

        if not self.TEMP_BASE.exists():
            return stats

        for user_dir in self.TEMP_BASE.iterdir():
            if not user_dir.is_dir():
                continue

            for session_dir in user_dir.iterdir():
                if not session_dir.is_dir():
                    continue

                stats["checked"] += 1
                metadata_path = session_dir / "metadata.json"

                should_delete = False

                if metadata_path.exists():
                    try:
                        with open(metadata_path, "r") as f:
                            metadata = json.load(f)

                        expires_at = datetime.fromisoformat(metadata.get("expires_at", ""))
                        if now > expires_at:
                            should_delete = True
                    except (json.JSONDecodeError, ValueError) as e:
                        # Invalid metadata, mark for deletion
                        logger.warning(f"Invalid metadata in {session_dir}: {e}")
                        should_delete = True
                else:
                    # No metadata file, mark for deletion
                    should_delete = True

                if should_delete:
                    try:
                        # Calculate size before deletion
                        size = self._get_dir_size(session_dir)
                        shutil.rmtree(session_dir)
                        stats["cleaned"] += 1
                        stats["bytes_freed"] += size
                        logger.info(f"Cleaned expired session: {session_dir.name}")
                    except Exception as e:
                        stats["errors"] += 1
                        logger.error(f"Error cleaning session {session_dir}: {e}")

            # Clean up empty user directories
            if user_dir.exists() and not any(user_dir.iterdir()):
                try:
                    user_dir.rmdir()
                    logger.info(f"Removed empty user directory: {user_dir.name}")
                except Exception:
                    pass

        logger.info(f"Session cleanup completed: {stats}")
        return stats

    def get_storage_stats(self) -> Dict[str, Any]:
        """
        Get storage statistics

        Returns:
            Dict with storage statistics
        """
        stats = {
            "total_users": 0,
            "total_sessions": 0,
            "total_size_bytes": 0,
            "temp_path": str(self.TEMP_BASE),
            "output_path": str(self.OUTPUT_BASE)
        }

        if not self.TEMP_BASE.exists():
            return stats

        for user_dir in self.TEMP_BASE.iterdir():
            if not user_dir.is_dir():
                continue

            stats["total_users"] += 1

            for session_dir in user_dir.iterdir():
                if session_dir.is_dir():
                    stats["total_sessions"] += 1
                    stats["total_size_bytes"] += self._get_dir_size(session_dir)

        stats["total_size_mb"] = round(stats["total_size_bytes"] / (1024 * 1024), 2)
        return stats

    def _sanitize_id(self, id_string: str) -> str:
        """Sanitize ID for use in filesystem paths"""
        if not id_string:
            return "anonymous"
        # Keep only alphanumeric, underscore, hyphen
        import re
        sanitized = re.sub(r'[^a-zA-Z0-9_-]', '_', str(id_string))
        return sanitized[:100] if sanitized else "anonymous"

    def _enforce_session_limit(self, user_id: str):
        """Remove oldest sessions if user exceeds limit"""
        sessions = self.list_user_sessions(user_id)

        if len(sessions) >= self.MAX_SESSIONS_PER_USER:
            # Sort by created_at and remove oldest
            sessions.sort(key=lambda x: x.get("created_at", ""))
            sessions_to_remove = sessions[:len(sessions) - self.MAX_SESSIONS_PER_USER + 1]

            for session in sessions_to_remove:
                self.cleanup_session(user_id, session["session_id"])
                logger.info(f"Removed old session {session['session_id']} due to limit")

    def _get_dir_size(self, path: Path) -> int:
        """Get total size of directory in bytes"""
        total = 0
        try:
            for entry in path.rglob("*"):
                if entry.is_file():
                    total += entry.stat().st_size
        except Exception:
            pass
        return total
    
    # ==========================================================================
    # Per-Node Logs Storage
    # ==========================================================================
    
    def get_logs_dir(self, user_id: str, session_id: str) -> Path:
        """Get the logs directory for a session"""
        safe_user_id = self._sanitize_id(user_id)
        logs_dir = self.TEMP_BASE / safe_user_id / session_id / "logs"
        logs_dir.mkdir(parents=True, exist_ok=True)
        return logs_dir
    
    def save_node_logs(
        self,
        user_id: str,
        session_id: str,
        node_id: str,
        logs: str,
        append: bool = True
    ):
        """
        Save execution logs for a specific node.
        
        Args:
            user_id: User identifier
            session_id: Session identifier
            node_id: Node identifier
            logs: Log content to save
            append: If True, append to existing logs; if False, overwrite
        """
        safe_node_id = self._sanitize_id(node_id)
        logs_dir = self.get_logs_dir(user_id, session_id)
        log_file = logs_dir / f"{safe_node_id}.txt"
        
        mode = "a" if append and log_file.exists() else "w"
        with open(log_file, mode, encoding="utf-8") as f:
            if mode == "a" and log_file.stat().st_size > 0:
                f.write("\n")
            f.write(logs)
        
        logger.debug(f"Saved logs for node {node_id} in session {session_id}")
    
    def get_node_logs(
        self,
        user_id: str,
        session_id: str,
        node_id: str
    ) -> str:
        """
        Retrieve logs for a specific node.
        
        Args:
            user_id: User identifier
            session_id: Session identifier
            node_id: Node identifier
            
        Returns:
            Log content as string, empty if not found
        """
        safe_node_id = self._sanitize_id(node_id)
        logs_dir = self.get_logs_dir(user_id, session_id)
        log_file = logs_dir / f"{safe_node_id}.txt"
        
        if not log_file.exists():
            return ""
        
        with open(log_file, "r", encoding="utf-8") as f:
            return f.read()
    
    def list_node_logs(self, user_id: str, session_id: str) -> List[str]:
        """
        List all node IDs that have logs.
        
        Returns:
            List of node IDs with available logs
        """
        logs_dir = self.get_logs_dir(user_id, session_id)
        return [f.stem for f in logs_dir.glob("*.txt")]
    
    # ==========================================================================
    # Validation Results Storage
    # ==========================================================================
    
    def get_validations_dir(self, user_id: str, session_id: str) -> Path:
        """Get the validations directory for a session"""
        safe_user_id = self._sanitize_id(user_id)
        validations_dir = self.TEMP_BASE / safe_user_id / session_id / "validations"
        validations_dir.mkdir(parents=True, exist_ok=True)
        return validations_dir
    
    def save_validation_results(
        self,
        user_id: str,
        session_id: str,
        node_id: str,
        validation_result: Dict[str, Any]
    ):
        """
        Save validation results for a node.
        
        Args:
            user_id: User identifier
            session_id: Session identifier
            node_id: Node identifier
            validation_result: Validation result dict
        """
        safe_node_id = self._sanitize_id(node_id)
        validations_dir = self.get_validations_dir(user_id, session_id)
        result_file = validations_dir / f"{safe_node_id}.json"
        
        result_data = {
            "node_id": node_id,
            "validated_at": datetime.utcnow().isoformat(),
            **validation_result
        }
        
        with open(result_file, "w", encoding="utf-8") as f:
            json.dump(result_data, f, indent=2, default=str)
        
        logger.debug(f"Saved validation results for node {node_id}")
    
    def get_validation_results(
        self,
        user_id: str,
        session_id: str,
        node_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieve validation results for a node.
        
        Returns:
            Validation result dict or None if not found
        """
        safe_node_id = self._sanitize_id(node_id)
        validations_dir = self.get_validations_dir(user_id, session_id)
        result_file = validations_dir / f"{safe_node_id}.json"
        
        if not result_file.exists():
            return None
        
        with open(result_file, "r", encoding="utf-8") as f:
            return json.load(f)
    
    def get_all_validation_results(
        self,
        user_id: str,
        session_id: str
    ) -> Dict[str, Dict[str, Any]]:
        """
        Get all validation results for a session.
        
        Returns:
            Dict mapping node_id to validation results
        """
        validations_dir = self.get_validations_dir(user_id, session_id)
        results = {}
        
        for result_file in validations_dir.glob("*.json"):
            with open(result_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                results[data.get("node_id", result_file.stem)] = data
        
        return results
