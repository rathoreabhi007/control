import random
import string
import polars as pl
import pandas as pd
import numpy as np
from datetime import datetime
import logging
import os
import json
from pathlib import Path
import time

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create data directory if it doesn't exist
DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)

# Hardcoded keys for file paths between nodes - NOW USING PARQUET!
FILE_KEYS = {
    'reading_config_comp': 'config_data.parquet',
    'read_src_comp': 'source_data.parquet',
    'read_tgt_comp': 'target_data.parquet',
    'pre_harmonisation_src_comp': 'pre_harmonisation_src.parquet',
    'harmonisation_src_comp': 'harmonisation_src.parquet',
    'enrichment_file_search_src_comp': 'enrichment_search_src.parquet',
    'enrichment_src_comp': 'enrichment_src.parquet',
    'data_transform_src_comp': 'transform_src.parquet',
    'pre_harmonisation_tgt_comp': 'pre_harmonisation_tgt.parquet',
    'harmonisation_tgt_comp': 'harmonisation_tgt.parquet',
    'enrichment_file_search_tgt_comp': 'enrichment_search_tgt.parquet',
    'enrichment_tgt_comp': 'enrichment_tgt.parquet',
    'data_transform_tgt_comp': 'transform_tgt.parquet',
    'combine_data_comp': 'combined_data.parquet',
    'apply_rules_comp': 'rules_applied.parquet',
    'output_rules_comp': 'output_rules.parquet',
    'break_rolling_comp': 'break_rolling.parquet',
    'extract': 'extract_data.parquet',
    'transform': 'transform_data.parquet',
    'load': 'load_data.parquet',
    'validate': 'validate_data.parquet',
    'enrich': 'enrich_data.parquet',
    'aggregate': 'aggregate_data.parquet',
    'read_csv': 'read_csv_data.parquet',
    'read_parquet': 'read_parquet_data.parquet',
    'read_excel': 'read_excel_data.parquet',
    'convert_parquet': 'convert_parquet_data.parquet',
    'filter': 'filter_data.parquet',
    'join': 'join_data.parquet',
    'output': 'output_data.parquet'
}

def error_handler(func):
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            logger.error(f"Error in {func.__name__}: {e}")
            return {"status": "failed", "fail_message": str(e)}
    return wrapper

