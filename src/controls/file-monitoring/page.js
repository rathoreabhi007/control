import React, { useState, useEffect, useMemo } from 'react';
import HSBCLogo from '../../components/HSBCLogo';
import { ApiService } from '../../services/api';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';

export default function FileMonitoringDashboard({ fileType = 'input' }) {
    const [fileStatuses, setFileStatuses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [hierarchy, setHierarchy] = useState({
        regulations: [],
        asset_classes: [],
        sub_control_names: [],
        control_names: [],
        frequencies: [],
        statuses: ['received', 'not_received']
    });

    const getTodayDate = () => {
        const today = new Date();
        return today.toISOString().split('T')[0];
    };

    const [filters, setFilters] = useState({
        monitoring_date: getTodayDate(),
        regulation: '',
        asset_class: '',
        sub_control_name: '',
        control_name: '',
        frequency: '',
        status: ''
    });

    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);
    const [sortColumn, setSortColumn] = useState('display_name');
    const [sortDirection, setSortDirection] = useState('asc');
    const [chartCategory, setChartCategory] = useState('regulation');

    const [visibleColumns, setVisibleColumns] = useState({
        display_name: true,
        status: true,
        arrival_time: true,
        regulation: false,
        asset_class: false,
        sub_control_name: false,
        control_name: false,
        frequency: false,
        note: true
    });
    const [showColumnSelector, setShowColumnSelector] = useState(false);

    const [columnFilters, setColumnFilters] = useState({
        display_name: '',
        regulation: '',
        asset_class: '',
        sub_control_name: '',
        control_name: '',
        frequency: '',
        status: '',
        arrival_time: '',
        note: ''
    });

    const dashboardTitle = fileType === 'input'
        ? 'Input File Monitoring'
        : 'Output File Monitoring';

    const arrivalLabel = fileType === 'input' ? 'Arrival Time' : 'Production Time';

    useEffect(() => {
        loadHierarchy();
    }, [fileType]);

    useEffect(() => {
        loadFileStatuses();
    }, [filters.monitoring_date, fileType]);

    const loadHierarchy = async () => {
        try {
            const data = await ApiService.getFileMonitoringHierarchy(fileType);
            setHierarchy(data);
        } catch (err) {
            // hierarchy load failure is non-fatal
        }
    };

    const loadFileStatuses = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await ApiService.getFileMonitoringStatus({
                file_type: fileType,
                monitoring_date: filters.monitoring_date
            }, 5000);
            setFileStatuses(data.file_statuses || []);
        } catch (err) {
            setError(err.message || 'Failed to load file monitoring status');
        } finally {
            setLoading(false);
        }
    };

    const handleFilterChange = (key, value) => {
        setFilters(prev => {
            const newFilters = { ...prev, [key]: value };
            if (key === 'regulation') {
                newFilters.asset_class = '';
                newFilters.sub_control_name = '';
                newFilters.control_name = '';
            } else if (key === 'asset_class') {
                newFilters.sub_control_name = '';
                newFilters.control_name = '';
            } else if (key === 'sub_control_name') {
                newFilters.control_name = '';
            }
            return newFilters;
        });
        setCurrentPage(1);
    };

    const clearFilters = () => {
        setFilters({
            monitoring_date: getTodayDate(),
            regulation: '',
            asset_class: '',
            sub_control_name: '',
            control_name: '',
            frequency: '',
            status: ''
        });
        setColumnFilters({
            display_name: '',
            regulation: '',
            asset_class: '',
            sub_control_name: '',
            control_name: '',
            frequency: '',
            status: '',
            arrival_time: '',
            note: ''
        });
        setCurrentPage(1);
    };

    // Cascade filters driven from loaded data
    const filteredAssetClasses = useMemo(() => {
        if (!filters.regulation) return hierarchy.asset_classes;
        return [...new Set(
            fileStatuses
                .filter(f => f.regulation === filters.regulation)
                .map(f => f.asset_class)
        )].sort();
    }, [filters.regulation, fileStatuses, hierarchy.asset_classes]);

    const filteredSubControlNames = useMemo(() => {
        if (!filters.regulation && !filters.asset_class) return hierarchy.sub_control_names;
        return [...new Set(
            fileStatuses
                .filter(f =>
                    (!filters.regulation || f.regulation === filters.regulation) &&
                    (!filters.asset_class || f.asset_class === filters.asset_class)
                )
                .map(f => f.sub_control_name)
        )].sort();
    }, [filters.regulation, filters.asset_class, fileStatuses, hierarchy.sub_control_names]);

    const filteredControlNames = useMemo(() => {
        if (!filters.regulation && !filters.asset_class && !filters.sub_control_name) return hierarchy.control_names;
        return [...new Set(
            fileStatuses
                .filter(f =>
                    (!filters.regulation || f.regulation === filters.regulation) &&
                    (!filters.asset_class || f.asset_class === filters.asset_class) &&
                    (!filters.sub_control_name || f.sub_control_name === filters.sub_control_name)
                )
                .map(f => f.control_name)
        )].sort();
    }, [filters.regulation, filters.asset_class, filters.sub_control_name, fileStatuses, hierarchy.control_names]);

    const applyClientFilters = (data) => {
        return data.filter(f => {
            if (filters.regulation && f.regulation !== filters.regulation) return false;
            if (filters.asset_class && f.asset_class !== filters.asset_class) return false;
            if (filters.sub_control_name && f.sub_control_name !== filters.sub_control_name) return false;
            if (filters.control_name && f.control_name !== filters.control_name) return false;
            if (filters.frequency && f.frequency !== filters.frequency) return false;
            if (filters.status && f.status !== filters.status) return false;

            if (columnFilters.display_name && !(f.display_name || '').toLowerCase().includes(columnFilters.display_name.toLowerCase())) return false;
            if (columnFilters.regulation && f.regulation !== columnFilters.regulation) return false;
            if (columnFilters.asset_class && f.asset_class !== columnFilters.asset_class) return false;
            if (columnFilters.sub_control_name && f.sub_control_name !== columnFilters.sub_control_name) return false;
            if (columnFilters.control_name && f.control_name !== columnFilters.control_name) return false;
            if (columnFilters.frequency && f.frequency !== columnFilters.frequency) return false;
            if (columnFilters.status && f.status !== columnFilters.status) return false;
            if (columnFilters.note && !(f.note || '').toLowerCase().includes(columnFilters.note.toLowerCase())) return false;

            return true;
        });
    };

    const sortedAndPaginatedStatuses = useMemo(() => {
        const filtered = applyClientFilters(fileStatuses);
        const sorted = [...filtered].sort((a, b) => {
            let aVal = a[sortColumn] || '';
            let bVal = b[sortColumn] || '';
            return sortDirection === 'asc'
                ? (aVal > bVal ? 1 : aVal < bVal ? -1 : 0)
                : (aVal < bVal ? 1 : aVal > bVal ? -1 : 0);
        });
        const startIndex = (currentPage - 1) * itemsPerPage;
        return sorted.slice(startIndex, startIndex + itemsPerPage);
    }, [fileStatuses, filters, columnFilters, sortColumn, sortDirection, currentPage, itemsPerPage]);

    const filteredCount = useMemo(() => applyClientFilters(fileStatuses).length, [fileStatuses, filters, columnFilters]);
    const totalPages = Math.ceil(filteredCount / itemsPerPage);

    const handleSort = (column) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    const stats = useMemo(() => {
        const filtered = applyClientFilters(fileStatuses);
        const total = filtered.length;
        const received = filtered.filter(f => f.status === 'received').length;
        const notReceived = filtered.filter(f => f.status === 'not_received').length;
        const receiptRate = total > 0 ? ((received / total) * 100).toFixed(1) : 0;
        return { total, received, notReceived, receiptRate };
    }, [fileStatuses, filters, columnFilters]);

    const getStatusColor = (status) => {
        switch (status) {
            case 'received':
                return 'bg-green-100 text-green-800 border-green-300';
            case 'not_received':
                return 'bg-red-100 text-red-800 border-red-300';
            default:
                return 'bg-gray-100 text-gray-800 border-gray-300';
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'received': return '✓';
            case 'not_received': return '✗';
            default: return '○';
        }
    };

    const formatStatusLabel = (status) => {
        switch (status) {
            case 'received': return 'Received';
            case 'not_received': return 'Not Received';
            default: return status;
        }
    };

    const formatDateTime = (isoString) => {
        if (!isoString) return '-';
        try {
            const d = new Date(isoString);
            return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } catch {
            return isoString;
        }
    };

    const chartData = useMemo(() => {
        const filtered = applyClientFilters(fileStatuses);
        const groups = {};
        filtered.forEach(f => {
            const key = f[chartCategory] || 'Unknown';
            if (!groups[key]) groups[key] = { Received: 0, 'Not Received': 0 };
            if (f.status === 'received') groups[key].Received++;
            else groups[key]['Not Received']++;
        });
        return Object.entries(groups)
            .map(([name, counts]) => ({
                name,
                Received: counts.Received,
                'Not Received': counts['Not Received'],
                total: counts.Received + counts['Not Received']
            }))
            .sort((a, b) => b.total - a.total);
    }, [fileStatuses, chartCategory, filters, columnFilters]);

    const getCategoryLabel = (cat) => {
        const labels = {
            regulation: 'Regulation',
            asset_class: 'Asset Class',
            sub_control_name: 'Sub-Control Name',
            control_name: 'Control Name'
        };
        return labels[cat] || cat;
    };

    const columnLabels = {
        display_name: 'File Name',
        status: 'Status',
        arrival_time: arrivalLabel,
        regulation: 'Regulation',
        asset_class: 'Asset Class',
        sub_control_name: 'Sub-Control Name',
        control_name: 'Control Name',
        frequency: 'Frequency',
        note: 'Note'
    };

    return (
        <div className="min-h-screen" style={{ backgroundColor: 'white' }}>
            <div className="flex flex-col h-screen">
                {/* Header */}
                <div
                    className="border-b px-8 py-4 relative overflow-hidden"
                    style={{
                        backgroundColor: 'white',
                        borderBottom: '3px solid #db0011',
                        height: '80px',
                        boxShadow: '0 2px 8px rgba(219,0,17,0.1)'
                    }}
                >
                    <div className="flex items-center justify-between h-full relative z-10">
                        <div className="flex items-center flex-shrink-0">
                            <HSBCLogo height={64} className="mr-4" />
                        </div>
                        <div className="flex-1 flex justify-center">
                            <h1 className="text-2xl font-bold text-center" style={{ color: '#db0011' }}>
                                {dashboardTitle}
                            </h1>
                        </div>
                        <div className="flex-shrink-0 w-32"></div>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex overflow-hidden relative" style={{ backgroundColor: '#f5f5f5' }}>
                    {/* Left Sidebar - Filters */}
                    <div className="w-80 bg-white border-r border-gray-200 overflow-y-auto shadow-lg">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-lg font-semibold text-gray-800">Filters</h2>
                                <button
                                    onClick={clearFilters}
                                    className="px-3 py-1.5 text-sm text-white rounded transition-colors"
                                    style={{ backgroundColor: '#db0011' }}
                                    onMouseOver={(e) => e.target.style.backgroundColor = '#a00010'}
                                    onMouseOut={(e) => e.target.style.backgroundColor = '#db0011'}
                                >
                                    Clear All
                                </button>
                            </div>

                            <div className="space-y-4">
                                {/* Monitoring Date */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Monitoring Date
                                    </label>
                                    <input
                                        type="date"
                                        value={filters.monitoring_date}
                                        onChange={(e) => handleFilterChange('monitoring_date', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-600 text-sm"
                                    />
                                </div>

                                {/* Regulation */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Regulation
                                    </label>
                                    <select
                                        value={filters.regulation}
                                        onChange={(e) => handleFilterChange('regulation', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-600 text-sm"
                                    >
                                        <option value="">All</option>
                                        {hierarchy.regulations.map((r) => (
                                            <option key={r} value={r}>{r}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Asset Class */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Asset Class
                                    </label>
                                    <select
                                        value={filters.asset_class}
                                        onChange={(e) => handleFilterChange('asset_class', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-600 text-sm"
                                    >
                                        <option value="">All</option>
                                        {filteredAssetClasses.map((ac) => (
                                            <option key={ac} value={ac}>{ac}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Sub-Control Name */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Sub-Control Name
                                    </label>
                                    <select
                                        value={filters.sub_control_name}
                                        onChange={(e) => handleFilterChange('sub_control_name', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-600 text-sm"
                                    >
                                        <option value="">All</option>
                                        {filteredSubControlNames.map((sc) => (
                                            <option key={sc} value={sc}>{sc}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Control Name */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Control Name
                                    </label>
                                    <select
                                        value={filters.control_name}
                                        onChange={(e) => handleFilterChange('control_name', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-600 text-sm"
                                    >
                                        <option value="">All</option>
                                        {filteredControlNames.map((cn) => (
                                            <option key={cn} value={cn}>{cn}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Frequency */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Frequency
                                    </label>
                                    <select
                                        value={filters.frequency}
                                        onChange={(e) => handleFilterChange('frequency', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-600 text-sm"
                                    >
                                        <option value="">All</option>
                                        {hierarchy.frequencies.map((freq) => (
                                            <option key={freq} value={freq}>{freq}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Status */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Status
                                    </label>
                                    <select
                                        value={filters.status}
                                        onChange={(e) => handleFilterChange('status', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-600 text-sm"
                                    >
                                        <option value="">All</option>
                                        <option value="received">Received</option>
                                        <option value="not_received">Not Received</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Content Area */}
                    <div className="flex-1 overflow-y-auto relative">
                        <div className="p-6 relative z-10">

                            {/* Loading State */}
                            {loading && (
                                <div className="flex items-center justify-center h-64">
                                    <div className="text-gray-500 text-lg">Loading file monitoring data...</div>
                                </div>
                            )}

                            {/* Error State */}
                            {error && !loading && (
                                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                                    <div className="flex items-center justify-between">
                                        <span className="text-red-600 font-medium">Error: {error}</span>
                                        <button
                                            onClick={loadFileStatuses}
                                            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                                        >
                                            Retry
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Statistics Cards */}
                            {!error && !loading && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                    <div className="bg-white rounded-lg shadow-md p-4 border-l-4" style={{ borderColor: '#db0011' }}>
                                        <div className="text-sm text-gray-600 font-medium">Total Files</div>
                                        <div className="text-2xl font-bold text-gray-800 mt-1">{stats.total}</div>
                                    </div>
                                    <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-green-500">
                                        <div className="text-sm text-gray-600 font-medium">Received</div>
                                        <div className="text-2xl font-bold text-green-600 mt-1">{stats.received}</div>
                                    </div>
                                    <div className="bg-white rounded-lg shadow-md p-4 border-l-4" style={{ borderColor: '#db0011' }}>
                                        <div className="text-sm text-gray-600 font-medium">Not Received</div>
                                        <div className="text-2xl font-bold mt-1" style={{ color: '#db0011' }}>{stats.notReceived}</div>
                                    </div>
                                    <div className="bg-white rounded-lg shadow-md p-4 border-l-4" style={{ borderColor: stats.receiptRate >= 80 ? '#10b981' : '#db0011' }}>
                                        <div className="text-sm text-gray-600 font-medium">Receipt Rate</div>
                                        <div className="text-2xl font-bold mt-1" style={{ color: stats.receiptRate >= 80 ? '#10b981' : '#db0011' }}>
                                            {stats.receiptRate}%
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Chart Section */}
                            {!error && !loading && chartData.length > 0 && (
                                <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-lg font-semibold text-gray-800">
                                            Status Distribution by {getCategoryLabel(chartCategory)}
                                        </h2>
                                        <select
                                            value={chartCategory}
                                            onChange={(e) => setChartCategory(e.target.value)}
                                            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-600 text-sm"
                                        >
                                            <option value="regulation">Regulation</option>
                                            <option value="asset_class">Asset Class</option>
                                            <option value="sub_control_name">Sub-Control Name</option>
                                            <option value="control_name">Control Name</option>
                                        </select>
                                    </div>
                                    <ResponsiveContainer width="100%" height={350}>
                                        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                            <XAxis
                                                dataKey="name"
                                                angle={-45}
                                                textAnchor="end"
                                                height={100}
                                                tick={{ fontSize: 12 }}
                                            />
                                            <YAxis tick={{ fontSize: 12 }} />
                                            <Tooltip
                                                contentStyle={{
                                                    backgroundColor: 'rgba(255,255,255,0.95)',
                                                    border: '1px solid #e5e7eb',
                                                    borderRadius: '6px'
                                                }}
                                            />
                                            <Legend />
                                            <Bar dataKey="Received" stackId="a" fill="#10b981" name="Received" />
                                            <Bar dataKey="Not Received" stackId="a" fill="#ef4444" name="Not Received" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            {/* Data Table */}
                            {!error && !loading && (
                                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                                    <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                                        <h2 className="text-lg font-semibold text-gray-800">
                                            File Status ({fileStatuses.length} total, {filteredCount} filtered)
                                        </h2>
                                        <div className="flex items-center gap-3">
                                            {/* Column Selector */}
                                            <div className="relative">
                                                <button
                                                    onClick={() => setShowColumnSelector(!showColumnSelector)}
                                                    className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                                                >
                                                    Columns
                                                </button>
                                                {showColumnSelector && (
                                                    <>
                                                        <div className="fixed inset-0 z-40" onClick={() => setShowColumnSelector(false)}></div>
                                                        <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-300 rounded-lg shadow-lg z-50 p-4">
                                                            <div className="text-sm font-semibold text-gray-700 mb-3">Select Columns</div>
                                                            <div className="space-y-2">
                                                                {Object.entries(visibleColumns).map(([key, value]) => (
                                                                    <label key={key} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={value}
                                                                            onChange={(e) => setVisibleColumns(prev => ({ ...prev, [key]: e.target.checked }))}
                                                                            className="rounded border-gray-300"
                                                                        />
                                                                        <span className="text-sm text-gray-700">{columnLabels[key] || key}</span>
                                                                    </label>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </>
                                                )}
                                            </div>

                                            {/* Items per page */}
                                            <select
                                                value={itemsPerPage}
                                                onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                                                className="px-2 py-1.5 border border-gray-300 rounded text-sm"
                                            >
                                                <option value={25}>25/page</option>
                                                <option value={50}>50/page</option>
                                                <option value={100}>100/page</option>
                                            </select>

                                            {/* Refresh */}
                                            <button
                                                onClick={loadFileStatuses}
                                                className="px-3 py-1.5 text-sm text-white rounded transition-colors"
                                                style={{ backgroundColor: '#db0011' }}
                                                onMouseOver={(e) => e.target.style.backgroundColor = '#a00010'}
                                                onMouseOut={(e) => e.target.style.backgroundColor = '#db0011'}
                                            >
                                                Refresh
                                            </button>
                                        </div>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    {visibleColumns.display_name && (
                                                        <th
                                                            className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                                                            onClick={() => handleSort('display_name')}
                                                        >
                                                            File Name {sortColumn === 'display_name' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                                                        </th>
                                                    )}
                                                    {visibleColumns.status && (
                                                        <th
                                                            className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                                                            onClick={() => handleSort('status')}
                                                        >
                                                            Status {sortColumn === 'status' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                                                        </th>
                                                    )}
                                                    {visibleColumns.arrival_time && (
                                                        <th
                                                            className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                                                            onClick={() => handleSort('arrival_time')}
                                                        >
                                                            {arrivalLabel} {sortColumn === 'arrival_time' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                                                        </th>
                                                    )}
                                                    {visibleColumns.regulation && (
                                                        <th
                                                            className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                                                            onClick={() => handleSort('regulation')}
                                                        >
                                                            Regulation {sortColumn === 'regulation' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                                                        </th>
                                                    )}
                                                    {visibleColumns.asset_class && (
                                                        <th
                                                            className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                                                            onClick={() => handleSort('asset_class')}
                                                        >
                                                            Asset Class {sortColumn === 'asset_class' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                                                        </th>
                                                    )}
                                                    {visibleColumns.sub_control_name && (
                                                        <th
                                                            className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                                                            onClick={() => handleSort('sub_control_name')}
                                                        >
                                                            Sub-Control {sortColumn === 'sub_control_name' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                                                        </th>
                                                    )}
                                                    {visibleColumns.control_name && (
                                                        <th
                                                            className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                                                            onClick={() => handleSort('control_name')}
                                                        >
                                                            Control Name {sortColumn === 'control_name' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                                                        </th>
                                                    )}
                                                    {visibleColumns.frequency && (
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                            Frequency
                                                        </th>
                                                    )}
                                                    {visibleColumns.note && (
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                            Note
                                                        </th>
                                                    )}
                                                </tr>
                                                {/* Column filter row */}
                                                <tr className="bg-gray-50 border-t border-gray-100">
                                                    {visibleColumns.display_name && (
                                                        <th className="px-4 py-2">
                                                            <input
                                                                type="text"
                                                                value={columnFilters.display_name}
                                                                onChange={(e) => setColumnFilters(prev => ({ ...prev, display_name: e.target.value }))}
                                                                placeholder="Search..."
                                                                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-red-400"
                                                            />
                                                        </th>
                                                    )}
                                                    {visibleColumns.status && (
                                                        <th className="px-4 py-2">
                                                            <select
                                                                value={columnFilters.status}
                                                                onChange={(e) => setColumnFilters(prev => ({ ...prev, status: e.target.value }))}
                                                                className="w-full px-1 py-1 text-xs border border-gray-300 rounded focus:outline-none"
                                                            >
                                                                <option value="">All</option>
                                                                <option value="received">Received</option>
                                                                <option value="not_received">Not Received</option>
                                                            </select>
                                                        </th>
                                                    )}
                                                    {visibleColumns.arrival_time && <th className="px-4 py-2"></th>}
                                                    {visibleColumns.regulation && <th className="px-4 py-2"></th>}
                                                    {visibleColumns.asset_class && <th className="px-4 py-2"></th>}
                                                    {visibleColumns.sub_control_name && <th className="px-4 py-2"></th>}
                                                    {visibleColumns.control_name && <th className="px-4 py-2"></th>}
                                                    {visibleColumns.frequency && <th className="px-4 py-2"></th>}
                                                    {visibleColumns.note && (
                                                        <th className="px-4 py-2">
                                                            <input
                                                                type="text"
                                                                value={columnFilters.note}
                                                                onChange={(e) => setColumnFilters(prev => ({ ...prev, note: e.target.value }))}
                                                                placeholder="Search..."
                                                                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-red-400"
                                                            />
                                                        </th>
                                                    )}
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {sortedAndPaginatedStatuses.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={Object.values(visibleColumns).filter(Boolean).length} className="px-4 py-8 text-center text-gray-500">
                                                            No file status records found for the selected filters.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    sortedAndPaginatedStatuses.map((file) => (
                                                        <tr key={file.file_id} className="hover:bg-gray-50 transition-colors">
                                                            {visibleColumns.display_name && (
                                                                <td className="px-4 py-3 text-sm text-gray-900 font-medium max-w-xs">
                                                                    <div className="truncate" title={file.display_name}>{file.display_name}</div>
                                                                    <div className="text-xs text-gray-400 truncate" title={file.file_name}>{file.file_name}</div>
                                                                </td>
                                                            )}
                                                            {visibleColumns.status && (
                                                                <td className="px-4 py-3 text-sm">
                                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(file.status)}`}>
                                                                        <span>{getStatusIcon(file.status)}</span>
                                                                        {formatStatusLabel(file.status)}
                                                                    </span>
                                                                </td>
                                                            )}
                                                            {visibleColumns.arrival_time && (
                                                                <td className="px-4 py-3 text-sm text-gray-700">
                                                                    {formatDateTime(file.arrival_time)}
                                                                </td>
                                                            )}
                                                            {visibleColumns.regulation && (
                                                                <td className="px-4 py-3 text-sm text-gray-700">{file.regulation || '-'}</td>
                                                            )}
                                                            {visibleColumns.asset_class && (
                                                                <td className="px-4 py-3 text-sm text-gray-700">{file.asset_class || '-'}</td>
                                                            )}
                                                            {visibleColumns.sub_control_name && (
                                                                <td className="px-4 py-3 text-sm text-gray-700">{file.sub_control_name || '-'}</td>
                                                            )}
                                                            {visibleColumns.control_name && (
                                                                <td className="px-4 py-3 text-sm text-gray-700">{file.control_name || '-'}</td>
                                                            )}
                                                            {visibleColumns.frequency && (
                                                                <td className="px-4 py-3 text-sm text-gray-700">{file.frequency || '-'}</td>
                                                            )}
                                                            {visibleColumns.note && (
                                                                <td className="px-4 py-3 text-sm text-gray-500 max-w-xs">
                                                                    <div className="truncate" title={file.note || ''}>{file.note || '-'}</div>
                                                                </td>
                                                            )}
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Pagination */}
                                    {totalPages > 1 && (
                                        <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between bg-gray-50">
                                            <div className="text-sm text-gray-600">
                                                Page {currentPage} of {totalPages} ({filteredCount} records)
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => setCurrentPage(1)}
                                                    disabled={currentPage === 1}
                                                    className="px-2 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-100"
                                                >
                                                    First
                                                </button>
                                                <button
                                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                    disabled={currentPage === 1}
                                                    className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-100"
                                                >
                                                    Prev
                                                </button>
                                                <span className="px-3 py-1 text-sm bg-white border border-gray-300 rounded">
                                                    {currentPage}
                                                </span>
                                                <button
                                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                                    disabled={currentPage === totalPages}
                                                    className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-100"
                                                >
                                                    Next
                                                </button>
                                                <button
                                                    onClick={() => setCurrentPage(totalPages)}
                                                    disabled={currentPage === totalPages}
                                                    className="px-2 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-100"
                                                >
                                                    Last
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
