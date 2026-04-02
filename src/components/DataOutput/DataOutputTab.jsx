import React, { memo, useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { DataOutputProvider } from '../../contexts/DataOutputContext';
import { ColumnResizeProvider } from '../../contexts/ColumnResizeContext';
import DataOutputContent from './DataOutputContent';
import ErrorBoundary from '../common/ErrorBoundary';
import { ApiService } from '../../services/api';
import { useSafeContainerControl } from '../../hooks/useSafeContainerControl';

/**
 * Main Data Output Tab Component
 * Serves as the container for the optimized data output interface
 */
const DataOutputTab = memo(({
    selectedNode,
    bottomBarHeight = 600,
    onError,
    useSafeContainer = false // New prop to enable safe container control
}) => {
    // Add a key to force re-render when selectedNode changes
    const nodeKey = selectedNode?.id || 'no-node';

    // Safe container control (optional)
    const { containerHeight: safeHeight, isInitialized } = useSafeContainerControl({
        minHeight: 300,
        maxHeight: 800,
        defaultHeight: bottomBarHeight,
        reservedSpace: 100
    });
    // State for CSV data loading
    const [csvData, setCsvData] = useState(null);
    const [csvLoading, setCsvLoading] = useState(false);
    const [csvError, setCsvError] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);

    // Ref to track the last API call to prevent duplicates
    const lastApiCallRef = useRef(null);

    // Handle pagination changes
    const handlePageChange = useCallback((newPage) => {
        setCurrentPage(newPage);
    }, []);

    const handlePageSizeChange = useCallback((newPageSize) => {
        setPageSize(newPageSize);
        setCurrentPage(1); // Reset to first page when page size changes
    }, []);

    // Memoize the file path to prevent unnecessary API calls
    const currentFilePath = useMemo(() => {
        if (!selectedNode?.data?.output) return null;
        const nodeOutput = selectedNode.data.output;
        if (ApiService.hasCsvFileData(nodeOutput)) {
            return ApiService.extractFilePathFromFileInfo(nodeOutput.file_info);
        }
        return null;
    }, [selectedNode?.data?.output]);

    // Load CSV data ONLY when node ID, file path, or pagination changes
    // NOT when other node data changes (like bottombar resize or sidebar toggle)
    useEffect(() => {
        /* console.log('DataOutputTab: useEffect triggered with dependencies:', {
            selectedNodeId: selectedNode?.id,
            currentFilePath,
            currentPage,
            pageSize
        }); */

        const loadCsvData = async () => {
            if (!selectedNode?.data?.output) {
                setCsvData(null);
                setCsvError(null);
                return;
            }

            // Check if node has file data
            if (currentFilePath) {
                // Create a unique key for this API call
                const apiCallKey = `${selectedNode?.id}-${currentFilePath}-${currentPage}-${pageSize}`;

                // Check if we already made this exact API call
                if (lastApiCallRef.current === apiCallKey) {
                    // console.log('DataOutputTab: Skipping duplicate API call:', apiCallKey);
                    return;
                }

                // Mark this API call as in progress
                lastApiCallRef.current = apiCallKey;

                setCsvLoading(true);
                setCsvError(null);

                try {
                    /* console.log('DataOutputTab: Making API call for CSV data:', {
                        currentFilePath,
                        currentPage,
                        pageSize,
                        selectedNodeId: selectedNode?.id,
                        apiCallKey
                    }); */
                    const csvResponse = await ApiService.readCsvData(currentFilePath, {
                        page: currentPage,
                        pageSize: pageSize
                    });

                    if (csvResponse.success) {
                        // Add the file path to the csvData for export functionality
                        const csvDataWithPath = {
                            ...csvResponse,
                            file_path: currentFilePath,
                            filename: currentFilePath
                        };
                        setCsvData(csvDataWithPath);
                    } else {
                        setCsvError(csvResponse.error || 'Failed to load data');
                    }
                } catch (error) {
                    setCsvError(error.message);
                } finally {
                    setCsvLoading(false);
                }
            } else {
                // Fallback to calculation_results if available
                setCsvData(null);
                setCsvError(null);
            }
        };

        loadCsvData();
    }, [selectedNode?.id, selectedNode?.data?.output, currentFilePath, currentPage, pageSize]);

    // Memoize data processing to prevent unnecessary re-renders
    const processedData = useMemo(() => {
        // Use CSV data if available
        if (csvData && csvData.success) {
            const { data, pagination, columns } = csvData;

            // Handle both formats: array of strings or array of objects with 'name' property
            let headers = [];
            if (columns && columns.length > 0) {
                if (typeof columns[0] === 'string') {
                    // Columns is an array of strings
                    headers = columns;
                } else if (columns[0] && typeof columns[0] === 'object' && columns[0].name) {
                    // Columns is an array of objects with 'name' property
                    headers = columns.map(col => col.name);
                } else {
                    // Fallback: try to extract names or use as-is
                    headers = columns.map(col => col?.name || col?.field || col || '');
                }
            }

            return {
                headers: headers,
                table: data || [],
                totalRows: parseInt(pagination?.total_rows) || 0,
                displayedRows: data?.length || 0,
                columns: headers.length || (columns?.length || 0),
                pagination: pagination,
                source: 'csv_api'
            };
        }

        // Fallback to calculation_results if available
        if (selectedNode?.data?.output?.calculation_results) {
            const { headers, table, total_rows_generated } = selectedNode.data.output.calculation_results;
            const totalCount = selectedNode.data.output.count;

            // Transform table data to object format for easier processing
            const transformedTable = table ? table.map((row, index) => {
                const obj = {};
                headers.forEach((header, colIndex) => {
                    obj[header] = row[colIndex] || '';
                });
                return obj;
            }) : [];

            return {
                headers: headers || [],
                table: transformedTable,
                totalRows: totalCount ? parseInt(totalCount) : (total_rows_generated || transformedTable.length),
                displayedRows: transformedTable.length,
                columns: headers ? headers.length : 0,
                source: 'calculation_results'
            };
        }

        return {
            headers: [],
            table: [],
            totalRows: 0,
            displayedRows: 0,
            columns: 0,
            source: 'none'
        };
    }, [selectedNode, csvData]);

    // Check if node has failed and show fail_message
    if (selectedNode?.data?.output?.fail_message) {
        return (
            <div className="data-output-error">
                <div className="bg-red-50 border border-red-200 rounded-lg p-6 m-4">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                            <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-red-800">Node Execution Failed</h3>
                            <p className="text-sm text-red-600">The node encountered an error during execution</p>
                        </div>
                    </div>
                    <div className="bg-white border border-red-200 rounded-md p-4">
                        <h4 className="text-sm font-medium text-red-800 mb-2">Error Details:</h4>
                        <pre className="text-sm text-red-700 bg-red-50 p-3 rounded border overflow-auto max-h-96">
                            {selectedNode.data.output.fail_message}
                        </pre>
                    </div>
                    {selectedNode?.data?.output?.execution_logs && (
                        <div className="mt-4 bg-white border border-red-200 rounded-md p-4">
                            <h4 className="text-sm font-medium text-red-800 mb-2">Execution Logs:</h4>
                            <div className="text-sm text-red-700 bg-red-50 p-3 rounded border max-h-48 overflow-auto">
                                {selectedNode.data.output.execution_logs.map((log, index) => (
                                    <div key={index} className="mb-1">
                                        <span className="text-red-600">[{index + 1}]</span> {log}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Show loading state
    if (csvLoading) {
        return (
            <div className="data-output-loading">
                <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                    <span className="ml-3 text-slate-400">Loading data from CSV file...</span>
                </div>
            </div>
        );
    }

    // Show CSV error state
    if (csvError) {
        return (
            <div className="data-output-error">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 m-4">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                            <svg className="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-yellow-800">CSV Data Loading Failed</h3>
                            <p className="text-sm text-yellow-600">Could not load data from CSV file</p>
                        </div>
                    </div>
                    <div className="bg-white border border-yellow-200 rounded-md p-4">
                        <h4 className="text-sm font-medium text-yellow-800 mb-2">Error Details:</h4>
                        <p className="text-sm text-yellow-700 bg-yellow-50 p-3 rounded border">
                            {csvError}
                        </p>
                        <div className="mt-3 text-sm text-yellow-600">
                            <p>Falling back to calculation_results if available...</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Show debug state when no data is available
    if (!selectedNode) {
        return (
            <div className="data-output-debug">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 m-4">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-blue-800">No Node Selected</h3>
                            <p className="text-sm text-blue-600">Please select a node to view its data output</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Early return if no data
    if (!processedData.headers.length || !processedData.table.length) {
        return (
            <div className="data-output-empty">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 m-4">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-gray-800">No Data Available</h3>
                            <p className="text-sm text-gray-600">This node has no data to display</p>
                        </div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-md p-4">
                        <h4 className="text-sm font-medium text-gray-800 mb-2">Debug Information:</h4>
                        <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded border">
                            <p><strong>Node ID:</strong> {selectedNode?.id || 'None'}</p>
                            <p><strong>Node Name:</strong> {selectedNode?.data?.fullName || 'None'}</p>
                            <p><strong>Data Source:</strong> {processedData.source}</p>
                            <p><strong>Headers Count:</strong> {processedData.headers.length}</p>
                            <p><strong>Table Rows:</strong> {processedData.table.length}</p>
                            <p><strong>CSV Loading:</strong> {csvLoading ? 'Yes' : 'No'}</p>
                            <p><strong>CSV Error:</strong> {csvError || 'None'}</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <ErrorBoundary onError={onError}>
            <DataOutputProvider
                key={nodeKey}
                initialData={processedData}
                nodeOutput={selectedNode.data.output}
                csvData={csvData}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                currentPage={currentPage}
                pageSize={pageSize}
            >
                <ColumnResizeProvider>
                    <div
                        className={useSafeContainer ? 'safe-container' : ''}
                        style={{
                            height: useSafeContainer && isInitialized
                                ? `${safeHeight - 20}px`
                                : `${bottomBarHeight - 20}px`
                        }}
                    >
                        <DataOutputContent
                            height={useSafeContainer && isInitialized
                                ? `${safeHeight - 20}px`
                                : `${bottomBarHeight - 20}px`
                            }
                        />
                    </div>
                </ColumnResizeProvider>
            </DataOutputProvider>
        </ErrorBoundary>
    );
});

DataOutputTab.displayName = 'DataOutputTab';

export default DataOutputTab;
