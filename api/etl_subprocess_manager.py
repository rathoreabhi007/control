import os
import sys
import logging
from pathlib import Path
from typing import Dict, Any, Tuple, Optional

# Reuse the proven subprocess infrastructure from control_execution
# Handle both absolute and relative imports
try:
    from control_execution.subprocess_manager import ControlSubprocessManager
except ImportError:
    # Fallback for relative import if needed
    api_dir = Path(__file__).parent
    if str(api_dir) not in sys.path:
        sys.path.insert(0, str(api_dir))
    from control_execution.subprocess_manager import ControlSubprocessManager

logger = logging.getLogger(__name__)


class ETLSubprocessManager:
	"""Wrapper around ControlSubprocessManager to launch ETL worker subprocesses."""

	def __init__(self, task_id: str, log_directory: Path):
		self.task_id = task_id
		self.log_directory = log_directory
		self._delegate: Optional[ControlSubprocessManager] = None

	def start_etl_task(self, step_name: str, params_file: str, result_file: str, timeout: int = 3600) -> Tuple[int, str]:
		"""
		Start the ETL worker subprocess.
		
		Args:
			step_name: ETL step function name to run
			params_file: Path to JSON file with parameters
			result_file: Path to JSON file where result will be written
			timeout: Subprocess timeout in seconds
		
		Returns:
			(pid, execution_log_file_path)
		"""
		# Resolve worker script path - should be in same directory as this file
		worker_script = str(Path(__file__).parent / "etl_worker.py")
		if not Path(worker_script).exists():
			# Fallback: try relative to project root
			project_root = Path(__file__).parent.parent
			worker_script = str(project_root / "api" / "etl_worker.py")
		if not Path(worker_script).exists():
			raise FileNotFoundError(f"ETL worker script not found. Tried: {Path(__file__).parent / 'etl_worker.py'}")

		# Prepare CLI arguments for worker
		script_args = [
			"--task-id", self.task_id,
			"--step-name", step_name,
			"--params-file", params_file,
			"--result-file", result_file,
		]

		# Ensure we use the same virtual environment and Python executable as FastAPI
		# ControlSubprocessManager inherits env by default and we'll pass through explicitly here too.
		env = os.environ.copy()
		env.update({
			"PYTHONUNBUFFERED": "1",
			# Explicitly propagate common venv/conda vars
			"VIRTUAL_ENV": os.environ.get("VIRTUAL_ENV", ""),
			"CONDA_DEFAULT_ENV": os.environ.get("CONDA_DEFAULT_ENV", ""),
			"CONDA_PREFIX": os.environ.get("CONDA_PREFIX", ""),
			"PYTHONPATH": os.environ.get("PYTHONPATH", ""),
		})

		logger.info(f"Launching ETL worker subprocess for task {self.task_id} using Python: {sys.executable}")
		logger.info(f"   Step: {step_name}")
		logger.info(f"   Params file: {params_file}")
		logger.info(f"   Result file: {result_file}")

		self._delegate = ControlSubprocessManager(self.task_id, self.log_directory)
		pid, exec_log = self._delegate.start_python_script(
			script_path=worker_script,
			script_arguments=script_args,
			environment_variables=env,
			timeout=timeout
		)
		return pid, exec_log

	def is_running(self) -> bool:
		return self._delegate.is_process_running() if self._delegate else False

	def get_status(self) -> Dict[str, Any]:
		return self._delegate.get_process_status() if self._delegate else {"status": "not_started"}

	def stop(self, force: bool = False) -> bool:
		return self._delegate.stop_process(force=force) if self._delegate else False

	def get_log_tail(self, lines: int = 100) -> str:
		return self._delegate.get_log_content(lines=lines) if self._delegate else "No log available"

	def cleanup(self):
		if self._delegate:
			self._delegate.cleanup()


