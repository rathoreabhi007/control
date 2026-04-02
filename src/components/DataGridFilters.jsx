/**
 * DataGridFilters Component
 * 
 * Provides filtering and column visibility controls for AG Grid data display.
 * Used in workflow node data previews for enhanced data exploration.
 */

import { useState, useCallback, useMemo } from 'react';
import { FaFilter, FaColumns, FaSearch, FaTimes, FaCheck } from 'react-icons/fa';

/**
 * Column Selector Dropdown
 */
export const ColumnSelector = ({ columns, visibleColumns, onToggleColumn, onSelectAll, onDeselectAll }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Filter columns based on search
    const filteredColumns = useMemo(() => {
        if (!searchTerm) return columns;
        return columns.filter(col =>
            col.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [columns, searchTerm]);

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm font-medium text-gray-700 transition-colors"
            >
                <FaColumns />
                Columns ({visibleColumns.length}/{columns.length})
            </button>

            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[200px] max-w-[300px] max-h-[400px] overflow-hidden flex flex-col">
                        <div className="p-2 border-b border-gray-100 space-y-2">
                            {/* Search Input */}
                            <div className="relative">
                                <FaSearch className="absolute left-2.5 top-2.5 text-gray-400 text-xs" />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Search columns..."
                                    className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    autoFocus
                                />
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={onSelectAll}
                                    className="flex-1 px-2 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded"
                                >
                                    Select All
                                </button>
                                <button
                                    onClick={onDeselectAll}
                                    className="flex-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded"
                                >
                                    Deselect All
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                            {filteredColumns.length === 0 ? (
                                <div className="text-xs text-gray-500 text-center py-2">
                                    No columns found
                                </div>
                            ) : (
                                filteredColumns.map((col) => (
                                    <label
                                        key={col}
                                        className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={visibleColumns.includes(col)}
                                            onChange={() => onToggleColumn(col)}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-gray-700 truncate" title={col}>{col}</span>
                                    </label>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

/**
 * Filter Condition Types
 */
export const FILTER_OPERATORS = {
    string: [
        { value: 'contains', label: 'Contains' },
        { value: 'equals', label: 'Equals' },
        { value: 'starts_with', label: 'Starts with' },
        { value: 'ends_with', label: 'Ends with' },
        { value: 'not_contains', label: 'Does not contain' },
    ],
    number: [
        { value: 'eq', label: '=' },
        { value: 'ne', label: '≠' },
        { value: 'gt', label: '>' },
        { value: 'gte', label: '≥' },
        { value: 'lt', label: '<' },
        { value: 'lte', label: '≤' },
        { value: 'between', label: 'Between' },
    ],
};

/**
 * Single Filter Row Component
 */
export const FilterRow = ({
    filter,
    columns,
    columnTypes,
    onUpdate,
    onRemove,
    index
}) => {
    const selectedType = columnTypes[filter.column] || 'string';
    const operators = FILTER_OPERATORS[selectedType] || FILTER_OPERATORS.string;

    return (
        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-md">
            <span className="text-xs text-gray-500 w-6">{index + 1}.</span>

            {/* Column Select */}
            <select
                value={filter.column}
                onChange={(e) => onUpdate({ ...filter, column: e.target.value })}
                className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
                <option value="">Select column...</option>
                {columns.map((col) => (
                    <option key={col} value={col}>{col}</option>
                ))}
            </select>

            {/* Operator Select */}
            <select
                value={filter.operator}
                onChange={(e) => onUpdate({ ...filter, operator: e.target.value })}
                className="w-32 px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
                {operators.map((op) => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                ))}
            </select>

            {/* Value Input */}
            {filter.operator === 'between' ? (
                <div className="flex items-center gap-1">
                    <input
                        type="text"
                        value={filter.value || ''}
                        onChange={(e) => onUpdate({ ...filter, value: e.target.value })}
                        placeholder="Min"
                        className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-gray-400">-</span>
                    <input
                        type="text"
                        value={filter.value2 || ''}
                        onChange={(e) => onUpdate({ ...filter, value2: e.target.value })}
                        placeholder="Max"
                        className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            ) : (
                <input
                    type="text"
                    value={filter.value || ''}
                    onChange={(e) => onUpdate({ ...filter, value: e.target.value })}
                    placeholder="Value..."
                    className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            )}

            {/* Remove Button */}
            <button
                onClick={onRemove}
                className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                title="Remove filter"
            >
                <FaTimes />
            </button>
        </div>
    );
};

/**
 * Main DataGridFilters Component
 */
const DataGridFilters = ({
    columns = [],
    columnTypes = {},
    onFiltersChange,
    onColumnsChange,
    initialFilters = [],
    initialVisibleColumns = null
}) => {
    const [filters, setFilters] = useState(initialFilters);
    const [visibleColumns, setVisibleColumns] = useState(
        initialVisibleColumns || columns
    );
    const [showFilters, setShowFilters] = useState(false);

    // Update visible columns when columns prop changes
    useMemo(() => {
        if (initialVisibleColumns === null && columns.length > 0) {
            setVisibleColumns(columns);
        }
    }, [columns, initialVisibleColumns]);

    // Add new filter
    const addFilter = useCallback(() => {
        const newFilter = {
            id: Date.now(),
            column: columns[0] || '',
            operator: 'contains',
            value: '',
        };
        setFilters(prev => [...prev, newFilter]);
    }, [columns]);

    // Update filter
    const updateFilter = useCallback((index, updatedFilter) => {
        setFilters(prev => {
            const newFilters = [...prev];
            newFilters[index] = updatedFilter;
            return newFilters;
        });
    }, []);

    // Remove filter
    const removeFilter = useCallback((index) => {
        setFilters(prev => prev.filter((_, i) => i !== index));
    }, []);

    // Clear all filters
    const clearFilters = useCallback(() => {
        setFilters([]);
    }, []);

    // Apply filters
    const applyFilters = useCallback(() => {
        const validFilters = filters.filter(f => f.column && f.value);
        onFiltersChange?.(validFilters);
    }, [filters, onFiltersChange]);

    // Column visibility handlers
    const toggleColumn = useCallback((col) => {
        setVisibleColumns(prev => {
            const newCols = prev.includes(col)
                ? prev.filter(c => c !== col)
                : [...prev, col];
            onColumnsChange?.(newCols);
            return newCols;
        });
    }, [onColumnsChange]);

    const selectAllColumns = useCallback(() => {
        setVisibleColumns(columns);
        onColumnsChange?.(columns);
    }, [columns, onColumnsChange]);

    const deselectAllColumns = useCallback(() => {
        setVisibleColumns([]);
        onColumnsChange?.([]);
    }, [onColumnsChange]);

    const activeFilterCount = filters.filter(f => f.column && f.value).length;

    return (
        <div className="space-y-2">
            {/* Toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
                <ColumnSelector
                    columns={columns}
                    visibleColumns={visibleColumns}
                    onToggleColumn={toggleColumn}
                    onSelectAll={selectAllColumns}
                    onDeselectAll={deselectAllColumns}
                />

                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${showFilters || activeFilterCount > 0
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                        }`}
                >
                    <FaFilter />
                    Filters
                    {activeFilterCount > 0 && (
                        <span className="px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                            {activeFilterCount}
                        </span>
                    )}
                </button>

                {activeFilterCount > 0 && (
                    <button
                        onClick={clearFilters}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                        <FaTimes />
                        Clear filters
                    </button>
                )}
            </div>

            {/* Filter Panel */}
            {showFilters && (
                <div className="border border-gray-200 rounded-lg p-3 bg-white space-y-2">
                    {filters.length === 0 ? (
                        <div className="text-sm text-gray-500 text-center py-4">
                            No filters applied. Click "Add Filter" to filter your data.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filters.map((filter, index) => (
                                <FilterRow
                                    key={filter.id}
                                    filter={filter}
                                    columns={columns}
                                    columnTypes={columnTypes}
                                    onUpdate={(updated) => updateFilter(index, updated)}
                                    onRemove={() => removeFilter(index)}
                                    index={index}
                                />
                            ))}
                        </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                        <button
                            onClick={addFilter}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        >
                            + Add Filter
                        </button>

                        {filters.length > 0 && (
                            <button
                                onClick={applyFilters}
                                className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors"
                            >
                                <FaCheck />
                                Apply Filters
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DataGridFilters;
