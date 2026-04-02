import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import HSBCLogo from '../../components/HSBCLogo';
import { ModuleRegistry, ClientSideRowModelModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { FaSync, FaDownload, FaChartBar, FaTable } from 'react-icons/fa';
import { useUser } from '../../contexts/UserContext';
import { BUCKET_SET_CONFIG } from './utils/bucketConfig';
import { AVAILABLE_COLUMNS } from './utils/columnConfig';
import { useSupervisoryData } from './hooks/useSupervisoryData';

// Components
import SummaryCard from './components/SummaryCard';
import ColumnDropZone from './components/ColumnDropZone';
import FilterSidebar from './components/FilterSidebar';
import ChartsSection from './components/ChartsSection';
import SupervisoryGrid from './components/SupervisoryGrid';

ModuleRegistry.registerModules([ClientSideRowModelModule]);

export default function SupervisoryDashboard() {
    const { currentUser } = useUser();
    const dashboardLayoutRef = useRef(null);
    const SIDEBAR_WIDTH_KEY = 'supervisory_dashboard_sidebar_width';

    const {
        filterOptions,
        savedFilters,
        selectedSavedFilterId,
        savedFilterName,
        setSavedFilterName,
        isSavingFilter,
        selectedBucketSet,
        setSelectedBucketSet,
        availableBucketSets,
        activeAgeBuckets,
        selectedColumns,
        setSelectedColumns,
        filters,
        aggregations,
        summary,
        totalRecords,
        filteredRecords,
        isLoading,
        error,
        hasActiveFilters,
        forceRefresh,
        handleFilterChange,
        clearAllFilters,
        handleSavedFilterSelect,
        handleSaveCurrentFilter
    } = useSupervisoryData(currentUser);

    // UI state
    const [activeView, setActiveView] = useState('table');
    const [showUnremediated, setShowUnremediated] = useState(true);
    const [showTotal, setShowTotal] = useState(true);
    const [chartGroupColumn, setChartGroupColumn] = useState(selectedColumns[0] || null);

    // Keep chartGroupColumn in sync — reset if the chosen column is removed from selectedColumns
    useEffect(() => {
        if (selectedColumns.length === 0) {
            setChartGroupColumn(null);
        } else if (!chartGroupColumn || !selectedColumns.find(c => c.field === chartGroupColumn.field)) {
            setChartGroupColumn(selectedColumns[0]);
        }
    }, [selectedColumns, chartGroupColumn]);
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        if (typeof window === 'undefined') return 224;
        const stored = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY));
        return Number.isFinite(stored) && stored > 0 ? stored : 224;
    });
    const isResizingSidebarRef = useRef(false);

    const activeBucketVisuals = useMemo(() => {
        const fallbackColors = ['#65A30D', '#CA8A04', '#EA580C', '#DC2626', '#991B1B'];
        const fallbackChartColors = ['#7FB43A', '#D39A2A', '#EE7B38', '#E05555', '#B23A3A'];
        const bucketSetConfig = BUCKET_SET_CONFIG[selectedBucketSet] || BUCKET_SET_CONFIG.CFTC;
        const colors = {};
        const chartColors = {};
        const labels = {};

        activeAgeBuckets.forEach((bucket, index) => {
            colors[bucket] = bucketSetConfig.colors[bucket] || fallbackColors[index % fallbackColors.length];
            chartColors[bucket] = bucketSetConfig.chartColors[bucket] || fallbackChartColors[index % fallbackChartColors.length];
            labels[bucket] = bucketSetConfig.labels[bucket] || `${bucket}d`;
        });

        return { colors, chartColors, labels };
    }, [selectedBucketSet, activeAgeBuckets]);

    const SIDEBAR_MIN_WIDTH = 220;
    const SIDEBAR_MAX_WIDTH = 520;

    useEffect(() => {
        const handleMouseMove = (event) => {
            if (!isResizingSidebarRef.current) return;
            const layoutRect = dashboardLayoutRef.current?.getBoundingClientRect();
            if (!layoutRect) return;

            const availableWidth = layoutRect.width;
            const dynamicMax = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, availableWidth - 420));
            const nextWidth = Math.max(
                SIDEBAR_MIN_WIDTH,
                Math.min(dynamicMax, event.clientX - layoutRect.left)
            );
            setSidebarWidth(nextWidth);
        };

        const handleMouseUp = () => {
            if (!isResizingSidebarRef.current) return;
            isResizingSidebarRef.current = false;
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(sidebarWidth)));
    }, [sidebarWidth, SIDEBAR_WIDTH_KEY]);

    const handleSidebarResizeStart = useCallback((event) => {
        event.preventDefault();
        isResizingSidebarRef.current = true;
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
    }, []);

    // Chart data preparation
    const chartData = useMemo(() => {
        if (!chartGroupColumn || selectedColumns.length === 0) return [];
        const groupCol = chartGroupColumn.field;
        const grouped = {};

        aggregations.forEach(row => {
            const key = row[groupCol];
            if (!grouped[key]) {
                grouped[key] = { name: key };
                activeAgeBuckets.forEach(bucket => {
                    grouped[key][`unremediated_${bucket}`] = 0;
                    grouped[key][`total_${bucket}`] = 0;
                });
            }
            activeAgeBuckets.forEach(bucket => {
                grouped[key][`unremediated_${bucket}`] += row[`unremediated_${bucket}`] || 0;
                grouped[key][`total_${bucket}`] += row[`total_${bucket}`] || 0;
            });
        });

        return Object.values(grouped)
            .sort((a, b) => {
                const totalA = activeAgeBuckets.reduce((sum, k) => sum + (a[`unremediated_${k}`] || 0), 0);
                const totalB = activeAgeBuckets.reduce((sum, k) => sum + (b[`unremediated_${k}`] || 0), 0);
                return totalB - totalA;
            })
            .slice(0, 10);
    }, [aggregations, chartGroupColumn, selectedColumns, activeAgeBuckets]);

    // Export to CSV
    const exportToCSV = useCallback(() => {
        if (aggregations.length === 0) return;

        const headers = [
            ...selectedColumns.map(c => c.field),
            ...activeAgeBuckets.map(b => `unremediated_${b}`),
            'unremediated_total',
            ...activeAgeBuckets.map(b => `total_${b}`),
            'total_total'
        ];
        const csvContent = [
            headers.join(','),
            ...aggregations.map(row => headers.map(h => row[h] ?? '').join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `supervisory_dashboard_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    }, [aggregations, selectedColumns, activeAgeBuckets]);

    return (
        <div className="min-h-screen supervisory-page-canvas flex flex-col">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between" style={{ height: '64px' }}>
                <div className="flex items-center gap-4">
                    <HSBCLogo height={40} />
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900">SUPERVISORY DASHBOARD</h1>
                        <p className="text-xs text-gray-500">Unremediated Controls by Age Bucket</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={forceRefresh}
                        disabled={isLoading}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                    >
                        <FaSync className={isLoading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                    <button
                        onClick={exportToCSV}
                        disabled={aggregations.length === 0}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-slate-700 text-white hover:bg-slate-800 rounded transition-colors disabled:opacity-50"
                    >
                        <FaDownload />
                        Export
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex flex-1 overflow-hidden" ref={dashboardLayoutRef}>
                {/* Left Sidebar - Filters */}
                <FilterSidebar
                    sidebarWidth={sidebarWidth}
                    handleSidebarResizeStart={handleSidebarResizeStart}
                    hasActiveFilters={hasActiveFilters}
                    clearAllFilters={clearAllFilters}
                    savedFilters={savedFilters}
                    selectedSavedFilterId={selectedSavedFilterId}
                    handleSavedFilterSelect={handleSavedFilterSelect}
                    savedFilterName={savedFilterName}
                    setSavedFilterName={setSavedFilterName}
                    handleSaveCurrentFilter={handleSaveCurrentFilter}
                    isSavingFilter={isSavingFilter}
                    selectedBucketSet={selectedBucketSet}
                    setSelectedBucketSet={setSelectedBucketSet}
                    availableBucketSets={availableBucketSets}
                    filterOptions={filterOptions}
                    filters={filters}
                    handleFilterChange={handleFilterChange}
                    totalRecords={totalRecords}
                    filteredRecords={filteredRecords}
                    currentUser={currentUser}
                />

                {/* Main Dashboard Area */}
                <div className="flex-1 p-4 overflow-y-auto">
                    {error && (
                        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">{error}</div>
                    )}

                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="supervisory-summary-card supervisory-summary-unrem rounded-lg p-3 border">
                            <div className="supervisory-summary-title supervisory-summary-title-unrem text-sm font-semibold mb-2">
                                Unremediated <span className="supervisory-summary-subtitle supervisory-summary-subtitle-unrem text-xs font-normal">(Status: Pending Action)</span>
                            </div>
                            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${activeAgeBuckets.length + 1}, minmax(0, 1fr))` }}>
                                <SummaryCard title="Total" value={summary.unremediated?.total || 0} color="#DC2626" small />
                                {activeAgeBuckets.map((bucket) => (
                                    <SummaryCard
                                        key={`unrem-${bucket}`}
                                        title={activeBucketVisuals.labels[bucket]}
                                        value={summary.unremediated?.[bucket] || 0}
                                        color={activeBucketVisuals.colors[bucket]}
                                        small
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="supervisory-summary-card supervisory-summary-total rounded-lg p-3 border">
                            <div className="supervisory-summary-title supervisory-summary-title-total text-sm font-semibold mb-2">
                                All Records <span className="supervisory-summary-subtitle supervisory-summary-subtitle-total text-xs font-normal">(All Remediation Status)</span>
                            </div>
                            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${activeAgeBuckets.length + 1}, minmax(0, 1fr))` }}>
                                <SummaryCard title="Total" value={summary.total?.total || 0} color="#2563EB" small />
                                {activeAgeBuckets.map((bucket) => (
                                    <SummaryCard
                                        key={`total-${bucket}`}
                                        title={activeBucketVisuals.labels[bucket]}
                                        value={summary.total?.[bucket] || 0}
                                        color={activeBucketVisuals.colors[bucket]}
                                        small
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Column Drop Zone */}
                    <ColumnDropZone
                        selectedColumns={selectedColumns}
                        availableColumns={AVAILABLE_COLUMNS}
                        onColumnsChange={setSelectedColumns}
                    />

                    {/* View Toggle */}
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1 bg-gray-100 rounded p-0.5">
                            <button
                                onClick={() => setActiveView('table')}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${activeView === 'table' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'
                                    }`}
                            >
                                <FaTable />
                                Table
                            </button>
                            <button
                                onClick={() => setActiveView('chart')}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${activeView === 'chart' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'
                                    }`}
                            >
                                <FaChartBar />
                                Chart
                            </button>
                        </div>
                        <div className="flex items-center gap-3">
                            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={showUnremediated}
                                    onChange={(e) => setShowUnremediated(e.target.checked)}
                                    className="w-3 h-3 supervisory-toggle-input-unrem"
                                />
                                <span className="font-medium supervisory-toggle-label-unrem">Unremediated</span>
                            </label>
                            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={showTotal}
                                    onChange={(e) => setShowTotal(e.target.checked)}
                                    className="w-3 h-3 supervisory-toggle-input-total"
                                />
                                <span className="font-medium supervisory-toggle-label-total">Total</span>
                            </label>
                            <span className="text-xs text-gray-500">{aggregations.length} groups</span>
                        </div>
                    </div>

                    {/* Table View */}
                    {activeView === 'table' && (
                        <SupervisoryGrid
                            aggregations={aggregations}
                            selectedColumns={selectedColumns}
                            activeAgeBuckets={activeAgeBuckets}
                            activeBucketVisuals={activeBucketVisuals}
                            showUnremediated={showUnremediated}
                            showTotal={showTotal}
                            isLoading={isLoading}
                            filters={filters}
                            selectedBucketSet={selectedBucketSet}
                        />
                    )}

                    {/* Chart View */}
                    {activeView === 'chart' && (
                        <ChartsSection
                            selectedColumns={selectedColumns}
                            chartData={chartData}
                            activeAgeBuckets={activeAgeBuckets}
                            activeBucketVisuals={activeBucketVisuals}
                            chartGroupColumn={chartGroupColumn}
                            onChartGroupColumnChange={setChartGroupColumn}
                        />
                    )}
                </div>
            </div>

            {/* Loading Overlay */}
            {isLoading && (
                <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-4 flex items-center gap-3 shadow-xl">
                        <div className="w-6 h-6 border-3 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-gray-700 text-sm">Loading...</span>
                    </div>
                </div>
            )}
        </div>
    );
}
