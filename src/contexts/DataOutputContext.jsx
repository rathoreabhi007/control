import React, { createContext, useContext, useReducer, useMemo, useEffect } from 'react';

// Initial state structure
const initialState = {
    // Data state
    data: {
        headers: [],
        table: [],
        totalRows: 0,
        displayedRows: 0,
        columns: 0,
        source: 'none'
    },

    // Pagination state
    pagination: {
        currentPage: 1,
        pageSize: 50,
        customPageSize: '50',
        showCustomInput: false
    },

    // Filtering state
    filters: {
        columnFilters: {},
        visibleColumns: new Set(),
        columnSearch: '',
        showColumnSelector: false,
        columnOrder: [], // Custom column order for reordering
        globalSearch: '', // Global search across all columns
        searchResults: null // Backend search results
    },

    // UI state
    ui: {
        showColumnFilter: false,
        selectedColumn: '',
        columnFilterSearch: '',
        selectedValues: new Set(),
        availableValues: [],
        filteredValues: [],
        dropdownPosition: { top: 0, left: 0 },
        dropdownHeight: {
            maxHeight: 400,
            valuesMaxHeight: 300
        },
        showActiveFiltersDropdown: false,
        isLoading: false,
        dataProcessed: false
    },

    // Grid state
    grid: {
        tableHeight: 800,
        hasManualResizes: false,
        manuallyResizedColumns: new Set()
    }
};

// Action types
const ACTIONS = {
    // Data actions
    SET_DATA: 'SET_DATA',
    SET_CSV_DATA: 'SET_CSV_DATA',
    SET_LOADING: 'SET_LOADING',
    SET_DATA_PROCESSED: 'SET_DATA_PROCESSED',

    // Pagination actions
    SET_CURRENT_PAGE: 'SET_CURRENT_PAGE',
    SET_PAGE_SIZE: 'SET_PAGE_SIZE',
    SET_CUSTOM_PAGE_SIZE: 'SET_CUSTOM_PAGE_SIZE',
    TOGGLE_CUSTOM_INPUT: 'TOGGLE_CUSTOM_INPUT',

    // Filter actions
    SET_COLUMN_FILTERS: 'SET_COLUMN_FILTERS',
    ADD_COLUMN_FILTER: 'ADD_COLUMN_FILTER',
    REMOVE_COLUMN_FILTER: 'REMOVE_COLUMN_FILTER',
    CLEAR_ALL_FILTERS: 'CLEAR_ALL_FILTERS',
    SET_VISIBLE_COLUMNS: 'SET_VISIBLE_COLUMNS',
    TOGGLE_COLUMN_VISIBILITY: 'TOGGLE_COLUMN_VISIBILITY',
    SET_COLUMN_SEARCH: 'SET_COLUMN_SEARCH',
    TOGGLE_COLUMN_SELECTOR: 'TOGGLE_COLUMN_SELECTOR',
    SET_COLUMN_ORDER: 'SET_COLUMN_ORDER',
    RESET_COLUMN_ORDER: 'RESET_COLUMN_ORDER',
    SET_GLOBAL_SEARCH: 'SET_GLOBAL_SEARCH',
    SET_SEARCH_RESULTS: 'SET_SEARCH_RESULTS',

    // UI actions
    SET_COLUMN_FILTER_UI: 'SET_COLUMN_FILTER_UI',
    SET_FILTER_VALUES: 'SET_FILTER_VALUES',
    SET_DROPDOWN_POSITION: 'SET_DROPDOWN_POSITION',
    TOGGLE_ACTIVE_FILTERS_DROPDOWN: 'TOGGLE_ACTIVE_FILTERS_DROPDOWN',

    // Grid actions
    SET_TABLE_HEIGHT: 'SET_TABLE_HEIGHT',
    SET_MANUAL_RESIZES: 'SET_MANUAL_RESIZES',
    ADD_MANUAL_RESIZE: 'ADD_MANUAL_RESIZE'
};

