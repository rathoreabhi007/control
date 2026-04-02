import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, ClientSideRowModelModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

// Register the client-side row model module (required for AG Grid v31+)
ModuleRegistry.registerModules([ClientSideRowModelModule]);

// Constants for AG-Grid configuration - Desktop Optimized
const AG_GRID_CONSTANTS = {
    DEFAULT_HEIGHT: 800,
    DEFAULT_PAGE_SIZE: 200,
    DEFAULT_COLUMN_WIDTH: 180,
    HEADER_HEIGHT: 50,
    MIN_DROPDOWN_HEIGHT: 400,
    DEFAULT_DROPDOWN_VALUES_HEIGHT: 300,
    COLORS: {
        SLATE_600: '#334155',
        SLATE_500: '#475569',
        SLATE_400: '#64748b',
        SLATE_300: '#cbd5e1',
        GRAY_50: '#f9fafb',
        BLUE_500: '#3b82f6',
        RED_500: '#ef4444',
        GREEN_500: '#22c55e'
    }
};

// Interface converted to JSDoc comment for documentation
/**
 * @typedef {Object} AgGridTableProps
 * @property {any[]} columns
 * @property {any[]} rowData
 * @property {number|string} [height]
 * @property {number|string} [width]
 * @property {boolean} [showExportButtons]
 * @property {string} [exportFileName]
 */

