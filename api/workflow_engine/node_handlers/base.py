"""
Base Node Handler

Abstract base class defining the interface for all node handlers.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional, Union
from pathlib import Path
import polars as pl
import logging

logger = logging.getLogger(__name__)


class BaseNodeHandler(ABC):
    """Abstract base class for workflow node handlers"""

    # Node type identifier (override in subclasses)
    node_type: str = "base"

    # Required parameters for this node type
    required_params: List[str] = []

    # Whether this node requires input from upstream nodes
    requires_input: bool = False

    # Minimum/maximum number of inputs
    min_inputs: int = 0
    max_inputs: int = 1

    @abstractmethod
    async def execute(
        self,
        params: Dict[str, Any],
        inputs: List[pl.LazyFrame],
        session_path: Path,
        node_id: str
    ) -> pl.LazyFrame:
        """
        Execute the node operation

        Args:
            params: Node parameters from configuration
            inputs: List of input LazyFrames from upstream nodes
            session_path: Path to session temp directory
            node_id: Unique identifier for this node

        Returns:
            LazyFrame containing the result
        """
        pass

    def validate_params(self, params: Dict[str, Any]) -> List[str]:
        """
        Validate node parameters

        Args:
            params: Parameters to validate

        Returns:
            List of validation error messages (empty if valid)
        """
        errors = []

        for param_name in self.required_params:
            if param_name not in params or not params[param_name]:
                errors.append(f"Required parameter '{param_name}' is missing")

        return errors

    def validate_inputs(self, inputs: List[pl.LazyFrame]) -> List[str]:
        """
        Validate input data

        Args:
            inputs: List of input LazyFrames

        Returns:
            List of validation error messages (empty if valid)
        """
        errors = []

        if self.requires_input and len(inputs) < self.min_inputs:
            errors.append(
                f"Node requires at least {self.min_inputs} input(s), got {len(inputs)}"
            )

        if len(inputs) > self.max_inputs:
            errors.append(
                f"Node accepts at most {self.max_inputs} input(s), got {len(inputs)}"
            )

        return errors

    def get_param(
        self,
        params: Dict[str, Any],
        key: str,
        default: Any = None,
        param_type: type = str
    ) -> Any:
        """
        Get parameter value with type conversion

        Args:
            params: Parameters dict
            key: Parameter key
            default: Default value if not found
            param_type: Expected type for conversion

        Returns:
            Parameter value or default
        """
        value = params.get(key, default)

        if value is None or value == "":
            return default

        try:
            if param_type == bool:
                if isinstance(value, bool):
                    return value
                return str(value).lower() in ("true", "1", "yes")
            elif param_type == int:
                return int(value)
            elif param_type == float:
                return float(value)
            elif param_type == list:
                if isinstance(value, list):
                    return value
                return [v.strip() for v in str(value).split(",") if v.strip()]
            else:
                return param_type(value)
        except (ValueError, TypeError) as e:
            logger.warning(f"Error converting param {key}: {e}")
            return default

    def log_execution(
        self,
        node_id: str,
        message: str,
        level: str = "info"
    ):
        """Log execution message with node context"""
        log_msg = f"[{self.node_type}:{node_id}] {message}"
        getattr(logger, level)(log_msg)
