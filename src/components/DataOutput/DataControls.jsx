import React, { memo } from 'react';
import { useDataOutput } from '../../contexts/DataOutputContext';
import { useColumnResize } from '../../contexts/ColumnResizeContext';
import { useExport } from '../../hooks/useExport';
import { useColumnReorder } from '../../hooks/useColumnReorder';
import ColumnSelector from './ColumnSelector';
import FilterControls from './FilterControls';
import SearchInput from './SearchInput';

/**
 * Data Controls Component
 * Handles export functionality, column selection, and filter controls
 */
const DataControls = memo(() => {
    const { state } = useDataOutput();
    const { exportToCsv, exportFilteredToCsv, exportPageFiltersToCsv, exportGlobalSearchToCsv, clearAllFilters } = useExport();
    const { customColumnWidths, resetColumnWidths } = useColumnResize();
    const { resetColumnOrder } = useColumnReorder();

    const { filters } = state;

    const hasActiveFilters = Object.keys(filters.columnFilters).length > 0 || filters.globalSearch.trim() !== '';
    const hasCustomColumnOrder = filters.columnOrder.length > 0;
    const hasCustomColumnWidths = Object.keys(customColumnWidths).length > 0;
    const isSearchMode = filters.searchResults && filters.searchResults.results && filters.searchResults.results.length > 0;
    const hasPageFilters = Object.keys(filters.columnFilters).length > 0;
    const hasGlobalSearch = filters.globalSearch && filters.globalSearch.trim() !== '';

    return (
        <div className="data-controls">
            {/* Single Line Layout: Search on Left, Export + Column Selector on Right */}
            <div className="data-controls-single-line">
                {/* Left: Search Input + Export Search + Clear button for search mode */}
                <div className="search-section">
                    <SearchInput />
                    {/* Show Export Search button on left when in search mode */}
                    {isSearchMode && hasGlobalSearch && (
                        <button
                            onClick={exportGlobalSearchToCsv}
                            className="export-button export-button-global-search search-export-button"
                            title="Export global search results to CSV"
                        >
                            Export Search
                        </button>
                    )}
                    {/* Show Clear button on left when in search mode */}
                    {isSearchMode && (
                        <button
                            onClick={clearAllFilters}
                            className="export-button export-button-clear search-clear-button"
                            title="Clear search"
                        >
                            Clear
                        </button>
                    )}
                </div>

                {/* Right: Export Buttons + Column Selector */}
                <div className="right-controls-section">
                    {/* Export Buttons */}
                    <div className="export-section">
                        {/* Show Clear Filters button on right when not in search mode */}
                        {hasActiveFilters && !isSearchMode && (
                            <button
                                onClick={clearAllFilters}
                                className="export-button export-button-clear"
                                title="Clear all applied filters"
                            >
                                Clear Filters
                            </button>
                        )}

                        <button
                            onClick={exportToCsv}
                            className="export-button export-button-all"
                            title="Export all data to CSV"
                        >
                            Export All
                        </button>

                        {/* Show different export buttons based on current mode */}
                        {hasPageFilters && !isSearchMode && (
                            <button
                                onClick={exportPageFiltersToCsv}
                                className="export-button export-button-page-filters"
                                title="Export page filters to CSV"
                            >
                                Export Filters
                            </button>
                        )}

                        {/* Fallback to original export filtered for backward compatibility */}
                        {!isSearchMode && !hasPageFilters && (
                            <button
                                onClick={exportFilteredToCsv}
                                className="export-button export-button-filtered"
                                title="Export filtered data to CSV"
                            >
                                Export Filtered
                            </button>
                        )}

                        {hasCustomColumnWidths && (
                            <button
                                onClick={resetColumnWidths}
                                className="export-button export-button-reset"
                                title="Reset all column widths to default"
                            >
                                Reset Widths
                            </button>
                        )}

                        {hasCustomColumnOrder && (
                            <button
                                onClick={resetColumnOrder}
                                className="export-button export-button-reset-order"
                                title="Reset column order to original"
                            >
                                Reset Order
                            </button>
                        )}
                    </div>

                    {/* Column Selector */}
                    <div className="column-section">
                        <ColumnSelector />
                    </div>

                    {/* Active Filters - Compact version on right side */}
                    {hasActiveFilters && (
                        <div className="compact-filters-section">
                            <FilterControls />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

DataControls.displayName = 'DataControls';

export default DataControls;