const AgGridTable = React.memo(({
    columns,
    rowData,
    height,
    width = '100%',
    showExportButtons = true,
    exportFileName = 'data'
}) => {
    // Performance monitoring
    // console.log('AgGridTable render:', {
    // columnsCount: columns?.length,
    //     rowDataCount: rowData?.length,
    //         timestamp: new Date().toISOString()
    // });
    const gridRef = useRef(null);
    const [tableHeight, setTableHeight] = useState(AG_GRID_CONSTANTS.DEFAULT_HEIGHT);
    const [isLoading, setIsLoading] = useState(false);
    const [dataProcessed, setDataProcessed] = useState(false);

    // Custom pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(AG_GRID_CONSTANTS.DEFAULT_PAGE_SIZE);
    const [customPageSize, setCustomPageSize] = useState(AG_GRID_CONSTANTS.DEFAULT_PAGE_SIZE.toString());
    const [showCustomInput, setShowCustomInput] = useState(false);

    // Column visibility state
    const [showColumnSelector, setShowColumnSelector] = useState(false);
    const [visibleColumns, setVisibleColumns] = useState(
        new Set(columns.map(col => col.field))
    );
    const [columnSearch, setColumnSearch] = useState('');

    // Column filter modal state
    const [showColumnFilter, setShowColumnFilter] = useState(false);
    const [selectedColumn, setSelectedColumn] = useState('');
    const [columnFilterSearch, setColumnFilterSearch] = useState('');
    const [selectedValues, setSelectedValues] = useState(new Set());
    const [availableValues, setAvailableValues] = useState([]);
    const [filteredValues, setFilteredValues] = useState([]);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
    const [dropdownHeight, setDropdownHeight] = useState({
        maxHeight: AG_GRID_CONSTANTS.MIN_DROPDOWN_HEIGHT,
        valuesMaxHeight: AG_GRID_CONSTANTS.DEFAULT_DROPDOWN_VALUES_HEIGHT
    });

    // Applied column filters
    const [columnFilters, setColumnFilters] = useState({});

    // Add state for showing the active filters dropdown
    const [showActiveFiltersDropdown, setShowActiveFiltersDropdown] = useState(false);

    // Performance optimization: Process data in chunks for large datasets
    useEffect(() => {
        if (rowData && rowData.length > 1000) {
            setIsLoading(true);
            // Use requestIdleCallback for smooth processing
            const processInChunks = () => {
                requestIdleCallback(() => {
                    setDataProcessed(true);
                    setIsLoading(false);
                }, { timeout: 100 });
            };
            processInChunks();
        } else {
            setDataProcessed(true);
            setIsLoading(false);
        }
    }, [rowData]);



    // Handler to remove a single filter
    const removeFilter = useCallback((column) => {
        setColumnFilters(prev => {
            const newFilters = { ...prev };
            delete newFilters[column];
            return newFilters;
        });
    }, []);

    // Calculate pagination with applied filters
    const getFilteredData = () => {
        let filtered = rowData;

        // Apply column filters
        Object.entries(columnFilters).forEach(([field, values]) => {
            if (values.size > 0) {
                filtered = filtered.filter(row => {
                    const cellValue = row[field]?.toString() || '';
                    return values.has(cellValue) || (values.has('(Blanks)') && (!cellValue || cellValue.trim() === ''));
                });
            }
        });

        return filtered;
    };

    const filteredData = useMemo(() => getFilteredData(), [rowData, columnFilters]);
    const totalRows = filteredData.length;
    const totalPages = Math.ceil(totalRows / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalRows);
    const displayedRows = useMemo(() => filteredData.slice(startIndex, endIndex), [filteredData, startIndex, endIndex]);

    // Calculate height based on screen size
    useEffect(() => {
        const calculateHeight = () => {
            const viewportHeight = window.innerHeight;
            const minHeight = 400;
            const maxHeight = Math.floor(viewportHeight * 0.75);
            const calculatedHeight = Math.max(minHeight, Math.min(700, maxHeight));
            setTableHeight(calculatedHeight);
        };

        calculateHeight();
        window.addEventListener('resize', calculateHeight);
        return () => window.removeEventListener('resize', calculateHeight);
    }, []);

    // Reset to page 1 when page size changes or filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [pageSize, columnFilters]);

    // Add a more intelligent resize handler that detects drag operations
    useEffect(() => {
        let resizeTimeout;
        let isDragging = false;
        let lastHeight = height;

        const handleResize = () => {
            // Clear any existing timeout
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
            }

            // If we're in the middle of a drag operation, don't resize immediately
            if (isDragging) {
                return;
            }

            // Debounce the resize event
            resizeTimeout = setTimeout(() => {
                if (gridRef.current && gridRef.current.api) {
                    // Only auto-resize if no columns have been manually resized
                    if (!gridRef.current.api.hasManualResizes) {
                        gridRef.current.api.sizeColumnsToFit();
                    }
                    // If manual resizes exist, do nothing - preserve user's column sizes
                }
            }, 150);
        };

        // Detect when user starts dragging (mouse down on resize handle)
        const handleMouseDown = (e) => {
            // Check if the mouse is on a resize handle or near the edge of the container
            const target = e.target;
            if (target.classList.contains('ag-header-cell-resize') ||
                target.closest('.ag-header-cell-resize') ||
                target.classList.contains('ag-resize-handle') ||
                target.classList.contains('cursor-row-resize') ||
                target.closest('.cursor-row-resize')) {
                isDragging = true;
            }
        };

        // Detect when user stops dragging
        const handleMouseUp = () => {
            if (isDragging) {
                isDragging = false;
                // Don't auto-resize after drag - preserve manual column resizes
                // The onColumnResized event will handle tracking manual resizes
            }
        };

        // Monitor height changes from parent component
        if (height !== lastHeight) {
            lastHeight = height;
            // When height changes (from parent resize), only fit columns if no manual resizes
            if (gridRef.current && gridRef.current.api) {
                setTimeout(() => {
                    if (!gridRef.current.api.hasManualResizes) {
                        gridRef.current.api.sizeColumnsToFit();
                    }
                    // If manual resizes exist, preserve them
                }, 50);
            }
        }

        window.addEventListener('resize', handleResize);
        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('resize', handleResize);
            document.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('mouseup', handleMouseUp);
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
            }
        };
    }, [height]); // Add height as dependency

    // Cleanup observers on unmount
    useEffect(() => {
        const currentGridRef = gridRef.current;

        return () => {
            if (currentGridRef && currentGridRef.api) {
                if (currentGridRef.api.mutationObserver) {
                    currentGridRef.api.mutationObserver.disconnect();
                }
                if (currentGridRef.api.resizeObserver) {
                    currentGridRef.api.resizeObserver.disconnect();
                }
            }
        };
    }, []);





    // Update filtered values when search changes
    useEffect(() => {
        if (columnFilterSearch) {
            setFilteredValues(availableValues.filter(value =>
                value.toLowerCase().includes(columnFilterSearch.toLowerCase())
            ));
        } else {
            setFilteredValues(availableValues);
        }
    }, [columnFilterSearch, availableValues]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (showColumnFilter) {
                const target = event.target;
                if (!target.closest('.column-filter-dropdown')) {
                    setShowColumnFilter(false);
                }
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showColumnFilter]);

    // Column visibility functions
    const toggleColumnVisibility = useCallback((columnField) => {
        setVisibleColumns(prev => {
            const newVisible = new Set(prev);
            if (newVisible.has(columnField)) {
                newVisible.delete(columnField);
            } else {
                newVisible.add(columnField);
            }
            return newVisible;
        });
    }, []);

    const selectAllColumns = useCallback(() => {
        setVisibleColumns(new Set(columns.map(col => col.field)));
    }, [columns]);

    const clearAllColumns = useCallback(() => {
        setVisibleColumns(new Set());
    }, []);

    const getFilteredColumns = () => {
        if (!columnSearch) return columns;
        return columns.filter(col =>
            (col.headerName || col.field).toLowerCase().includes(columnSearch.toLowerCase())
        );
    };

    // Open column filter dropdown
    const openColumnFilter = (columnField, event) => {
        // Use currentTarget instead of target to get the button element
        const buttonRect = event.currentTarget.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

        // Calculate available space below the button
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - buttonRect.bottom;

        // Calculate dropdown dimensions
        const headerHeight = 48; // Header section
        const searchHeight = 48; // Search section  
        const selectAllHeight = 36; // Select all section
        const footerHeight = 48; // Footer with buttons
        const fixedHeight = headerHeight + searchHeight + selectAllHeight + footerHeight;

        // Reserve some padding from viewport edges
        const padding = 20;
        const maxAvailableHeight = spaceBelow - padding;

        // Calculate max height for the entire dropdown
        const dropdownMaxHeight = Math.max(300, Math.min(500, maxAvailableHeight));

        // Calculate max height for the values list
        const valuesMaxHeight = Math.max(150, dropdownMaxHeight - fixedHeight);

        setDropdownPosition({
            top: buttonRect.bottom + scrollTop + 5,
            left: Math.max(10, Math.min(buttonRect.left + scrollLeft - 150, window.innerWidth - 330))
        });

        setDropdownHeight({
            maxHeight: dropdownMaxHeight,
            valuesMaxHeight: valuesMaxHeight
        });

        setSelectedColumn(columnField);
        setColumnFilterSearch('');

        // Get unique values for this column
        const uniqueValues = [...new Set(rowData.map(row => {
            const value = row[columnField]?.toString() || '';
            return value.trim() === '' ? '(Blanks)' : value;
        }))].sort();

        setAvailableValues(uniqueValues);
        setFilteredValues(uniqueValues);

        // Set currently selected values
        const currentFilter = columnFilters[columnField] || new Set();
        setSelectedValues(new Set(currentFilter));

        setShowColumnFilter(true);
    };

    // Apply column filter
    const applyColumnFilter = () => {
        const newFilters = { ...columnFilters };
        if (selectedValues.size === 0) {
            delete newFilters[selectedColumn];
        } else {
            newFilters[selectedColumn] = new Set(selectedValues);
        }
        setColumnFilters(newFilters);
        setShowColumnFilter(false);
    };

    // Clear all column filters
    const clearAllColumnFilters = () => {
        setColumnFilters({});
    };

    // Toggle value selection
    const toggleValue = (value) => {
        const newSelected = new Set(selectedValues);
        if (newSelected.has(value)) {
            newSelected.delete(value);
        } else {
            newSelected.add(value);
        }
        setSelectedValues(newSelected);
    };

    // Select/Deselect all
    const toggleSelectAll = () => {
        if (selectedValues.size === filteredValues.length) {
            setSelectedValues(new Set());
        } else {
            setSelectedValues(new Set(filteredValues));
        }
    };

    // Auto-detect column type and add appropriate filters - ONLY for visible columns
    const visibleColumnsList = useMemo(() =>
        columns.filter(col => visibleColumns.has(col.field)),
        [columns, visibleColumns]
    );

    const enhancedColumns = useMemo(() => visibleColumnsList
        .map(col => {
            const sampleValues = rowData.slice(0, 10).map(row => row[col.field]).filter(val => val != null);
            const isNumeric = sampleValues.length > 0 && sampleValues.every(val => !isNaN(Number(val)));
            const hasActiveFilter = columnFilters[col.field] && columnFilters[col.field].size > 0;

            return {
                ...col,
                headerComponent: (params) => {
                    return (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: '100%',
                            gap: '8px', // Increased gap for better spacing
                            padding: '4px 8px', // Added padding for breathing room
                            minHeight: '32px' // Ensure minimum height for better readability
                        }}>

                            <span style={{
                                flex: 1,
                                fontSize: '13px', // Slightly larger font
                                fontWeight: '600',
                                color: '#1e293b',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                minWidth: 0, // Allow text to shrink properly
                                lineHeight: '1.3' // Better line spacing
                            }}
                                title={col.headerName || col.field} // Show full name on hover
                            >
                                {col.headerName || col.field}
                            </span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    openColumnFilter(col.field, e);
                                }}
                                style={{
                                    width: '20px',
                                    height: '20px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: hasActiveFilter ? '#10b981' : 'transparent',
                                    color: hasActiveFilter ? 'white' : '#64748b',
                                    border: hasActiveFilter ? '1px solid #10b981' : '1px solid #64748b',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    flexShrink: 0,
                                    transition: 'all 0.2s ease'
                                }}
                                title={`Filter ${col.headerName || col.field}`}
                            >
                                <img
                                    src="/filter-icon.svg"
                                    alt="Filter"
                                    style={{
                                        width: '14px',
                                        height: '14px',
                                        filter: 'brightness(0)'
                                    }}
                                />
                            </button>
                        </div>
                    );
                },
                filter: isNumeric ? 'agNumberColumnFilter' : 'agTextColumnFilter',
                sortable: true,
                resizable: true,
                filterParams: isNumeric ? {
                    buttons: ['reset', 'apply'],
                    closeOnApply: true
                } : {
                    buttons: ['reset', 'apply'],
                    closeOnApply: true,
                    filterOptions: ['contains', 'equals', 'startsWith', 'endsWith']
                }
            };
        }), [visibleColumnsList, rowData, columnFilters]);

    // Pagination handlers
    const goToPage = useCallback((page) => {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page);
        }
    }, [totalPages]);

    const handlePageSizeChange = useCallback((newSize) => {
        setPageSize(newSize);
        setCustomPageSize(newSize.toString());
        setShowCustomInput(false);
    }, []);

    const handleCustomPageSizeSubmit = useCallback(() => {
        const size = parseInt(customPageSize);
        if (size && size > 0 && size <= totalRows) {
            setPageSize(size);
            setShowCustomInput(false);
        }
    }, [customPageSize, totalRows]);

    // Export functions - FIXED to work with full dataset and visible columns only
    const exportToCsv = useCallback(() => {
        // Export ALL original data but only visible columns
        const visibleColumnsArray = columns.filter(col => visibleColumns.has(col.field));
        const allDataCsv = convertToCSV(rowData, visibleColumnsArray);
        downloadCSV(allDataCsv, `${exportFileName}_all.csv`);
    }, [columns, visibleColumns, rowData, exportFileName]);

    const exportFilteredToCsv = useCallback(() => {
        // Apply current filters to full dataset and export visible columns only
        const visibleColumnsArray = columns.filter(col => visibleColumns.has(col.field));

        // Start with all data and apply custom column filters first
        let filteredData = getFilteredData(); // This applies custom column filters

        if (gridRef.current) {
            // Get current AG-Grid filter model and apply it to already filtered data
            const filterModel = gridRef.current.api.getFilterModel();

            if (Object.keys(filterModel).length > 0) {
                // Apply AG-Grid filters to the data that's already filtered by custom column filters
                filteredData = applyFiltersToData(filteredData, filterModel, visibleColumnsArray);
            }
        }

        // Export the fully filtered data with only visible columns
        const filteredCsv = convertToCSV(filteredData, visibleColumnsArray);
        downloadCSV(filteredCsv, `${exportFileName}_filtered.csv`);
    }, [columns, visibleColumns, exportFileName]);

    const exportSelectedToCsv = useCallback(() => {
        if (gridRef.current) {
            const selectedNodes = gridRef.current.api.getSelectedNodes();
            const selectedData = selectedNodes.map(node => node.data);
            if (selectedData.length > 0) {
                const visibleColumnsArray = columns.filter(col => visibleColumns.has(col.field));
                const selectedCsv = convertToCSV(selectedData, visibleColumnsArray);
                downloadCSV(selectedCsv, `${exportFileName}_selected.csv`);
            } else {
                alert('No rows selected. Please select rows to export.');
            }
        }
    }, [columns, visibleColumns, exportFileName]);

    const clearAllFilters = useCallback(() => {
        if (gridRef.current) {
            gridRef.current.api.setFilterModel(null);
        }
        clearAllColumnFilters();
    }, []);

    // Helper function to convert data to CSV
    const convertToCSV = (data, columns) => {
        const headers = columns.map(col => col.headerName || col.field).join(',');
        const rows = data.map(row =>
            columns.map(col => {
                const value = row[col.field];
                // Handle values that contain commas or quotes
                const cleanValue = value?.toString().replace(/"/g, '""') || '';
                return cleanValue.includes(',') ? `"${cleanValue}"` : cleanValue;
            }).join(',')
        );
        return [headers, ...rows].join('\n');
    };

    // Helper function to download CSV
    const downloadCSV = (csvContent, fileName) => {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Helper function to apply filters to data
    const applyFiltersToData = (data, filterModel, columns) => {
        return data.filter(row => {
            return Object.entries(filterModel).every(([field, filter]) => {
                const cellValue = row[field];

                if (!filter || cellValue == null) return true;

                // Handle different filter types
                if (filter.filterType === 'text' || typeof filter === 'object') {
                    const filterValue = filter.filter || filter.filterType;
                    const type = filter.type || 'contains';
                    const value = cellValue.toString().toLowerCase();
                    const search = filterValue?.toString().toLowerCase() || '';

                    switch (type) {
                        case 'contains': return value.includes(search);
                        case 'equals': return value === search;
                        case 'startsWith': return value.startsWith(search);
                        case 'endsWith': return value.endsWith(search);
                        default: return true;
                    }
                } else if (filter.filterType === 'number') {
                    const numValue = Number(cellValue);
                    const filterNum = Number(filter.filter);
                    const type = filter.type || 'equals';

                    switch (type) {
                        case 'equals': return numValue === filterNum;
                        case 'greaterThan': return numValue > filterNum;
                        case 'lessThan': return numValue < filterNum;
                        case 'greaterThanOrEqual': return numValue >= filterNum;
                        case 'lessThanOrEqual': return numValue <= filterNum;
                        default: return true;
                    }
                }

                return true;
            });
        });
    };

    const finalHeight = height ? (typeof height === 'number' ? height : parseInt(height.toString())) : tableHeight;

    // Generate page numbers for pagination
    const getPageNumbers = () => {
        const pages = [];
        const maxVisiblePages = 7;

        if (totalPages <= maxVisiblePages) {
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i);
            }
        } else {
            if (currentPage <= 4) {
                for (let i = 1; i <= 5; i++) pages.push(i);
                pages.push('...');
                pages.push(totalPages);
            } else if (currentPage >= totalPages - 3) {
                pages.push(1);
                pages.push('...');
                for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
            } else {
                pages.push(1);
                pages.push('...');
                for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
                pages.push('...');
                pages.push(totalPages);
            }
        }
        return pages;
    };

    return (
        <div style={{
            width,
            maxWidth: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            marginBottom: '20px'
        }}>
            {/* Top Section with Export Buttons, Column Selector, and Value Filter */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                {/* Export Buttons - Ultra Compact */}
                {showExportButtons && (
                    <div style={{
                        display: 'flex',
                        gap: '4px',
                        flexWrap: 'wrap',
                        padding: '0 4px',
                        marginBottom: '8px'
                    }}>
                        <button onClick={clearAllFilters} style={{
                            padding: '6px 10px',
                            backgroundColor: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: '500'
                        }}>
                            Clear All Filters
                        </button>
                        <button onClick={exportToCsv} style={{
                            padding: '6px 10px',
                            backgroundColor: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: '500'
                        }}>
                            Export All to CSV
                        </button>
                        <button onClick={exportFilteredToCsv} style={{
                            padding: '6px 10px',
                            backgroundColor: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: '500'
                        }}>
                            Export Filtered to CSV
                        </button>
                        <button onClick={exportSelectedToCsv} style={{
                            padding: '6px 10px',
                            backgroundColor: '#f59e0b',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: '500'
                        }}>
                            Export Selected to CSV
                        </button>
                    </div>
                )}

                {/* Right side controls */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    {/* Column Visibility Selector */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '4px',
                        backgroundColor: '#1e293b',
                        borderRadius: '6px',
                        border: '1px solid #475569',
                        position: 'relative'
                    }}>
                        <button
                            onClick={() => setShowColumnSelector(!showColumnSelector)}
                            style={{
                                padding: '4px 8px',
                                fontSize: '11px',
                                backgroundColor: '#334155',
                                color: '#e2e8f0',
                                border: '1px solid #64748b',
                                borderRadius: '3px',
                                cursor: 'pointer',
                                fontWeight: '500'
                            }}
                        >
                            📋 Select ({visibleColumns.size}/{columns.length})
                        </button>

                        {/* Column Selector Dropdown */}
                        {showColumnSelector && (
                            <div style={{
                                position: 'absolute',
                                top: '100%',
                                right: 0,
                                backgroundColor: '#1e293b',
                                border: '1px solid #475569',
                                borderRadius: '6px',
                                zIndex: 1000,
                                minWidth: '250px',
                                maxHeight: '400px',
                                marginTop: '4px',
                                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
                            }}>
                                {/* Header */}
                                <div style={{
                                    padding: '8px 12px',
                                    borderBottom: '1px solid #475569',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <span style={{ fontSize: '12px', color: '#e2e8f0', fontWeight: '500' }}>
                                        Select Columns
                                    </span>
                                    <button
                                        onClick={() => setShowColumnSelector(false)}
                                        style={{
                                            backgroundColor: 'transparent',
                                            border: 'none',
                                            color: '#94a3b8',
                                            fontSize: '14px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        ✕
                                    </button>
                                </div>

                                {/* Search */}
                                <div style={{ padding: '8px 12px', borderBottom: '1px solid #475569' }}>
                                    <input
                                        type="text"
                                        placeholder="Search columns..."
                                        value={columnSearch}
                                        onChange={(e) => setColumnSearch(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '4px 6px',
                                            backgroundColor: '#334155',
                                            color: '#e2e8f0',
                                            border: '1px solid #64748b',
                                            borderRadius: '3px',
                                            fontSize: '10px'
                                        }}
                                    />
                                </div>

                                {/* Select All / Clear All */}
                                <div style={{ padding: '6px 12px', borderBottom: '1px solid #475569', display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={selectAllColumns}
                                        style={{
                                            padding: '3px 8px',
                                            fontSize: '10px',
                                            backgroundColor: '#10b981',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '3px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Select All
                                    </button>
                                    <button
                                        onClick={clearAllColumns}
                                        style={{
                                            padding: '3px 8px',
                                            fontSize: '10px',
                                            backgroundColor: '#ef4444',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '3px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Clear All
                                    </button>
                                </div>

                                {/* Column List */}
                                <div style={{
                                    maxHeight: '250px',
                                    overflowY: 'auto',
                                    padding: '6px 0'
                                }}>
                                    {getFilteredColumns().map(col => (
                                        <label
                                            key={col.field}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                padding: '3px 12px',
                                                cursor: 'pointer',
                                                fontSize: '10px',
                                                color: '#e2e8f0'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#334155'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={visibleColumns.has(col.field)}
                                                onChange={() => toggleColumnVisibility(col.field)}
                                                style={{ cursor: 'pointer' }}
                                            />
                                            {col.headerName || col.field}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Clear All Filters Button with Dropdown for Active Filters */}
                    {Object.keys(columnFilters).length > 0 && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '4px',
                            backgroundColor: '#1e293b',
                            borderRadius: '6px',
                            border: '1px solid #475569',
                            position: 'relative'
                        }}>
                            <span
                                style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                                onClick={() => setShowActiveFiltersDropdown(v => !v)}
                            >
                                Active Filters: <span style={{ fontSize: '13px', marginLeft: '2px' }}>▼</span>
                            </span>
                            <button
                                onClick={clearAllColumnFilters}
                                style={{
                                    padding: '4px 8px',
                                    fontSize: '10px',
                                    backgroundColor: '#ef4444',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '3px',
                                    cursor: 'pointer'
                                }}
                            >
                                Clear All ({Object.keys(columnFilters).length})
                            </button>
                            {/* Dropdown for active filters */}
                            {showActiveFiltersDropdown && (
                                <div style={{
                                    position: 'absolute',
                                    top: '110%',
                                    right: 0,
                                    backgroundColor: '#1e293b',
                                    border: '1px solid #475569',
                                    borderRadius: '6px',
                                    zIndex: 1000,
                                    minWidth: '180px',
                                    boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                                    padding: '8px 0',
                                }}>
                                    {Object.keys(columnFilters).map(col => (
                                        <div key={col} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '4px 16px',
                                            fontSize: '11px',
                                            color: '#e2e8f0',
                                            borderBottom: '1px solid #334155',
                                            gap: '8px'
                                        }}>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px' }}>{col}</span>
                                            <button
                                                onClick={() => removeFilter(col)}
                                                style={{
                                                    backgroundColor: '#ef4444',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '3px',
                                                    cursor: 'pointer',
                                                    fontSize: '10px',
                                                    padding: '2px 7px',
                                                    marginLeft: '8px'
                                                }}
                                                title={`Remove filter for ${col}`}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Grid Container */}
            <div
                className="ag-theme-alpine"
                style={{
                    height: `${finalHeight - 110}px`,
                    width: '100%',
                    border: '1px solid #475569',
                    borderRadius: '6px 6px 0 0',
                    position: 'relative',
                    overflow: 'hidden' // Prevent any overflow issues during resize
                }}
            >
                {/* Loading Overlay */}
                {isLoading && (
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        borderRadius: '6px 6px 0 0'
                    }}>
                        <div style={{
                            color: 'white',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '12px'
                        }}>
                            <div style={{
                                width: '32px',
                                height: '32px',
                                border: '3px solid rgba(255, 255, 255, 0.3)',
                                borderTop: '3px solid white',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite'
                            }}></div>
                            <span style={{ fontSize: '14px', fontWeight: '500' }}>
                                Loading data...
                            </span>
                        </div>
                    </div>
                )}

                {/* Add spinner animation */}
                <style>
                    {`
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    `}
                </style>
                {/* Add CSS for column dragging and improved spacing */}
                <style>
                    {`

                    .ag-header-cell:hover {
                        background-color: rgba(0, 0, 0, 0.05);
                    }
                    .ag-column-drop-horizontal {
                        background-color: #f0f9ff;
                        border: 2px dashed #3b82f6;
                        border-radius: 4px;
                    }
                    .ag-header-cell {
                        border-right: 1px solid #e2e8f0;
                    }
                    .ag-header {
                        border-bottom: 2px solid #e2e8f0;
                    }
                    .ag-header-row {
                        height: 40px !important; /* Increased header height */
                    }
                    .ag-header-cell-label {
                        padding: 0 4px; /* Add some padding to header labels */
                    }
                    
                    /* Prevent overlapping during resize */
                    .ag-cell {
                        overflow: hidden !important;
                        text-overflow: ellipsis !important;
                        white-space: nowrap !important;
                        position: relative !important;
                        padding: 0 8px !important; /* Add horizontal padding for better separation */
                        box-sizing: border-box !important;
                    }
                    
                    /* Ensure proper layout during resize */
                    .ag-body-viewport {
                        overflow-x: auto !important;
                        position: relative !important;
                    }
                    
                    /* Prevent column overlap during resize */
                    .ag-header-cell,
                    .ag-cell {
                        position: relative !important;
                        z-index: 1 !important;
                        border-right: 1px solid #f1f5f9 !important; /* Light border for column separation */
                    }
                    
                    /* Ensure proper cell content positioning */
                    .ag-cell-wrapper {
                        padding: 0 4px !important;
                        box-sizing: border-box !important;
                    }
                    
                    /* Smooth transitions for better UX */
                    .ag-header-cell,
                    .ag-cell {
                        transition: width 0.05s ease-out;
                    }
                    
                    /* Force proper column boundaries */
                    .ag-header-cell-resize {
                        position: absolute !important;
                        right: 0 !important;
                        top: 0 !important;
                        bottom: 0 !important;
                        width: 4px !important;
                        cursor: col-resize !important;
                        z-index: 10 !important;
                    }
                    
                    /* Ensure grid maintains structure during resize */
                    .ag-root-wrapper {
                        overflow: hidden !important;
                    }
                    
                    .ag-body-horizontal-scroll-viewport {
                        overflow-x: auto !important;
                        overflow-y: hidden !important;
                    }
                `}
                </style>
                {dataProcessed && (
                    <AgGridReact
                        ref={gridRef}
                        columnDefs={enhancedColumns}
                        rowData={displayedRows}

                        // Disable built-in pagination
                        pagination={false}

                        // Grid layout settings
                        domLayout="normal"

                        // Selection settings
                        suppressRowClickSelection={false}
                        rowSelection="multiple"

                        // Theme
                        theme="legacy"

                        // Column settings with performance optimizations
                        defaultColDef={{
                            sortable: true,
                            filter: true,
                            resizable: true,
                            minWidth: 160, // Slightly increased for better separation
                            // Remove maxWidth to allow manual column expansion
                            // Performance optimizations
                            suppressMenu: true,
                            suppressHeaderFilterButton: true
                        }}

                        // Performance optimizations for large datasets
                        rowBuffer={20} // Render extra rows outside viewport for smoother scrolling
                        maxBlocksInCache={10} // Limit memory usage
                        animateRows={false} // Disable animations for better performance

                        // Enable row virtualization for smooth scrolling
                        rowModelType="clientSide"

                        // Optimize rendering
                        headerHeight={AG_GRID_CONSTANTS.HEADER_HEIGHT}
                        rowHeight={32} // Consistent row height for better virtualization

                        // Column movement disabled
                        suppressMovableColumns={true} // Disable column drag and drop

                        // Text selection
                        enableCellTextSelection={true}

                        // Grid behavior
                        suppressHorizontalScroll={false}
                        suppressMenuHide={false}

                        // Event handlers
                        onGridReady={(params) => {
                            // Track if columns have been manually resized
                            params.api.manuallyResizedColumns = new Set();
                            params.api.hasManualResizes = false; // Flag to quickly check if any manual resizes exist

                            // Enhanced column sizing approach - only for initial load and container resize
                            const fitColumnsWithPadding = () => {
                                // Add null checks to prevent errors
                                if (!params.api || !params.api.gridBodyCtrl || !params.api.gridBodyCtrl.eBodyViewport) {
                                    // console.warn('Grid not fully initialized yet, skipping column sizing');
                                    return;
                                }

                                const containerWidth = params.api.gridBodyCtrl.eBodyViewport.clientWidth;
                                const allColumns = params.api.getAllDisplayedColumns();

                                if (allColumns.length === 0) return;

                                // Calculate total content width needed
                                const totalContentWidth = allColumns.reduce((sum, col) => {
                                    return sum + Math.max(160, col.getActualWidth()); // Use minWidth as base
                                }, 0);

                                // Add padding for column separation
                                const totalPadding = allColumns.length * 16; // 8px padding on each side
                                const totalWidthNeeded = totalContentWidth + totalPadding;

                                if (totalWidthNeeded > containerWidth) {
                                    // If content is wider than container, fit to container
                                    // But preserve manually resized columns
                                    params.api.sizeColumnsToFit();
                                } else {
                                    // If there's extra space, distribute it evenly with minimum width
                                    // But only for columns that haven't been manually resized
                                    const extraSpace = containerWidth - totalWidthNeeded;
                                    const autoResizeColumns = allColumns.filter(col =>
                                        !params.api.manuallyResizedColumns.has(col.getColId())
                                    );

                                    if (autoResizeColumns.length > 0) {
                                        const extraPerColumn = extraSpace / autoResizeColumns.length;

                                        autoResizeColumns.forEach(col => {
                                            const newWidth = Math.max(160, col.getActualWidth() + extraPerColumn);
                                            params.api.setColumnWidth(col, newWidth);
                                        });
                                    }
                                }
                            };

                            // Initial sizing - only if no manual resizes exist
                            if (!params.api.hasManualResizes) {
                                // Add a small delay to ensure grid is fully rendered
                                setTimeout(() => {
                                    fitColumnsWithPadding();
                                }, 100);
                            }

                            // Set up a more intelligent resize detection using ResizeObserver
                            // This will detect when the grid container itself changes size
                            const gridContainer = params.api.gridBodyCtrl?.eBodyViewport;
                            if (gridContainer && window.ResizeObserver) {
                                let resizeTimeout;

                                const resizeObserver = new ResizeObserver((entries) => {
                                    // Clear any existing timeout
                                    if (resizeTimeout) {
                                        clearTimeout(resizeTimeout);
                                    }

                                    // Debounce the resize handling
                                    resizeTimeout = setTimeout(() => {
                                        if (params.api) {
                                            // Only auto-resize if no columns have been manually resized
                                            if (!params.api.hasManualResizes) {
                                                fitColumnsWithPadding();
                                            }
                                            // If manual resizes exist, do nothing - preserve user's column sizes
                                        }
                                    }, 100);
                                });

                                resizeObserver.observe(gridContainer);

                                // Store observer for cleanup
                                params.api.resizeObserver = resizeObserver;
                            }

                            // Also set up MutationObserver for parent container changes
                            if (gridContainer && gridContainer.parentElement) {
                                let mutationTimeout;
                                let lastMutationTime = 0;

                                const observer = new MutationObserver((mutations) => {
                                    // Clear any existing timeout
                                    if (mutationTimeout) {
                                        clearTimeout(mutationTimeout);
                                    }

                                    const now = Date.now();

                                    // Only process mutations if enough time has passed since last one
                                    if (now - lastMutationTime > 200) {
                                        lastMutationTime = now;

                                        // Debounce the mutation handling
                                        mutationTimeout = setTimeout(() => {
                                            if (params.api) {
                                                // Only auto-resize if no columns have been manually resized
                                                if (!params.api.hasManualResizes) {
                                                    params.api.sizeColumnsToFit();
                                                }
                                                // If manual resizes exist, do nothing - preserve user's column sizes
                                            }
                                        }, 300);
                                    }
                                });

                                observer.observe(gridContainer.parentElement, {
                                    attributes: true,
                                    attributeFilter: ['style', 'class'],
                                    childList: false,
                                    subtree: false
                                });

                                // Store observer for cleanup
                                params.api.mutationObserver = observer;
                            }
                        }}



                        onGridSizeChanged={(params) => {
                            // Debounce the grid size change to prevent conflicts during drag operations
                            if (params.api.resizeTimeout) {
                                clearTimeout(params.api.resizeTimeout);
                            }

                            params.api.resizeTimeout = setTimeout(() => {
                                // Only auto-resize if no columns have been manually resized
                                if (!params.api.hasManualResizes) {
                                    // Use the same enhanced sizing logic but preserve manual resizes
                                    const containerWidth = params.api.gridBodyCtrl.eBodyViewport.clientWidth;
                                    const allColumns = params.api.getAllDisplayedColumns();

                                    if (allColumns.length === 0) return;

                                    // Calculate total content width needed
                                    const totalContentWidth = allColumns.reduce((sum, col) => {
                                        return sum + Math.max(160, col.getActualWidth());
                                    }, 0);

                                    // Add padding for column separation
                                    const totalPadding = allColumns.length * 16;
                                    const totalWidthNeeded = totalContentWidth + totalPadding;

                                    if (totalWidthNeeded > containerWidth) {
                                        params.api.sizeColumnsToFit();
                                    } else {
                                        const extraSpace = containerWidth - totalWidthNeeded;
                                        const autoResizeColumns = allColumns.filter(col =>
                                            !params.api.manuallyResizedColumns.has(col.getColId())
                                        );

                                        if (autoResizeColumns.length > 0) {
                                            const extraPerColumn = extraSpace / autoResizeColumns.length;

                                            autoResizeColumns.forEach(col => {
                                                const newWidth = Math.max(160, col.getActualWidth() + extraPerColumn);
                                                params.api.setColumnWidth(col, newWidth);
                                            });
                                        }
                                    }
                                }
                                // If manual resizes exist, do nothing - preserve user's column sizes
                            }, 100);
                        }}

                        onColumnResized={(params) => {
                            // Track manually resized columns
                            if (params.column && params.api.manuallyResizedColumns) {
                                const columnId = params.column.getColId();
                                const newWidth = params.column.getActualWidth();

                                // Only track if it's a meaningful resize (not just a tiny adjustment)
                                if (newWidth > 208) { // Only track resizes above minimum width (updated)
                                    params.api.manuallyResizedColumns.add(columnId);
                                    params.api.hasManualResizes = true; // Set the flag

                                    // Log for debugging
                                    // console.log(`Column ${columnId} manually resized to ${newWidth}px`);
                                    // console.log(`Total manually resized columns: ${params.api.manuallyResizedColumns.size}`);
                                    // console.log('Manual resizes will now be preserved');
                                }
                            }
                        }}
                    />
                )}
            </div>

            {/* CUSTOM PAGINATION CONTROLS - ULTRA COMPACT */}
            <div style={{
                backgroundColor: '#334155',
                border: '1px solid #475569',
                borderTop: 'none',
                borderRadius: '0 0 6px 6px',
                padding: '10px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px',
                minHeight: '42px',
                color: '#e2e8f0',
                fontSize: '12px',
                fontWeight: '500',
                boxSizing: 'border-box',
                marginBottom: '6px'
            }}>
                {/* Left side - Row info and page size controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <span style={{ whiteSpace: 'nowrap', fontSize: '11px' }}>
                        Showing {startIndex + 1} to {endIndex} of {totalRows} entries
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ whiteSpace: 'nowrap', fontSize: '11px' }}>Show:</span>

                        {/* Quick page size buttons - Ultra Compact */}
                        {[50, 100, 250, 500, 1000].map(size => (
                            <button
                                key={size}
                                onClick={() => handlePageSizeChange(size)}
                                style={{
                                    backgroundColor: pageSize === size ? '#10b981' : '#475569',
                                    color: '#e2e8f0',
                                    border: '1px solid #64748b',
                                    padding: '4px 8px',
                                    borderRadius: '3px',
                                    cursor: 'pointer',
                                    fontSize: '10px',
                                    fontWeight: '500',
                                    minWidth: '32px',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                {size}
                            </button>
                        ))}

                        {/* Custom number input - Ultra Compact */}
                        {!showCustomInput ? (
                            <button
                                onClick={() => setShowCustomInput(true)}
                                style={{
                                    backgroundColor: '#475569',
                                    color: '#e2e8f0',
                                    border: '1px solid #64748b',
                                    padding: '4px 8px',
                                    borderRadius: '3px',
                                    cursor: 'pointer',
                                    fontSize: '10px',
                                    fontWeight: '500',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                Custom
                            </button>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <input
                                    type="number"
                                    value={customPageSize}
                                    onChange={(e) => setCustomPageSize(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleCustomPageSizeSubmit()}
                                    style={{
                                        width: '60px',
                                        padding: '4px 6px',
                                        backgroundColor: '#475569',
                                        color: '#e2e8f0',
                                        border: '1px solid #64748b',
                                        borderRadius: '3px',
                                        fontSize: '10px'
                                    }}
                                    min="1"
                                    max={totalRows}
                                    placeholder="Any #"
                                />
                                <button
                                    onClick={handleCustomPageSizeSubmit}
                                    style={{
                                        backgroundColor: '#10b981',
                                        color: 'white',
                                        border: 'none',
                                        padding: '4px 7px',
                                        borderRadius: '3px',
                                        cursor: 'pointer',
                                        fontSize: '9px'
                                    }}
                                >
                                    Set
                                </button>
                                <button
                                    onClick={() => setShowCustomInput(false)}
                                    style={{
                                        backgroundColor: '#ef4444',
                                        color: 'white',
                                        border: 'none',
                                        padding: '4px 7px',
                                        borderRadius: '3px',
                                        cursor: 'pointer',
                                        fontSize: '9px'
                                    }}
                                >
                                    ✕
                                </button>
                            </div>
                        )}

                        <span style={{ whiteSpace: 'nowrap', fontSize: '11px' }}>rows</span>
                    </div>
                </div>

                {/* Right side - Page navigation - Ultra Compact */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => goToPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        style={{
                            backgroundColor: currentPage === 1 ? '#1e293b' : '#475569',
                            color: currentPage === 1 ? '#64748b' : '#e2e8f0',
                            border: '1px solid #64748b',
                            padding: '5px 9px',
                            borderRadius: '3px',
                            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                            fontSize: '10px',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        Previous
                    </button>

                    {getPageNumbers().map((page, index) => (
                        <React.Fragment key={index}>
                            {page === '...' ? (
                                <span style={{ padding: '5px 4px', color: '#94a3b8', fontSize: '10px' }}>...</span>
                            ) : (
                                <button
                                    onClick={() => goToPage(page)}
                                    style={{
                                        backgroundColor: currentPage === page ? '#10b981' : '#475569',
                                        color: '#e2e8f0',
                                        border: '1px solid #64748b',
                                        padding: '5px 9px',
                                        borderRadius: '3px',
                                        cursor: 'pointer',
                                        fontSize: '10px',
                                        fontWeight: currentPage === page ? '600' : '500',
                                        minWidth: '28px'
                                    }}
                                >
                                    {page}
                                </button>
                            )}
                        </React.Fragment>
                    ))}

                    <button
                        onClick={() => goToPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        style={{
                            backgroundColor: currentPage === totalPages ? '#1e293b' : '#475569',
                            color: currentPage === totalPages ? '#64748b' : '#e2e8f0',
                            border: '1px solid #64748b',
                            padding: '5px 9px',
                            borderRadius: '3px',
                            cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                            fontSize: '10px',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        Next
                    </button>
                </div>
            </div>

            {/* Status Info - Ultra Compact */}
            <div style={{
                fontSize: '10px',
                color: '#64748b',
                padding: '5px 8px',
                backgroundColor: '#1e293b',
                borderRadius: '3px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '10px',
                flexWrap: 'wrap'
            }}>
                <span>Page {currentPage} of {totalPages}</span>
                <span>Showing {pageSize} rows per page</span>
                <span>Total: {totalRows} rows | Columns: {visibleColumns.size}/{columns.length} visible</span>
            </div>

            {/* Column Filter Dropdown */}
            {showColumnFilter && (
                <div
                    className="column-filter-dropdown"
                    style={{
                        position: 'fixed',
                        top: `${dropdownPosition.top}px`,
                        left: `${dropdownPosition.left}px`,
                        backgroundColor: '#1e293b',
                        border: '1px solid #475569',
                        borderRadius: '8px',
                        width: '320px',
                        maxHeight: `${dropdownHeight.maxHeight}px`, // Dynamic height based on available space
                        display: 'flex',
                        flexDirection: 'column',
                        zIndex: 2000
                    }}
                >
                    {/* Header */}
                    <div style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid #475569',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexShrink: 0 // Prevent header from shrinking
                    }}>
                        <h3 style={{ margin: 0, fontSize: '14px', color: '#e2e8f0' }}>
                            Filter: {columns.find(c => c.field === selectedColumn)?.headerName || selectedColumn}
                        </h3>
                        <button
                            onClick={() => setShowColumnFilter(false)}
                            style={{
                                backgroundColor: 'transparent',
                                border: 'none',
                                color: '#94a3b8',
                                fontSize: '16px',
                                cursor: 'pointer'
                            }}
                        >
                            ✕
                        </button>
                    </div>

                    {/* Search */}
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #475569', flexShrink: 0 }}>
                        <input
                            type="text"
                            placeholder="Search..."
                            value={columnFilterSearch}
                            onChange={(e) => setColumnFilterSearch(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '6px 8px',
                                backgroundColor: '#334155',
                                color: '#e2e8f0',
                                border: '1px solid #64748b',
                                borderRadius: '4px',
                                fontSize: '11px'
                            }}
                        />
                    </div>

                    {/* Select All */}
                    <div style={{ padding: '8px 16px', borderBottom: '1px solid #475569', flexShrink: 0 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '11px', color: '#e2e8f0' }}>
                            <input
                                type="checkbox"
                                checked={selectedValues.size === filteredValues.length && filteredValues.length > 0}
                                onChange={toggleSelectAll}
                            />
                            Select All
                        </label>
                    </div>

                    {/* Values List */}
                    <div style={{
                        maxHeight: `${dropdownHeight.valuesMaxHeight}px`,
                        overflowY: 'auto',
                        padding: '8px 0',
                        flex: 1 // Allow this section to grow and fill available space
                    }}>
                        {filteredValues.map(value => (
                            <label
                                key={value}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '4px 16px',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    color: '#e2e8f0'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#334155'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedValues.has(value)}
                                    onChange={() => toggleValue(value)}
                                />
                                {value}
                            </label>
                        ))}
                    </div>

                    {/* Footer */}
                    <div style={{
                        padding: '12px 16px',
                        borderTop: '1px solid #475569',
                        display: 'flex',
                        gap: '8px',
                        justifyContent: 'flex-end',
                        backgroundColor: '#1e293b', // Same as dropdown background
                        flexShrink: 0 // Prevent footer from shrinking
                    }}>
                        <button
                            onClick={() => setShowColumnFilter(false)}
                            style={{
                                padding: '6px 12px',
                                backgroundColor: '#475569',
                                color: '#e2e8f0',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '11px',
                                cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={applyColumnFilter}
                            style={{
                                padding: '6px 12px',
                                backgroundColor: '#10b981',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '11px',
                                cursor: 'pointer'
                            }}
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
});

export default AgGridTable; 