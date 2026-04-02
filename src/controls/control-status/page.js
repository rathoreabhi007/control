import React, { useRef, useState, useEffect, useMemo } from 'react';
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

export default function ControlStatusDashboard({ instanceId }) {
    const [runLogs, setRunLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [backendUnavailable, setBackendUnavailable] = useState(false);
    const [hierarchy, setHierarchy] = useState({
        reg_types: [],
        control_types: [],
        asset_types: [],
        subcategory_types: [],
        frequencies: [],
        statuses: []
    });

    // Get today's date in YYYY-MM-DD format
    const getTodayDate = () => {
        const today = new Date();
        return today.toISOString().split('T')[0];
    };

    // Filters - initialize with today's date
    const [filters, setFilters] = useState({
        control_run_date: getTodayDate(),
        business_date: '',
        reg_type: '',
        control_type: '',
        asset_type: '',
        subcategory_type: '',
        frequency: '',
        status: ''
    });

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);
    const [sortColumn, setSortColumn] = useState('control_run_date');
    const [sortDirection, setSortDirection] = useState('desc');

    // Chart category selection - now shows status counts grouped by category
    const [chartCategory, setChartCategory] = useState('reg_type'); // reg_type, control_type, asset_type, subcategory_type

    // Column visibility - default to only name and status
    const [visibleColumns, setVisibleColumns] = useState({
        name: true,
        status: true,
        control_run_date: false,
        business_date: true,
        reg_type: false,
        control_type: false,
        asset_type: false,
        subcategory_type: false,
        frequency: false,
        start_time: true,
        end_time: true,
        comment: true  // Comment column for failed messages
    });
    const [showColumnSelector, setShowColumnSelector] = useState(false);
    const columnsButtonRef = useRef(null);
    const [columnSelectorStyle, setColumnSelectorStyle] = useState(null);

    // Column filters - for filtering individual columns
    const [columnFilters, setColumnFilters] = useState({
        name: '',
        control_run_date: '',
        business_date: '',
        reg_type: '',
        control_type: '',
        asset_type: '',
        subcategory_type: '',
        frequency: '',
        status: '',
        start_time: '',
        end_time: '',
        comment: ''
    });

    // Load hierarchy options on mount
    useEffect(() => {
        loadHierarchy();
    }, []);


    // Load run logs when DATE filters change (other filters are applied client-side)
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);
            setBackendUnavailable(false);
            try {
                // Only send date filters to backend
                const dateFilters = {
                    control_run_date: filters.control_run_date,
                    business_date: filters.business_date
                };
                const data = await ApiService.getControlStatusLogs(dateFilters, 5000);
                setRunLogs(data.run_logs || []);
            } catch (err) {
                const errorMessage = err?.message || 'Failed to load control run logs';
                const isNetworkError = /failed to fetch|network|timeout|backend is not responding/i.test(errorMessage);
                if (isNetworkError) {
                    setRunLogs([]);
                    setError(null);
                    setBackendUnavailable(true);
                } else {
                    setError(errorMessage);
                    console.error('Error loading run logs:', err);
                }
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [filters.control_run_date, filters.business_date]);

    const loadHierarchy = async () => {
        try {
            const data = await ApiService.getControlRunLogsHierarchy();
            setHierarchy(data);
        } catch (err) {
            console.error('Error loading hierarchy:', err);
        }
    };

    const loadRunLogs = async () => {
        setLoading(true);
        setError(null);
        setBackendUnavailable(false);
        try {
            // Only send date filters to backend (other filters are applied client-side)
            const dateFilters = {
                control_run_date: filters.control_run_date,
                business_date: filters.business_date
            };
            const data = await ApiService.getControlStatusLogs(dateFilters, 5000);
            setRunLogs(data.run_logs || []);
        } catch (err) {
            const errorMessage = err?.message || 'Failed to load control run logs';
            const isNetworkError = /failed to fetch|network|timeout|backend is not responding/i.test(errorMessage);
            if (isNetworkError) {
                setRunLogs([]);
                setError(null);
                setBackendUnavailable(true);
            } else {
                setError(errorMessage);
                console.error('Error loading run logs:', err);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleFilterChange = (key, value) => {
        setFilters(prev => {
            const newFilters = { ...prev, [key]: value };
            
            // Clear child filters when parent filter changes
            if (key === 'reg_type') {
                newFilters.control_type = '';
                newFilters.asset_type = '';
                newFilters.subcategory_type = '';
            } else if (key === 'control_type') {
                newFilters.asset_type = '';
                newFilters.subcategory_type = '';
            } else if (key === 'asset_type') {
                newFilters.subcategory_type = '';
            }
            
            return newFilters;
        });
        setCurrentPage(1); // Reset to first page on filter change
    };

    const clearFilters = () => {
        setFilters({
            control_run_date: getTodayDate(), // Reset to today's date
            business_date: '',
            reg_type: '',
            control_type: '',
            asset_type: '',
            subcategory_type: '',
            frequency: '',
            status: ''
        });
        setCurrentPage(1);
    };

    // Filter control types based on selected reg_type
    const filteredControlTypes = useMemo(() => {
        if (!filters.reg_type) return hierarchy.control_types;
        return runLogs
            .filter(log => log.reg_type === filters.reg_type)
            .map(log => log.control_type)
            .filter((value, index, self) => self.indexOf(value) === index)
            .sort();
    }, [filters.reg_type, runLogs, hierarchy.control_types]);

    // Filter asset types based on selected reg_type and control_type
    const filteredAssetTypes = useMemo(() => {
        if (!filters.reg_type && !filters.control_type) return hierarchy.asset_types;
        return runLogs
            .filter(log => 
                (!filters.reg_type || log.reg_type === filters.reg_type) &&
                (!filters.control_type || log.control_type === filters.control_type)
            )
            .map(log => log.asset_type)
            .filter((value, index, self) => self.indexOf(value) === index)
            .sort();
    }, [filters.reg_type, filters.control_type, runLogs, hierarchy.asset_types]);

    // Filter subcategory types based on selected hierarchy
    const filteredSubcategoryTypes = useMemo(() => {
        if (!filters.reg_type && !filters.control_type && !filters.asset_type) {
            return hierarchy.subcategory_types;
        }
        return runLogs
            .filter(log => 
                (!filters.reg_type || log.reg_type === filters.reg_type) &&
                (!filters.control_type || log.control_type === filters.control_type) &&
                (!filters.asset_type || log.asset_type === filters.asset_type)
            )
            .map(log => log.subcategory_type)
            .filter((value, index, self) => self.indexOf(value) === index)
            .sort();
    }, [filters.reg_type, filters.control_type, filters.asset_type, runLogs, hierarchy.subcategory_types]);

    // Apply client-side filters and sort/paginate data
    // Note: Date filters are applied on the backend, other filters are applied here
    const sortedAndPaginatedLogs = useMemo(() => {
        // Apply client-side filters (non-date filters)
        let filtered = runLogs.filter(log => {
            // Apply reg_type filter
            if (filters.reg_type && log.reg_type !== filters.reg_type) {
                return false;
            }
            // Apply control_type filter
            if (filters.control_type && log.control_type !== filters.control_type) {
                return false;
            }
            // Apply asset_type filter
            if (filters.asset_type && log.asset_type !== filters.asset_type) {
                return false;
            }
            // Apply subcategory_type filter
            if (filters.subcategory_type && log.subcategory_type !== filters.subcategory_type) {
                return false;
            }
            // Apply frequency filter
            if (filters.frequency && log.frequency !== filters.frequency) {
                return false;
            }
            // Apply status filter (case-insensitive)
            if (filters.status && log.status?.toLowerCase() !== filters.status.toLowerCase()) {
                return false;
            }
            
            // Apply column filters (text search for name and comment, exact match for others)
            if (columnFilters.name) {
                const nameValue = (log.name || log.control_name || log.control_id || '').toLowerCase();
                if (!nameValue.includes(columnFilters.name.toLowerCase())) {
                    return false;
                }
            }
            if (columnFilters.control_run_date && log.control_run_date !== columnFilters.control_run_date) {
                return false;
            }
            if (columnFilters.business_date && log.business_date !== columnFilters.business_date) {
                return false;
            }
            if (columnFilters.reg_type && log.reg_type !== columnFilters.reg_type) {
                return false;
            }
            if (columnFilters.control_type && log.control_type !== columnFilters.control_type) {
                return false;
            }
            if (columnFilters.asset_type && log.asset_type !== columnFilters.asset_type) {
                return false;
            }
            if (columnFilters.subcategory_type && log.subcategory_type !== columnFilters.subcategory_type) {
                return false;
            }
            if (columnFilters.frequency && log.frequency !== columnFilters.frequency) {
                return false;
            }
            // Apply status filter (case-insensitive)
            if (columnFilters.status && log.status?.toLowerCase() !== columnFilters.status.toLowerCase()) {
                return false;
            }
            if (columnFilters.comment) {
                const commentValue = (log.failed_reason || '').toLowerCase();
                if (!commentValue.includes(columnFilters.comment.toLowerCase())) {
                    return false;
                }
            }
            
            return true;
        });
        
        // Sort
        let sorted = [...filtered];
        sorted.sort((a, b) => {
            let aVal = a[sortColumn] || '';
            let bVal = b[sortColumn] || '';
            
            if (sortDirection === 'asc') {
                return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
            } else {
                return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
            }
        });

        // Paginate
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        return sorted.slice(startIndex, endIndex);
    }, [runLogs, filters, columnFilters, sortColumn, sortDirection, currentPage, itemsPerPage]);

    const handleSort = (column) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    // Calculate statistics - apply client-side filters first
    const stats = useMemo(() => {
        // Apply client-side filters (non-date filters) for statistics
        const filtered = runLogs.filter(log => {
            if (filters.reg_type && log.reg_type !== filters.reg_type) return false;
            if (filters.control_type && log.control_type !== filters.control_type) return false;
            if (filters.asset_type && log.asset_type !== filters.asset_type) return false;
            if (filters.subcategory_type && log.subcategory_type !== filters.subcategory_type) return false;
            if (filters.frequency && log.frequency !== filters.frequency) return false;
            // Status filter (case-insensitive)
            if (filters.status && log.status?.toLowerCase() !== filters.status.toLowerCase()) return false;
            
            // Apply column filters
            if (columnFilters.name) {
                const nameValue = (log.name || log.control_name || log.control_id || '').toLowerCase();
                if (!nameValue.includes(columnFilters.name.toLowerCase())) return false;
            }
            if (columnFilters.control_run_date && log.control_run_date !== columnFilters.control_run_date) return false;
            if (columnFilters.business_date && log.business_date !== columnFilters.business_date) return false;
            if (columnFilters.reg_type && log.reg_type !== columnFilters.reg_type) return false;
            if (columnFilters.control_type && log.control_type !== columnFilters.control_type) return false;
            if (columnFilters.asset_type && log.asset_type !== columnFilters.asset_type) return false;
            if (columnFilters.subcategory_type && log.subcategory_type !== columnFilters.subcategory_type) return false;
            if (columnFilters.frequency && log.frequency !== columnFilters.frequency) return false;
            // Status filter (case-insensitive)
            if (columnFilters.status && log.status?.toLowerCase() !== columnFilters.status.toLowerCase()) return false;
            if (columnFilters.comment) {
                const commentValue = (log.failed_reason || '').toLowerCase();
                if (!commentValue.includes(columnFilters.comment.toLowerCase())) return false;
            }
            
            return true;
        });
        
        const total = filtered.length;
        // Status comparisons are case-insensitive
        const running = filtered.filter(log => (log.status || '').toLowerCase() === 'running').length;
        const success = filtered.filter(log => {
            const status = (log.status || '').toLowerCase();
            return status === 'completed' || status === 'success';
        }).length;
        const failed = filtered.filter(log => (log.status || '').toLowerCase() === 'failed').length;
        const notStarted = filtered.filter(log => (log.status || '').toLowerCase() === 'not_started').length;
        const successRate = total > 0 ? ((success / total) * 100).toFixed(1) : 0;

        return { total, running, success, failed, notStarted, successRate };
    }, [runLogs, filters, columnFilters]);

    const getStatusColor = (status) => {
        switch (status?.toLowerCase()) {
            case 'running':
                return 'bg-blue-100 text-blue-800 border-blue-300';
            case 'completed':
            case 'success':
                return 'bg-green-100 text-green-800 border-green-300';
            case 'failed':
                return 'bg-red-100 text-red-800 border-red-300';
            case 'stopped':
                return 'bg-yellow-100 text-yellow-800 border-yellow-300';
            case 'not_started':
                return 'bg-gray-100 text-gray-800 border-gray-300';
            default:
                return 'bg-gray-100 text-gray-800 border-gray-300';
        }
    };

    const getStatusIcon = (status) => {
        switch (status?.toLowerCase()) {
            case 'running':
                return '▶';
            case 'completed':
            case 'success':
                return '✓';
            case 'failed':
                return '✗';
            case 'stopped':
                return '⏸';
            case 'not_started':
                return '○';
            default:
                return '○';
        }
    };

    // Calculate total pages based on filtered data
    const filteredLogsCount = useMemo(() => {
        return runLogs.filter(log => {
            if (filters.reg_type && log.reg_type !== filters.reg_type) return false;
            if (filters.control_type && log.control_type !== filters.control_type) return false;
            if (filters.asset_type && log.asset_type !== filters.asset_type) return false;
            if (filters.subcategory_type && log.subcategory_type !== filters.subcategory_type) return false;
            if (filters.frequency && log.frequency !== filters.frequency) return false;
            // Status filter (case-insensitive)
            if (filters.status && log.status?.toLowerCase() !== filters.status.toLowerCase()) return false;
            
            // Apply column filters
            if (columnFilters.name) {
                const nameValue = (log.name || log.control_name || log.control_id || '').toLowerCase();
                if (!nameValue.includes(columnFilters.name.toLowerCase())) return false;
            }
            if (columnFilters.control_run_date && log.control_run_date !== columnFilters.control_run_date) return false;
            if (columnFilters.business_date && log.business_date !== columnFilters.business_date) return false;
            if (columnFilters.reg_type && log.reg_type !== columnFilters.reg_type) return false;
            if (columnFilters.control_type && log.control_type !== columnFilters.control_type) return false;
            if (columnFilters.asset_type && log.asset_type !== columnFilters.asset_type) return false;
            if (columnFilters.subcategory_type && log.subcategory_type !== columnFilters.subcategory_type) return false;
            if (columnFilters.frequency && log.frequency !== columnFilters.frequency) return false;
            // Status filter (case-insensitive)
            if (columnFilters.status && log.status?.toLowerCase() !== columnFilters.status.toLowerCase()) return false;
            if (columnFilters.comment) {
                const commentValue = (log.failed_reason || '').toLowerCase();
                if (!commentValue.includes(columnFilters.comment.toLowerCase())) return false;
            }
            
            return true;
        }).length;
    }, [runLogs, filters, columnFilters]);
    
    const totalPages = Math.ceil(filteredLogsCount / itemsPerPage);

    // Chart data based on selected category - shows status counts grouped by category
    const chartData = useMemo(() => {
        const categoryMap = {
            'reg_type': 'reg_type',
            'control_type': 'control_type',
            'asset_type': 'asset_type',
            'subcategory_type': 'subcategory_type'
        };

        const categoryKey = categoryMap[chartCategory];
        if (!categoryKey) return [];

        // Apply client-side filters (non-date filters) for chart data
        const filtered = runLogs.filter(log => {
            if (filters.reg_type && log.reg_type !== filters.reg_type) return false;
            if (filters.control_type && log.control_type !== filters.control_type) return false;
            if (filters.asset_type && log.asset_type !== filters.asset_type) return false;
            if (filters.subcategory_type && log.subcategory_type !== filters.subcategory_type) return false;
            if (filters.frequency && log.frequency !== filters.frequency) return false;
            // Status filter (case-insensitive)
            if (filters.status && log.status?.toLowerCase() !== filters.status.toLowerCase()) return false;
            
            // Apply column filters
            if (columnFilters.name) {
                const nameValue = (log.name || log.control_name || log.control_id || '').toLowerCase();
                if (!nameValue.includes(columnFilters.name.toLowerCase())) return false;
            }
            if (columnFilters.control_run_date && log.control_run_date !== columnFilters.control_run_date) return false;
            if (columnFilters.business_date && log.business_date !== columnFilters.business_date) return false;
            if (columnFilters.reg_type && log.reg_type !== columnFilters.reg_type) return false;
            if (columnFilters.control_type && log.control_type !== columnFilters.control_type) return false;
            if (columnFilters.asset_type && log.asset_type !== columnFilters.asset_type) return false;
            if (columnFilters.subcategory_type && log.subcategory_type !== columnFilters.subcategory_type) return false;
            if (columnFilters.frequency && log.frequency !== columnFilters.frequency) return false;
            // Status filter (case-insensitive)
            if (columnFilters.status && log.status?.toLowerCase() !== columnFilters.status.toLowerCase()) return false;
            if (columnFilters.comment) {
                const commentValue = (log.failed_reason || '').toLowerCase();
                if (!commentValue.includes(columnFilters.comment.toLowerCase())) return false;
            }
            
            return true;
        });

        // Group by category value and count by status
        const categoryGroups = {};
        
        filtered.forEach(log => {
            const categoryValue = log[categoryKey] || 'Unknown';
            const status = log.status || 'unknown';
            
            // Normalize status
            let normalizedStatus = status.toLowerCase();
            if (normalizedStatus === 'completed' || normalizedStatus === 'success') {
                normalizedStatus = 'Success';
            } else if (normalizedStatus === 'running') {
                normalizedStatus = 'Running';
            } else if (normalizedStatus === 'failed') {
                normalizedStatus = 'Failed';
            } else if (normalizedStatus === 'not_started') {
                normalizedStatus = 'Not Started';
            } else {
                normalizedStatus = status.charAt(0).toUpperCase() + status.slice(1);
            }
            
            if (!categoryGroups[categoryValue]) {
                categoryGroups[categoryValue] = {
                    Success: 0,
                    Running: 0,
                    Failed: 0,
                    'Not Started': 0,
                    [normalizedStatus]: 0
                };
            }
            
            // Increment count for this status
            if (categoryGroups[categoryValue][normalizedStatus] !== undefined) {
                categoryGroups[categoryValue][normalizedStatus]++;
            } else {
                categoryGroups[categoryValue][normalizedStatus] = 1;
            }
        });

        // Convert to array format for charts
        const chartDataArray = Object.entries(categoryGroups).map(([name, statusCounts]) => {
            return {
                name: name,
                Success: statusCounts.Success || 0,
                Running: statusCounts.Running || 0,
                Failed: statusCounts.Failed || 0,
                'Not Started': statusCounts['Not Started'] || 0,
                total: (statusCounts.Success || 0) + (statusCounts.Running || 0) + (statusCounts.Failed || 0) + (statusCounts['Not Started'] || 0)
            };
        }).sort((a, b) => b.total - a.total);

        return chartDataArray;
    }, [runLogs, chartCategory, filters, columnFilters]);

    // Get category label
    const getCategoryLabel = (category) => {
        const labels = {
            'reg_type': 'Reg Type',
            'control_type': 'Control Type',
            'asset_type': 'Asset Type',
            'subcategory_type': 'Subcategory Type'
        };
        return labels[category] || category;
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
                                Control Status Dashboard
                            </h1>
                        </div>
                        <div className="flex-shrink-0 w-32"></div>
                    </div>
                </div>

                {/* Main Content - Flex Layout */}
                <div className="flex-1 flex overflow-hidden relative"
                    style={{
                        backgroundColor: '#f5f5f5',
                    }}
                >
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
                                {/* Control Run Date */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Control Run Date
                                    </label>
                                    <input
                                        type="date"
                                        value={filters.control_run_date}
                                        onChange={(e) => handleFilterChange('control_run_date', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-600 text-sm"
                                    />
                                </div>

                                {/* Business Date */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Business Date
                                    </label>
                                    <input
                                        type="date"
                                        value={filters.business_date}
                                        onChange={(e) => handleFilterChange('business_date', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-600 text-sm"
                                    />
                                </div>

                                {/* Reg Type */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Reg Type
                                    </label>
                                    <select
                                        value={filters.reg_type}
                                        onChange={(e) => handleFilterChange('reg_type', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-600 text-sm"
                                    >
                                        <option value="">All</option>
                                        {hierarchy.reg_types.map((type) => (
                                            <option key={type} value={type}>
                                                {type}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Control Type */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Control Type
                                    </label>
                                    <select
                                        value={filters.control_type}
                                        onChange={(e) => handleFilterChange('control_type', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-600 text-sm"
                                    >
                                        <option value="">All</option>
                                        {filteredControlTypes.map((type) => (
                                            <option key={type} value={type}>
                                                {type}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Asset Type */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Asset Type
                                    </label>
                                    <select
                                        value={filters.asset_type}
                                        onChange={(e) => handleFilterChange('asset_type', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-600 text-sm"
                                    >
                                        <option value="">All</option>
                                        {filteredAssetTypes.map((type) => (
                                            <option key={type} value={type}>
                                                {type}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Subcategory Type */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Subcategory Type
                                    </label>
                                    <select
                                        value={filters.subcategory_type}
                                        onChange={(e) => handleFilterChange('subcategory_type', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-600 text-sm"
                                    >
                                        <option value="">All</option>
                                        {filteredSubcategoryTypes.map((type) => (
                                            <option key={type} value={type}>
                                                {type}
                                            </option>
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
                                            <option key={freq} value={freq}>
                                                {freq}
                                            </option>
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
                                        {hierarchy.statuses.map((status) => (
                                            <option key={status} value={status}>
                                                {status === 'not_started' ? 'Not Started' : 
                                                 status.charAt(0).toUpperCase() + status.slice(1)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Content Area */}
                    <div className="flex-1 overflow-y-auto relative">

                        <div className="p-6 relative z-10">
                            {backendUnavailable && !loading && (
                                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center">
                                            <span className="text-amber-700 font-medium">
                                                Backend unavailable. Showing dashboard without live run logs.
                                            </span>
                                        </div>
                                        <button
                                            onClick={loadRunLogs}
                                            className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700"
                                        >
                                            Retry
                                        </button>
                                    </div>
                                </div>
                            )}
                            {/* Error State */}
                            {error && (
                            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center">
                                        <span className="text-red-600 font-medium">Error: {error}</span>
                                    </div>
                                    <button
                                        onClick={loadRunLogs}
                                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                                    >
                                        Retry
                                    </button>
                                </div>
                            </div>
                        )}

                            {/* Statistics Cards */}
                            {!error && !loading && (
                                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                                    <div className="bg-white rounded-lg shadow-md p-4 border-l-4" style={{ borderColor: '#db0011' }}>
                                        <div className="text-sm text-gray-600 font-medium">Total Runs</div>
                                        <div className="text-2xl font-bold text-gray-800 mt-1">{stats.total}</div>
                                    </div>
                                    <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-blue-500">
                                        <div className="text-sm text-gray-600 font-medium">Running</div>
                                        <div className="text-2xl font-bold text-blue-600 mt-1">{stats.running}</div>
                                    </div>
                                    <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-green-500">
                                        <div className="text-sm text-gray-600 font-medium">Success</div>
                                        <div className="text-2xl font-bold text-green-600 mt-1">{stats.success}</div>
                                    </div>
                                    <div className="bg-white rounded-lg shadow-md p-4 border-l-4" style={{ borderColor: '#db0011' }}>
                                        <div className="text-sm text-gray-600 font-medium">Failed</div>
                                        <div className="text-2xl font-bold mt-1" style={{ color: '#db0011' }}>{stats.failed}</div>
                                    </div>
                                    <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-gray-500">
                                        <div className="text-sm text-gray-600 font-medium">Not Started</div>
                                        <div className="text-2xl font-bold text-gray-600 mt-1">{stats.notStarted}</div>
                                    </div>
                                    <div className="bg-white rounded-lg shadow-md p-4 border-l-4" style={{ borderColor: '#db0011' }}>
                                        <div className="text-sm text-gray-600 font-medium">Success Rate</div>
                                        <div className="text-2xl font-bold mt-1" style={{ color: '#db0011' }}>{stats.successRate}%</div>
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
                                        <div className="flex gap-2">
                                            <select
                                                value={chartCategory}
                                                onChange={(e) => setChartCategory(e.target.value)}
                                                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-600 text-sm"
                                            >
                                                <option value="reg_type">Reg Type</option>
                                                <option value="control_type">Control Type</option>
                                                <option value="asset_type">Asset Type</option>
                                                <option value="subcategory_type">Subcategory Type</option>
                                            </select>
                                        </div>
                                    </div>
                                    {/* Stacked Bar Chart - Full Width */}
                                    <div className="w-full">
                                        <h3 className="text-sm font-medium text-gray-600 mb-3">Status Distribution (Stacked Bar)</h3>
                                        <ResponsiveContainer width="100%" height={400}>
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
                                                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                                        border: '1px solid #e5e7eb',
                                                        borderRadius: '6px'
                                                    }}
                                                />
                                                <Legend />
                                                <Bar dataKey="Success" stackId="a" fill="#10b981" name="Success" />
                                                <Bar dataKey="Running" stackId="a" fill="#3b82f6" name="Running" />
                                                <Bar dataKey="Failed" stackId="a" fill="#ef4444" name="Failed" />
                                                <Bar dataKey="Not Started" stackId="a" fill="#9ca3af" name="Not Started" />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}

                        {/* Data Table */}
                        <div className="bg-white rounded-lg shadow-md">
                            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-gray-800">
                                    Control Run Logs ({runLogs.length} total)
                                </h2>
                                <div className="flex items-center gap-3">
                                    {/* Column Visibility Selector */}
                                    <div className="relative">
                                        <button
                                            ref={columnsButtonRef}
                                            onClick={() => {
                                                const nextOpen = !showColumnSelector;
                                                if (nextOpen) {
                                                    const rect = columnsButtonRef.current?.getBoundingClientRect();
                                                    if (rect) {
                                                        const menuHeight = 420; // ~ header + max-h-96 list + button
                                                        const margin = 8;
                                                        const spaceBelow = window.innerHeight - rect.bottom;
                                                        const openUpwards = spaceBelow < menuHeight + margin;
                                                        const top = openUpwards
                                                            ? Math.max(margin, rect.top - menuHeight - margin)
                                                            : Math.min(window.innerHeight - menuHeight - margin, rect.bottom + margin);
                                                        const left = Math.min(window.innerWidth - 260 - margin, Math.max(margin, rect.right - 260));
                                                        setColumnSelectorStyle({
                                                            position: 'fixed',
                                                            top: `${top}px`,
                                                            left: `${left}px`,
                                                            width: '260px',
                                                            maxHeight: `${menuHeight}px`,
                                                            zIndex: 50
                                                        });
                                                    } else {
                                                        setColumnSelectorStyle(null);
                                                    }
                                                }
                                                setShowColumnSelector(nextOpen);
                                            }}
                                            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors flex items-center gap-1"
                                        >
                                            <span>📋 Columns</span>
                                        </button>
                                        {showColumnSelector && (
                                            <>
                                                <div 
                                                    className="fixed inset-0 z-40" 
                                                    onClick={() => setShowColumnSelector(false)}
                                                ></div>
                                                <div
                                                    className="bg-white border border-gray-300 rounded-lg shadow-lg p-4"
                                                    style={columnSelectorStyle || undefined}
                                                >
                                                    <div className="text-sm font-semibold text-gray-700 mb-3">Select Columns</div>
                                                    <div className="space-y-2 max-h-96 overflow-y-auto">
                                                        {Object.entries(visibleColumns).map(([key, value]) => (
                                                            <label key={key} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={value}
                                                                    onChange={(e) => {
                                                                        setVisibleColumns(prev => ({
                                                                            ...prev,
                                                                            [key]: e.target.checked
                                                                        }));
                                                                    }}
                                                                    className="rounded border-gray-300 text-blue-600 focus:ring-red-600"
                                                                />
                                                                <span className="text-sm text-gray-700">
                                                                    {key === 'name' ? 'Name' :
                                                                     key === 'status' ? 'Status' :
                                                                     key === 'control_run_date' ? 'Control Run Date' :
                                                                     key === 'business_date' ? 'Business Date' :
                                                                     key === 'reg_type' ? 'Reg Type' :
                                                                     key === 'control_type' ? 'Control Type' :
                                                                     key === 'asset_type' ? 'Asset Type' :
                                                                     key === 'subcategory_type' ? 'Subcategory' :
                                                                     key === 'frequency' ? 'Frequency' :
                                                                     key === 'start_time' ? 'Start Time' :
                                                                     key === 'end_time' ? 'End Time' :
                                                                     key === 'comment' ? 'Comment' : key}
                                                                </span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                    <button
                                                        onClick={() => setShowColumnSelector(false)}
                                                        className="mt-3 w-full px-3 py-1.5 text-sm text-white rounded transition-colors"
                                                        style={{ backgroundColor: '#db0011' }}
                                                        onMouseOver={(e) => e.target.style.backgroundColor = '#a00010'}
                                                        onMouseOut={(e) => e.target.style.backgroundColor = '#db0011'}
                                                    >
                                                        Done
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <label className="text-sm text-gray-600">Items per page:</label>
                                    <select
                                        value={itemsPerPage}
                                        onChange={(e) => {
                                            setItemsPerPage(Number(e.target.value));
                                            setCurrentPage(1);
                                        }}
                                        className="px-2 py-1 border border-gray-300 rounded text-sm"
                                    >
                                        <option value={25}>25</option>
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                        <option value={200}>200</option>
                                    </select>
                                </div>
                            </div>

                            {loading ? (
                                <div className="p-8 text-center">
                                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                    <p className="mt-2 text-gray-600">Loading control run logs...</p>
                                </div>
                            ) : (
                                <>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    {visibleColumns.name && (
                                                        <th
                                                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                                            onClick={() => handleSort('name')}
                                                        >
                                                            Name
                                                            {sortColumn === 'name' && (
                                                                <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                                            )}
                                                        </th>
                                                    )}
                                                    {visibleColumns.control_run_date && (
                                                        <th
                                                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                                            onClick={() => handleSort('control_run_date')}
                                                        >
                                                            Control Run Date
                                                            {sortColumn === 'control_run_date' && (
                                                                <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                                            )}
                                                        </th>
                                                    )}
                                                    {visibleColumns.business_date && (
                                                        <th
                                                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                                            onClick={() => handleSort('business_date')}
                                                        >
                                                            Business Date
                                                            {sortColumn === 'business_date' && (
                                                                <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                                            )}
                                                        </th>
                                                    )}
                                                    {visibleColumns.reg_type && (
                                                        <th
                                                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                                            onClick={() => handleSort('reg_type')}
                                                        >
                                                            Reg Type
                                                            {sortColumn === 'reg_type' && (
                                                                <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                                            )}
                                                        </th>
                                                    )}
                                                    {visibleColumns.control_type && (
                                                        <th
                                                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                                            onClick={() => handleSort('control_type')}
                                                        >
                                                            Control Type
                                                            {sortColumn === 'control_type' && (
                                                                <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                                            )}
                                                        </th>
                                                    )}
                                                    {visibleColumns.asset_type && (
                                                        <th
                                                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                                            onClick={() => handleSort('asset_type')}
                                                        >
                                                            Asset Type
                                                            {sortColumn === 'asset_type' && (
                                                                <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                                            )}
                                                        </th>
                                                    )}
                                                    {visibleColumns.subcategory_type && (
                                                        <th
                                                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                                            onClick={() => handleSort('subcategory_type')}
                                                        >
                                                            Subcategory
                                                            {sortColumn === 'subcategory_type' && (
                                                                <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                                            )}
                                                        </th>
                                                    )}
                                                    {visibleColumns.frequency && (
                                                        <th
                                                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                                            onClick={() => handleSort('frequency')}
                                                        >
                                                            Frequency
                                                            {sortColumn === 'frequency' && (
                                                                <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                                            )}
                                                        </th>
                                                    )}
                                                    {visibleColumns.status && (
                                                        <th
                                                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                                            onClick={() => handleSort('status')}
                                                        >
                                                            Status
                                                            {sortColumn === 'status' && (
                                                                <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                                            )}
                                                        </th>
                                                    )}
                                                    {visibleColumns.start_time && (
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                            Start Time
                                                        </th>
                                                    )}
                                                    {visibleColumns.end_time && (
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                            End Time
                                                        </th>
                                                    )}
                                                    {visibleColumns.comment && (
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                            Comment
                                                        </th>
                                                    )}
                                                </tr>
                                                {/* Filter Row - Always visible when columns are visible */}
                                                <tr className="bg-gray-100 border-t border-gray-200">
                                                    {visibleColumns.name && (
                                                        <td className="px-2 py-2 min-w-[200px]">
                                                            <div className="relative w-full">
                                                                <input
                                                                    type="text"
                                                                    placeholder="Filter by name..."
                                                                    value={columnFilters.name || ''}
                                                                    onChange={(e) => {
                                                                        setColumnFilters(prev => ({ ...prev, name: e.target.value }));
                                                                        setCurrentPage(1);
                                                                    }}
                                                                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-600 bg-white shadow-sm"
                                                                    style={{ minWidth: '150px' }}
                                                                />
                                                                {columnFilters.name && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setColumnFilters(prev => ({ ...prev, name: '' }));
                                                                            setCurrentPage(1);
                                                                        }}
                                                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full w-5 h-5 flex items-center justify-center text-sm font-bold"
                                                                        title="Clear filter"
                                                                    >
                                                                        ×
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    )}
                                                    {visibleColumns.control_run_date && (
                                                        <td className="px-2 py-2">
                                                            <input
                                                                type="date"
                                                                value={columnFilters.control_run_date || ''}
                                                                onChange={(e) => {
                                                                    setColumnFilters(prev => ({ ...prev, control_run_date: e.target.value }));
                                                                    setCurrentPage(1);
                                                                }}
                                                                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600 bg-white"
                                                            />
                                                        </td>
                                                    )}
                                                    {visibleColumns.business_date && (
                                                        <td className="px-2 py-2">
                                                            <input
                                                                type="date"
                                                                value={columnFilters.business_date || ''}
                                                                onChange={(e) => {
                                                                    setColumnFilters(prev => ({ ...prev, business_date: e.target.value }));
                                                                    setCurrentPage(1);
                                                                }}
                                                                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600 bg-white"
                                                            />
                                                        </td>
                                                    )}
                                                    {visibleColumns.reg_type && (
                                                        <td className="px-2 py-2">
                                                            <div className="relative">
                                                                <input
                                                                    type="text"
                                                                    placeholder="Filter..."
                                                                    value={columnFilters.reg_type || ''}
                                                                    onChange={(e) => {
                                                                        setColumnFilters(prev => ({ ...prev, reg_type: e.target.value }));
                                                                        setCurrentPage(1);
                                                                    }}
                                                                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600 bg-white"
                                                                />
                                                                {columnFilters.reg_type && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setColumnFilters(prev => ({ ...prev, reg_type: '' }));
                                                                            setCurrentPage(1);
                                                                        }}
                                                                        className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                                                                        title="Clear filter"
                                                                    >
                                                                        ×
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    )}
                                                    {visibleColumns.control_type && (
                                                        <td className="px-2 py-2">
                                                            <div className="relative">
                                                                <input
                                                                    type="text"
                                                                    placeholder="Filter..."
                                                                    value={columnFilters.control_type || ''}
                                                                    onChange={(e) => {
                                                                        setColumnFilters(prev => ({ ...prev, control_type: e.target.value }));
                                                                        setCurrentPage(1);
                                                                    }}
                                                                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600 bg-white"
                                                                />
                                                                {columnFilters.control_type && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setColumnFilters(prev => ({ ...prev, control_type: '' }));
                                                                            setCurrentPage(1);
                                                                        }}
                                                                        className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                                                                        title="Clear filter"
                                                                    >
                                                                        ×
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    )}
                                                    {visibleColumns.asset_type && (
                                                        <td className="px-2 py-2">
                                                            <div className="relative">
                                                                <input
                                                                    type="text"
                                                                    placeholder="Filter..."
                                                                    value={columnFilters.asset_type || ''}
                                                                    onChange={(e) => {
                                                                        setColumnFilters(prev => ({ ...prev, asset_type: e.target.value }));
                                                                        setCurrentPage(1);
                                                                    }}
                                                                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600 bg-white"
                                                                />
                                                                {columnFilters.asset_type && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setColumnFilters(prev => ({ ...prev, asset_type: '' }));
                                                                            setCurrentPage(1);
                                                                        }}
                                                                        className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                                                                        title="Clear filter"
                                                                    >
                                                                        ×
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    )}
                                                    {visibleColumns.subcategory_type && (
                                                        <td className="px-2 py-2">
                                                            <div className="relative">
                                                                <input
                                                                    type="text"
                                                                    placeholder="Filter..."
                                                                    value={columnFilters.subcategory_type || ''}
                                                                    onChange={(e) => {
                                                                        setColumnFilters(prev => ({ ...prev, subcategory_type: e.target.value }));
                                                                        setCurrentPage(1);
                                                                    }}
                                                                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600 bg-white"
                                                                />
                                                                {columnFilters.subcategory_type && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setColumnFilters(prev => ({ ...prev, subcategory_type: '' }));
                                                                            setCurrentPage(1);
                                                                        }}
                                                                        className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                                                                        title="Clear filter"
                                                                    >
                                                                        ×
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    )}
                                                    {visibleColumns.frequency && (
                                                        <td className="px-2 py-2">
                                                            <div className="relative">
                                                                <input
                                                                    type="text"
                                                                    placeholder="Filter..."
                                                                    value={columnFilters.frequency || ''}
                                                                    onChange={(e) => {
                                                                        setColumnFilters(prev => ({ ...prev, frequency: e.target.value }));
                                                                        setCurrentPage(1);
                                                                    }}
                                                                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600 bg-white"
                                                                />
                                                                {columnFilters.frequency && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setColumnFilters(prev => ({ ...prev, frequency: '' }));
                                                                            setCurrentPage(1);
                                                                        }}
                                                                        className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                                                                        title="Clear filter"
                                                                    >
                                                                        ×
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    )}
                                                    {visibleColumns.status && (
                                                        <td className="px-2 py-2">
                                                            <div className="relative">
                                                                <input
                                                                    type="text"
                                                                    placeholder="Filter..."
                                                                    value={columnFilters.status || ''}
                                                                    onChange={(e) => {
                                                                        setColumnFilters(prev => ({ ...prev, status: e.target.value }));
                                                                        setCurrentPage(1);
                                                                    }}
                                                                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600 bg-white"
                                                                />
                                                                {columnFilters.status && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setColumnFilters(prev => ({ ...prev, status: '' }));
                                                                            setCurrentPage(1);
                                                                        }}
                                                                        className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                                                                        title="Clear filter"
                                                                    >
                                                                        ×
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    )}
                                                    {visibleColumns.start_time && (
                                                        <td className="px-2 py-2">
                                                            <div className="relative">
                                                                <input
                                                                    type="text"
                                                                    placeholder="Filter..."
                                                                    value={columnFilters.start_time || ''}
                                                                    onChange={(e) => {
                                                                        setColumnFilters(prev => ({ ...prev, start_time: e.target.value }));
                                                                        setCurrentPage(1);
                                                                    }}
                                                                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600 bg-white"
                                                                />
                                                                {columnFilters.start_time && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setColumnFilters(prev => ({ ...prev, start_time: '' }));
                                                                            setCurrentPage(1);
                                                                        }}
                                                                        className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                                                                        title="Clear filter"
                                                                    >
                                                                        ×
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    )}
                                                    {visibleColumns.end_time && (
                                                        <td className="px-2 py-2">
                                                            <div className="relative">
                                                                <input
                                                                    type="text"
                                                                    placeholder="Filter..."
                                                                    value={columnFilters.end_time || ''}
                                                                    onChange={(e) => {
                                                                        setColumnFilters(prev => ({ ...prev, end_time: e.target.value }));
                                                                        setCurrentPage(1);
                                                                    }}
                                                                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600 bg-white"
                                                                />
                                                                {columnFilters.end_time && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setColumnFilters(prev => ({ ...prev, end_time: '' }));
                                                                            setCurrentPage(1);
                                                                        }}
                                                                        className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                                                                        title="Clear filter"
                                                                    >
                                                                        ×
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    )}
                                                    {visibleColumns.comment && (
                                                        <td className="px-2 py-2">
                                                            <div className="relative">
                                                                <input
                                                                    type="text"
                                                                    placeholder="Filter comment..."
                                                                    value={columnFilters.comment || ''}
                                                                    onChange={(e) => {
                                                                        setColumnFilters(prev => ({ ...prev, comment: e.target.value }));
                                                                        setCurrentPage(1);
                                                                    }}
                                                                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600 bg-white"
                                                                />
                                                                {columnFilters.comment && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setColumnFilters(prev => ({ ...prev, comment: '' }));
                                                                            setCurrentPage(1);
                                                                        }}
                                                                        className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                                                                        title="Clear filter"
                                                                    >
                                                                        ×
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    )}
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {sortedAndPaginatedLogs.length === 0 ? (
                                                    <tr>
                                                        <td 
                                                            colSpan={Object.values(visibleColumns).filter(v => v).length} 
                                                            className="px-6 py-8 text-center text-gray-500"
                                                        >
                                                            No control run logs found matching the selected filters. Please adjust your filters to see results.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    sortedAndPaginatedLogs.map((log, index) => (
                                                    <tr key={log.task_id || index} className="hover:bg-gray-50">
                                                        {visibleColumns.name && (
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                {log.name || log.control_name || log.control_id || '-'}
                                                            </td>
                                                        )}
                                                        {visibleColumns.control_run_date && (
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                {log.control_run_date || '-'}
                                                            </td>
                                                        )}
                                                        {visibleColumns.business_date && (
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                {log.business_date || '-'}
                                                            </td>
                                                        )}
                                                        {visibleColumns.reg_type && (
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                {log.reg_type || '-'}
                                                            </td>
                                                        )}
                                                        {visibleColumns.control_type && (
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                {log.control_type || '-'}
                                                            </td>
                                                        )}
                                                        {visibleColumns.asset_type && (
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                {log.asset_type || '-'}
                                                            </td>
                                                        )}
                                                        {visibleColumns.subcategory_type && (
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                {log.subcategory_type || '-'}
                                                            </td>
                                                        )}
                                                        {visibleColumns.frequency && (
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                {log.frequency || '-'}
                                                            </td>
                                                        )}
                                                        {visibleColumns.status && (
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(log.status)}`}>
                                                                    <span className="mr-1">{getStatusIcon(log.status)}</span>
                                                                    {log.status === 'not_started' ? 'Not Started' : (log.status || 'Unknown')}
                                                                </span>
                                                            </td>
                                                        )}
                                                        {visibleColumns.start_time && (
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                                {log.start_time ? new Date(log.start_time).toLocaleString() : '-'}
                                                            </td>
                                                        )}
                                                        {visibleColumns.end_time && (
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                                {log.end_time ? new Date(log.end_time).toLocaleString() : '-'}
                                                            </td>
                                                        )}
                                                        {visibleColumns.comment && (
                                                            <td className="px-6 py-4 text-sm text-gray-500 max-w-md" title={log.failed_reason || ''}>
                                                                <div className="break-words">
                                                                    {log.failed_reason || '-'}
                                                                </div>
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
                                        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                                            <div className="text-sm text-gray-700">
                                                Showing {sortedAndPaginatedLogs.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredLogsCount)} of {filteredLogsCount} results
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                                    disabled={currentPage === 1}
                                                    className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Previous
                                                </button>
                                                <span className="px-4 py-2 text-sm text-gray-700">
                                                    Page {currentPage} of {totalPages}
                                                </span>
                                                <button
                                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                                    disabled={currentPage === totalPages}
                                                    className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Next
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