def generate_test_data(num_cols=20, num_rows=100, step_name="generic"):
    """Generate test data with specified number of columns and rows - UNIQUE PER NODE"""
    logger.info(f"Generating UNIQUE test data: {num_cols} columns x {num_rows} rows for {step_name}")
    
    # Create node-specific data patterns
    node_patterns = {
        'reading_config_comp': {
            'prefix': 'CONFIG',
            'color': 'BLUE',
            'data_type': 'configuration',
            'special_cols': ['config_id', 'config_name', 'config_value', 'config_status']
        },
        'read_src_comp': {
            'prefix': 'SRC',
            'color': 'GREEN', 
            'data_type': 'source_data',
            'special_cols': ['src_id', 'src_name', 'src_type', 'src_status']
        },
        'read_tgt_comp': {
            'prefix': 'TGT',
            'color': 'RED',
            'data_type': 'target_data', 
            'special_cols': ['tgt_id', 'tgt_name', 'tgt_type', 'tgt_status']
        },
        'pre_harmonisation_src_comp': {
            'prefix': 'PRE_SRC',
            'color': 'PURPLE',
            'data_type': 'pre_harmonized_src',
            'special_cols': ['pre_src_id', 'pre_src_name', 'harmonization_status', 'quality_score']
        },
        'harmonisation_src_comp': {
            'prefix': 'HARM_SRC',
            'color': 'ORANGE',
            'data_type': 'harmonized_src',
            'special_cols': ['harm_src_id', 'harm_src_name', 'harmonization_level', 'completeness']
        },
        'enrichment_file_search_src_comp': {
            'prefix': 'ENRICH_SEARCH_SRC',
            'color': 'CYAN',
            'data_type': 'enrichment_search_src',
            'special_cols': ['search_id', 'search_pattern', 'files_found', 'search_status']
        },
        'enrichment_src_comp': {
            'prefix': 'ENRICH_SRC',
            'color': 'MAGENTA',
            'data_type': 'enriched_src',
            'special_cols': ['enrich_id', 'enrich_type', 'enrichment_score', 'enrichment_status']
        },
        'data_transform_src_comp': {
            'prefix': 'TRANSFORM_SRC',
            'color': 'YELLOW',
            'data_type': 'transformed_src',
            'special_cols': ['transform_id', 'transform_type', 'transformation_rules', 'transform_status']
        },
        'pre_harmonisation_tgt_comp': {
            'prefix': 'PRE_TGT',
            'color': 'PINK',
            'data_type': 'pre_harmonized_tgt',
            'special_cols': ['pre_tgt_id', 'pre_tgt_name', 'harmonization_status', 'quality_score']
        },
        'harmonisation_tgt_comp': {
            'prefix': 'HARM_TGT',
            'color': 'BROWN',
            'data_type': 'harmonized_tgt',
            'special_cols': ['harm_tgt_id', 'harm_tgt_name', 'harmonization_level', 'completeness']
        },
        'enrichment_file_search_tgt_comp': {
            'prefix': 'ENRICH_SEARCH_TGT',
            'color': 'LIME',
            'data_type': 'enrichment_search_tgt',
            'special_cols': ['search_id', 'search_pattern', 'files_found', 'search_status']
        },
        'enrichment_tgt_comp': {
            'prefix': 'ENRICH_TGT',
            'color': 'INDIGO',
            'data_type': 'enriched_tgt',
            'special_cols': ['enrich_id', 'enrich_type', 'enrichment_score', 'enrichment_status']
        },
        'data_transform_tgt_comp': {
            'prefix': 'TRANSFORM_TGT',
            'color': 'TEAL',
            'data_type': 'transformed_tgt',
            'special_cols': ['transform_id', 'transform_type', 'transformation_rules', 'transform_status']
        },
        'combine_data_comp': {
            'prefix': 'COMBINED',
            'color': 'GOLD',
            'data_type': 'combined_data',
            'special_cols': ['combined_id', 'src_contribution', 'tgt_contribution', 'combination_status']
        },
        'apply_rules_comp': {
            'prefix': 'RULES',
            'color': 'SILVER',
            'data_type': 'rules_applied',
            'special_cols': ['rule_id', 'rule_name', 'rule_result', 'rule_status']
        },
        'output_rules_comp': {
            'prefix': 'OUTPUT',
            'color': 'PLATINUM',
            'data_type': 'output_rules',
            'special_cols': ['output_id', 'output_type', 'output_quality', 'output_status']
        },
        'break_rolling_comp': {
            'prefix': 'BREAK_ROLLING',
            'color': 'DIAMOND',
            'data_type': 'break_rolling',
            'special_cols': ['break_id', 'rolling_period', 'break_type', 'break_status']
        }
    }
    
    # Get node-specific pattern or use default
    pattern = node_patterns.get(step_name, {
        'prefix': 'GENERIC',
        'color': 'DEFAULT',
        'data_type': 'generic_data',
        'special_cols': ['id', 'name', 'type', 'status']
    })
    
    # Create node-specific headers
    headers = []
    special_cols = pattern['special_cols']
    
    # Add special columns first
    for i, col in enumerate(special_cols):
        headers.append(f"{pattern['prefix']}_{col}")
    
    # Add remaining generic columns
    remaining_cols = num_cols - len(special_cols)
    for i in range(remaining_cols):
        headers.append(f"{pattern['prefix']}_col_{i+1}")
    
    # Randomly choose 30% of columns to be text columns
    text_col_indices = set(random.sample(range(num_cols), k=max(1, int(num_cols * 0.3))))
    
    def random_text(length, prefix=""):
        """Generate random text with node-specific prefix."""
        base_text = ''.join(random.choices(string.ascii_letters + string.digits + ' ', k=length-2))
        return f"{prefix}_{base_text}" if prefix else base_text

    table = []
    for row_idx in range(num_rows):
        row = []
        for col_idx in range(num_cols):
            if col_idx in text_col_indices:
                # Generate node-specific text data
                if col_idx < len(special_cols):
                    # Special column - use meaningful data
                    col_name = special_cols[col_idx]
                    if 'id' in col_name:
                        row.append(f"{pattern['prefix']}_ID_{row_idx+1:04d}")
                    elif 'name' in col_name:
                        row.append(f"{pattern['prefix']}_NAME_{row_idx+1}")
                    elif 'status' in col_name:
                        statuses = ['ACTIVE', 'PENDING', 'COMPLETED', 'FAILED', 'PROCESSING']
                        row.append(random.choice(statuses))
                    elif 'type' in col_name:
                        types = ['TYPE_A', 'TYPE_B', 'TYPE_C', 'TYPE_D', 'TYPE_E']
                        row.append(random.choice(types))
                    else:
                        row.append(random_text(random.randint(5, 15), pattern['prefix']))
                else:
                    # Generic column
                    row.append(random_text(random.randint(5, 20), pattern['prefix']))
            else:
                # Numeric data with node-specific ranges
                if col_idx < len(special_cols):
                    # Special column - use meaningful numeric data
                    col_name = special_cols[col_idx]
                    if 'score' in col_name or 'quality' in col_name:
                        row.append(round(random.uniform(0.0, 1.0), 3))
                    elif 'level' in col_name:
                        row.append(random.randint(1, 10))
                    else:
                        row.append(random.randint(1, 1000))
                else:
                    # Generic numeric column with node-specific base
                    base_value = hash(pattern['prefix']) % 1000
                    row.append(base_value + random.randint(1, 1000))
        table.append(row)
    
    logger.info(f"Generated {pattern['color']} themed data for {step_name} with prefix '{pattern['prefix']}'")
    return headers, table

