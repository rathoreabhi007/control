import argparse
import json
import logging
import sys
from pathlib import Path
from datetime import datetime

# Ensure we can import from project and api package
CURRENT_DIR = Path(__file__).parent
PROJECT_ROOT = CURRENT_DIR.parent
if str(PROJECT_ROOT) not in sys.path:
	sys.path.insert(0, str(PROJECT_ROOT))
if str(CURRENT_DIR) not in sys.path:
	sys.path.insert(0, str(CURRENT_DIR))

from enhanced_etl import (
	# Completeness Control Steps
	reading_config_comp, read_src_comp, read_tgt_comp,
	pre_harmonisation_src_comp, harmonisation_src_comp, enrichment_file_search_src_comp,
	enrichment_src_comp, data_transform_src_comp,
	pre_harmonisation_tgt_comp, harmonisation_tgt_comp, enrichment_file_search_tgt_comp,
	enrichment_tgt_comp, data_transform_tgt_comp,
	combine_data_comp, apply_rules_comp, output_rules_comp, break_rolling_comp,
	# Legacy ETL functions
	extract, transform, load, validate, enrich, aggregate,
	# Workflow Tool ETL functions
	read_csv, read_parquet, read_excel, convert_parquet, filter_data, join_data, aggregate_data, data_output
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("etl_worker")

# Local mapping of step names to functions (mirrors task_manager_v2)
ETL_FUNCTIONS = {
	# Completeness Control Steps
	'reading_config_comp': reading_config_comp,
	'read_src_comp': read_src_comp,
	'read_tgt_comp': read_tgt_comp,
	'pre_harmonisation_src_comp': pre_harmonisation_src_comp,
	'harmonisation_src_comp': harmonisation_src_comp,
	'enrichment_file_search_src_comp': enrichment_file_search_src_comp,
	'enrichment_src_comp': enrichment_src_comp,
	'data_transform_src_comp': data_transform_src_comp,
	'pre_harmonisation_tgt_comp': pre_harmonisation_tgt_comp,
	'harmonisation_tgt_comp': harmonisation_tgt_comp,
	'enrichment_file_search_tgt_comp': enrichment_file_search_tgt_comp,
	'enrichment_tgt_comp': enrichment_tgt_comp,
	'data_transform_tgt_comp': data_transform_tgt_comp,
	'combine_data_comp': combine_data_comp,
	'apply_rules_comp': apply_rules_comp,
	'output_rules_comp': output_rules_comp,
	'break_rolling_comp': break_rolling_comp,

	# Legacy ETL functions
	'extract': extract,
	'transform': transform,
	'load': load,
	'validate': validate,
	'enrich': enrich,
	'aggregate': aggregate,

	# Workflow Tool ETL functions
	'read_csv': read_csv,
	'read_parquet': read_parquet,
	'read_excel': read_excel,
	'convert_parquet': convert_parquet,
	'filter': filter_data,
	'join': join_data,
	'aggregate': aggregate_data,
	'output': data_output,
}


def main():
	parser = argparse.ArgumentParser(description="Run a single ETL step in a subprocess.")
	parser.add_argument("--task-id", required=True)
	parser.add_argument("--step-name", required=True)
	parser.add_argument("--params-file", required=True)
	parser.add_argument("--result-file", required=True)
	args = parser.parse_args()

	logger.info(f"ETL Worker started for task {args.task_id}, step {args.step_name}")
	logger.info(f"   Params file: {args.params_file}")
	logger.info(f"   Result file: {args.result_file}")

	# Load parameters
	with open(args.params_file, "r", encoding="utf-8") as f:
		params = json.load(f)

	# Ensure step_name is present in params for downstream logs/compat
	params["step_name"] = args.step_name

	# Lookup function
	if args.step_name not in ETL_FUNCTIONS:
		error = f"Unknown ETL step: {args.step_name}"
		logger.error(error)
		_save_result(args.result_file, {
			"status": "failed",
			"fail_message": error,
			"step_type": args.step_name,
			"execution_logs": [error],
			"processed_at": datetime.now().isoformat()
		})
		sys.exit(1)

	etl_func = ETL_FUNCTIONS[args.step_name]

	try:
		result = etl_func(params)
		# Ensure a standard shape
		if isinstance(result, dict):
			result.setdefault("status", "success")
			result.setdefault("step_type", args.step_name)
		else:
			result = {
				"status": "success",
				"step_type": args.step_name,
				"output": result
			}
		_save_result(args.result_file, result)
		logger.info("ETL Worker completed successfully")
		sys.exit(0)
	except Exception as e:
		error_msg = f"Error running ETL step {args.step_name}: {e}"
		logger.exception(error_msg)
		_save_result(args.result_file, {
			"status": "failed",
			"fail_message": str(e),
			"step_type": args.step_name,
			"execution_logs": [error_msg],
			"processed_at": datetime.now().isoformat()
		})
		sys.exit(1)


def _save_result(path: str, data: dict):
	Path(path).parent.mkdir(parents=True, exist_ok=True)
	with open(path, "w", encoding="utf-8") as f:
		json.dump(data, f, indent=2, default=str)


if __name__ == "__main__":
	main()


