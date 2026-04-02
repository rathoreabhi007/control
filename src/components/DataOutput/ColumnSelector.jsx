import React, { memo, useCallback, useEffect, useRef } from 'react';
import { useDataOutput } from '../../contexts/DataOutputContext';

/**
 * Column Selector Component
 * Handles column visibility management with search and bulk actions
 */
const ColumnSelector = memo(() => {
    const { state, actions } = useDataOutput();
    const dropdownRef = useRef(null);

    const { filters } = state;

    // Get all available columns - use csvData.columns if available, otherwise fallback to data.headers
    const allColumns = (state.csvData?.columns || state.data.headers || []).map(header => ({
        field: header,
        headerName: header
    }));

    // Filter columns based on search
    const filteredColumns = allColumns.filter(col =>
        !filters.columnSearch ||
        (col.headerName || col.field).toLowerCase().includes(filters.columnSearch.toLowerCase())
    );

    // Handle column visibility toggle
    const toggleColumnVisibility = useCallback((columnField) => {
        actions.toggleColumnVisibility(columnField);
    }, [actions]);

    // Handle select all columns
    const selectAllColumns = useCallback(() => {
        actions.setVisibleColumns(new Set(allColumns.map(col => col.field)));
    }, [actions, allColumns]);

    // Handle clear all columns
    const clearAllColumns = useCallback(() => {
        actions.setVisibleColumns(new Set());
    }, [actions]);

    // Handle column search
    const handleColumnSearch = useCallback((e) => {
        actions.setColumnSearch(e.target.value);
    }, [actions]);

    // Handle dropdown toggle
    const toggleDropdown = useCallback(() => {
        actions.toggleColumnSelector(!filters.showColumnSelector);
    }, [actions, filters.showColumnSelector]);

    // Handle click outside to close dropdown
    useEffect(() => {
        const handleClickOutside = (event) => {
            // Check if dropdown is open and click is outside the dropdown container
            if (filters.showColumnSelector && 
                dropdownRef.current && 
                !dropdownRef.current.contains(event.target)) {
                actions.toggleColumnSelector(false);
            }
        };

        // Add event listener when dropdown is open
        if (filters.showColumnSelector) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        // Cleanup
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [filters.showColumnSelector, actions]);

    return (
        <div className="column-selector" ref={dropdownRef}>
            <div className="column-selector-container">
                <button
                    onClick={toggleDropdown}
                    className="column-selector-button"
                    title="Select columns to display"
                >
                    📋 Select ({filters.visibleColumns.size}/{allColumns.length})
                </button>

                {/* Column Selector Dropdown */}
                {filters.showColumnSelector && (
                    <div className="column-selector-dropdown">
                        {/* Header */}
                        <div className="column-selector-header">
                            <span className="column-selector-title">Select Columns</span>
                            <button
                                onClick={toggleDropdown}
                                className="column-selector-close"
                                title="Close column selector"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Search */}
                        <div className="column-selector-search">
                            <input
                                type="text"
                                placeholder="Search columns..."
                                value={filters.columnSearch}
                                onChange={handleColumnSearch}
                                className="column-selector-search-input"
                            />
                        </div>

                        {/* Select All / Clear All */}
                        <div className="column-selector-actions">
                            <button
                                onClick={selectAllColumns}
                                className="column-selector-action column-selector-action-select-all"
                                title="Select all columns"
                            >
                                Select All
                            </button>
                            <button
                                onClick={clearAllColumns}
                                className="column-selector-action column-selector-action-clear-all"
                                title="Clear all columns"
                            >
                                Clear All
                            </button>
                        </div>

                        {/* Column List */}
                        <div className="column-selector-list">
                            {filteredColumns.length > 0 ? (
                                filteredColumns.map(col => (
                                    <label
                                        key={col.field}
                                        className="column-selector-item"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={filters.visibleColumns.has(col.field)}
                                            onChange={() => toggleColumnVisibility(col.field)}
                                            className="column-selector-checkbox"
                                        />
                                        <span className="column-selector-label">
                                            {col.headerName || col.field}
                                        </span>
                                    </label>
                                ))
                            ) : (
                                <div className="column-selector-empty">
                                    No columns found matching your search.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});

ColumnSelector.displayName = 'ColumnSelector';

export default ColumnSelector;
