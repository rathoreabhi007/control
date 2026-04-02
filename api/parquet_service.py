"""
Parquet Service - High-performance data access using Polars and PyArrow
Uses lazy loading (scan_parquet) to read only required data into memory
Much faster and more memory-efficient than CSV + Pandas
"""

import os
import polars as pl
import pyarrow.parquet as pq
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

# Data directory configuration
DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)

class ParquetService:
    """Service for reading Parquet files with pagination and metadata using Polars"""
    
    def __init__(self):
        self.data_dir = DATA_DIR
        self.cache = {}  # Minimal cache for metadata only
        self.cache_ttl = 300  # 5 minutes cache TTL
    
    def validate_file_path(self, file_path: str) -> bool:
        """Validate that a file path exists and is accessible"""
        try:
            if not file_path:
                logger.warning("No file path provided")
                return False
            
            # Normalize path separators for cross-platform compatibility
            normalized_path = file_path.replace('\\', '/')
            
            # Convert .csv to .parquet if needed
            if normalized_path.endswith('.csv'):
                normalized_path = normalized_path.replace('.csv', '.parquet')
            
            logger.info(f"Validating file path: {normalized_path}")
                
            if not os.path.exists(normalized_path):
                logger.warning(f"File not found: {normalized_path}")
                # List files in the directory to help debug
                dir_path = os.path.dirname(normalized_path)
                if os.path.exists(dir_path):
                    files_in_dir = os.listdir(dir_path)
                    logger.info(f"Files in directory {dir_path}: {files_in_dir}")
                return False
                
            logger.info(f"File validated: {normalized_path}")
            return True
        except Exception as e:
            logger.error(f"Error validating file path {file_path}: {e}")
            return False
    
    def normalize_path(self, file_path: str) -> str:
        """Normalize path and convert CSV to Parquet extension"""
        normalized = file_path.replace('\\', '/')
        if normalized.endswith('.csv'):
            normalized = normalized.replace('.csv', '.parquet')
        return normalized
    
    def get_file_metadata(self, file_path: str) -> Optional[Dict[str, Any]]:
        """Get detailed metadata for a specific Parquet file using PyArrow"""
        try:
            normalized_path = self.normalize_path(file_path)
            
            if not self.validate_file_path(normalized_path):
                return None
                
            # Check cache first
            cache_key = f"metadata:{normalized_path}"
            if cache_key in self.cache:
                cached_data, timestamp = self.cache[cache_key]
                if (datetime.now() - timestamp).seconds < self.cache_ttl:
                    return cached_data
            
            # Read Parquet metadata using PyArrow (very fast, no data loading)
            file_stat = os.stat(normalized_path)
            parquet_file = pq.ParquetFile(normalized_path)
            
            # Get schema information
            schema = parquet_file.schema_arrow
            columns = schema.names
            
            # Get row count from metadata
            total_rows = parquet_file.metadata.num_rows
            
            metadata = {
                "filename": os.path.basename(normalized_path),
                "file_path": normalized_path,
                "source": "parquet",
                "size_bytes": file_stat.st_size,
                "size_mb": round(file_stat.st_size / (1024 * 1024), 2),
                "modified_at": datetime.fromtimestamp(file_stat.st_mtime).isoformat(),
                "created_at": datetime.fromtimestamp(file_stat.st_ctime).isoformat(),
                "columns": columns,
                "column_count": len(columns),
                "total_rows": total_rows,
                "num_row_groups": parquet_file.metadata.num_row_groups,
                "compression": parquet_file.metadata.row_group(0).column(0).compression if parquet_file.metadata.num_row_groups > 0 else "NONE"
            }
            
            # Cache the result
            self.cache[cache_key] = (metadata, datetime.now())
            
            logger.info(f"File metadata for {normalized_path}: {metadata['column_count']} columns, {metadata['total_rows']} rows, {metadata['size_mb']} MB")
            return metadata
            
        except Exception as e:
            logger.error(f"Error getting file metadata for {file_path}: {e}")
            return None
    
    def read_parquet_paginated(
        self, 
        file_path: str, 
        page: int = 1, 
        page_size: int = 100,
        sort_column: Optional[str] = None,
        sort_direction: str = "asc",
        filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Read Parquet file with pagination using Polars lazy loading
        This reads ONLY the required data into memory - very efficient!
        """
        try:
            normalized_path = self.normalize_path(file_path)
            logger.info(f"read_parquet_paginated called with file_path: {normalized_path}")
            
            if not self.validate_file_path(normalized_path):
                return {
                    "error": f"File not found: {normalized_path}",
                    "data": [],
                    "columns": [],
                    "pagination": {
                        "current_page": page,
                        "page_size": page_size,
                        "total_rows": 0,
                        "total_pages": 0,
                        "has_next": False,
                        "has_previous": False
                    }
                }
            
            # Start with lazy loading - NO DATA READ YET!
            logger.info(f"Using Polars lazy loading (scan_parquet) for: {normalized_path}")
            lazy_df = pl.scan_parquet(normalized_path)
            
            # Get total row count efficiently (from metadata)
            parquet_file = pq.ParquetFile(normalized_path)
            total_rows = parquet_file.metadata.num_rows
            columns = parquet_file.schema_arrow.names
            
            logger.info(f"Total rows in Parquet: {total_rows}")
            
            # Apply filters if specified (still lazy!)
            if filters:
                for column, filter_value in filters.items():
                    if column in columns and filter_value:
                        if isinstance(filter_value, str):
                            lazy_df = lazy_df.filter(pl.col(column).str.contains(filter_value))
                        else:
                            lazy_df = lazy_df.filter(pl.col(column) == filter_value)
                logger.info(f"Applied filters (lazy)")
            
            # Apply sorting if specified (still lazy!)
            if sort_column and sort_column in columns:
                descending = sort_direction.lower() == "desc"
                lazy_df = lazy_df.sort(sort_column, descending=descending)
                logger.info(f"Sorted by {sort_column} ({sort_direction}) - lazy")
            
            # Recompute total rows after filters so pagination remains accurate
            if filters:
                total_rows = lazy_df.select(pl.count()).collect(streaming=True).item()

            # Calculate pagination
            total_pages = (total_rows + page_size - 1) // page_size if total_rows > 0 else 1
            start_idx = (page - 1) * page_size
            
            # NOW we execute and fetch ONLY the required page!
            # This is where Polars shines - it only reads what's needed
            logger.info(f"Fetching page {page} ({page_size} rows) - executing lazy query now...")
            
            page_data = (
                lazy_df
                .slice(start_idx, page_size)  # Only fetch this slice
                .collect(streaming=True)  # Execute query and load ONLY this data
            )
            
            logger.info(f"Polars loaded {len(page_data)} rows into memory (page {page}/{total_pages})")
            
            # Convert to JSON-safe format
            data = page_data.to_dicts()
            
            result = {
                "data": data,
                "columns": columns,
                "pagination": {
                    "current_page": page,
                    "page_size": page_size,
                    "total_rows": total_rows,
                    "total_pages": total_pages,
                    "has_next": page < total_pages,
                    "has_previous": page > 1
                }
            }
            
            logger.info(f"Successfully returned {len(data)} rows from {normalized_path} (page {page}/{total_pages})")
            return result
            
        except Exception as e:
            logger.error(f"Error reading Parquet file {file_path}: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return {
                "error": f"Error reading file: {str(e)}",
                "data": [],
                "columns": [],
                "pagination": {
                    "current_page": page,
                    "page_size": page_size,
                    "total_rows": 0,
                    "total_pages": 0,
                    "has_next": False,
                    "has_previous": False
                }
            }
    
    def get_column_unique_values(
        self, 
        file_path: str, 
        column_name: str,
        limit: int = 5000,
        search_term: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get unique values for a column with optional limit and search
        Uses Polars for efficient streaming with early exit
        
        Args:
            file_path: Path to parquet file
            column_name: Column to get unique values from
            limit: Maximum number of unique values to return (default: 5000)
            search_term: Optional search term to filter values
        
        Returns:
            Dict with unique values, count, and metadata
        """
        try:
            normalized_path = self.normalize_path(file_path)
            
            if not self.validate_file_path(normalized_path):
                return {
                    "error": f"File not found: {normalized_path}",
                    "values": [],
                    "count": 0,
                    "limited": False
                }
            
            # Check cache first
            cache_key = f"unique_values:{normalized_path}:{column_name}:{limit}:{search_term}"
            if cache_key in self.cache:
                cached_data, timestamp = self.cache[cache_key]
                if (datetime.now() - timestamp).seconds < self.cache_ttl:
                    logger.info(f"Returning cached unique values for {column_name}")
                    return cached_data
            
            logger.info(f"Getting unique values for column '{column_name}' (limit: {limit})")
            start_time = datetime.now()
            
            # Use lazy loading to read data efficiently
            lazy_df = pl.scan_parquet(normalized_path)
            
            # Select only the column we need (reduces memory usage)
            lazy_df = lazy_df.select(pl.col(column_name))
            
            # Apply search filter if provided (still lazy)
            if search_term:
                lazy_df = lazy_df.filter(
                    pl.col(column_name).cast(pl.Utf8).str.contains(search_term, literal=False)
                )
            
            # Get unique values - collect to get count
            unique_df = lazy_df.unique().collect()
            
            total_unique = len(unique_df)
            limited = total_unique > limit
            
            # Take only the first 'limit' values
            if limited:
                unique_df = unique_df.head(limit)
                logger.warning(f"Column {column_name} has {total_unique} unique values, limited to {limit}")
            
            # Convert to list and handle nulls
            values = []
            for value in unique_df[column_name].to_list():
                if value is None or (isinstance(value, str) and value.strip() == ''):
                    values.append('(Blanks)')
                else:
                    values.append(str(value))
            
            # Sort values for better UX
            values.sort()
            
            elapsed_time = (datetime.now() - start_time).total_seconds()
            
            result = {
                "values": values,
                "count": len(values),
                "total_unique": total_unique,
                "limited": limited,
                "column_name": column_name,
                "search_term": search_term,
                "processing_time_ms": round(elapsed_time * 1000, 2)
            }
            
            # Cache the result
            self.cache[cache_key] = (result, datetime.now())
            
            logger.info(f"Retrieved {len(values)} unique values for {column_name} in {elapsed_time:.2f}s")
            return result
            
        except Exception as e:
            logger.error(f"Error getting unique values for {column_name}: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return {
                "error": f"Error getting unique values: {str(e)}",
                "values": [],
                "count": 0,
                "limited": False
            }
    
    def get_column_statistics(self, file_path: str, column_name: str) -> Optional[Dict[str, Any]]:
        """Get statistics for a specific column using Polars lazy loading"""
        try:
            normalized_path = self.normalize_path(file_path)
            
            if not self.validate_file_path(normalized_path):
                return None
                
            # Check cache first
            cache_key = f"stats:{normalized_path}:{column_name}"
            if cache_key in self.cache:
                cached_data, timestamp = self.cache[cache_key]
                if (datetime.now() - timestamp).seconds < self.cache_ttl:
                    return cached_data
            
            # Use lazy loading for efficient stats calculation
            logger.info(f"Calculating statistics for column '{column_name}' using lazy loading...")
            
            lazy_df = pl.scan_parquet(normalized_path)
            
            # Calculate stats lazily and collect only the results
            stats_df = (
                lazy_df
                .select([
                    pl.col(column_name).count().alias('total_count'),
                    pl.col(column_name).null_count().alias('null_count'),
                    pl.col(column_name).n_unique().alias('unique_count'),
                ])
                .collect()
            )
            
            # Get most common values (top 5)
            most_common_df = (
                lazy_df
                .select(column_name)
                .group_by(column_name)
                .agg(pl.count().alias('count'))
                .sort('count', descending=True)
                .head(5)
                .collect()
            )
            
            stats = {
                "column_name": column_name,
                "total_count": stats_df['total_count'][0],
                "null_count": stats_df['null_count'][0],
                "non_null_count": stats_df['total_count'][0] - stats_df['null_count'][0],
                "unique_count": stats_df['unique_count'][0],
                "most_common": {
                    str(row[column_name]): row['count'] 
                    for row in most_common_df.to_dicts()
                }
            }
            
            # Cache the result
            self.cache[cache_key] = (stats, datetime.now())
            
            logger.info(f"Column statistics for {column_name}: {stats['unique_count']} unique values")
            return stats
            
        except Exception as e:
            logger.error(f"Error getting column statistics for {column_name} in {file_path}: {e}")
            return None
    
    def search_in_file(self, file_path: str, query: str, column: Optional[str] = None, limit: int = 5000) -> Dict[str, Any]:
        """Search for a query in the Parquet file using lazy loading"""
        try:
            normalized_path = self.normalize_path(file_path)
            
            if not self.validate_file_path(normalized_path):
                return {
                    "error": f"File not found: {normalized_path}",
                    "results": [],
                    "total_matches": 0
                }
            
            # Use lazy loading for search
            logger.info(f"Searching for '{query}' using lazy loading...")
            lazy_df = pl.scan_parquet(normalized_path)
            
            # Perform search
            if column:
                # Search in specific column
                results_df = (
                    lazy_df
                    .filter(pl.col(column).cast(pl.Utf8).str.contains(query, literal=False))
                    .limit(limit)  # Apply 5000 limit for performance
                    .collect()
                )
            else:
                # Search in all string columns
                # Get schema to identify string columns
                parquet_file = pq.ParquetFile(normalized_path)
                schema = parquet_file.schema_arrow
                
                # Build OR condition for all string/text columns
                filter_conditions = []
                for field in schema:
                    col_name = field.name
                    try:
                        filter_conditions.append(
                            pl.col(col_name).cast(pl.Utf8).str.contains(query, literal=False)
                        )
                    except:
                        # Skip columns that can't be cast to string
                        pass
                
                if filter_conditions:
                    combined_filter = filter_conditions[0]
                    for condition in filter_conditions[1:]:
                        combined_filter = combined_filter | condition
                    
                    results_df = (
                        lazy_df
                        .filter(combined_filter)
                        .limit(limit)  # Apply 5000 limit for performance
                        .collect()
                    )
                else:
                    results_df = pl.DataFrame()
            
            # Convert to JSON-safe format
            results = results_df.to_dicts()
            
            # Check if results were limited
            limited = len(results) >= limit
            if limited:
                logger.warning(f"Search results limited to {limit} rows for performance")
            
            logger.info(f"Search '{query}' in {normalized_path}: {len(results)} matches{' (limited)' if limited else ''}")
            return {
                "results": results,
                "total_matches": len(results),
                "query": query,
                "column": column,
                "limit_applied": limit,
                "results_limited": limited
            }
            
        except Exception as e:
            logger.error(f"Error searching in file {file_path}: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return {
                "error": f"Error searching file: {str(e)}",
                "results": [],
                "total_matches": 0
            }
    
    def clear_cache(self):
        """Clear the cache"""
        self.cache.clear()
        logger.info("Parquet service cache cleared")

# Global instance
parquet_service = ParquetService()

