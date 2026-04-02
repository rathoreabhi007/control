"""
Simplified CSV Service - Direct file path approach
No registry, no multi-user conflicts, just direct file access from file_info
"""

import os
import pandas as pd
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

# Data directory configuration
DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)

class CSVService:
    """Service for reading CSV files with pagination and metadata from direct file paths"""
    
    def __init__(self):
        self.data_dir = DATA_DIR  # Fallback directory
        self.cache = {}  # Simple in-memory cache for file metadata
        self.cache_ttl = 300  # 5 minutes cache TTL
    
    def validate_file_path(self, file_path: str) -> bool:
        """Validate that a file path exists and is accessible"""
        try:
            if not file_path:
                logger.warning("No file path provided")
                return False
            
            # Normalize path separators for cross-platform compatibility
            normalized_path = file_path.replace('\\', '/')
            logger.info(f"Validating file path: {file_path} -> {normalized_path}")
                
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
    
    def get_file_metadata(self, file_path: str) -> Optional[Dict[str, Any]]:
        """Get detailed metadata for a specific CSV file"""
        try:
            # Normalize path separators
            normalized_path = file_path.replace('\\', '/')
            
            if not self.validate_file_path(normalized_path):
                return None
                
            # Check cache first
            cache_key = f"metadata:{normalized_path}"
            if cache_key in self.cache:
                cached_data, timestamp = self.cache[cache_key]
                if (datetime.now() - timestamp).seconds < self.cache_ttl:
                    return cached_data
            
            # Read file metadata
            file_stat = os.stat(normalized_path)
            df = pd.read_csv(normalized_path, nrows=0)  # Read only headers
            
            metadata = {
                "filename": os.path.basename(normalized_path),
                "file_path": normalized_path,
                "source": "direct_path",
                "size_bytes": file_stat.st_size,
                "size_mb": round(file_stat.st_size / (1024 * 1024), 2),
                "modified_at": datetime.fromtimestamp(file_stat.st_mtime).isoformat(),
                "created_at": datetime.fromtimestamp(file_stat.st_ctime).isoformat(),
                "columns": list(df.columns),
                "column_count": len(df.columns),
                "estimated_memory_mb": round(file_stat.st_size / (1024 * 1024) * 2, 2)  # Rough estimate
            }
            
            # Cache the result
            self.cache[cache_key] = (metadata, datetime.now())
            
            logger.info(f"File metadata for {file_path}: {metadata['column_count']} columns, {metadata['size_mb']} MB")
            return metadata
            
        except Exception as e:
            logger.error(f"Error getting file metadata for {file_path}: {e}")
            return None
    
    def read_csv_paginated(
        self, 
        file_path: str, 
        page: int = 1, 
        page_size: int = 100,
        sort_column: Optional[str] = None,
        sort_direction: str = "asc",
        filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Read CSV file with pagination, sorting, and filtering"""
        try:
            # Normalize path separators
            normalized_path = file_path.replace('\\', '/')
            logger.info(f"read_csv_paginated called with file_path: {file_path} -> {normalized_path}")
            
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
            
            # Check cache first
            cache_key = f"data:{normalized_path}:{page}:{page_size}:{sort_column}:{sort_direction}"
            if cache_key in self.cache:
                cached_data, timestamp = self.cache[cache_key]
                if (datetime.now() - timestamp).seconds < self.cache_ttl:
                    logger.info(f"Using cached data for {normalized_path}")
                    return cached_data
            
            # First, get total row count efficiently (without loading all data)
            logger.info(f"Counting rows in CSV file: {normalized_path}")
            with open(normalized_path, 'r') as f:
                # Count lines (subtract 1 for header)
                total_rows = sum(1 for _ in f) - 1
            logger.info(f"Total rows in CSV: {total_rows}")
            
            # Calculate pagination
            total_pages = (total_rows + page_size - 1) // page_size if total_rows > 0 else 1
            start_idx = (page - 1) * page_size
            end_idx = min(start_idx + page_size, total_rows)
            
            # Only read the required page of data using skiprows and nrows
            if sort_column or filters:
                # If sorting or filtering is needed, we must load entire file
                # (This is a limitation - for production, consider using database)
                logger.warning(f"Loading entire file for sorting/filtering: {normalized_path}")
                df = pd.read_csv(normalized_path)
                df = df.fillna('').astype(str)
                
                # Apply sorting if specified
                if sort_column and sort_column in df.columns:
                    ascending = sort_direction.lower() == "asc"
                    df = df.sort_values(by=sort_column, ascending=ascending)
                    logger.info(f"Sorted by {sort_column} ({sort_direction})")
                
                # Apply filters if specified
                if filters:
                    for column, filter_value in filters.items():
                        if column in df.columns and filter_value:
                            if isinstance(filter_value, str):
                                df = df[df[column].str.contains(filter_value, case=False, na=False)]
                            else:
                                df = df[df[column] == filter_value]
                    logger.info(f"Applied filters, remaining rows: {len(df)}")
                    total_rows = len(df)
                    total_pages = (total_rows + page_size - 1) // page_size if total_rows > 0 else 1
                
                # Get the page data
                page_data = df.iloc[start_idx:end_idx]
            else:
                # Efficient page reading - only load required rows
                logger.info(f"Reading page {page} ({page_size} rows) from CSV file: {normalized_path}")
                
                # Read only the required page using skiprows and nrows
                # skiprows: skip header (0) + rows before current page
                rows_to_skip = list(range(1, start_idx + 1)) if start_idx > 0 else None
                rows_to_read = end_idx - start_idx
                
                if rows_to_read > 0:
                    page_data = pd.read_csv(
                        normalized_path,
                        skiprows=rows_to_skip,
                        nrows=rows_to_read
                    )
                    page_data = page_data.fillna('').astype(str)
                else:
                    # No data to read for this page
                    page_data = pd.read_csv(normalized_path, nrows=0)
                
                logger.info(f"Efficiently read {len(page_data)} rows (page {page}/{total_pages})")
            
            # Convert to JSON-safe format
            data = page_data.to_dict('records')
            columns = list(page_data.columns)
            
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
            
            # Cache the result
            self.cache[cache_key] = (result, datetime.now())
            
            logger.info(f"Successfully read {len(data)} rows from {file_path} (page {page}/{total_pages})")
            return result
            
        except Exception as e:
            logger.error(f"Error reading CSV file {file_path}: {e}")
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
    
    def get_column_statistics(self, file_path: str, column_name: str) -> Optional[Dict[str, Any]]:
        """Get statistics for a specific column"""
        try:
            # Normalize path separators
            normalized_path = file_path.replace('\\', '/')
            
            if not self.validate_file_path(normalized_path):
                return None
                
            # Check cache first
            cache_key = f"stats:{normalized_path}:{column_name}"
            if cache_key in self.cache:
                cached_data, timestamp = self.cache[cache_key]
                if (datetime.now() - timestamp).seconds < self.cache_ttl:
                    return cached_data
            
            # Read the CSV file
            df = pd.read_csv(normalized_path)
            df = df.fillna('').astype(str)
            
            if column_name not in df.columns:
                logger.warning(f"Column {column_name} not found in {file_path}")
                return None
            
            column_data = df[column_name]
            
            # Calculate basic statistics
            stats = {
                "column_name": column_name,
                "total_count": len(column_data),
                "non_null_count": len(column_data[column_data != '']),
                "null_count": len(column_data[column_data == '']),
                "unique_count": column_data.nunique(),
                "most_common": column_data.value_counts().head(5).to_dict() if len(column_data) > 0 else {}
            }
            
            # Cache the result
            self.cache[cache_key] = (stats, datetime.now())
            
            logger.info(f"Column statistics for {column_name}: {stats['unique_count']} unique values")
            return stats
            
        except Exception as e:
            logger.error(f"Error getting column statistics for {column_name} in {file_path}: {e}")
            return None
    
    def search_in_file(self, file_path: str, query: str, column: Optional[str] = None) -> Dict[str, Any]:
        """Search for a query in the CSV file"""
        try:
            # Normalize path separators
            normalized_path = file_path.replace('\\', '/')
            
            if not self.validate_file_path(normalized_path):
                return {
                    "error": f"File not found: {normalized_path}",
                    "results": [],
                    "total_matches": 0
                }
            
            # Read the CSV file
            df = pd.read_csv(normalized_path)
            df = df.fillna('').astype(str)
            
            # Perform search
            if column and column in df.columns:
                # Search in specific column
                mask = df[column].str.contains(query, case=False, na=False)
                results_df = df[mask]
            else:
                # Search in all columns
                mask = df.astype(str).apply(lambda x: x.str.contains(query, case=False, na=False)).any(axis=1)
                results_df = df[mask]
            
            # Convert to JSON-safe format
            results = results_df.to_dict('records')
            
            logger.info(f"Search '{query}' in {file_path}: {len(results)} matches")
            return {
                "results": results,
                "total_matches": len(results),
                "query": query,
                "column": column
            }
            
        except Exception as e:
            logger.error(f"Error searching in file {file_path}: {e}")
            return {
                "error": f"Error searching file: {str(e)}",
                "results": [],
                "total_matches": 0
            }
    
    def clear_cache(self):
        """Clear the cache"""
        self.cache.clear()
        logger.info("Cache cleared")

# Global instance
csv_service = CSVService()
