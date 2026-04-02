"""
Task Validator Module
Parameter validation for control task execution
"""

import os
import logging
from typing import Dict, Any, List, Optional, Tuple
from pathlib import Path
import re
from datetime import datetime

# Configure logging
logger = logging.getLogger(__name__)

class ControlTaskValidator:
    """Validates control task parameters and configuration"""
    
    # Valid control names (can be extended)
    VALID_CONTROL_NAMES = [
        "bash_operator",
        "python_operator", 
        "data_processing_pipeline",
        "etl_pipeline",
        "data_validation",
        "file_processor",
        "database_operation",
        "api_integration",
        "custom_script",
        "auto_config",  # AutoConfig deployment script
        # Our control script names
        "control_script_data_extraction_001",
        "control_script_data_transformation_002",
        "control_script_data_loading_003",
        "control_script_data_validation_004",
        "control_script_report_generation_005"
    ]
    
    # Valid run environments
    VALID_RUN_ENVS = ["PROD", "UAT", "DEV", "TEST"]
    
    # Maximum values
    MAX_SCRIPT_ARGUMENTS = 50
    MAX_ENVIRONMENT_VARIABLES = 100
    MAX_SCRIPT_PATH_LENGTH = 500
    MAX_CONTROL_NAME_LENGTH = 100
    
    def __init__(self):
        """Initialize validator"""
        self.validation_errors = []
        self.validation_warnings = []
    
    def validate_control_params(self, params: Dict[str, Any]) -> Tuple[bool, List[str], List[str]]:
        """
        Validate control task parameters
        
        Args:
            params: Control task parameters
            
        Returns:
            Tuple of (is_valid, errors, warnings)
        """
        self.validation_errors = []
        self.validation_warnings = []
        
        try:
            # Validate required fields
            self._validate_required_fields(params)
            
            # Validate field types and formats
            self._validate_field_types(params)
            
            # Validate control name
            self._validate_control_name(params.get("control_name"))
            
            # Validate run environment
            self._validate_run_env(params.get("run_env"))
            
            # Validate expected run date
            self._validate_expected_run_date(params.get("expected_run_date"))
            
            # Validate Python script path
            self._validate_python_script_path(params.get("python_script_path"))
            
            # Validate script arguments
            self._validate_script_arguments(params.get("script_arguments", []))
            
            # Validate environment variables
            self._validate_environment_variables(params.get("environment_variables", {}))
            
            # Validate schedule (if provided)
            if "schedule" in params:
                self._validate_schedule(params.get("schedule"))
            
            # Check for potential issues
            self._check_potential_issues(params)
            
            is_valid = len(self.validation_errors) == 0
            
            if is_valid:
                logger.info("Control task parameters validated successfully")
            else:
                logger.warning(f"Validation failed with {len(self.validation_errors)} errors")
            
            return is_valid, self.validation_errors, self.validation_warnings
            
        except Exception as e:
            error_msg = f"Validation error: {e}"
            self.validation_errors.append(error_msg)
            logger.error(f"{error_msg}")
            return False, self.validation_errors, self.validation_warnings
    
    def _validate_required_fields(self, params: Dict[str, Any]):
        """Validate required fields are present"""
        required_fields = [
            "control_name",
            "run_env", 
            "expected_run_date",
            "python_script_path"
        ]
        
        for field in required_fields:
            if field not in params or params[field] is None:
                self.validation_errors.append(f"Required field '{field}' is missing")
            elif isinstance(params[field], str) and not params[field].strip():
                self.validation_errors.append(f"Required field '{field}' cannot be empty")
    
    def _validate_field_types(self, params: Dict[str, Any]):
        """Validate field types"""
        type_validations = {
            "control_name": str,
            "run_env": str,
            "expected_run_date": str,
            "python_script_path": str,
            "script_arguments": list,
            "environment_variables": dict
        }
        
        for field, expected_type in type_validations.items():
            if field in params and params[field] is not None:
                if not isinstance(params[field], expected_type):
                    self.validation_errors.append(
                        f"Field '{field}' must be of type {expected_type.__name__}, got {type(params[field]).__name__}"
                    )
    
    def _validate_control_name(self, control_name: Optional[str]):
        """Validate control name"""
        if not control_name:
            return
        
        if len(control_name) > self.MAX_CONTROL_NAME_LENGTH:
            self.validation_errors.append(
                f"Control name too long (max {self.MAX_CONTROL_NAME_LENGTH} characters)"
            )
        
        # Check for valid characters (alphanumeric, underscore, hyphen)
        if not re.match(r'^[a-zA-Z0-9_-]+$', control_name):
            self.validation_errors.append(
                "Control name can only contain alphanumeric characters, underscores, and hyphens"
            )
        
        # Check if it's a known control name
        if control_name not in self.VALID_CONTROL_NAMES:
            self.validation_warnings.append(
                f"Control name '{control_name}' is not in the list of known controls"
            )
    
    def _validate_run_env(self, run_env: Optional[str]):
        """Validate run environment"""
        if not run_env:
            return
        
        if run_env not in self.VALID_RUN_ENVS:
            self.validation_errors.append(
                f"Invalid run environment '{run_env}'. Must be one of: {', '.join(self.VALID_RUN_ENVS)}"
            )
    
    def _validate_expected_run_date(self, expected_run_date: Optional[str]):
        """Validate expected run date format"""
        if not expected_run_date:
            return
        
        try:
            # Try to parse the date
            datetime.strptime(expected_run_date, "%Y-%m-%d")
        except ValueError:
            self.validation_errors.append(
                "Expected run date must be in YYYY-MM-DD format"
            )
    
    def _validate_python_script_path(self, script_path: Optional[str]):
        """Validate Python script path"""
        if not script_path:
            return
        
        if len(script_path) > self.MAX_SCRIPT_PATH_LENGTH:
            self.validation_errors.append(
                f"Script path too long (max {self.MAX_SCRIPT_PATH_LENGTH} characters)"
            )
        
        # Resolve script path - handle relative paths
        resolved_script_path = script_path
        if not os.path.isabs(script_path):
            # If relative path, resolve relative to project root (parent of api directory)
            # Use .resolve() to ensure we get absolute paths
            project_root = Path(__file__).resolve().parent.parent.parent
            resolved_script_path = str((project_root / script_path).resolve())
        
        # Debug logging
        logger.debug(f"Validating script path: original={script_path}, resolved={resolved_script_path}")
        
        # Check if file exists
        if not os.path.exists(resolved_script_path):
            logger.error(f"Script not found: {resolved_script_path}")
            self.validation_errors.append(f"Python script not found: {script_path}")
        else:
            # Check if it's a Python file
            if not script_path.endswith('.py'):
                self.validation_warnings.append(
                    f"Script path '{script_path}' does not end with .py extension"
                )
            
            # Check if file is readable (use resolved path, not original)
            is_readable = os.access(resolved_script_path, os.R_OK)
            logger.debug(f"Script readability check: path={resolved_script_path}, readable={is_readable}")
            if not is_readable:
                logger.error(f"Script not readable: {resolved_script_path}")
                self.validation_errors.append(f"Python script is not readable: {script_path}")
    
    def _validate_script_arguments(self, script_arguments: List[str]):
        """Validate script arguments"""
        if not isinstance(script_arguments, list):
            return
        
        if len(script_arguments) > self.MAX_SCRIPT_ARGUMENTS:
            self.validation_errors.append(
                f"Too many script arguments (max {self.MAX_SCRIPT_ARGUMENTS})"
            )
        
        for i, arg in enumerate(script_arguments):
            if not isinstance(arg, str):
                self.validation_errors.append(f"Script argument {i} must be a string")
            elif len(arg) > 1000:  # Reasonable limit for argument length
                self.validation_errors.append(f"Script argument {i} too long (max 1000 characters)")
    
    def _validate_environment_variables(self, env_vars: Dict[str, str]):
        """Validate environment variables"""
        if not isinstance(env_vars, dict):
            return
        
        if len(env_vars) > self.MAX_ENVIRONMENT_VARIABLES:
            self.validation_errors.append(
                f"Too many environment variables (max {self.MAX_ENVIRONMENT_VARIABLES})"
            )
        
        for key, value in env_vars.items():
            if not isinstance(key, str):
                self.validation_errors.append("Environment variable keys must be strings")
            elif not isinstance(value, str):
                self.validation_errors.append(f"Environment variable '{key}' value must be a string")
            elif not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', key):
                self.validation_errors.append(
                    f"Environment variable name '{key}' is invalid (must start with letter/underscore, contain only alphanumeric/underscore)"
                )
            elif len(key) > 100:
                self.validation_errors.append(f"Environment variable name '{key}' too long (max 100 characters)")
            elif len(value) > 10000:  # Reasonable limit for env var value
                self.validation_errors.append(f"Environment variable '{key}' value too long (max 10000 characters)")
    
    def _validate_schedule(self, schedule: Optional[str]):
        """Validate cron-like schedule format"""
        if not schedule:
            return
        
        # Basic cron format validation (5 fields: minute hour day month weekday)
        cron_pattern = r'^(\*|[0-5]?\d) (\*|[01]?\d|2[0-3]) (\*|[012]?\d|3[01]) (\*|[01]?\d) (\*|[0-6])$'
        
        if not re.match(cron_pattern, schedule.strip()):
            self.validation_warnings.append(
                "Schedule format may be invalid. Expected cron format: 'minute hour day month weekday'"
            )
    
    def _check_potential_issues(self, params: Dict[str, Any]):
        """Check for potential issues and add warnings"""
        script_path = params.get("python_script_path")
        
        if script_path:
            # Check for potentially dangerous script paths
            dangerous_paths = ["/etc/", "/bin/", "/sbin/", "/usr/bin/", "/usr/sbin/"]
            if any(script_path.startswith(path) for path in dangerous_paths):
                self.validation_warnings.append(
                    "Script path appears to be in a system directory - ensure this is intentional"
                )
            
            # Check for relative paths that might be problematic
            if not os.path.isabs(script_path):
                self.validation_warnings.append(
                    "Script path is relative - ensure the working directory is correct"
                )
        
        # Check for potentially dangerous environment variables
        env_vars = params.get("environment_variables", {})
        dangerous_env_vars = ["PATH", "LD_LIBRARY_PATH", "PYTHONPATH"]
        for var in dangerous_env_vars:
            if var in env_vars:
                self.validation_warnings.append(
                    f"Environment variable '{var}' is being overridden - ensure this is intentional"
                )
    
    def get_validation_summary(self) -> Dict[str, Any]:
        """
        Get validation summary
        
        Returns:
            Dict with validation summary
        """
        return {
            "is_valid": len(self.validation_errors) == 0,
            "error_count": len(self.validation_errors),
            "warning_count": len(self.validation_warnings),
            "errors": self.validation_errors,
            "warnings": self.validation_warnings,
            "validated_at": datetime.now().isoformat()
        }
    
    @staticmethod
    def sanitize_control_params(params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Sanitize control parameters (remove None values, trim strings)
        
        Args:
            params: Raw parameters
            
        Returns:
            Sanitized parameters
        """
        sanitized = {}
        
        for key, value in params.items():
            if value is not None:
                if isinstance(value, str):
                    sanitized[key] = value.strip()
                else:
                    sanitized[key] = value
        
        return sanitized
    
    @staticmethod
    def get_default_control_params() -> Dict[str, Any]:
        """
        Get default control parameters
        
        Returns:
            Dict with default parameters
        """
        return {
            "control_name": "custom_script",
            "run_env": "DEV",
            "expected_run_date": datetime.now().strftime("%Y-%m-%d"),
            "python_script_path": "",
            "script_arguments": [],
            "environment_variables": {},
            "schedule": None
        }
