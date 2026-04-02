import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaChartBar, FaChevronRight, FaDownload, FaSync, FaTable } from 'react-icons/fa';
import { ModuleRegistry, ClientSideRowModelModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import HSBCLogo from '../../components/HSBCLogo';
import { useUser } from '../../contexts/UserContext';
import SummaryCard from '../supervisory-dashboard/components/SummaryCard';
import ColumnDropZone from '../supervisory-dashboard/components/ColumnDropZone';
import { AVAILABLE_COLUMNS } from '../supervisory-dashboard/utils/columnConfig';
import TrendFilterSidebar from './components/TrendFilterSidebar';
import TrendPivotGrid from './components/TrendPivotGrid';
import TrendChartsSection from './components/TrendChartsSection';
import { useSupervisoryTrendData } from './hooks/useSupervisoryTrendData';

ModuleRegistry.registerModules([ClientSideRowModelModule]);

export default function SupervisoryTrendsPage() {
    const { currentUser } = useUser();
    const dashboardLayoutRef = useRef(null);
    const SIDEBAR_WIDTH_KEY = 'supervisory_trends_sidebar_width';
    const SIDEBAR_COLLAPSED_KEY = 'supervisory_trends_sidebar_collapsed';
    const SIDEBAR_MIN_WIDTH = 220;
    const SIDEBAR_MAX_WIDTH = 520;

    const {
        filterOptions,
        filters,
        savedFilters,
        selectedSavedFilterId,
        savedFilterName,
        setSavedFilterName,
        isSavingFilter,
        selectedColumns,
        setSelectedColumns,
        trendData,
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
    } = useSupervisoryTrendData(currentUser);

    const [activeView, setActiveView] = useState('table');
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        if (typeof window === 'undefined') return 224;
        const stored = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY));
        return Number.isFinite(stored) && stored > 0 ? stored : 224;
    });
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
    });
    const isResizingSidebarRef = useRef(false);

    useEffect(() => {
        const handleMouseMove = (event) => {
            if (!isResizingSidebarRef.current) return;
            const layoutRect = dashboardLayoutRef.current?.getBoundingClientRect();
            if (!layoutRect) return;
            const dynamicMax = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, layoutRect.width - 420));
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
    }, [sidebarWidth]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isSidebarCollapsed));
    }, [isSidebarCollapsed]);

    const handleSidebarResizeStart = useCallback((event) => {
        event.preventDefault();
        isResizingSidebarRef.current = true;
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
    }, []);

    const statuses = useMemo(() => trendData?.statuses || [], [trendData]);
    const maxBusinessDate = trendData?.max_business_date || null;
    const summaryStatusCounts = useMemo(() => trendData?.summary?.status_counts || {}, [trendData]);

    const summaryCards = useMemo(() => {
        const entries = statuses.map((status) => ({
            title: status,
            value: summaryStatusCounts[status] || 0,
            color: status.toLowerCase().includes('unrem') ? '#DC2626' : '#2563EB'
        }));
        return [
            { title: 'Filtered Total', value: filteredRecords || 0, color: '#0F172A' },
            ...entries
        ];
    }, [filteredRecords, statuses, summaryStatusCounts]);

    const totalCardItems = useMemo(() => ([
        { title: 'Total Records', value: totalRecords || 0, color: '#2563EB' },
        { title: 'Filtered Records', value: filteredRecords || 0, color: '#1D4ED8' },
        { title: 'Groups', value: trendData?.grouped_tables?.monthly_status_last_5?.rows?.length || 0, color: '#0F766E' }
    ]), [filteredRecords, totalRecords, trendData]);

    const exportToCSV = useCallback(() => {
        if (!trendData) return;

        const sections = [
            { name: 'monthly_status_last_5', rows: trendData.tables?.monthly_status_last_5 || [] },
            { name: 'daily_status_last_5', rows: trendData.tables?.daily_status_last_5 || [] },
            { name: 'daily_status_current_month', rows: trendData.tables?.daily_status_current_month || [] }
        ];

        const csvParts = sections.map(({ name, rows }) => {
            const header = ['period_key', 'period_label', ...statuses, 'total_count'];
            const lines = rows.map((row) => [
                row.period_key,
                row.period_label,
                ...statuses.map((status) => row.status_counts?.[status] || 0),
                row.total_count || 0
            ].join(','));
            return [name, header.join(','), ...lines].join('\n');
        });

        const blob = new Blob([csvParts.join('\n\n')], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `supervisory_trends_${new Date().toISOString().split('T')[0]}.csv`;
        anchor.click();
        window.URL.revokeObjectURL(url);
    }, [statuses, trendData]);

    return (
        <div className="min-h-screen supervisory-page-canvas flex flex-col">
            <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between" style={{ height: '64px' }}>
                <div className="flex items-center gap-4">
                    <HSBCLogo height={40} />
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900">SUPERVISORY TRENDS</h1>
                        <p className="text-xs text-gray-500">Month and day remediation views with stacked trend charts</p>
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
                        disabled={!trendData}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-slate-700 text-white hover:bg-slate-800 rounded transition-colors disabled:opacity-50"
                    >
                        <FaDownload />
                        Export
                    </button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden" ref={dashboardLayoutRef}>
                {!isSidebarCollapsed ? (
                    <TrendFilterSidebar
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
                        filterOptions={filterOptions}
                        filters={filters}
                        handleFilterChange={handleFilterChange}
                        totalRecords={totalRecords}
                        filteredRecords={filteredRecords}
                        onCollapse={() => setIsSidebarCollapsed(true)}
                    />
                ) : (
                    <div className="w-10 bg-white border-r border-gray-200 flex items-start justify-center pt-3">
                        <button
                            type="button"
                            onClick={() => setIsSidebarCollapsed(false)}
                            className="w-7 h-7 inline-flex items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                            aria-label="Expand filters"
                            title="Expand filters"
                        >
                            <FaChevronRight style={{ fontSize: '11px' }} />
                        </button>
                    </div>
                )}

                <div className="flex-1 p-4 overflow-y-auto">
                    {error && (
                        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">{error}</div>
                    )}

                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="supervisory-summary-card supervisory-summary-unrem rounded-lg p-3 border">
                            <div className="supervisory-summary-title supervisory-summary-title-unrem text-sm font-semibold mb-2">
                                Remediation Status <span className="supervisory-summary-subtitle supervisory-summary-subtitle-unrem text-xs font-normal">(filtered scope)</span>
                            </div>
                            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(summaryCards.length, 1)}, minmax(0, 1fr))` }}>
                                {summaryCards.map((card) => (
                                    <SummaryCard key={card.title} title={card.title} value={card.value} color={card.color} small />
                                ))}
                            </div>
                        </div>

                        <div className="supervisory-summary-card supervisory-summary-total rounded-lg p-3 border">
                            <div className="supervisory-summary-title supervisory-summary-title-total text-sm font-semibold mb-2">
                                Trend Scope <span className="supervisory-summary-subtitle supervisory-summary-subtitle-total text-xs font-normal">(current selection)</span>
                            </div>
                            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(totalCardItems.length, 1)}, minmax(0, 1fr))` }}>
                                {totalCardItems.map((card) => (
                                    <SummaryCard key={card.title} title={card.title} value={card.value} color={card.color} small />
                                ))}
                            </div>
                        </div>
                    </div>

                    <ColumnDropZone
                        selectedColumns={selectedColumns}
                        availableColumns={AVAILABLE_COLUMNS}
                        onColumnsChange={setSelectedColumns}
                    />

                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1 bg-gray-100 rounded p-0.5">
                            <button
                                onClick={() => setActiveView('table')}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${activeView === 'table' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
                            >
                                <FaTable />
                                Tables
                            </button>
                            <button
                                onClick={() => setActiveView('chart')}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${activeView === 'chart' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
                            >
                                <FaChartBar />
                                Charts
                            </button>
                        </div>
                        <div className="text-xs text-gray-500">
                            As of {maxBusinessDate || 'n/a'}
                        </div>
                    </div>

                    {activeView === 'table' && (
                        <div className="space-y-4">
                            <TrendPivotGrid
                                title="Monthly Remediation Status"
                                subtitle="Grouped view with month on the primary header and remediation status on the secondary header"
                                table={trendData?.grouped_tables?.monthly_status_last_5}
                                isLoading={isLoading}
                            />
                            <TrendPivotGrid
                                title="Daily Remediation Status"
                                subtitle="Grouped view for the last 5 business dates"
                                table={trendData?.grouped_tables?.daily_status_last_5}
                                isLoading={isLoading}
                            />
                            <TrendPivotGrid
                                title="Current Month Daily Status"
                                subtitle="Grouped view for all business dates in the current month"
                                table={trendData?.grouped_tables?.daily_status_current_month}
                                isLoading={isLoading}
                            />
                        </div>
                    )}

                    {activeView === 'chart' && (
                        <TrendChartsSection
                            monthlyChart={trendData?.charts?.monthly_plan_status_last_5 || { data: [], series: [], line_options: [] }}
                            dailyChart={trendData?.charts?.daily_plan_status_last_30 || { data: [], series: [], line_options: [] }}
                        />
                    )}
                </div>
            </div>

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
