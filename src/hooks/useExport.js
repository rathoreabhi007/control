import { useCallback } from 'react';
import { useDataOutput } from '../contexts/DataOutputContext';
import { ApiService } from '../services/api';

/**
 * Custom hook for handling data export functionality
 * Implements streaming export for large datasets
 */
export const useExport = () => {
    const { state, computed, actions, csvData } = useDataOutput();

    const { data } = state;
    const { filteredData, visibleColumnsList } = computed;

    // Helper function to convert data to CSV format
    const convertToCSV = useCallback((data, columns) => {
        if (!data || !columns || data.length === 0 || columns.length === 0) {
            return '';
        }

        // Handle both object format (field/headerName) and string format (column names)
        const headers = columns.map(col => typeof col === 'string' ? col : (col.headerName || col.field));
        const headerRow = headers.join(',');

        const dataRows = data.map(row => {
            return columns.map(col => {
                const field = typeof col === 'string' ? col : col.field;
                const value = row[field];
                const cleanValue = value?.toString().replace(/"/g, '""') || '';
                return cleanValue.includes(',') ? `"${cleanValue}"` : cleanValue;
            }).join(',');
        });

        return [headerRow, ...dataRows].join('\n');
    }, []);

    // Helper function to download CSV
    const downloadCSV = useCallback((csvContent, fileName) => {
        // console.log('📥 Download CSV called:', {
        //     fileName,
        //     csvContentLength: csvContent?.length,
        //     csvContentPreview: csvContent?.substring(0, 200)
        // });

        try {
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);

            link.setAttribute('href', url);
            link.setAttribute('download', fileName);
            link.style.visibility = 'hidden';

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            URL.revokeObjectURL(url);
            // console.log('✅ CSV download initiated successfully');
        } catch (error) {
            console.error('❌ Error downloading CSV:', error);
        }
    }, []);

    // Streaming export for large datasets
    const streamingExport = useCallback(async (data, columns, fileName) => {
        // console.log('🌊 Streaming Export called:', {
        //     fileName,
        //     dataLength: data?.length,
        //     columnsLength: columns?.length
        // });

        const chunkSize = 1000;

        // Create readable stream
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    // Write headers
                    const headers = columns.map(col => typeof col === 'string' ? col : (col.headerName || col.field));
                    controller.enqueue(headers.join(',') + '\n');

                    // Process data in chunks
                    for (let i = 0; i < data.length; i += chunkSize) {
                        const chunk = data.slice(i, i + chunkSize);
                        const csvChunk = chunk.map(row =>
                            columns.map(col => {
                                const field = typeof col === 'string' ? col : col.field;
                                const value = row[field];
                                const cleanValue = value?.toString().replace(/"/g, '""') || '';
                                return cleanValue.includes(',') ? `"${cleanValue}"` : cleanValue;
                            }).join(',')
                        ).join('\n');

                        controller.enqueue(csvChunk + '\n');

                        // Yield to prevent blocking UI
                        if (i % 5000 === 0) {
                            await new Promise(resolve => setTimeout(resolve, 0));
                        }
                    }

                    controller.close();
                } catch (error) {
                    controller.error(error);
                }
            }
        });

        // Convert stream to blob and download
        const response = new Response(stream);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();

        URL.revokeObjectURL(url);
        // console.log('✅ Streaming export download initiated successfully');
    }, []);

    // Export all data
    const exportToCsv = useCallback(() => {
        const fileName = `data_export_all_${new Date().toISOString().split('T')[0]}.csv`;

        if (data.table.length > 5000) {
            // Use streaming for large datasets
            streamingExport(data.table, visibleColumnsList, fileName);
        } else {
            // Use regular export for smaller datasets
            const csvContent = convertToCSV(data.table, visibleColumnsList);
            downloadCSV(csvContent, fileName);
        }
    }, [data.table, visibleColumnsList, convertToCSV, downloadCSV, streamingExport]);

    // Export filtered data
    const exportFilteredToCsv = useCallback(async () => {
        const fileName = `data_export_filtered_${new Date().toISOString().split('T')[0]}.csv`;

        // console.log('🔍 Export Filtered Debug:', {
        //     dataSource: data.source,
        //     hasCsvData: !!csvData,
        //     csvDataSuccess: csvData?.success,
        //     csvDataFilePath: csvData?.file_info?.file_path,
        //     filteredDataLength: filteredData?.length,
        //     visibleColumnsLength: visibleColumnsList?.length,
        //     hasColumnFilters: Object.keys(state.filters.columnFilters).length > 0,
        //     columnFilters: state.filters.columnFilters
        // });

        // For CSV data with server-side pagination, fetch all data from server
        if (data.source === 'csv_api' && csvData) {
            try {
                // console.log('📊 Export: Fetching all data from server for filtered export...');
                // console.log('🔍 Export: csvData structure:', csvData);
                // console.log('🔍 Export: csvData.file_info:', csvData.file_info);
                // console.log('🔍 Export: csvData.filename:', csvData.filename);

                // Get the file path from csvData - try multiple possible locations
                let filePath = csvData.file_info?.file_path || csvData.filename || csvData.file_path;
                if (!filePath) {
                    console.error('❌ Export: No file path found in csvData');
                    console.error('❌ Export: Available csvData keys:', Object.keys(csvData));
                    return;
                }

                // Fetch all data with a large page size
                const allDataResponse = await ApiService.readCsvData(filePath, {
                    page: 1,
                    pageSize: 10000, // Large page size to get all data
                    sortDirection: 'asc'
                });

                if (allDataResponse.success && allDataResponse.data) {
                    // console.log('✅ Export: Fetched all data from server:', allDataResponse.data.length, 'rows');

                    // Apply client-side filters to the fetched data
                    let filteredData = allDataResponse.data;
                    Object.entries(state.filters.columnFilters).forEach(([field, values]) => {
                        if (values.size > 0) {
                            filteredData = filteredData.filter(row => {
                                const cellValue = row[field]?.toString() || '';
                                return values.has(cellValue) || (values.has('(Blanks)') && (!cellValue || cellValue.trim() === ''));
                            });
                        }
                    });

                    // console.log('✅ Export: Applied filters, exporting:', filteredData.length, 'rows');

                    // Export the filtered data
                    if (filteredData.length > 5000) {
                        streamingExport(filteredData, visibleColumnsList, fileName);
                    } else {
                        const csvContent = convertToCSV(filteredData, visibleColumnsList);
                        downloadCSV(csvContent, fileName);
                    }
                } else {
                    console.error('❌ Export: Failed to fetch data from server');
                }
            } catch (error) {
                console.error('❌ Export: Error fetching data from server:', error);
                // Fallback to current page data
                const csvContent = convertToCSV(filteredData, visibleColumnsList);
                downloadCSV(csvContent, fileName);
            }
        } else {
            // For client-side data, export all filtered data
            if (filteredData.length > 5000) {
                streamingExport(filteredData, visibleColumnsList, fileName);
            } else {
                const csvContent = convertToCSV(filteredData, visibleColumnsList);
                downloadCSV(csvContent, fileName);
            }
        }
    }, [filteredData, visibleColumnsList, convertToCSV, downloadCSV, streamingExport, data.source, csvData, state.filters.columnFilters]);



    // Export page filters (client-side column filters)
    const exportPageFiltersToCsv = useCallback(async () => {
        // console.log('🔍 Export Page Filters Debug:', {
        //     dataSource: data.source,
        //     hasCsvData: !!csvData,
        //     csvDataSuccess: csvData?.success,
        //     hasColumnFilters: Object.keys(state.filters.columnFilters).length > 0,
        //     columnFilters: state.filters.columnFilters
        // });

        // For CSV data with server-side pagination, fetch all data from server
        if (data.source === 'csv_api' && csvData) {
            try {
                // console.log('📊 Export: Fetching all data from server for page filter export...');
                // console.log('🔍 Export: csvData structure:', csvData);
                // console.log('🔍 Export: csvData.file_info:', csvData.file_info);
                // console.log('🔍 Export: csvData.filename:', csvData.filename);

                // Get the file path from csvData - try multiple possible locations
                let filePath = csvData.file_info?.file_path || csvData.filename || csvData.file_path;
                if (!filePath) {
                    console.error('❌ Export: No file path found in csvData');
                    console.error('❌ Export: Available csvData keys:', Object.keys(csvData));
                    return;
                }

                // Fetch all data with a large page size
                const allDataResponse = await ApiService.readCsvData(filePath, {
                    page: 1,
                    pageSize: 10000, // Large page size to get all data
                    sortDirection: 'asc'
                });

                if (allDataResponse.success && allDataResponse.data) {
                    // console.log('✅ Export: Fetched all data from server:', allDataResponse.data.length, 'rows');

                    // Apply ONLY column filters to the fetched data (no global search)
                    let filteredData = allDataResponse.data;
                    Object.entries(state.filters.columnFilters).forEach(([field, values]) => {
                        if (values.size > 0) {
                            filteredData = filteredData.filter(row => {
                                const cellValue = row[field]?.toString() || '';
                                return values.has(cellValue) || (values.has('(Blanks)') && (!cellValue || cellValue.trim() === ''));
                            });
                        }
                    });

                    // console.log('✅ Export: Applied page filters, exporting:', filteredData.length, 'rows');

                    // Convert to CSV and download
                    const csvContent = convertToCSV(filteredData, visibleColumnsList);
                    const fileName = `page_filtered_data_${new Date().toISOString().split('T')[0]}.csv`;
                    downloadCSV(csvContent, fileName);
                } else {
                    console.error('❌ Export: Failed to fetch all data from server');
                }
            } catch (error) {
                console.error('❌ Export: Error fetching all data:', error);
            }
        } else {
            // For calculation_results, use existing filtered data
            const csvContent = convertToCSV(filteredData, visibleColumnsList);
            const fileName = `page_filtered_data_${new Date().toISOString().split('T')[0]}.csv`;
            downloadCSV(csvContent, fileName);
        }
    }, [filteredData, visibleColumnsList, convertToCSV, downloadCSV, data.source, csvData, state.filters.columnFilters]);

    // Export global search results
    const exportGlobalSearchToCsv = useCallback(async () => {
        // console.log('🔍 Export Global Search Debug:', {
        //     hasSearchResults: !!state.filters.searchResults,
        //     searchResultsCount: state.filters.searchResults?.results?.length || 0,
        //     globalSearchTerm: state.filters.globalSearch
        // });

        if (!state.filters.searchResults || !state.filters.searchResults.results) {
            console.error('❌ Export: No global search results to export');
            return;
        }

        // Get search results data
        let searchData = state.filters.searchResults.results;

        // Apply column filters to search results if any
        if (Object.keys(state.filters.columnFilters).length > 0) {
            Object.entries(state.filters.columnFilters).forEach(([field, values]) => {
                if (values.size > 0) {
                    searchData = searchData.filter(row => {
                        const cellValue = row[field]?.toString() || '';
                        return values.has(cellValue) || (values.has('(Blanks)') && (!cellValue || cellValue.trim() === ''));
                    });
                }
            });
        }

        // console.log('✅ Export: Exporting global search results:', searchData.length, 'rows');

        // Convert to CSV and download
        const csvContent = convertToCSV(searchData, visibleColumnsList);
        const fileName = `global_search_${state.filters.globalSearch}_${new Date().toISOString().split('T')[0]}.csv`;
        downloadCSV(csvContent, fileName);
    }, [state.filters.searchResults, state.filters.globalSearch, state.filters.columnFilters, visibleColumnsList, convertToCSV, downloadCSV]);

    // Clear all filters
    const clearAllFilters = useCallback(() => {
        actions.clearAllFilters();
    }, [actions]);

    return {
        exportToCsv,
        exportFilteredToCsv,
        exportPageFiltersToCsv,
        exportGlobalSearchToCsv,
        clearAllFilters
    };
};
