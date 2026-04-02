"""
Python Script Node Handler

Executes user-defined Python functions with multiple DataFrame inputs
and a single DataFrame output.
"""

from typing import Dict, Any, List
from pathlib import Path
import polars as pl
import logging

from .base import BaseNodeHandler

logger = logging.getLogger(__name__)


class PythonScriptHandler(BaseNodeHandler):
    """Handler for executing custom Python scripts"""

    node_type = "python_script"
    required_params = ["script"]
    requires_input = True
    min_inputs = 1
    max_inputs = 5

    async def execute(
        self,
        params: Dict[str, Any],
        inputs: List[pl.LazyFrame],
        session_path: Path,
        node_id: str
    ) -> pl.LazyFrame:
        """
        Execute a user-defined Python function

        Parameters:
            script: Python code containing a function definition
            function_name: Name of the function to call (default: 'process')

        The function receives Polars DataFrames as positional arguments (df1, df2, ...)
        and must return a single Polars or Pandas DataFrame.
        """
        script = self.get_param(params, "script", "")
        function_name = self.get_param(params, "function_name", "process")

        if not inputs:
            raise ValueError("Python Script node requires at least one input")

        if not script.strip():
            raise ValueError("Python script is empty")

        self.log_execution(
            node_id,
            f"Executing Python script: function={function_name}, "
            f"inputs={len(inputs)}"
        )

        try:
            # Collect all input LazyFrames to DataFrames
            input_dfs = []
            for i, lf in enumerate(inputs):
                df = lf.collect()
                input_dfs.append(df)
                self.log_execution(
                    node_id,
                    f"Input df{i + 1}: {df.height} rows, {len(df.columns)} columns"
                )

            # Build execution namespace with allowed libraries
            exec_namespace = {
                "__builtins__": __builtins__,
            }

            # Import common libraries into namespace
            try:
                import numpy as np
                exec_namespace["np"] = np
                exec_namespace["numpy"] = np
            except ImportError:
                pass

            try:
                import pandas as pd
                exec_namespace["pd"] = pd
                exec_namespace["pandas"] = pd
            except ImportError:
                pass

            exec_namespace["pl"] = pl
            exec_namespace["polars"] = pl

            # Add input DataFrames to namespace
            for i, df in enumerate(input_dfs):
                exec_namespace[f"df{i + 1}"] = df

            # Execute the user script to define functions
            exec(script, exec_namespace)

            # Get the target function
            if function_name not in exec_namespace:
                raise ValueError(
                    f"Function '{function_name}' not found in script. "
                    f"Make sure to define: def {function_name}(df1, ...):"
                )

            func = exec_namespace[function_name]
            if not callable(func):
                raise ValueError(f"'{function_name}' is not a callable function")

            # Call the function with input DataFrames
            result = func(*input_dfs)

            # Convert result to Polars DataFrame if needed
            if result is None:
                raise ValueError(
                    f"Function '{function_name}' returned None. "
                    "It must return a DataFrame."
                )

            if isinstance(result, pl.LazyFrame):
                result = result.collect()
            elif isinstance(result, pl.DataFrame):
                pass  # Already a Polars DataFrame
            else:
                # Try converting from Pandas
                try:
                    import pandas as pd
                    if isinstance(result, pd.DataFrame):
                        result = pl.from_pandas(result)
                    else:
                        raise ValueError(
                            f"Function '{function_name}' returned "
                            f"{type(result).__name__}, expected a DataFrame"
                        )
                except ImportError:
                    raise ValueError(
                        f"Function '{function_name}' returned "
                        f"{type(result).__name__}, expected a Polars DataFrame"
                    )

            self.log_execution(
                node_id,
                f"Script result: {result.height} rows, "
                f"{len(result.columns)} columns"
            )

            return result.lazy()

        except SyntaxError as e:
            self.log_execution(
                node_id,
                f"Syntax error in Python script: {e}",
                "error"
            )
            raise ValueError(f"Syntax error in script: {e}")
        except Exception as e:
            self.log_execution(
                node_id, f"Error executing Python script: {e}", "error"
            )
            raise