// Reducer function
const dataOutputReducer = (state, action) => {
    switch (action.type) {
        case ACTIONS.SET_DATA:
            return {
                ...state,
                data: { ...state.data, ...action.payload }
            };

        case ACTIONS.SET_CSV_DATA:
            return {
                ...state,
                csvData: action.payload
            };

        case ACTIONS.SET_LOADING:
            return {
                ...state,
                ui: { ...state.ui, isLoading: action.payload }
            };

        case ACTIONS.SET_DATA_PROCESSED:
            return {
                ...state,
                ui: { ...state.ui, dataProcessed: action.payload }
            };

        case ACTIONS.SET_CURRENT_PAGE:
            return {
                ...state,
                pagination: { ...state.pagination, currentPage: action.payload }
            };

        case ACTIONS.SET_PAGE_SIZE:
            return {
                ...state,
                pagination: {
                    ...state.pagination,
                    pageSize: action.payload,
                    currentPage: 1 // Reset to first page when page size changes
                }
            };

        case ACTIONS.SET_CUSTOM_PAGE_SIZE:
            return {
                ...state,
                pagination: { ...state.pagination, customPageSize: action.payload }
            };

        case ACTIONS.TOGGLE_CUSTOM_INPUT:
            return {
                ...state,
                pagination: { ...state.pagination, showCustomInput: action.payload }
            };

        case ACTIONS.SET_COLUMN_FILTERS:
            return {
                ...state,
                filters: { ...state.filters, columnFilters: action.payload }
            };

        case ACTIONS.ADD_COLUMN_FILTER:
            return {
                ...state,
                filters: {
                    ...state.filters,
                    columnFilters: {
                        ...state.filters.columnFilters,
                        [action.payload.column]: action.payload.values
                    }
                }
            };

        case ACTIONS.REMOVE_COLUMN_FILTER:
            const newFilters = { ...state.filters.columnFilters };
            delete newFilters[action.payload];
            return {
                ...state,
                filters: { ...state.filters, columnFilters: newFilters }
            };

        case ACTIONS.CLEAR_ALL_FILTERS:
            return {
                ...state,
                filters: { ...state.filters, columnFilters: {}, globalSearch: '', searchResults: null }
            };

        case ACTIONS.SET_VISIBLE_COLUMNS:
            return {
                ...state,
                filters: { ...state.filters, visibleColumns: action.payload }
            };

        case ACTIONS.TOGGLE_COLUMN_VISIBILITY:
            const newVisibleColumns = new Set(state.filters.visibleColumns);
            if (newVisibleColumns.has(action.payload)) {
                newVisibleColumns.delete(action.payload);
            } else {
                newVisibleColumns.add(action.payload);
            }
            return {
                ...state,
                filters: { ...state.filters, visibleColumns: newVisibleColumns }
            };

        case ACTIONS.SET_COLUMN_SEARCH:
            return {
                ...state,
                filters: { ...state.filters, columnSearch: action.payload }
            };

        case ACTIONS.TOGGLE_COLUMN_SELECTOR:
            return {
                ...state,
                filters: { ...state.filters, showColumnSelector: action.payload }
            };

        case ACTIONS.SET_COLUMN_ORDER:
            return {
                ...state,
                filters: { ...state.filters, columnOrder: action.payload }
            };

        case ACTIONS.RESET_COLUMN_ORDER:
            return {
                ...state,
                filters: { ...state.filters, columnOrder: [] }
            };

        case ACTIONS.SET_GLOBAL_SEARCH:
            return {
                ...state,
                filters: { ...state.filters, globalSearch: action.payload }
            };

        case ACTIONS.SET_SEARCH_RESULTS:
            return {
                ...state,
                filters: { ...state.filters, searchResults: action.payload }
            };

        case ACTIONS.SET_COLUMN_FILTER_UI:
            return {
                ...state,
                ui: { ...state.ui, ...action.payload }
            };

        case ACTIONS.SET_FILTER_VALUES:
            return {
                ...state,
                ui: { ...state.ui, ...action.payload }
            };

        case ACTIONS.SET_DROPDOWN_POSITION:
            return {
                ...state,
                ui: { ...state.ui, dropdownPosition: action.payload }
            };

        case ACTIONS.TOGGLE_ACTIVE_FILTERS_DROPDOWN:
            return {
                ...state,
                ui: { ...state.ui, showActiveFiltersDropdown: action.payload }
            };

        case ACTIONS.SET_TABLE_HEIGHT:
            if (state.grid.tableHeight === action.payload) {
                return state;
            }
            return {
                ...state,
                grid: { ...state.grid, tableHeight: action.payload }
            };

        case ACTIONS.SET_MANUAL_RESIZES:
            return {
                ...state,
                grid: { ...state.grid, hasManualResizes: action.payload }
            };

        case ACTIONS.ADD_MANUAL_RESIZE:
            const newResizedColumns = new Set(state.grid.manuallyResizedColumns);
            newResizedColumns.add(action.payload);
            return {
                ...state,
                grid: {
                    ...state.grid,
                    manuallyResizedColumns: newResizedColumns,
                    hasManualResizes: true
                }
            };

        default:
            return state;
    }
};

