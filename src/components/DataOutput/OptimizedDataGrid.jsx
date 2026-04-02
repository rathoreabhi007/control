import React, { memo, useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useDataOutput } from '../../contexts/DataOutputContext';
import { useColumnResize } from '../../contexts/ColumnResizeContext';
import { useVirtualization } from '../../hooks/useVirtualization';
import { useGridObservers } from '../../hooks/useGridObservers';
import { useColumnReorder } from '../../hooks/useColumnReorder';
import LoadingSpinner from '../common/LoadingSpinner';
import ColumnFilter from './ColumnFilter';
import FilterIcon from '../FilterIcon';

/**
 * Optimized Data Grid Component
 * Lightweight, virtualized data grid with all AG Grid features
 */
const OptimizedDataGrid = memo(() => {
    const { state, computed, actions } = useDataOutput();
    const { customColumnWidths, updateColumnWidth } = useColumnResize();
    const {
        handleDragStart,
        handleDragOver,
        handleDragEnter,
        handleDragLeave,
        handleDrop,
        handleDragEnd,
        getDragClasses
    } = useColumnReorder();
    const containerRef = useRef(null);



    const { ui, filters } = state;
    const { displayedRows, visibleColumnsList } = computed;


    // Set up grid observers for resize handling
    useGridObservers(containerRef, actions);

    // Virtualization hook for performance - add safety check
    const {
        visibleRange,
        totalHeight,
        handleScroll,
        getRowStyle
    } = useVirtualization((displayedRows || []).length, 32, 50); // 32px row height, 50px buffer

    // Transform data for display
    const transformedData = useMemo(() => {
        if (!displayedRows || !displayedRows.length || !visibleColumnsList || !visibleColumnsList.length) {
            return [];
        }

        const transformed = displayedRows.map((row, index) => {
            const transformedRow = { id: index, originalIndex: index };
            visibleColumnsList.forEach(column => {
                transformedRow[column] = row[column] || '';
            });
            return transformedRow;
        });

        return transformed;
    }, [displayedRows, visibleColumnsList]);


    // Calculate column widths
    const columnWidths = useMemo(() => {
        const minColumnWidth = 208; // Increased by 30% from 160px to 208px
        const totalColumns = (visibleColumnsList || []).length;

        // Debug logging
        console.log('🔍 Column Width Debug:');
        console.log('  - visibleColumnsList:', visibleColumnsList);
        console.log('  - totalColumns:', totalColumns);
        console.log('  - visibleColumnsList length:', visibleColumnsList?.length);
        console.log('  - state.data.headers:', state.data?.headers);
        console.log('  - state.csvData.columns:', state.csvData?.columns);
        console.log('  - filters.visibleColumns:', state.filters?.visibleColumns);
        console.log('  - filters.visibleColumns.size:', state.filters?.visibleColumns?.size);

        if (totalColumns === 0) {
            console.warn('⚠️ No visible columns found! This will prevent horizontal scrolling.');
            return [];
        }

        // Use custom widths if available, otherwise use default width
        const widths = (visibleColumnsList || []).map(column => {
            return customColumnWidths[column] || minColumnWidth;
        });

        const totalWidth = widths.reduce((sum, width) => sum + width, 40); // 40px for checkbox
        console.log('📏 Width Calculation:');
        console.log('  - individual widths:', widths);
        console.log('  - totalWidth:', totalWidth);
        console.log('  - shouldShowScrollbar:', totalWidth > 800);
        console.log('  - container likely width: ~800px');

        return widths;
    }, [visibleColumnsList, customColumnWidths, state.data, state.csvData, state.filters?.visibleColumns]);

    // Handle row selection
    const [selectedRows, setSelectedRows] = React.useState(new Set());

    // Column filter state
    const [activeFilterColumn, setActiveFilterColumn] = useState(null);
    const [filterPosition, setFilterPosition] = useState({ top: 0, left: 0 });

    // Column resizing state
    const [resizingColumn, setResizingColumn] = useState(null);
    const [resizeStartX, setResizeStartX] = useState(0);
    const [resizeStartWidth, setResizeStartWidth] = useState(0);

    const handleRowClick = useCallback((rowId) => {
        setSelectedRows(prev => {
            const newSelection = new Set(prev);
            if (newSelection.has(rowId)) {
                newSelection.delete(rowId);
            } else {
                newSelection.add(rowId);
            }
            return newSelection;
        });
    }, []);

    // Handle select all
    const handleSelectAll = useCallback(() => {
        const rowsLength = (displayedRows || []).length;
        if (selectedRows.size === rowsLength) {
            setSelectedRows(new Set());
        } else {
            setSelectedRows(new Set((displayedRows || []).map((_, index) => index)));
        }
    }, [selectedRows.size, displayedRows]);

    // Handle column filter
    const handleColumnFilter = useCallback((columnField, event) => {
        event.stopPropagation();

        const buttonRect = event.currentTarget.getBoundingClientRect();

        // Calculate position relative to viewport (for fixed positioning)
        let top = buttonRect.bottom + 5;
        let left = buttonRect.left - 150;

        // Ensure dropdown doesn't go outside viewport
        const maxLeft = window.innerWidth - 330;
        const maxTop = window.innerHeight - 500;

        left = Math.max(10, Math.min(left, maxLeft));
        top = Math.max(10, Math.min(top, maxTop));

        setFilterPosition({
            top: top,
            left: left
        });

        setActiveFilterColumn(columnField);
    }, []);

    // Close column filter
    const closeColumnFilter = useCallback(() => {
        setActiveFilterColumn(null);
    }, []);

    // Column resize handlers
    const handleResizeStart = useCallback((columnIndex, event) => {
        event.preventDefault();
        event.stopPropagation();

        const column = visibleColumnsList[columnIndex];
        const currentWidth = customColumnWidths[column] || 208; // Updated to match new default width

        setResizingColumn(columnIndex);
        setResizeStartX(event.clientX);
        setResizeStartWidth(currentWidth);

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [visibleColumnsList, customColumnWidths]);

    const handleResizeMove = useCallback((event) => {
        if (resizingColumn === null) return;

        const deltaX = event.clientX - resizeStartX;
        const newWidth = Math.max(100, resizeStartWidth + deltaX); // Minimum 100px width

        const column = visibleColumnsList[resizingColumn];
        updateColumnWidth(column, newWidth);
    }, [resizingColumn, resizeStartX, resizeStartWidth, visibleColumnsList, updateColumnWidth]);

    const handleResizeEnd = useCallback(() => {
        if (resizingColumn === null) return;

        setResizingColumn(null);
        setResizeStartX(0);
        setResizeStartWidth(0);

        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }, [resizingColumn]);

    // Handle click outside to close filter
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (activeFilterColumn && !event.target.closest('.column-filter-dropdown') && !event.target.closest('.grid-header-filter')) {
                closeColumnFilter();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [activeFilterColumn, closeColumnFilter]);

    // Global mouse event listeners for column resizing
    useEffect(() => {
        const handleMouseMove = (event) => {
            handleResizeMove(event);
        };

        const handleMouseUp = () => {
            handleResizeEnd();
        };

        if (resizingColumn !== null) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [resizingColumn, handleResizeMove, handleResizeEnd]);





    return (
        <div className="optimized-data-grid" ref={containerRef}>
            {/* Loading Overlay */}
            {ui.isLoading && <LoadingSpinner />}

            {/* Grid Header */}
            <div className="grid-header">
                <div
                    className="grid-header-row"
                    style={{
                        width: `${columnWidths.reduce((sum, width) => sum + width, 40)}px` // 40px for checkbox column
                    }}
                >
                    {/* Select All Checkbox */}
                    <div className="grid-header-cell grid-header-select">
                        <input
                            type="checkbox"
                            checked={selectedRows.size === (displayedRows || []).length && (displayedRows || []).length > 0}
                            onChange={handleSelectAll}
                            className="grid-checkbox"
                        />
                    </div>

                    {/* Column Headers */}
                    {(visibleColumnsList || []).map((column, index) => {
                        const hasActiveFilter = filters.columnFilters[column] && filters.columnFilters[column].size > 0;
                        const columnWidth = columnWidths[index] || 208; // Fallback to default width (updated)

                        return (
                            <div
                                key={column}
                                className={`grid-header-cell ${getDragClasses(column)}`}
                                style={{ width: columnWidth }}
                                draggable={true}
                                onDragStart={(e) => handleDragStart(column, e)}
                                onDragOver={(e) => handleDragOver(column, e)}
                                onDragEnter={(e) => handleDragEnter(column, e)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(column, e)}
                                onDragEnd={handleDragEnd}

                            >
                                {/* Column Reorder Handle */}
                                <div className="column-reorder-handle">
                                    <div className="column-reorder-icon">
                                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                                            <path d="M2 4h8v1H2zM2 7h8v1H2z" />
                                        </svg>
                                    </div>
                                </div>

                                <div className="grid-header-content">
                                    <span className="grid-header-text" title={column}>
                                        {column}
                                    </span>
                                    <button
                                        className={`grid-header-filter ${hasActiveFilter ? 'grid-header-filter-active' : ''}`}
                                        onClick={(e) => handleColumnFilter(column, e)}
                                        title={`Filter ${column}`}
                                    >
                                        <FilterIcon
                                            size={16}
                                            className="filter-icon"
                                        />
                                    </button>
                                </div>

                                {/* Column Resize Handle */}
                                <div
                                    className={`column-resize-handle ${resizingColumn === index ? 'column-resize-handle-active' : ''}`}
                                    onMouseDown={(e) => handleResizeStart(index, e)}
                                    title="Drag to resize column"
                                />
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Grid Body */}
            <div
                className="grid-body"
                onScroll={handleScroll}
            >
                <div
                    className="grid-body-content"
                    style={{
                        height: `${totalHeight}px`,
                        width: `${columnWidths.reduce((sum, width) => sum + width, 40)}px`, // 40px for checkbox column
                        position: 'relative' // Required for absolutely positioned rows
                    }}
                >
                    {transformedData
                        .slice(visibleRange.start, visibleRange.end)
                        .map((row, sliceIndex) => {
                            const actualIndex = visibleRange.start + sliceIndex;
                            return (
                                <div
                                    key={row.id}
                                    className={`grid-row ${selectedRows.has(actualIndex) ? 'grid-row-selected' : ''}`}
                                    style={getRowStyle(actualIndex)}
                                    onClick={() => handleRowClick(actualIndex)}
                                >
                                    {/* Select Checkbox */}
                                    <div className="grid-cell grid-cell-select">
                                        <input
                                            type="checkbox"
                                            checked={selectedRows.has(actualIndex)}
                                            onChange={() => handleRowClick(actualIndex)}
                                            className="grid-checkbox"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </div>

                                    {/* Data Cells */}
                                    {(visibleColumnsList || []).map((column, index) => {
                                        const columnWidth = columnWidths[index] || 208; // Fallback to default width (updated)
                                        return (
                                            <div
                                                key={column}
                                                className="grid-cell"
                                                style={{ width: columnWidth }}
                                                title={row[column]?.toString() || ''}
                                            >
                                                <div className="grid-cell-content">
                                                    {row[column]?.toString() || ''}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                </div>
            </div>



            {/* Column Filter Dropdown */}
            {activeFilterColumn && (
                <div
                    className="column-filter-container"
                    style={{
                        position: 'fixed',
                        top: filterPosition.top,
                        left: filterPosition.left,
                        zIndex: 1001
                    }}
                >
                    <ColumnFilter
                        columnField={activeFilterColumn}
                        onClose={closeColumnFilter}
                    />
                </div>
            )}

        </div>
    );
});

OptimizedDataGrid.displayName = 'OptimizedDataGrid';

export default OptimizedDataGrid;
