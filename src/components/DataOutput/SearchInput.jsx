import React, { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useDataOutput } from '../../contexts/DataOutputContext';
import { ApiService } from '../../services/api';
import { FaSearch, FaTimes, FaSpinner, FaPlay, FaStop } from 'react-icons/fa';

/**
 * Search Input Component
 * Provides single column or global search functionality with manual trigger
 */
const SearchInput = memo(() => {
    const { state, actions, nodeOutput, csvData, onSearch } = useDataOutput();
    const { globalSearch } = state.filters;
    const [localSearch, setLocalSearch] = useState(globalSearch);
    const [selectedColumn, setSelectedColumn] = useState(''); // Optional - empty means search all columns
    const [columnSearch, setColumnSearch] = useState(''); // Search for column names
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState(null);
    const [showColumnDropdown, setShowColumnDropdown] = useState(false);
    const searchTimeoutRef = useRef(null);
    const abortControllerRef = useRef(null);

    // Perform backend search (supports both column-specific and global search)
    const performBackendSearch = useCallback(async (searchTerm) => {
        // Priority 1: Custom search handler (for API-driven pages like details-page)
        if (onSearch) {
            if (!searchTerm || !searchTerm.trim()) {
                console.warn('⚠️ Search term is empty');
                return;
            }

            // Enforce column selection for API search (as per user requirement)
            if (!selectedColumn) {
                // You might want to show a UI notification here
                console.warn('⚠️ Column selection is required for this search');
                setSearchResults({
                    error: "Please select a column to search in.",
                    total_matches: 0,
                    results: []
                });
                return;
            }

            setIsSearching(true);
            try {
                await onSearch(searchTerm, selectedColumn);
                actions.setGlobalSearch(searchTerm);
                // Note: onSearch usually handles setting results in its own way (e.g. reloading data)
                // But we can reset the local search results to avoid confusion or set a success message
                setSearchResults({
                    total_matches: 1, // Dummy count or meaningful if returned
                    results: [], // Data usually updates in the grid directly
                    message: "Search applied"
                });
            } catch (error) {
                console.error("Custom search failed:", error);
                setSearchResults({
                    error: error.message || "Search failed",
                    total_matches: 0,
                    results: []
                });
            } finally {
                setIsSearching(false);
            }
            return;
        }

        if (!nodeOutput?.file_info?.file_path) {
            console.warn('⚠️ No file path available for search');
            return;
        }

        if (!searchTerm || !searchTerm.trim()) {
            console.warn('⚠️ Search term is empty');
            return;
        }

        // Cancel any existing search
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        // Create new AbortController for this search
        abortControllerRef.current = new AbortController();
        setIsSearching(true);

        try {
            const result = await ApiService.searchCsvDataByPath(
                nodeOutput.file_info.file_path,
                searchTerm,
                { column: selectedColumn || null }, // null means search all columns
                abortControllerRef.current.signal // Pass abort signal
            );

            setSearchResults(result);
            actions.setSearchResults(result);
            actions.setGlobalSearch(searchTerm);
        } catch (error) {
            // Don't show error if request was aborted
            if (error.name === 'AbortError') {
                console.log('🔍 Search was cancelled');
                return;
            }

            console.error('❌ Backend search failed:', error);
            setSearchResults({
                error: error.message,
                total_matches: 0,
                results: []
            });
        } finally {
            setIsSearching(false);
            abortControllerRef.current = null;
        }
    }, [nodeOutput?.file_info?.file_path, actions, selectedColumn, onSearch]);


    // Handle search input change
    const handleSearchChange = useCallback((e) => {
        const value = e.target.value;
        setLocalSearch(value);
    }, []);

    // Stop current search
    const stopSearch = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsSearching(false);
        console.log('🛑 Search stopped by user');
    }, []);

    // Clear search
    const clearSearch = useCallback(() => {
        // Stop any ongoing search first
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }

        setLocalSearch('');
        setSelectedColumn('');
        setColumnSearch('');
        setSearchResults(null);
        actions.setSearchResults(null);
        actions.setGlobalSearch('');
        setIsSearching(false);

        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }
    }, [actions]);

    // Handle column selection change
    const handleColumnChange = useCallback((column) => {
        setSelectedColumn(column);
        setShowColumnDropdown(false);
        setColumnSearch('');
    }, []);

    // Clear column selection (to enable global search)
    const clearColumnSelection = useCallback(() => {
        setSelectedColumn('');
        setShowColumnDropdown(false);
    }, []);

    // Handle column search
    const handleColumnSearchChange = useCallback((e) => {
        setColumnSearch(e.target.value);
    }, []);

    // Handle Enter key to search (immediate search)
    const handleKeyPress = useCallback((e) => {
        if (e.key === 'Enter' && localSearch && localSearch.trim()) {
            performBackendSearch(localSearch.trim());
        }
    }, [localSearch, performBackendSearch]);

    // Manual search start
    const handleStartSearch = useCallback(() => {
        if (localSearch && localSearch.trim()) {
            performBackendSearch(localSearch.trim());
        }
    }, [localSearch, performBackendSearch]);

    // Cleanup on unmount
    useEffect(() => {
        const currentAbortController = abortControllerRef.current;
        const currentTimeout = searchTimeoutRef.current;

        return () => {
            if (currentAbortController) {
                currentAbortController.abort();
            }
            if (currentTimeout) {
                clearTimeout(currentTimeout);
            }
        };
    }, []);

    // Get available columns for dropdown
    const availableColumns = useMemo(() => {
        return csvData?.columns || state.data?.headers || [];
    }, [csvData?.columns, state.data?.headers]);

    // Filter columns based on column search
    const filteredColumns = useMemo(() => {
        if (!columnSearch.trim()) return availableColumns;
        return availableColumns.filter(column =>
            column.toLowerCase().includes(columnSearch.toLowerCase())
        );
    }, [availableColumns, columnSearch]);

    return (
        <div className="search-input-container">
            <div className="search-input-wrapper">
                <div className="search-icon">
                    {isSearching ? (
                        <FaSpinner className="w-4 h-4 text-slate-400 animate-spin" />
                    ) : (
                        <FaSearch className="w-4 h-4 text-slate-400" />
                    )}
                </div>

                {/* Column Selector with Search */}
                <div className="relative" style={{ minWidth: '200px' }}>
                    <div
                        className="search-column-selector cursor-pointer"
                        onClick={() => setShowColumnDropdown(!showColumnDropdown)}
                        style={{
                            border: '1px solid #cbd5e1',
                            borderRadius: '4px',
                            padding: '6px 12px',
                            background: 'white',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}
                    >
                        <span>{selectedColumn || 'All Columns (Global Search)'}</span>
                        {selectedColumn && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    clearColumnSelection();
                                }}
                                className="ml-2 text-slate-400 hover:text-slate-600"
                                title="Clear column selection (search all columns)"
                            >
                                <FaTimes className="w-3 h-3" />
                            </button>
                        )}
                    </div>

                    {showColumnDropdown && (
                        <div
                            className="absolute top-full left-0 mt-1 w-full bg-white border border-slate-300 rounded shadow-lg z-50"
                            style={{ maxHeight: '300px', overflowY: 'auto' }}
                        >
                            {/* Column Search Input */}
                            <div className="p-2 border-b border-slate-200 sticky top-0 bg-white">
                                <input
                                    type="text"
                                    placeholder="Search column names..."
                                    value={columnSearch}
                                    onChange={handleColumnSearchChange}
                                    className="w-full px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    autoFocus
                                />
                            </div>

                            {/* Column List */}
                            <div className="max-h-64 overflow-y-auto">
                                {filteredColumns.length > 0 ? (
                                    filteredColumns.map(column => (
                                        <div
                                            key={column}
                                            className="px-3 py-2 hover:bg-slate-100 cursor-pointer text-sm"
                                            onClick={() => handleColumnChange(column)}
                                        >
                                            {column}
                                        </div>
                                    ))
                                ) : (
                                    <div className="px-3 py-2 text-sm text-slate-400">
                                        No columns found
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <input
                    type="text"
                    placeholder={selectedColumn ? `Search in ${selectedColumn}...` : "Search all columns..."}
                    value={localSearch}
                    onChange={handleSearchChange}
                    onKeyPress={handleKeyPress}
                    className="search-input"
                    disabled={isSearching}
                />

                {/* Search Control Buttons */}
                <div className="flex gap-1 ml-2">
                    {/* Manual Search Button */}
                    <button
                        onClick={handleStartSearch}
                        className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-1 text-sm"
                        title="Start search"
                        disabled={isSearching || !localSearch || !localSearch.trim()}
                    >
                        <FaPlay className="w-3 h-3" />
                        Search
                    </button>

                    {/* Stop Search Button */}
                    {isSearching && (
                        <button
                            onClick={stopSearch}
                            className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 flex items-center gap-1 text-sm"
                            title="Stop current search"
                        >
                            <FaStop className="w-3 h-3" />
                            Stop
                        </button>
                    )}

                </div>

                {(localSearch || selectedColumn) && (
                    <button
                        onClick={clearSearch}
                        className="clear-search-button ml-2"
                        title="Clear search"
                        disabled={isSearching}
                    >
                        <FaTimes className="w-3 h-3 text-slate-400 hover:text-slate-600" />
                    </button>
                )}
            </div>
            {searchResults && (
                <div className="search-results-info">
                    {searchResults.error ? (
                        <span className="text-sm text-red-500">
                            Search error: {searchResults.error}
                        </span>
                    ) : (
                        <span className="text-sm text-slate-500">
                            Found <strong>{searchResults.total_matches}</strong> matches
                            {selectedColumn ? (
                                <> in column: <strong>{selectedColumn}</strong></>
                            ) : (
                                <> in <strong>all columns</strong> (global search)</>
                            )}
                            {searchResults.total_matches > 0 && (
                                <span className="ml-2 text-xs text-slate-400">
                                    (Showing first {Math.min(searchResults.results?.length || 0, 100)} results)
                                </span>
                            )}
                        </span>
                    )}
                </div>
            )}
            {isSearching && (
                <div className="search-results-info">
                    <span className="text-sm text-slate-500">
                        <FaSpinner className="w-3 h-3 animate-spin inline mr-1" />
                        Searching {selectedColumn ? `in ${selectedColumn}` : 'all columns'}...
                    </span>
                </div>
            )}
        </div>
    );
});

SearchInput.displayName = 'SearchInput';

export default SearchInput;