// Create context
const DataOutputContext = createContext();

// Provider component
export const DataOutputProvider = ({
    children,
    initialData,
    nodeOutput,
    csvData,
    onPageChange,
    onPageSizeChange,
    currentPage,
    pageSize,
    onSearch
}) => {
    const [state, dispatch] = useReducer(dataOutputReducer, {
        ...initialState,
        data: initialData || initialState.data,
        csvData: csvData || null
    });

    // Update data when initialData changes
    // Compare by meaningful values, not object references
    useEffect(() => {
        if (initialData) {
            // Check if data actually changed by comparing key properties
            const hasDataChanged =
                initialData.totalRows !== state.data.totalRows ||
                initialData.columns !== state.data.columns ||
                initialData.source !== state.data.source ||
                (initialData.table?.length || 0) !== (state.data.table?.length || 0) ||
                (initialData.headers?.length || 0) !== (state.data.headers?.length || 0);

            if (hasDataChanged) {
                dispatch({
                    type: 'SET_DATA',
                    payload: initialData
                });
            }
        }
    }, [initialData, nodeOutput?.step_type, state.data.totalRows, state.data.columns, state.data.source, state.data.table?.length, state.data.headers?.length]);

    // Update csvData when it changes
    useEffect(() => {
        if (csvData !== state.csvData) {
            dispatch({
                type: 'SET_CSV_DATA',
                payload: csvData
            });
        }
    }, [csvData, state.csvData]);

    // Handle CSV pagination changes
    useEffect(() => {
        if (onPageChange && currentPage !== state.pagination.currentPage) {
            dispatch({
                type: 'SET_CURRENT_PAGE',
                payload: currentPage
            });
        }
    }, [currentPage, onPageChange, state.pagination.currentPage]);

    useEffect(() => {
        if (onPageSizeChange && pageSize !== state.pagination.pageSize) {
            dispatch({
                type: 'SET_PAGE_SIZE',
                payload: pageSize
            });
        }
    }, [pageSize, onPageSizeChange, state.pagination.pageSize]);

    // Initialize visibleColumns when data is first loaded (show all columns by default)
    useEffect(() => {
        // Only initialize if visibleColumns is empty and we have headers
        const hasHeaders = (state.data?.headers && state.data.headers.length > 0) ||
            (state.csvData?.columns && state.csvData.columns.length > 0);

        if (hasHeaders && state.filters.visibleColumns.size === 0) {
            // Get all available columns
            const allColumns = state.csvData?.columns
                ? (typeof state.csvData.columns[0] === 'string'
                    ? state.csvData.columns
                    : state.csvData.columns.map(col => col?.name || col?.field || col))
                : (state.data?.headers || []);

            // Set all columns as visible by default (empty Set means show all)
            // We keep it empty to show all columns, but this ensures the logic works correctly
            if (allColumns.length > 0) {
                // Don't set visibleColumns - empty Set means "show all" in the computed logic
                // This is already handled correctly in computedValues
            }
        }
    }, [state.data?.headers, state.csvData?.columns, state.filters.visibleColumns.size]);

    // Memoized computed values
    const computedValues = useMemo(() => {
        const { data, pagination, filters } = state;

        // If we have search results, use them instead of regular data
        if (filters.searchResults && filters.searchResults.results && filters.searchResults.results.length > 0) {

            // Use search results as the data source
            const searchData = filters.searchResults.results;
            const searchColumns = searchData.length > 0 ? Object.keys(searchData[0]) : [];

            // Calculate visible columns for search results
            const baseVisibleColumns = searchColumns.filter(col =>
                filters.visibleColumns.has(col) || filters.visibleColumns.size === 0
            );

            // Apply custom column order if available
            let visibleColumnsList;
            if (filters.columnOrder.length > 0) {
                visibleColumnsList = filters.columnOrder.filter(col => baseVisibleColumns.includes(col));
                baseVisibleColumns.forEach(col => {
                    if (!visibleColumnsList.includes(col)) {
                        visibleColumnsList.push(col);
                    }
                });
            } else {
                visibleColumnsList = baseVisibleColumns;
            }

            // Apply column filters to search results
            let filteredData = searchData;
            Object.entries(filters.columnFilters).forEach(([field, values]) => {
                if (values.size > 0) {
                    filteredData = filteredData.filter(row => {
                        const cellValue = row[field]?.toString() || '';
                        return values.has(cellValue) || (values.has('(Blanks)') && (!cellValue || cellValue.trim() === ''));
                    });
                }
            });

            // For search results, we don't use pagination - show all results
            const result = {
                filteredData,
                totalRows: filters.searchResults.total_matches,
                totalPages: 1,
                startIndex: 0,
                endIndex: filteredData.length,
                displayedRows: filteredData,
                displayedRowsCount: filteredData.length,
                visibleColumnsList,
                hasNext: false,
                hasPrevious: false,
                isSearchResults: true,
                searchQuery: filters.globalSearch
            };


            return result;
        }

        // For CSV data, use server-side pagination
        if (data.source === 'csv_api' && csvData && csvData.pagination) {
            // Calculate filtered data (client-side filtering on current page)
            let filteredData = data.table || [];

            // Apply global search filter
            if (filters.globalSearch && filters.globalSearch.trim()) {
                const searchTerm = filters.globalSearch.toLowerCase().trim();
                filteredData = filteredData.filter(row => {
                    return Object.values(row).some(value => {
                        const stringValue = (value || '').toString().toLowerCase();
                        return stringValue.includes(searchTerm);
                    });
                });
            }

            // Apply column filters
            Object.entries(filters.columnFilters).forEach(([field, values]) => {
                if (values.size > 0) {
                    filteredData = filteredData.filter(row => {
                        const cellValue = row[field]?.toString() || '';
                        return values.has(cellValue) || (values.has('(Blanks)') && (!cellValue || cellValue.trim() === ''));
                    });
                }
            });

            // Calculate visible columns for CSV data
            const baseVisibleColumns = (csvData.columns || []).filter(col =>
                filters.visibleColumns.has(col) || filters.visibleColumns.size === 0
            );

            // Apply custom column order if available
            let visibleColumnsList;
            if (filters.columnOrder.length > 0) {
                // Use custom order but only include visible columns
                visibleColumnsList = filters.columnOrder.filter(col => baseVisibleColumns.includes(col));
                // Add any visible columns that aren't in the custom order
                baseVisibleColumns.forEach(col => {
                    if (!visibleColumnsList.includes(col)) {
                        visibleColumnsList.push(col);
                    }
                });
            } else {
                visibleColumnsList = baseVisibleColumns;
            }


            const result = {
                filteredData,
                totalRows: parseInt(csvData.pagination.total_rows) || 0,
                totalPages: parseInt(csvData.pagination.total_pages) || 1,
                startIndex: (parseInt(csvData.pagination.current_page) - 1) * parseInt(csvData.pagination.page_size),
                endIndex: Math.min(
                    (parseInt(csvData.pagination.current_page) - 1) * parseInt(csvData.pagination.page_size) + parseInt(csvData.pagination.page_size),
                    parseInt(csvData.pagination.total_rows)
                ),
                displayedRows: filteredData,
                displayedRowsCount: filteredData.length,
                visibleColumnsList,
                hasNext: csvData.pagination.has_next === 'true' || csvData.pagination.has_next === true,
                hasPrevious: csvData.pagination.has_previous === 'true' || csvData.pagination.has_previous === true,
                isServerSidePagination: true
            };


            return result;
        }

        // For calculation_results, use client-side pagination

        // Calculate filtered data
        let filteredData = data.table || [];

        // Apply global search filter
        if (filters.globalSearch && filters.globalSearch.trim()) {
            const searchTerm = filters.globalSearch.toLowerCase().trim();
            filteredData = filteredData.filter(row => {
                return Object.values(row).some(value => {
                    const stringValue = (value || '').toString().toLowerCase();
                    return stringValue.includes(searchTerm);
                });
            });
        }

        // Apply column filters
        Object.entries(filters.columnFilters).forEach(([field, values]) => {
            if (values.size > 0) {
                filteredData = filteredData.filter(row => {
                    const cellValue = row[field]?.toString() || '';
                    return values.has(cellValue) || (values.has('(Blanks)') && (!cellValue || cellValue.trim() === ''));
                });
            }
        });

        // Calculate pagination
        const totalRows = filteredData.length;
        const totalPages = Math.ceil(totalRows / pagination.pageSize);
        const startIndex = (pagination.currentPage - 1) * pagination.pageSize;
        const endIndex = Math.min(startIndex + pagination.pageSize, totalRows);
        const displayedRows = filteredData.slice(startIndex, endIndex);
        const displayedRowsCount = displayedRows.length;

        // Calculate visible columns - if no columns are selected, show all columns
        const baseVisibleColumns = (data.headers || []).filter(col =>
            filters.visibleColumns.has(col) || filters.visibleColumns.size === 0
        );

        // Apply custom column order if available
        let visibleColumnsList;
        if (filters.columnOrder.length > 0) {
            // Use custom order but only include visible columns
            visibleColumnsList = filters.columnOrder.filter(col => baseVisibleColumns.includes(col));
            // Add any visible columns that aren't in the custom order
            baseVisibleColumns.forEach(col => {
                if (!visibleColumnsList.includes(col)) {
                    visibleColumnsList.push(col);
                }
            });
        } else {
            visibleColumnsList = baseVisibleColumns;
        }

        const result = {
            filteredData,
            totalRows,
            totalPages,
            startIndex,
            endIndex,
            displayedRows,
            displayedRowsCount,
            visibleColumnsList,
            hasNext: pagination.currentPage < totalPages,
            hasPrevious: pagination.currentPage > 1,
            isServerSidePagination: false
        };

        return result;
    }, [state, csvData]);

    // Action creators
    const actions = useMemo(() => ({
        // Data actions
        setData: (data) => dispatch({ type: ACTIONS.SET_DATA, payload: data }),
        setLoading: (loading) => dispatch({ type: ACTIONS.SET_LOADING, payload: loading }),
        setDataProcessed: (processed) => dispatch({ type: ACTIONS.SET_DATA_PROCESSED, payload: processed }),

        // Pagination actions
        setCurrentPage: (page) => dispatch({ type: ACTIONS.SET_CURRENT_PAGE, payload: page }),
        setPageSize: (size) => dispatch({ type: ACTIONS.SET_PAGE_SIZE, payload: size }),
        setCustomPageSize: (size) => dispatch({ type: ACTIONS.SET_CUSTOM_PAGE_SIZE, payload: size }),
        toggleCustomInput: (show) => dispatch({ type: ACTIONS.TOGGLE_CUSTOM_INPUT, payload: show }),

        // Filter actions
        setColumnFilters: (filters) => dispatch({ type: ACTIONS.SET_COLUMN_FILTERS, payload: filters }),
        addColumnFilter: (column, values) => dispatch({ type: ACTIONS.ADD_COLUMN_FILTER, payload: { column, values } }),
        removeColumnFilter: (column) => dispatch({ type: ACTIONS.REMOVE_COLUMN_FILTER, payload: column }),
        clearAllFilters: () => dispatch({ type: ACTIONS.CLEAR_ALL_FILTERS }),
        setVisibleColumns: (columns) => dispatch({ type: ACTIONS.SET_VISIBLE_COLUMNS, payload: columns }),
        toggleColumnVisibility: (column) => dispatch({ type: ACTIONS.TOGGLE_COLUMN_VISIBILITY, payload: column }),
        setColumnSearch: (search) => dispatch({ type: ACTIONS.SET_COLUMN_SEARCH, payload: search }),
        toggleColumnSelector: (show) => dispatch({ type: ACTIONS.TOGGLE_COLUMN_SELECTOR, payload: show }),
        setColumnOrder: (order) => dispatch({ type: ACTIONS.SET_COLUMN_ORDER, payload: order }),
        resetColumnOrder: () => dispatch({ type: ACTIONS.RESET_COLUMN_ORDER }),
        setGlobalSearch: (search) => dispatch({ type: ACTIONS.SET_GLOBAL_SEARCH, payload: search }),
        setSearchResults: (results) => dispatch({ type: ACTIONS.SET_SEARCH_RESULTS, payload: results }),

        // UI actions
        setColumnFilterUI: (uiState) => dispatch({ type: ACTIONS.SET_COLUMN_FILTER_UI, payload: uiState }),
        setFilterValues: (values) => dispatch({ type: ACTIONS.SET_FILTER_VALUES, payload: values }),
        setDropdownPosition: (position) => dispatch({ type: ACTIONS.SET_DROPDOWN_POSITION, payload: position }),
        toggleActiveFiltersDropdown: (show) => dispatch({ type: ACTIONS.TOGGLE_ACTIVE_FILTERS_DROPDOWN, payload: show }),

        // Grid actions
        setTableHeight: (height) => dispatch({ type: ACTIONS.SET_TABLE_HEIGHT, payload: height }),
        setManualResizes: (hasResizes) => dispatch({ type: ACTIONS.SET_MANUAL_RESIZES, payload: hasResizes }),
        addManualResize: (columnId) => dispatch({ type: ACTIONS.ADD_MANUAL_RESIZE, payload: columnId })
    }), []);

    const contextValue = useMemo(() => ({
        state,
        actions,
        computed: computedValues,
        nodeOutput,
        csvData,
        onPageChange,
        onPageSizeChange,
        onSearch
    }), [state, actions, computedValues, nodeOutput, csvData, onPageChange, onPageSizeChange, onSearch]);

    return (
        <DataOutputContext.Provider value={contextValue}>
            {children}
        </DataOutputContext.Provider>
    );
};

// Custom hook to use the context
export const useDataOutput = () => {
    const context = useContext(DataOutputContext);
    if (!context) {
        throw new Error('useDataOutput must be used within a DataOutputProvider');
    }
    return context;
};

export default DataOutputContext;