def create_parquet_file(headers, table, filename, step_name):
    """Create a Parquet file with the given data using Polars"""
    file_path = DATA_DIR / filename
    time.sleep(30)
    try:
        # Create Polars DataFrame and save to Parquet
        df = pl.DataFrame({headers[i]: [row[i] for row in table] for i in range(len(headers))})
        df.write_parquet(file_path, compression='snappy')
        
        logger.info(f"Created Parquet file: {file_path} with {len(df)} rows and {len(df.columns)} columns")
        
        # Get file size
        file_size = file_path.stat().st_size
        logger.info(f"File size: {file_size} bytes ({file_size / (1024*1024):.2f} MB)")
        
        return {
            'file_path': str(file_path),
            'file_size_bytes': file_size,
            'file_size_mb': round(file_size / (1024*1024), 2),
            'rows': len(df),
            'columns': len(df.columns),
            'compression': 'snappy',
            'format': 'parquet',
            'created_at': datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error creating Parquet file {file_path}: {e}")
        raise

def read_parquet_file(file_path, max_rows=1000):
    """Read a Parquet file and return data using Polars"""
    try:
        # Check both .parquet and .csv extensions for backward compatibility
        parquet_path = file_path.replace('.csv', '.parquet')
        
        if not os.path.exists(parquet_path) and not os.path.exists(file_path):
            logger.warning(f"File not found: {file_path} or {parquet_path}")
            return None, None, None
        
        # Use parquet file if it exists
        actual_path = parquet_path if os.path.exists(parquet_path) else file_path
        
        # Read Parquet with Polars
        df = pl.read_parquet(actual_path)
        
        # Limit rows for testing
        if len(df) > max_rows:
            df = df.head(max_rows)
            logger.info(f"Limited Parquet to {max_rows} rows for testing")
        
        headers = df.columns
        table = df.to_dicts()  # Convert to list of dicts, then we'll convert to list of lists
        table = [[row[col] for col in headers] for row in table]
        
        logger.info(f"Read Parquet file: {actual_path} with {len(df)} rows and {len(df.columns)} columns")
        
        return headers, table, {
            'file_path': actual_path,
            'rows': len(df),
            'columns': len(df.columns),
            'format': 'parquet',
            'read_at': datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error reading Parquet file {file_path}: {e}")
        return None, None, None

def process_generic_node_with_parquet(params, step_name):
    """Enhanced generic node processor that creates Parquet files with proper failed dependency validation"""
    start_time = datetime.now()
    logger.info(f"Starting {step_name} with Parquet file creation")
    
    # Validate previous outputs for failed status
    if 'previous_outputs' in params:
        for prev_step, output in params['previous_outputs'].items():
            if isinstance(output, dict):
                if output.get('status') == 'failed' or output.get('fail_message'):
                    error_msg = f"Cannot run {step_name}: dependency {prev_step} has failed - {output.get('fail_message', 'Unknown error')}"
                    logger.error(error_msg)
                    return {
                        "status": "failed",
                        "fail_message": error_msg,
                        "step_type": step_name,
                        "execution_logs": [error_msg],
                        "run_parameters": params
                    }
    
    # Get input file path from previous outputs if available
    input_file_path = None
    if 'previous_outputs' in params:
        for prev_step, output in params['previous_outputs'].items():
            if isinstance(output, dict) and 'file_info' in output:
                input_file_path = output['file_info']['file_path']
                logger.info(f"Found input file from {prev_step}: {input_file_path}")
                break
    
    # Generate or read data
    if input_file_path and os.path.exists(input_file_path):
        # Read from previous Parquet file
        logger.info(f"Reading from previous file: {input_file_path}")
        headers, table, file_info = read_parquet_file(input_file_path, max_rows=1000)
        if headers is None:
            # Fallback to generating new data
            headers, table = generate_test_data(20, 1000, step_name)
            file_info = None
    else:
        # Generate new test data
        headers, table = generate_test_data(20, 1000, step_name)
        file_info = None
    
    # Create Parquet file for this step
    output_filename = FILE_KEYS.get(step_name, f"{step_name}_data.parquet")
    parquet_info = create_parquet_file(headers, table, output_filename, step_name)
    
    # Generate histogram data - First 50 unique values for each column
    histogram_data = []
    for col_idx, header in enumerate(headers):
        try:
            column_data = [row[col_idx] for row in table]
            
            # Get first 50 unique values (preserving insertion order)
            seen = set()
            unique_values = []
            for value in column_data:
                if value not in seen and len(unique_values) < 50:
                    seen.add(value)
                    unique_values.append(str(value))
            
            # Calculate top 5 values with counts
            from collections import Counter
            value_counts = Counter(column_data)
            top_5_values = [
                {'value': str(value), 'count': count} 
                for value, count in value_counts.most_common(5)
            ]
            
            # Determine data type
            if isinstance(column_data[0], str):
                data_type = 'text'
            elif isinstance(column_data[0], (int, float)):
                data_type = 'numeric'
            else:
                data_type = 'unknown'
            
            histogram_data.append({
                'column_name': header,
                'data_type': data_type,
                'total_values': len(column_data),
                'unique_count': len(seen),
                'unique_values': unique_values,  # First 50 unique values as list
                'top_values': top_5_values  # Top 5 values with counts
            })
        except Exception as e:
            logger.warning(f"Error processing histogram data for column {header}: {str(e)}")
            histogram_data.append({
                'column_name': header,
                'data_type': 'unknown',
                'total_values': len(table),
                'unique_count': 0,
                'unique_values': [],
                'top_values': [],
                'error': str(e)
            })
    
    processing_time = (datetime.now() - start_time).total_seconds()
    logger.info(f"{step_name} processing completed in {processing_time:.2f} seconds")
    
    return {
        "status": "success",
        "run_parameters": params,
        "step_type": step_name,
        "execution_logs": [
            f"Starting {step_name} processing at {datetime.now().isoformat()}",
            f"Processing with environment: {params.get('runEnv', 'unknown')}",
            f"Generated/Read table with {len(headers)} columns and {len(table)} rows",
            f"Created Parquet file: {parquet_info['file_path']} ({parquet_info['file_size_mb']} MB)",
            f"Processing completed successfully in {processing_time:.2f} seconds"
        ],
        "processing_info": {
            "processed_at": datetime.now().isoformat(),
            "environment": params.get('runEnv', 'unknown'),
            "table_size": f"{len(headers)}x{len(table)}",
            "total_rows_generated": len(table),
            "processing_time_seconds": processing_time,
            "parquet_file_created": parquet_info['file_path'],
            "compression": "snappy",
            "format": "parquet"
        },
        'histogram_data': histogram_data,
        'count': str(len(table)),
        'fail_message': None,
        'file_info': parquet_info,
        'input_file_info': file_info
    }

# Completeness Control Step Functions

@error_handler
def reading_config_comp(params):
    """Reading Configuration Component"""
    logger.info(f"Starting Reading Config Component")
    
    result = process_generic_node_with_parquet(params, 'reading_config_comp')
    
    # Check if the result indicates a failed dependency
    if result.get('status') == 'failed':
        return result
    
    result['config_details'] = {
        'config_files_processed': random.randint(1, 5),
        'config_validation_passed': True,
        'config_quality_score': random.uniform(0.95, 0.99),
        'config_timestamp': datetime.now().isoformat()
    }
    
    return result

@error_handler
def read_src_comp(params):
    """Read Source Component"""
    logger.info(f"Starting Read Source Component")
    
    result = process_generic_node_with_parquet(params, 'read_src_comp')
    
    # Check if the result indicates a failed dependency
    if result.get('status') == 'failed':
        return result
    
    result['src_details'] = {
        'source_files_read': random.randint(10, 50),
        'source_data_quality': random.uniform(0.85, 0.95),
        'source_records_processed': int(result['count']),
        'source_timestamp': datetime.now().isoformat()
    }
    
    return result

@error_handler
def read_tgt_comp(params):
    """Read Target Component"""
    logger.info(f"Starting Read Target Component")
    
    result = process_generic_node_with_parquet(params, 'read_tgt_comp')
    
    # Check if the result indicates a failed dependency
    if result.get('status') == 'failed':
        return result
    
    result['tgt_details'] = {
        'target_files_read': random.randint(5, 20),
        'target_data_quality': random.uniform(0.90, 0.98),
        'target_records_processed': int(result['count']),
        'target_timestamp': datetime.now().isoformat()
    }
    
    return result

@error_handler
def pre_harmonisation_src_comp(params):
    """Pre-Harmonisation Source Component"""
    logger.info(f"Starting Pre-Harmonisation Source Component")
    result = process_generic_node_with_parquet(params, 'pre_harmonisation_src_comp')
    result['pre_harmonisation_src_details'] = {
        'pre_harmonisation_rules_applied': random.randint(5, 15),
        'data_cleansing_performed': True,
        'harmonisation_quality_score': random.uniform(0.88, 0.96),
        'pre_harmonisation_timestamp': datetime.now().isoformat()
    }
    
    return result

@error_handler
def harmonisation_src_comp(params):
    """Harmonisation Source Component"""
    logger.info(f"Starting Harmonisation Source Component")
    
    result = process_generic_node_with_parquet(params, 'harmonisation_src_comp')
    result['harmonisation_src_details'] = {
        'harmonisation_rules_applied': random.randint(8, 20),
        'data_standardization_performed': True,
        'harmonisation_quality_score': random.uniform(0.90, 0.97),
        'harmonisation_timestamp': datetime.now().isoformat()
    }
    
    return result

@error_handler
def enrichment_file_search_src_comp(params):
    """Enrichment File Search Source Component"""
    logger.info(f"Starting Enrichment File Search Source Component")
    
    result = process_generic_node_with_parquet(params, 'enrichment_file_search_src_comp')
    result['enrichment_file_search_src_details'] = {
        'enrichment_files_found': random.randint(3, 12),
        'enrichment_file_quality': random.uniform(0.85, 0.95),
        'enrichment_search_timestamp': datetime.now().isoformat()
    }
    
    return result

@error_handler
def enrichment_src_comp(params):
    """Enrichment Source Component"""
    logger.info(f"Starting Enrichment Source Component")
    
    result = process_generic_node_with_parquet(params, 'enrichment_src_comp')
    result['enrichment_src_details'] = {
        'enrichment_sources_used': random.randint(2, 8),
        'enrichment_fields_added': random.randint(5, 15),
        'enrichment_quality_score': random.uniform(0.85, 0.95),
        'enrichment_timestamp': datetime.now().isoformat()
    }
    
    return result

@error_handler
def data_transform_src_comp(params):
    """Data Transform Source Component"""
    logger.info(f"Starting Data Transform Source Component")
    
    result = process_generic_node_with_parquet(params, 'data_transform_src_comp')
    result['data_transform_src_details'] = {
        'transformation_rules_applied': random.randint(10, 25),
        'data_transformation_quality': random.uniform(0.88, 0.96),
        'transformation_timestamp': datetime.now().isoformat()
    }
    
    return result

@error_handler
def pre_harmonisation_tgt_comp(params):
    """Pre-Harmonisation Target Component"""
    logger.info(f"Starting Pre-Harmonisation Target Component")
    
    result = process_generic_node_with_parquet(params, 'pre_harmonisation_tgt_comp')
    result['pre_harmonisation_tgt_details'] = {
        'pre_harmonisation_rules_applied': random.randint(5, 15),
        'data_cleansing_performed': True,
        'harmonisation_quality_score': random.uniform(0.88, 0.96),
        'pre_harmonisation_timestamp': datetime.now().isoformat()
    }
    
    return result

@error_handler
def harmonisation_tgt_comp(params):
    """Harmonisation Target Component"""
    logger.info(f"Starting Harmonisation Target Component")
    
    result = process_generic_node_with_parquet(params, 'harmonisation_tgt_comp')
    result['harmonisation_tgt_details'] = {
        'harmonisation_rules_applied': random.randint(8, 20),
        'data_standardization_performed': True,
        'harmonisation_quality_score': random.uniform(0.90, 0.97),
        'harmonisation_timestamp': datetime.now().isoformat()
    }
    
    return result

@error_handler
def enrichment_file_search_tgt_comp(params):
    """Enrichment File Search Target Component"""
    logger.info(f"Starting Enrichment File Search Target Component")
    
    result = process_generic_node_with_parquet(params, 'enrichment_file_search_tgt_comp')
    result['enrichment_file_search_tgt_details'] = {
        'enrichment_files_found': random.randint(3, 12),
        'enrichment_file_quality': random.uniform(0.85, 0.95),
        'enrichment_search_timestamp': datetime.now().isoformat()
    }
    
    return result

@error_handler
def enrichment_tgt_comp(params):
    """Enrichment Target Component"""
    logger.info(f"Starting Enrichment Target Component")
    
    result = process_generic_node_with_parquet(params, 'enrichment_tgt_comp')
    result['enrichment_tgt_details'] = {
        'enrichment_sources_used': random.randint(2, 8),
        'enrichment_fields_added': random.randint(5, 15),
        'enrichment_quality_score': random.uniform(0.85, 0.95),
        'enrichment_timestamp': datetime.now().isoformat()
    }
    
    return result

@error_handler
def data_transform_tgt_comp(params):
    """Data Transform Target Component"""
    logger.info(f"Starting Data Transform Target Component")
    
    result = process_generic_node_with_parquet(params, 'data_transform_tgt_comp')
    result['data_transform_tgt_details'] = {
        'transformation_rules_applied': random.randint(10, 25),
        'data_transformation_quality': random.uniform(0.88, 0.96),
        'transformation_timestamp': datetime.now().isoformat()
    }
    
    return result

@error_handler
def combine_data_comp(params):
    """Combine Data Component"""
    logger.info(f"Starting Combine Data Component")
    
    result = process_generic_node_with_parquet(params, 'combine_data_comp')
    result['combine_data_details'] = {
        'src_data_combined': True,
        'tgt_data_combined': True,
        'combination_strategy': 'inner_join',
        'combination_quality_score': random.uniform(0.90, 0.98),
        'combination_timestamp': datetime.now().isoformat()
    }
    
    return result

@error_handler
def apply_rules_comp(params):
    """Apply Rules Component"""
    logger.info(f"Starting Apply Rules Component")
    
    result = process_generic_node_with_parquet(params, 'apply_rules_comp')
    result['apply_rules_details'] = {
        'business_rules_applied': random.randint(15, 30),
        'rule_validation_passed': True,
        'rules_quality_score': random.uniform(0.92, 0.99),
        'rules_timestamp': datetime.now().isoformat()
    }
    
    return result

@error_handler
def output_rules_comp(params):
    """Output Rules Component"""
    logger.info(f"Starting Output Rules Component")
    
    result = process_generic_node_with_parquet(params, 'output_rules_comp')
    result['output_rules_details'] = {
        'output_rules_generated': random.randint(5, 15),
        'output_validation_passed': True,
        'output_quality_score': random.uniform(0.94, 0.99),
        'output_timestamp': datetime.now().isoformat()
    }
    
    return result

@error_handler
def break_rolling_comp(params):
    """Break Rolling Component"""
    logger.info(f"Starting Break Rolling Component")
    
    result = process_generic_node_with_parquet(params, 'break_rolling_comp')
    result['break_rolling_details'] = {
        'rolling_windows_processed': random.randint(3, 10),
        'break_analysis_completed': True,
        'rolling_quality_score': random.uniform(0.89, 0.97),
        'rolling_timestamp': datetime.now().isoformat()
    }
    
    return result

# Legacy ETL functions for backward compatibility
@error_handler
def extract(params):
    """Enhanced extract function with CSV file creation"""
    logger.info(f"Starting EXTRACT step with CSV file creation")
    
    result = process_generic_node_with_parquet(params, 'extract')
    result['extract_details'] = {
        'source_type': params.get('source_type', 'database'),
        'extraction_method': params.get('extraction_method', 'full_load'),
        'data_quality_score': random.uniform(0.85, 0.99),
        'records_processed': int(result['count'])
    }
    
    return result

@error_handler
def transform(params):
    """Enhanced transform function with CSV file creation"""
    logger.info(f"Starting TRANSFORM step with CSV file creation")
    
    result = process_generic_node_with_parquet(params, 'transform')
    result['transform_details'] = {
        'transformation_rules_applied': random.randint(5, 20),
        'data_cleansing_performed': True,
        'data_validation_passed': True,
        'transformation_quality_score': random.uniform(0.90, 0.99),
        'records_transformed': int(result['count'])
    }
    
    return result

@error_handler
def load(params):
    """Enhanced load function with CSV file creation"""
    logger.info(f"Starting LOAD step with CSV file creation")
    
    result = process_generic_node_with_parquet(params, 'load')
    result['load_details'] = {
        'target_system': params.get('target_system', 'data_warehouse'),
        'load_strategy': params.get('load_strategy', 'full_refresh'),
        'load_performance_score': random.uniform(0.85, 0.99),
        'records_loaded': int(result['count']),
        'load_timestamp': datetime.now().isoformat()
    }
    
    return result

# Additional ETL functions
@error_handler
def validate(params):
    """Data validation step with CSV file creation"""
    logger.info(f"Starting VALIDATE step with CSV file creation")
    
    result = process_generic_node_with_parquet(params, 'validate')
    result['validation_details'] = {
        'validation_rules_applied': random.randint(10, 30),
        'validation_passed': True,
        'data_quality_score': random.uniform(0.90, 0.99),
        'validation_timestamp': datetime.now().isoformat()
    }
    
    return result

@error_handler
def enrich(params):
    """Data enrichment step with CSV file creation"""
    logger.info(f"Starting ENRICH step with CSV file creation")
    
    result = process_generic_node_with_parquet(params, 'enrich')
    result['enrichment_details'] = {
        'enrichment_sources_used': random.randint(2, 8),
        'enrichment_fields_added': random.randint(5, 15),
        'enrichment_quality_score': random.uniform(0.85, 0.95),
        'enrichment_timestamp': datetime.now().isoformat()
    }
    
    return result

@error_handler
def aggregate(params):
    """Data aggregation step with CSV file creation"""
    logger.info(f"Starting AGGREGATE step with CSV file creation")
    
    result = process_generic_node_with_parquet(params, 'aggregate')
    result['aggregation_details'] = {
        'aggregation_functions_applied': random.randint(3, 10),
        'grouping_dimensions': random.randint(2, 6),
        'aggregation_quality_score': random.uniform(0.90, 0.99),
        'aggregation_timestamp': datetime.now().isoformat()
    }
    
    return result

# Workflow Tool ETL Functions
@error_handler
def read_csv(params):
    """Read CSV file operation with enhanced functionality"""
    logger.info(f"Starting READ_CSV operation with enhanced functionality")
    
    # Extract parameters
    file_path = params.get('file_path', '/path/to/file.csv')
    delimiter = params.get('delimiter', ',')
    encoding = params.get('encoding', 'utf-8')
    header = params.get('header', True)
    skip_rows = params.get('skip_rows', 0)
    
    logger.info(f"Reading CSV: {file_path}, delimiter: {delimiter}, encoding: {encoding}")
    
    result = process_generic_node_with_parquet(params, 'read_csv')
    result['file_details'] = {
        'file_path': file_path,
        'delimiter': delimiter,
        'encoding': encoding,
        'has_header': header,
        'skip_rows': skip_rows,
        'file_size_mb': random.uniform(1.5, 15.0),
        'read_timestamp': datetime.now().isoformat()
    }
    
    return result

@error_handler
def read_parquet(params):
    """Read Parquet file operation with enhanced functionality"""
    logger.info(f"Starting READ_PARQUET operation with enhanced functionality")
    
    # Extract parameters
    file_path = params.get('file_path', '/path/to/file.parquet')
    columns = params.get('columns', '')
    filters = params.get('filters', '')
    
    logger.info(f"Reading Parquet: {file_path}")
    
    result = process_generic_node_with_parquet(params, 'read_parquet')
    result['file_details'] = {
        'file_path': file_path,
        'columns': columns.split(',') if columns else [],
        'filters': filters,
        'file_size_mb': random.uniform(0.5, 8.0),
        'compression': 'snappy',
        'read_timestamp': datetime.now().isoformat()
    }
    
    return result

@error_handler
def read_excel(params):
    """Read Excel file operation with enhanced functionality"""
    logger.info(f"Starting READ_EXCEL operation with enhanced functionality")
    
    # Extract parameters
    file_path = params.get('file_path', '/path/to/file.xlsx')
    sheet_name = params.get('sheet_name', 'Sheet1')
    header_row = params.get('header_row', 0)
    skip_rows = params.get('skip_rows', 0)
    
    logger.info(f"Reading Excel: {file_path}, sheet: {sheet_name}")
    
    result = process_generic_node_with_parquet(params, 'read_excel')
    result['file_details'] = {
        'file_path': file_path,
        'sheet_name': sheet_name,
        'header_row': header_row,
        'skip_rows': skip_rows,
        'file_size_mb': random.uniform(2.0, 20.0),
        'read_timestamp': datetime.now().isoformat()
    }
    
    return result

@error_handler
def convert_parquet(params):
    """Convert data to Parquet format with enhanced functionality"""
    logger.info(f"Starting CONVERT_PARQUET operation with enhanced functionality")
    
    # Extract parameters
    output_path = params.get('output_path', '/path/to/output.parquet')
    compression = params.get('compression', 'snappy')
    partition_by = params.get('partition_by', '')
    
    logger.info(f"Converting to Parquet: {output_path}, compression: {compression}")
    
    result = process_generic_node_with_parquet(params, 'convert_parquet')
    result['conversion_details'] = {
        'output_path': output_path,
        'compression': compression,
        'partition_by': partition_by.split(',') if partition_by else [],
        'compression_ratio': random.uniform(0.3, 0.7),
        'conversion_timestamp': datetime.now().isoformat()
    }
    
    return result

@error_handler
def filter_data(params):
    """Filter data operation with enhanced functionality"""
    logger.info(f"Starting FILTER operation with enhanced functionality")
    
    # Extract parameters
    condition = params.get('condition', 'column > 100')
    case_sensitive = params.get('case_sensitive', False)
    
    logger.info(f"Filtering data with condition: {condition}")
    
    result = process_generic_node_with_parquet(params, 'filter')
    result['filter_details'] = {
        'condition': condition,
        'case_sensitive': case_sensitive,
        'records_before_filter': int(result['count'] * random.uniform(1.2, 2.0)),
        'records_after_filter': int(result['count']),
        'filter_efficiency': random.uniform(0.4, 0.8),
        'filter_timestamp': datetime.now().isoformat()
    }
    
    return result

@error_handler
def join_data(params):
    """Join data operation with enhanced functionality"""
    logger.info(f"Starting JOIN operation with enhanced functionality")
    
    # Extract parameters
    join_type = params.get('join_type', 'inner')
    left_key = params.get('left_key', 'id')
    right_key = params.get('right_key', 'id')
    suffixes = params.get('suffixes', '_x,_y')
    
    logger.info(f"Joining data: {join_type} join on {left_key} = {right_key}")
    
    result = process_generic_node_with_parquet(params, 'join')
    result['join_details'] = {
        'join_type': join_type,
        'left_key': left_key,
        'right_key': right_key,
        'suffixes': suffixes.split(',') if suffixes else ['_x', '_y'],
        'left_records': int(result['count'] * random.uniform(0.8, 1.2)),
        'right_records': int(result['count'] * random.uniform(0.8, 1.2)),
        'joined_records': int(result['count']),
        'join_efficiency': random.uniform(0.7, 0.95),
        'join_timestamp': datetime.now().isoformat()
    }
    
    return result

@error_handler
def aggregate_data(params):
    """Aggregate data operation with enhanced functionality"""
    logger.info(f"Starting AGGREGATE operation with enhanced functionality")
    
    # Extract parameters
    group_by = params.get('group_by', 'date,region')
    aggregations = params.get('aggregations', 'sum:amount,count:id,mean:value')
    sort_by = params.get('sort_by', 'date DESC')
    
    logger.info(f"Aggregating data: group by {group_by}")
    
    result = process_generic_node_with_parquet(params, 'aggregate')
    result['aggregation_details'] = {
        'group_by': group_by.split(',') if group_by else [],
        'aggregations': aggregations.split(',') if aggregations else [],
        'sort_by': sort_by,
        'input_records': int(result['count'] * random.uniform(3.0, 10.0)),
        'output_records': int(result['count']),
        'aggregation_efficiency': random.uniform(0.8, 0.98),
        'aggregation_timestamp': datetime.now().isoformat()
    }
    
    return result

@error_handler
def data_output(params):
    """Data output operation with enhanced functionality"""
    logger.info(f"Starting DATA_OUTPUT operation with enhanced functionality")
    
    # Extract parameters
    output_type = params.get('output_type', 'preview')
    max_rows = params.get('max_rows', 1000)
    
    logger.info(f"Outputting data: type={output_type}, max_rows={max_rows}")
    
    result = process_generic_node_with_parquet(params, 'output')
    result['output_details'] = {
        'output_type': output_type,
        'max_rows': max_rows,
        'total_records': int(result['count']),
        'output_records': min(max_rows, int(result['count'])),
        'output_format': 'table',
        'output_timestamp': datetime.now().isoformat()
    }
    
    return result
