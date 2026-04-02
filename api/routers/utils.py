"""
Shared utility functions for routers
"""
import numpy as np
import pandas as pd
import logging

logger = logging.getLogger(__name__)


def safe_json_encoder(obj):
    """Custom JSON encoder that handles numpy types and pandas objects"""
    if isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.bool_):
        return bool(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, pd.Series):
        return obj.tolist()
    elif isinstance(obj, pd.DataFrame):
        return obj.to_dict('records')
    elif pd.isna(obj):
        return None
    elif hasattr(obj, 'item'):  # numpy scalar
        return obj.item()
    elif hasattr(obj, 'tolist'):  # numpy array-like
        return obj.tolist()
    else:
        return str(obj)  # Fallback to string conversion


def make_json_safe(data):
    """Recursively convert all numpy types in data structure to JSON-safe types"""
    if isinstance(data, dict):
        return {str(k): make_json_safe(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [make_json_safe(item) for item in data]
    elif isinstance(data, tuple):
        return [make_json_safe(item) for item in data]
    else:
        return safe_json_encoder(data)


def merge_previous_outputs_to_params(params: dict, previous_outputs: dict = None) -> dict:
    """Merge previous outputs into the parameters dictionary with enhanced ETL support"""
    if previous_outputs:
        logger.info(f"Processing {len(previous_outputs)} previous outputs for enhanced ETL system")
        
        # Add previous outputs to params
        params['previous_outputs'] = previous_outputs
        
        # Extract specific data from previous outputs if available
        for step_name, output in previous_outputs.items():
            if isinstance(output, dict):
                # Validate that the previous output is successful
                if output.get('status') == 'failed' or output.get('fail_message'):
                    logger.error(f"Previous output from {step_name} has failed status: {output.get('fail_message', 'Unknown error')}")
                    continue
                
                # Add step-specific data to params
                params[f'{step_name}_status'] = output.get('status', 'success')
                params[f'{step_name}_histogram'] = output.get('histogram_data', [])
                
                # Enhanced ETL: Add file information for CSV file flow
                if output.get('file_info'):
                    params[f'{step_name}_file_info'] = output['file_info']
                    logger.info(f"Added file info from {step_name}: {output['file_info'].get('file_path', 'Unknown path')}")
                
                if output.get('input_file_info'):
                    params[f'{step_name}_input_file_info'] = output['input_file_info']
                    logger.info(f"Added input file info from {step_name}: {output['input_file_info'].get('file_path', 'Unknown path')}")
                
                # Add processing info instead of calculation results
                if 'processing_info' in output:
                    params[f'{step_name}_processing_info'] = output['processing_info']
                    logger.info(f"Added processing info from {step_name}")
                
                logger.info(f"Successfully processed previous output from {step_name}")
            else:
                logger.warning(f"Previous output from {step_name} is not a dictionary: {type(output)}")
    
    return params


# Step name constants
COMPLETENESS_STEPS = {
    # Initial steps
    'reading_config_comp': 'Reading_Config_Comp',
    'read_src_comp': 'Read_SRC_Comp',
    'read_tgt_comp': 'Read_TGT_Comp',
    
    # SRC flow steps
    'pre_harmonisation_src_comp': 'Reading & Pre-Harmonisation_SRC',
    'harmonisation_src_comp': 'Harmonisation_SRC',
    'enrichment_file_search_src_comp': 'Enrichment File Search_SRC',
    'enrichment_src_comp': 'Enrichment_SRC',
    'data_transform_src_comp': 'Data Transform Post Enrichment_SRC',
    
    # TGT flow steps
    'pre_harmonisation_tgt_comp': 'Reading & Pre-Harmonisation_TGT',
    'harmonisation_tgt_comp': 'Harmonisation_TGT',
    'enrichment_file_search_tgt_comp': 'Enrichment File Search_TGT',
    'enrichment_tgt_comp': 'Enrichment_TGT',
    'data_transform_tgt_comp': 'Data Transform Post Enrichment_TGT',
    
    # Combined steps
    'combine_data_comp': 'Combine SRC and TGT Data',
    'apply_rules_comp': 'Apply Rec Rules & Break Explain',
    'output_rules_comp': 'Output Rules',
    'break_rolling_comp': 'BreakRolling Details'
}

WORKFLOW_STEPS = {
    # Data Source Nodes
    'read_csv': 'Read CSV File',
    'read_parquet': 'Read Parquet File',
    'read_excel': 'Read Excel File',
    
    # Data Transform Nodes
    'convert_parquet': 'Convert to Parquet',
    'filter': 'Filter Data',
    'join': 'Join Data',
    'aggregate': 'Aggregate Data',
    'output': 'Data Output'
}

