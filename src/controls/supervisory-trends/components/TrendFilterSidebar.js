import React from 'react';
import { FaChevronLeft, FaFilter } from 'react-icons/fa';
import MultiSelectFilter from '../../supervisory-dashboard/components/MultiSelectFilter';

const TrendFilterSidebar = ({
    sidebarWidth,
    handleSidebarResizeStart,
    hasActiveFilters,
    clearAllFilters,
    savedFilters,
    selectedSavedFilterId,
    handleSavedFilterSelect,
    savedFilterName,
    setSavedFilterName,
    handleSaveCurrentFilter,
    isSavingFilter,
    filterOptions,
    filters,
    handleFilterChange,
    totalRecords,
    filteredRecords,
    onCollapse
}) => {
    return (
        <div
            className="bg-white border-r border-gray-200 p-3 overflow-y-auto flex-shrink-0 relative supervisory-surface supervisory-sidebar"
            style={{ width: `${sidebarWidth}px` }}
        >
            <div className="flex items-center justify-between mb-3 supervisory-sidebar-header">
                <div className="flex items-center gap-1.5">
                    <FaFilter className="text-gray-500" style={{ fontSize: '12px' }} />
                    <span className="font-semibold text-gray-700 text-sm">Filters</span>
                </div>
                <div className="flex items-center gap-2">
                    {hasActiveFilters && (
                        <button onClick={clearAllFilters} className="text-xs supervisory-clear-btn">Clear</button>
                    )}
                    <button
                        type="button"
                        onClick={onCollapse}
                        className="w-7 h-7 inline-flex items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                        aria-label="Collapse filters"
                        title="Collapse filters"
                    >
                        <FaChevronLeft style={{ fontSize: '11px' }} />
                    </button>
                </div>
            </div>

            <div className="mb-3 supervisory-sidebar-card">
                <label className="block text-xs font-medium text-gray-700 mb-1 supervisory-section-label">Saved Filters</label>
                <select
                    className="w-full px-2 py-1.5 border border-gray-300 rounded bg-white text-xs supervisory-field"
                    value={selectedSavedFilterId}
                    onChange={handleSavedFilterSelect}
                >
                    <option value="">Select saved filter...</option>
                    {savedFilters.map((filter) => (
                        <option key={filter.id} value={filter.id}>
                            {filter.name} ({filter.created_by_name || filter.created_by || 'user'})
                        </option>
                    ))}
                </select>
                <div className="flex gap-2 mt-2">
                    <input
                        type="text"
                        className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs supervisory-field"
                        placeholder="Save current as..."
                        value={savedFilterName}
                        onChange={(event) => setSavedFilterName(event.target.value)}
                    />
                    <button
                        onClick={handleSaveCurrentFilter}
                        disabled={!savedFilterName.trim() || isSavingFilter}
                        className="px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded disabled:opacity-50 supervisory-save-btn"
                    >
                        Save
                    </button>
                </div>
            </div>

            <div className="mb-3 supervisory-sidebar-card supervisory-filter-card">
                <div className="text-[11px] uppercase tracking-wide supervisory-filter-card-title">Refine Data</div>
                <MultiSelectFilter
                    label="Regulation"
                    options={filterOptions.regulation}
                    selected={filters.regulation}
                    onChange={(values) => handleFilterChange('regulation', values)}
                    placeholder="All"
                />
                <MultiSelectFilter
                    label="Asset Class"
                    options={filterOptions.asset_class}
                    selected={filters.asset_class}
                    onChange={(values) => handleFilterChange('asset_class', values)}
                    placeholder="All"
                />
                <MultiSelectFilter
                    label="Control Type"
                    options={filterOptions.control_type}
                    selected={filters.control_type}
                    onChange={(values) => handleFilterChange('control_type', values)}
                    placeholder="All"
                />
                <MultiSelectFilter
                    label="Data Type"
                    options={filterOptions.data_type}
                    selected={filters.data_type}
                    onChange={(values) => handleFilterChange('data_type', values)}
                    placeholder="All"
                />
                <MultiSelectFilter
                    label="Sub-Control Type"
                    options={filterOptions.sub_control_type}
                    selected={filters.sub_control_type}
                    onChange={(values) => handleFilterChange('sub_control_type', values)}
                    placeholder="All"
                />
                <MultiSelectFilter
                    label="Remediation Status"
                    options={filterOptions.remediation_status}
                    selected={filters.remediation_status}
                    onChange={(values) => handleFilterChange('remediation_status', values)}
                    placeholder="All"
                />
            </div>

            <div className="mt-4 pt-3 border-t border-gray-200 text-xs text-gray-600 supervisory-sidebar-stats">
                <div className="flex justify-between mb-1">
                    <span>Total:</span>
                    <span className="font-medium">{totalRecords.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                    <span>Filtered:</span>
                    <span className="font-medium">{filteredRecords.toLocaleString()}</span>
                </div>
            </div>

            <div
                className="absolute top-0 right-0 h-full w-1 cursor-col-resize supervisory-sidebar-resizer"
                onMouseDown={handleSidebarResizeStart}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize filters sidebar"
            />
        </div>
    );
};

export default TrendFilterSidebar;
