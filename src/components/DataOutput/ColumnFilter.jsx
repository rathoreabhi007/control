import React, { memo, useState, useEffect, useCallback, useMemo } from 'react';
import { useDataOutput } from '../../contexts/DataOutputContext';

/**
 * Column Filter Component
 * Provides filtering functionality for individual columns
 */
const ColumnFilter = memo(({ columnField, onClose }) => {
    const { state, actions } = useDataOutput();
    const { data, filters } = state;

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedValues, setSelectedValues] = useState(new Set());
    const [filteredValues, setFilteredValues] = useState([]);
    const [isLimited, setIsLimited] = useState(false);

    // Get unique values for this column (limit to 5000 for performance)
    const uniqueValues = useMemo(() => {
        if (!data.table || !columnField) return [];

        const MAX_FILTER_VALUES = 5000;
        const valueSet = new Set();
        let limited = false;
        
        // Collect unique values, stop at 5000
        for (const row of data.table) {
            if (valueSet.size >= MAX_FILTER_VALUES) {
                console.warn(`⚠️ Filter values limited to ${MAX_FILTER_VALUES} for column: ${columnField}`);
                limited = true;
                break;
            }
            
            const value = row[columnField]?.toString() || '';
            const displayValue = value.trim() === '' ? '(Blanks)' : value;
            valueSet.add(displayValue);
        }

        // Update limited state
        setIsLimited(limited);

        // Convert to array and sort
        const values = Array.from(valueSet).sort();
        
        return values;
    }, [data.table, columnField]);

    // Filter values based on search term
    const filteredValuesList = useMemo(() => {
        if (!searchTerm) return uniqueValues;
        return uniqueValues.filter(value =>
            value.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [uniqueValues, searchTerm]);

    // Initialize with current filter values
    useEffect(() => {
        const currentFilter = filters.columnFilters[columnField] || new Set();
        setSelectedValues(new Set(currentFilter));
        setFilteredValues(uniqueValues);
    }, [columnField, filters.columnFilters, uniqueValues]);

    // Update filtered values when search changes
    useEffect(() => {
        setFilteredValues(filteredValuesList);
    }, [filteredValuesList]);

    // Toggle value selection
    const toggleValue = useCallback((value) => {
        setSelectedValues(prev => {
            const newSelected = new Set(prev);
            if (newSelected.has(value)) {
                newSelected.delete(value);
            } else {
                newSelected.add(value);
            }
            return newSelected;
        });
    }, []);

    // Select/Deselect all
    const toggleSelectAll = useCallback(() => {
        setSelectedValues(prev => {
            if (prev.size === filteredValues.length) {
                return new Set();
            } else {
                return new Set(filteredValues);
            }
        });
    }, [filteredValues]);

    // Apply filter
    const applyFilter = useCallback(() => {
        const newFilters = { ...filters.columnFilters };
        if (selectedValues.size === 0) {
            delete newFilters[columnField];
        } else {
            newFilters[columnField] = new Set(selectedValues);
        }
        actions.setColumnFilters(newFilters);
        onClose();
    }, [selectedValues, columnField, filters.columnFilters, actions, onClose]);

    // Clear filter
    const clearFilter = useCallback(() => {
        setSelectedValues(new Set());
    }, []);

    // Cancel filter
    const cancelFilter = useCallback(() => {
        onClose();
    }, [onClose]);

    if (!columnField) return null;

    return (
        <div className="column-filter-dropdown">
            {/* Header */}
            <div className="column-filter-header">
                <span className="column-filter-title">
                    Filter: {columnField}
                </span>
                <button
                    onClick={onClose}
                    className="column-filter-close"
                    title="Close filter"
                >
                    ×
                </button>
            </div>

            {/* Warning if values are limited */}
            {isLimited && (
                <div className="px-3 py-2 bg-yellow-50 border-b border-yellow-200 text-xs text-yellow-700">
                    ⚠️ Showing first 5,000 unique values (performance limit). Use search to find specific values.
                </div>
            )}

            {/* Search */}
            <div className="column-filter-search">
                <input
                    type="text"
                    placeholder="Search values..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="column-filter-search-input"
                />
            </div>

            {/* Select All */}
            <div className="column-filter-actions">
                <button
                    onClick={toggleSelectAll}
                    className="column-filter-action"
                >
                    {selectedValues.size === filteredValues.length ? 'Deselect All' : 'Select All'}
                </button>
                <button
                    onClick={clearFilter}
                    className="column-filter-action"
                >
                    Clear
                </button>
            </div>

            {/* Values List */}
            <div className="column-filter-list">
                {filteredValues.length > 0 ? (
                    filteredValues.map((value, index) => (
                        <div
                            key={index}
                            className="column-filter-item"
                            onClick={() => toggleValue(value)}
                        >
                            <input
                                type="checkbox"
                                checked={selectedValues.has(value)}
                                onChange={() => toggleValue(value)}
                                className="column-filter-checkbox"
                            />
                            <span className="column-filter-label">
                                {value}
                            </span>
                        </div>
                    ))
                ) : (
                    <div className="column-filter-empty">
                        No values found
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="column-filter-footer">
                <button
                    onClick={cancelFilter}
                    className="column-filter-button column-filter-cancel"
                >
                    Cancel
                </button>
                <button
                    onClick={applyFilter}
                    className="column-filter-button column-filter-apply"
                >
                    Apply ({selectedValues.size})
                </button>
            </div>
        </div>
    );
});

ColumnFilter.displayName = 'ColumnFilter';

export default ColumnFilter;
