import { useState, useEffect, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import ApiService from '../../services/api';
import { FaSearch, FaSync, FaDownload, FaFilter } from 'react-icons/fa';
import HSBCLogo from '../../components/HSBCLogo';

ModuleRegistry.registerModules([AllCommunityModule]);

/**
 * Config Search Page - Search across configuration parquet files
 */
const ConfigSearchPage = () => {
    // Data state
    const [types, setTypes] = useState([]);
    const [sheets, setSheets] = useState([]);
    const [columns, setColumns] = useState([]);
    const [results, setResults] = useState([]);
    const [totalRows, setTotalRows] = useState(0);

    // Filter state
    const [selectedType, setSelectedType] = useState('');
    const [selectedSheet, setSelectedSheet] = useState('');
    const [selectedColumn, setSelectedColumn] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize] = useState(50);
    const [totalPages, setTotalPages] = useState(0);

    // UI state
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingTypes, setIsLoadingTypes] = useState(true);
    const [error, setError] = useState(null);
    const [hasSearched, setHasSearched] = useState(false);

    // Load available types on mount
    useEffect(() => {
        const loadTypes = async () => {
            try {
                setIsLoadingTypes(true);
                const response = await ApiService.getConfigSearchTypes();
                if (response.success) {
                    setTypes(response.types || []);
                    if (response.types && response.types.length > 0) {
                        setSelectedType(response.types[0]);
                    }
                }
            } catch (err) {
                setError(`Failed to load types: ${err.message}`);
            } finally {
                setIsLoadingTypes(false);
            }
        };
        loadTypes();
    }, []);

    // Load sheets when type changes
    useEffect(() => {
        if (!selectedType) return;

        const loadSheets = async () => {
            try {
                const response = await ApiService.getConfigSearchSheets(selectedType);
                if (response.success) {
                    setSheets(response.sheets || []);
                    if (response.sheets && response.sheets.length > 0) {
                        setSelectedSheet(response.sheets[0]);
                    } else {
                        setSelectedSheet('');
                    }
                }
            } catch (err) {
                setError(`Failed to load sheets: ${err.message}`);
            }
        };
        loadSheets();
    }, [selectedType]);

    // Load columns when sheet changes
    useEffect(() => {
        if (!selectedType || !selectedSheet) {
            setColumns([]);
            return;
        }

        const loadColumns = async () => {
            try {
                const response = await ApiService.getConfigSearchColumns(selectedType, selectedSheet);
                if (response.success) {
                    setColumns(response.columns || []);
                }
            } catch (err) {
                setError(`Failed to load columns: ${err.message}`);
            }
        };
        loadColumns();
    }, [selectedType, selectedSheet]);

    // Search function
    const handleSearch = useCallback(async (page = 1) => {
        if (!selectedType || !selectedSheet) {
            setError('Please select a type and sheet');
            return;
        }

        if (!searchQuery.trim()) {
            setError('Please enter a search query');
            return;
        }

        setIsLoading(true);
        setError(null);
        setHasSearched(true);

        try {
            const response = await ApiService.searchConfig(
                selectedType,
                selectedSheet,
                searchQuery.trim(),
                {
                    column: selectedColumn || null,
                    page: page,
                    pageSize: pageSize
                }
            );

            if (response.success) {
                setResults(response.results || []);
                setTotalRows(response.total_matches || 0);
                setTotalPages(response.pagination?.total_pages || 0);
                setCurrentPage(page);
            } else {
                setError(response.error || 'Search failed');
                setResults([]);
            }
        } catch (err) {
            setError(`Search failed: ${err.message}`);
            setResults([]);
        } finally {
            setIsLoading(false);
        }
    }, [selectedType, selectedSheet, searchQuery, selectedColumn, pageSize]);

    // Handle Enter key in search input
    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleSearch(1);
        }
    };

    // Reset filters
    const handleReset = () => {
        setSearchQuery('');
        setSelectedColumn('');
        setResults([]);
        setHasSearched(false);
        setError(null);
        setCurrentPage(1);
        setTotalRows(0);
    };

    // Export to CSV
    const handleExportCSV = () => {
        if (results.length === 0) return;

        const headers = columns.length > 0 ? columns : Object.keys(results[0] || {});
        const rows = results.map(row =>
            headers.map(col => {
                const value = row[col];
                if (value === null || value === undefined) return '';
                const strValue = String(value);
                return strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')
                    ? `"${strValue.replace(/"/g, '""')}"`
                    : strValue;
            })
        );

        const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `config-search-${selectedType}-${selectedSheet}-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    // AG Grid column definitions
    const columnDefs = useMemo(() => {
        if (columns.length === 0 && results.length > 0) {
            return Object.keys(results[0]).map(key => ({
                headerName: key,
                field: key,
                minWidth: 120,
                flex: 1,
                resizable: true,
                sortable: true,
                filter: true
            }));
        }

        return columns.map(col => ({
            headerName: col,
            field: col,
            minWidth: 120,
            flex: 1,
            resizable: true,
            sortable: true,
            filter: true
        }));
    }, [columns, results]);

    // Default column definition
    const defaultColDef = useMemo(() => ({
        sortable: true,
        filter: true,
        resizable: true,
        minWidth: 100
    }), []);

    // Pagination handlers
    const handlePrevPage = () => {
        if (currentPage > 1) {
            handleSearch(currentPage - 1);
        }
    };

    const handleNextPage = () => {
        if (currentPage < totalPages) {
            handleSearch(currentPage + 1);
        }
    };

    if (isLoadingTypes) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading configuration...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen supervisory-page-canvas relative flex flex-col">
            {/* Full Page Loading Overlay */}
            {isLoading && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-8 flex flex-col items-center shadow-xl">
                        <div className="animate-spin rounded-full h-16 w-16 border-4 border-red-500 border-t-transparent mb-4"></div>
                        <p className="text-gray-700 text-lg font-medium">Searching...</p>
                        <p className="text-gray-500 text-sm mt-1">{selectedType} / {selectedSheet}</p>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="supervisory-app-header bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between" style={{ height: '64px' }}>
                <div className="flex items-center justify-between h-full w-full">
                    <div className="flex items-center gap-4">
                        <HSBCLogo height={40} />
                        <div>
                            <h1 className="text-lg font-semibold text-gray-900">CONFIG SEARCH</h1>
                            <p className="text-xs supervisory-app-subtitle">Search across configuration parquet files</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {results.length > 0 && (
                            <button
                                onClick={handleExportCSV}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-slate-700 text-white hover:bg-slate-800 rounded transition-colors"
                            >
                                <FaDownload />
                                Export CSV
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex-1 p-4 overflow-y-auto">
                <div className="supervisory-surface supervisory-elevated rounded-lg border border-gray-200 p-4 mb-4">
                    <div className="flex items-center gap-2 mb-4">
                        <FaFilter className="text-gray-500" />
                        <span className="font-medium text-gray-700">Search Filters</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
                        {/* Type Selector */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                            <select
                                value={selectedType}
                                onChange={(e) => setSelectedType(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg supervisory-field"
                            >
                                <option value="">Select Type</option>
                                {types.map(type => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                        </div>

                        {/* Sheet Selector */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Sheet</label>
                            <select
                                value={selectedSheet}
                                onChange={(e) => setSelectedSheet(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg supervisory-field"
                                disabled={!selectedType}
                            >
                                <option value="">Select Sheet</option>
                                {sheets.map(sheet => (
                                    <option key={sheet} value={sheet}>{sheet}</option>
                                ))}
                            </select>
                        </div>

                        {/* Column Filter (Optional) */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Column (Optional)</label>
                            <select
                                value={selectedColumn}
                                onChange={(e) => setSelectedColumn(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg supervisory-field"
                                disabled={!selectedSheet}
                            >
                                <option value="">All Columns</option>
                                {columns.map(col => (
                                    <option key={col} value={col}>{col}</option>
                                ))}
                            </select>
                        </div>

                        {/* Search Input */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Search Query</label>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyPress={handleKeyPress}
                                placeholder="Enter search term..."
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg supervisory-field"
                                disabled={!selectedSheet}
                            />
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-end gap-2">
                            <button
                                onClick={() => handleSearch(1)}
                                disabled={isLoading || !selectedType || !selectedSheet || !searchQuery.trim()}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                            >
                                <FaSearch />
                                Search
                            </button>
                            <button
                                onClick={handleReset}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                            >
                                <FaSync />
                                Reset
                            </button>
                        </div>
                    </div>
                </div>

                {/* Error Display */}
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                        {error}
                    </div>
                )}

                {/* Results Section */}
                {hasSearched && !isLoading && (
                    <div className="supervisory-surface supervisory-elevated rounded-lg border border-gray-200">
                        {/* Results Header */}
                        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-700">Results</span>
                                <span className="text-sm text-gray-500">
                                    ({totalRows} {totalRows === 1 ? 'row' : 'rows'} found)
                                </span>
                            </div>
                            <div className="text-sm text-gray-500">
                                {selectedType} / {selectedSheet}
                                {searchQuery && ` - "${searchQuery}"`}
                            </div>
                        </div>

                        {results.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                                <FaSearch className="text-4xl mb-3 text-gray-300" />
                                <p>No results found</p>
                            </div>
                        ) : (
                            <>
                                {/* AG Grid Table */}
                                <div className="ag-theme-alpine config-grid-theme" style={{ height: 'calc(100vh - 350px)', minHeight: '400px', width: '100%' }}>
                                    <AgGridReact
                                        rowData={results}
                                        columnDefs={columnDefs}
                                        defaultColDef={defaultColDef}
                                        theme="legacy"
                                        animateRows={true}
                                        pagination={false}
                                        enableCellTextSelection={true}
                                        ensureDomOrder={true}
                                    />
                                </div>

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                                        <div className="text-sm text-gray-500">
                                            Page {currentPage} of {totalPages}
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handlePrevPage}
                                                disabled={currentPage === 1 || isLoading}
                                                className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                Previous
                                            </button>
                                            <button
                                                onClick={handleNextPage}
                                                disabled={currentPage >= totalPages || isLoading}
                                                className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* Initial State */}
                {!hasSearched && !error && (
                    <div className="supervisory-surface supervisory-elevated rounded-lg border border-gray-200 p-12 text-center">
                        <FaSearch className="text-6xl text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-700 mb-2">Ready to Search</h3>
                        <p className="text-gray-500 max-w-md mx-auto">
                            Select a type and sheet above, then enter a search term and click Search.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ConfigSearchPage;
