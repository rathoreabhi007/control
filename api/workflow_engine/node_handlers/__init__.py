"""
Node Handlers for Workflow Execution

Each handler implements a specific data operation type.
All handlers follow a common interface for the executor.
"""

from .base import BaseNodeHandler
from .read_csv import ReadCSVHandler
from .read_parquet import ReadParquetHandler
from .read_excel import ReadExcelHandler
from .filter_data import FilterDataHandler
from .join_data import JoinDataHandler
from .aggregate import AggregateHandler
from .convert_parquet import ConvertParquetHandler
from .output import OutputHandler
from .pivot_table import PivotTableHandler
from .save_csv import SaveCSVHandler
from .save_excel import SaveExcelHandler
from .python_script import PythonScriptHandler

# Registry mapping node types to handlers
NODE_HANDLERS = {
    "read_csv": ReadCSVHandler,
    "read_parquet": ReadParquetHandler,
    "read_excel": ReadExcelHandler,
    "filter": FilterDataHandler,
    "join": JoinDataHandler,
    "aggregate": AggregateHandler,
    "convert_parquet": ConvertParquetHandler,
    "output": OutputHandler,
    "pivot_table": PivotTableHandler,
    "save_csv": SaveCSVHandler,
    "save_excel": SaveExcelHandler,
    "python_script": PythonScriptHandler,
}


def get_handler(node_type: str) -> BaseNodeHandler:
    """
    Get handler instance for a node type

    Args:
        node_type: Type of the node (e.g., 'read_csv', 'filter')

    Returns:
        Handler instance

    Raises:
        ValueError: If node type is not supported
    """
    handler_class = NODE_HANDLERS.get(node_type)
    if handler_class is None:
        raise ValueError(f"Unsupported node type: {node_type}")
    return handler_class()


__all__ = [
    'BaseNodeHandler',
    'ReadCSVHandler',
    'ReadParquetHandler',
    'ReadExcelHandler',
    'FilterDataHandler',
    'JoinDataHandler',
    'AggregateHandler',
    'ConvertParquetHandler',
    'OutputHandler',
    'PivotTableHandler',
    'SaveCSVHandler',
    'SaveExcelHandler',
    'PythonScriptHandler',
    'get_handler',
    'NODE_HANDLERS',
]
