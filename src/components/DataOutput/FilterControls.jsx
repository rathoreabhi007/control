import React, { memo, useCallback } from 'react';
import { useDataOutput } from '../../contexts/DataOutputContext';

/**
 * Filter Controls Component
 * Displays active filters and allows users to manage them
 */
const FilterControls = memo(() => {
    const { state, actions } = useDataOutput();

    const { filters, ui } = state;

    // Get active filters
    const activeFilters = Object.keys(filters.columnFilters).filter(
        column => filters.columnFilters[column] && filters.columnFilters[column].size > 0
    );

    // Handle remove filter
    const removeFilter = useCallback((column) => {
        actions.removeColumnFilter(column);
    }, [actions]);

    // Handle clear all filters
    const clearAllFilters = useCallback(() => {
        actions.clearAllFilters();
    }, [actions]);

    // Handle dropdown toggle
    const toggleDropdown = useCallback(() => {
        actions.toggleActiveFiltersDropdown(!ui.showActiveFiltersDropdown);
    }, [actions, ui.showActiveFiltersDropdown]);

    if (activeFilters.length === 0) {
        return null;
    }

    return (
        <div className="filter-controls">
            <div className="filter-controls-container">
                <span
                    className="filter-controls-label"
                    onClick={toggleDropdown}
                    title="View active filters"
                >
                    Filters ({activeFilters.length}) <span className="filter-controls-dropdown-icon">▼</span>
                </span>

                <button
                    onClick={clearAllFilters}
                    className="filter-controls-clear-all"
                    title="Clear all filters"
                >
                    Clear
                </button>

                {/* Active Filters Dropdown */}
                {ui.showActiveFiltersDropdown && (
                    <div className="filter-controls-dropdown">
                        {activeFilters.map(column => (
                            <div key={column} className="filter-controls-item">
                                <span className="filter-controls-column-name" title={column}>
                                    {column}
                                </span>
                                <button
                                    onClick={() => removeFilter(column)}
                                    className="filter-controls-remove"
                                    title={`Remove filter for ${column}`}
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
});

FilterControls.displayName = 'FilterControls';

export default FilterControls;

