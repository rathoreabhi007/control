import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    LineChart,
    Line,
    AreaChart,
    Area,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Cell
} from 'recharts';
import { ApiService } from '../../services/api';
import { FaSync, FaClock, FaServer } from 'react-icons/fa';
import HSBCLogo from '../../components/HSBCLogo';

/**
 * System Monitoring Dashboard
 * Real-time CPU & Memory utilization analysis
 * Streamlit-inspired clean design
 */
const SystemMonitoring = () => {
    const DEFAULT_TIME_RANGE = '6h';
    const MAX_POINTS = 1200;
    const MAX_CHART_POINTS = 600;

    const [monitoringData, setMonitoringData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [servers, setServers] = useState([]);
    const [selectedServer, setSelectedServer] = useState(null);

    // Streamlit-like theme colors
    const theme = {
        background: '#FAFAFA',
        card: '#FFFFFF',
        border: '#E0E0E0',
        text: {
            primary: '#262730',
            secondary: '#808495'
        },
        colors: {
            blue: '#0068C9',
            green: '#09AB3B',
            orange: '#FF8700',
            red: '#FF2B2B',
            purple: '#7D3AC1'
        }
    };

    // Fetch available servers
    const fetchServers = useCallback(async () => {
        try {
            const response = await ApiService.getMonitoringServers();
            if (response.success && response.servers) {
                setServers(response.servers);
                // Auto-select first server if available and none selected
                if (response.servers.length > 0) {
                    setSelectedServer(prev => prev || response.servers[0].log_file);
                }
            }
        } catch (err) {
            // silently ignore - servers list is optional
        }
    }, []); // No dependencies - runs once on mount

    // Fetch monitoring data
    const fetchMonitoringData = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            const response = await ApiService.getSystemMonitoring(
                DEFAULT_TIME_RANGE,
                selectedServer,
                MAX_POINTS
            );

            setMonitoringData(response.data || []);
            setLastUpdated(new Date());
        } catch (err) {
            setError(err.message || 'Failed to load monitoring data');
        } finally {
            setIsLoading(false);
        }
    }, [selectedServer]);

    // Fetch servers on mount
    useEffect(() => {
        fetchServers();
    }, [fetchServers]);

    // Initial load and re-fetch when selectedServer changes
    useEffect(() => {
        fetchMonitoringData();
    }, [fetchMonitoringData]);

    // Auto-refresh effect
    useEffect(() => {
        if (!autoRefresh) return;

        const interval = setInterval(() => {
            fetchMonitoringData();
        }, 30000); // Refresh every 30 seconds

        return () => clearInterval(interval);
    }, [autoRefresh, fetchMonitoringData]);

    const filteredData = useMemo(() => {
        return monitoringData || [];
    }, [monitoringData]);

    // Transform data for Recharts
    const chartData = useMemo(() => {
        if (!filteredData.length) {
            return [];
        }

        const step = Math.max(1, Math.ceil(filteredData.length / MAX_CHART_POINTS));
        const sampledData = step > 1 ? filteredData.filter((_, idx) => idx % step === 0) : filteredData;

        return sampledData.map((item) => ({
            time: new Date(item.timestamp).toLocaleTimeString(),
            timestamp: item.timestamp,
            cpu: item.cpu_percent,
            memory: item.mem_percent,
            memoryUsed: item.mem_used / (1024 ** 3), // Convert to GB
            memoryAvailable: item.mem_available / (1024 ** 3), // Convert to GB
            frequency: item.frequency,
            load1min: item.load_1min,
            load5min: item.load_5min,
            load15min: item.load_15min,
            swap: item.swap_percent,
            // For per-core data
            coreData: item.core_usage || []
        }));
    }, [filteredData, MAX_CHART_POINTS]);

    // Professional color palette
    const chartColors = {
        primary: '#2563eb',      // Blue
        secondary: '#dc2626',    // Red  
        success: '#16a34a',      // Green
        warning: '#f59e0b',      // Amber
        info: '#3b82f6',         // Light Blue
        purple: '#9333ea',       // Purple
        pink: '#ec4899',         // Pink
        gray: '#6b7280'          // Gray
    };

    // Enhanced tooltip with better styling
    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px',
                    padding: '16px',
                    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
                    backdropFilter: 'blur(8px)',
                    fontSize: '14px',
                    minWidth: '200px'
                }}>
                    <div style={{
                        marginBottom: '12px',
                        fontWeight: '600',
                        color: '#1f2937',
                        fontSize: '15px',
                        borderBottom: '1px solid #f3f4f6',
                        paddingBottom: '8px'
                    }}>
                        📊 {label}
                    </div>
                    {payload.map((entry, index) => (
                        <div key={index} style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            margin: '6px 0',
                            padding: '4px 0'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <div style={{
                                    width: '12px',
                                    height: '12px',
                                    backgroundColor: entry.color,
                                    borderRadius: '2px',
                                    marginRight: '8px'
                                }} />
                                <span style={{ color: '#374151', fontWeight: '500' }}>
                                    {entry.name || entry.dataKey}
                                </span>
                            </div>
                            <span style={{
                                fontWeight: '600',
                                color: entry.color,
                                backgroundColor: 'rgba(0,0,0,0.05)',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                fontSize: '13px'
                            }}>
                                {entry.value}{entry.dataKey.includes('memory') && entry.dataKey !== 'memory' ? ' GB' :
                                    entry.dataKey.includes('frequency') ? ' MHz' :
                                        entry.dataKey.includes('load') || entry.dataKey === 'cpu' || entry.dataKey === 'memory' || entry.dataKey === 'swap' ? '%' : ''}
                            </span>
                        </div>
                    ))}
                </div>
            );
        }
        return null;
    };

    // Calculate statistics
    const stats = useMemo(() => {
        if (!filteredData.length) {
            return null;
        }

        const latest = filteredData[filteredData.length - 1];
        const previous = filteredData.length > 1 ? filteredData[filteredData.length - 2] : latest;

        const cpuValues = filteredData.map(d => d.cpu_percent);
        const memValues = filteredData.map(d => d.mem_percent);

        return {
            current: {
                cpu: latest.cpu_percent,
                memory: latest.mem_percent,
                memUsedGB: latest.mem_used / (1024 ** 3),
                memAvailGB: latest.mem_available / (1024 ** 3),
                memTotalGB: latest.mem_total / (1024 ** 3),
                frequency: latest.frequency,
                load: {
                    min1: latest.load_1min,
                    min5: latest.load_5min,
                    min15: latest.load_15min
                },
                swap: latest.swap_percent
            },
            delta: {
                cpu: latest.cpu_percent - previous.cpu_percent,
                memory: latest.mem_percent - previous.mem_percent
            },
            averages: {
                cpu: cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length,
                memory: memValues.reduce((a, b) => a + b, 0) / memValues.length
            },
            peaks: {
                cpu: Math.max(...cpuValues),
                memory: Math.max(...memValues)
            },
            mins: {
                cpu: Math.min(...cpuValues),
                memory: Math.min(...memValues)
            },
            std: {
                cpu: Math.sqrt(cpuValues.reduce((sq, n) => sq + Math.pow(n - (cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length), 2), 0) / cpuValues.length),
                memory: Math.sqrt(memValues.reduce((sq, n) => sq + Math.pow(n - (memValues.reduce((a, b) => a + b, 0) / memValues.length), 2), 0) / memValues.length)
            }
        };
    }, [filteredData]);

    // Streamlit-like Metric Card Component
    const MetricCard = ({ title, value, delta }) => (
        <div style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            padding: '24px 20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
            <div style={{
                fontSize: '14px',
                color: theme.text.secondary,
                marginBottom: '8px',
                fontWeight: '400'
            }}>
                {title}
            </div>
            <div style={{
                fontSize: '36px',
                fontWeight: '600',
                color: theme.text.primary,
                lineHeight: '1'
            }}>
                {value}
            </div>
            {delta !== undefined && delta !== null && (
                <div style={{
                    fontSize: '14px',
                    marginTop: '8px',
                    color: delta >= 0 ? theme.colors.green : theme.colors.red,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                }}>
                    <span>{delta >= 0 ? '↑' : '↓'}</span>
                    <span>{Math.abs(delta).toFixed(1)}%</span>
                </div>
            )}
        </div>
    );

    if (error) {
        return (
            <div style={{
                minHeight: '100vh',
                backgroundColor: theme.background,
                padding: '2rem'
            }}>
                <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                    <div style={{
                        backgroundColor: '#FFF5F5',
                        border: `1px solid ${theme.colors.red}`,
                        borderRadius: '8px',
                        padding: '24px',
                        marginTop: '48px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
                            <FaServer style={{ color: theme.colors.red, fontSize: '24px', marginTop: '4px' }} />
                            <div>
                                <h3 style={{ fontSize: '18px', fontWeight: '600', color: theme.text.primary, marginBottom: '8px' }}>
                                    Monitoring Data Unavailable
                                </h3>
                                <p style={{ fontSize: '14px', color: theme.text.secondary }}>
                                    {error}
                                </p>
                            </div>
                        </div>
                        <div style={{
                            backgroundColor: theme.card,
                            borderRadius: '6px',
                            padding: '16px',
                            marginTop: '16px',
                            fontSize: '14px',
                            color: theme.text.secondary
                        }}>
                            <p style={{ marginBottom: '12px' }}>💡 <strong>To enable monitoring:</strong></p>
                            <ol style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
                                <li>Ensure the monitoring script is running on the server</li>
                                <li>Check that the API endpoint is accessible</li>
                                <li>Verify the log file path is correct</li>
                            </ol>
                        </div>
                        <button
                            onClick={fetchMonitoringData}
                            style={{
                                marginTop: '16px',
                                padding: '10px 20px',
                                backgroundColor: theme.colors.red,
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: '500',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                            onMouseEnter={(e) => e.target.style.opacity = '0.9'}
                            onMouseLeave={(e) => e.target.style.opacity = '1'}
                        >
                            <FaSync />
                            Retry
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="monitoring-container" style={{ minHeight: '100vh', backgroundColor: 'white' }}>
            {/* Header - Same as Completeness Control */}
            <div
                className="border-b border-slate-200 px-8 py-4"
                style={{
                    backgroundColor: 'white',
                    height: '80px',
                    boxShadow: `
                        0 4px 8px rgba(0,0,0,0.15),
                        0 8px 16px rgba(0,0,0,0.1),
                        0 2px 4px rgba(0,0,0,0.1),
                        inset 0 2px 0 rgba(255,255,255,0.8),
                        inset 0 -2px 0 rgba(0,0,0,0.1)
                    `
                }}
            >
                <div className="flex items-center justify-between h-full">
                    {/* HSBC Logo - Left */}
                    <div className="flex items-center flex-shrink-0">
                        <HSBCLogo height={64} className="mr-4" />
                    </div>

                    {/* Title - Center */}
                    <div className="flex-1 flex justify-center">
                        <h1 className="text-2xl font-bold text-black text-center">
                            SYSTEM MONITORING DASHBOARD
                        </h1>
                    </div>

                    {/* Last Updated Indicator - Right */}
                    <div className="flex-shrink-0 flex items-center gap-2">
                        {lastUpdated && (
                            <div className="px-3 py-1 rounded-lg text-sm font-medium bg-blue-100 text-blue-800 flex items-center gap-2">
                                <FaClock />
                                {lastUpdated.toLocaleTimeString()}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div style={{
                backgroundColor: theme.background,
                padding: '2rem 3rem',
                minHeight: 'calc(100vh - 80px)'
            }}>

                {/* Sidebar Controls - Streamlit style */}
                <div style={{
                    backgroundColor: theme.card,
                    border: `1px solid ${theme.border}`,
                    borderRadius: '8px',
                    padding: '20px',
                    marginBottom: '24px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}>
                    <h3 style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: theme.text.primary,
                        marginBottom: '16px'
                    }}>
                        ⚙️ Configuration
                    </h3>

                    {/* Server Selector */}
                    {servers.length > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{
                                fontSize: '14px',
                                fontWeight: '500',
                                color: theme.text.secondary,
                                display: 'block',
                                marginBottom: '8px'
                            }}>
                                Select Server
                            </label>
                            <select
                                value={selectedServer || ''}
                                onChange={(e) => setSelectedServer(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    border: `1px solid ${theme.border}`,
                                    borderRadius: '6px',
                                    fontSize: '14px',
                                    color: theme.text.primary,
                                    backgroundColor: theme.card,
                                    cursor: 'pointer',
                                    outline: 'none'
                                }}
                            >
                                {servers.map((server) => (
                                    <option key={server.log_file} value={server.log_file}>
                                        {server.server_name} ({server.size_mb} MB)
                                    </option>
                                ))}
                            </select>
                            {servers.length > 1 && (
                                <div style={{
                                    marginTop: '8px',
                                    fontSize: '12px',
                                    color: theme.text.secondary
                                }}>
                                    💡 {servers.length} servers available for monitoring
                                </div>
                            )}
                        </div>
                    )}

                    {/* Auto-refresh Toggle */}
                    <div style={{ marginBottom: '12px' }}>
                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            color: theme.text.primary
                        }}>
                            <input
                                type="checkbox"
                                checked={autoRefresh}
                                onChange={(e) => setAutoRefresh(e.target.checked)}
                                style={{
                                    width: '18px',
                                    height: '18px',
                                    cursor: 'pointer',
                                    accentColor: theme.colors.blue
                                }}
                            />
                            <span>Auto-refresh (every 30s)</span>
                        </label>
                        {autoRefresh && (
                            <div style={{
                                marginTop: '8px',
                                padding: '8px 12px',
                                backgroundColor: '#E7F5FF',
                                borderRadius: '4px',
                                fontSize: '13px',
                                color: theme.colors.blue
                            }}>
                                ℹ️ Dashboard will refresh automatically
                            </div>
                        )}
                    </div>

                    {/* Refresh Button */}
                    <button
                        onClick={fetchMonitoringData}
                        disabled={isLoading}
                        style={{
                            width: '100%',
                            padding: '10px 16px',
                            backgroundColor: theme.colors.blue,
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            fontSize: '14px',
                            fontWeight: '500',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            opacity: isLoading ? 0.6 : 1
                        }}
                        onMouseEnter={(e) => !isLoading && (e.target.style.opacity = '0.9')}
                        onMouseLeave={(e) => !isLoading && (e.target.style.opacity = '1')}
                    >
                        <FaSync className={isLoading ? 'animate-spin' : ''} />
                        Refresh Now
                    </button>
                </div>

                {/* Loading State */}
                {isLoading && !stats && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '48px 0',
                        backgroundColor: theme.card,
                        borderRadius: '8px',
                        border: `1px solid ${theme.border}`
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <FaSync style={{
                                fontSize: '32px',
                                color: theme.colors.blue,
                                marginBottom: '12px'
                            }} className="animate-spin" />
                            <p style={{ fontSize: '14px', color: theme.text.secondary }}>
                                Loading monitoring data...
                            </p>
                        </div>
                    </div>
                )}

                {/* Statistics */}
                {stats && (
                    <>
                        {/* Current Metrics - Streamlit style */}
                        <div style={{ marginBottom: '32px' }}>
                            <h2 style={{
                                fontSize: '28px',
                                fontWeight: '600',
                                color: theme.text.primary,
                                marginBottom: '20px'
                            }}>
                                📈 Current Statistics
                            </h2>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                gap: '16px'
                            }}>
                                <MetricCard
                                    title="Current CPU Usage"
                                    value={`${stats.current.cpu.toFixed(1)}%`}
                                    delta={stats.delta.cpu}
                                />
                                <MetricCard
                                    title="Average CPU"
                                    value={`${stats.averages.cpu.toFixed(1)}%`}
                                />
                                <MetricCard
                                    title="Peak CPU"
                                    value={`${stats.peaks.cpu.toFixed(1)}%`}
                                />
                                <MetricCard
                                    title="Memory Usage"
                                    value={`${stats.current.memory.toFixed(1)}%`}
                                    delta={stats.delta.memory}
                                />
                                <MetricCard
                                    title="Memory Used"
                                    value={`${stats.current.memUsedGB.toFixed(2)} GB`}
                                />
                                <MetricCard
                                    title="Memory Available"
                                    value={`${stats.current.memAvailGB.toFixed(2)} GB`}
                                />
                            </div>
                        </div>

                        {/* Main Charts - Streamlit style */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
                            gap: '20px',
                            marginBottom: '32px'
                        }}>
                            {/* CPU Usage Chart */}
                            <div style={{
                                backgroundColor: theme.card,
                                border: `1px solid ${theme.border}`,
                                borderRadius: '8px',
                                padding: '24px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                            }}>
                                <h3 style={{
                                    fontSize: '18px',
                                    fontWeight: '600',
                                    color: theme.text.primary,
                                    marginBottom: '16px'
                                }}>
                                    💻 CPU Usage Over Time
                                </h3>
                                <ResponsiveContainer width="100%" height={350}>
                                    <AreaChart data={chartData} margin={{ top: 20, right: 40, left: 20, bottom: 80 }}>
                                        <defs>
                                            <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={chartColors.primary} stopOpacity={0.4} />
                                                <stop offset="50%" stopColor={chartColors.primary} stopOpacity={0.2} />
                                                <stop offset="95%" stopColor={chartColors.primary} stopOpacity={0.05} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" strokeWidth={1} />
                                        <XAxis
                                            dataKey="time"
                                            stroke="#64748b"
                                            fontSize={11}
                                            tick={{ fontSize: 10, fill: '#64748b', angle: -90, textAnchor: 'end' }}
                                            axisLine={false}
                                            tickLine={false}
                                            height={80}
                                        />
                                        <YAxis
                                            domain={[0, 100]}
                                            stroke="#64748b"
                                            fontSize={11}
                                            tick={{ fontSize: 10, fill: '#64748b' }}
                                            axisLine={false}
                                            tickLine={false}
                                            width={60}
                                            label={{
                                                value: 'CPU Usage (%)',
                                                angle: -90,
                                                position: 'insideLeft',
                                                style: { textAnchor: 'middle', fill: '#64748b', fontSize: '12px' }
                                            }}
                                        />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Area
                                            type="monotone"
                                            dataKey="cpu"
                                            stroke={chartColors.primary}
                                            strokeWidth={3}
                                            fillOpacity={1}
                                            fill="url(#cpuGradient)"
                                            dot={false}
                                            activeDot={{
                                                r: 6,
                                                stroke: chartColors.primary,
                                                strokeWidth: 2,
                                                fill: 'white'
                                            }}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Memory Usage Chart */}
                            <div style={{
                                backgroundColor: theme.card,
                                border: `1px solid ${theme.border}`,
                                borderRadius: '8px',
                                padding: '24px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                            }}>
                                <h3 style={{
                                    fontSize: '18px',
                                    fontWeight: '600',
                                    color: theme.text.primary,
                                    marginBottom: '16px'
                                }}>
                                    🧠 Memory Usage Over Time
                                </h3>
                                <ResponsiveContainer width="100%" height={350}>
                                    <AreaChart data={chartData} margin={{ top: 20, right: 40, left: 20, bottom: 80 }}>
                                        <defs>
                                            <linearGradient id="memoryGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={chartColors.warning} stopOpacity={0.4} />
                                                <stop offset="50%" stopColor={chartColors.warning} stopOpacity={0.2} />
                                                <stop offset="95%" stopColor={chartColors.warning} stopOpacity={0.05} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" strokeWidth={1} />
                                        <XAxis
                                            dataKey="time"
                                            stroke="#64748b"
                                            fontSize={11}
                                            tick={{ fontSize: 10, fill: '#64748b', angle: -90, textAnchor: 'end' }}
                                            axisLine={false}
                                            tickLine={false}
                                            height={80}
                                        />
                                        <YAxis
                                            domain={[0, 100]}
                                            stroke="#64748b"
                                            fontSize={11}
                                            tick={{ fontSize: 10, fill: '#64748b' }}
                                            axisLine={false}
                                            tickLine={false}
                                            width={60}
                                            label={{
                                                value: 'Memory Usage (%)',
                                                angle: -90,
                                                position: 'insideLeft',
                                                style: { textAnchor: 'middle', fill: '#64748b', fontSize: '12px' }
                                            }}
                                        />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Area
                                            type="monotone"
                                            dataKey="memory"
                                            stroke={chartColors.warning}
                                            strokeWidth={3}
                                            fillOpacity={1}
                                            fill="url(#memoryGradient)"
                                            dot={false}
                                            activeDot={{
                                                r: 6,
                                                stroke: chartColors.warning,
                                                strokeWidth: 2,
                                                fill: 'white'
                                            }}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Memory Details - Streamlit style */}
                        <div style={{
                            backgroundColor: theme.card,
                            border: `1px solid ${theme.border}`,
                            borderRadius: '8px',
                            padding: '24px',
                            marginBottom: '32px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                        }}>
                            <h3 style={{
                                fontSize: '18px',
                                fontWeight: '600',
                                color: theme.text.primary,
                                marginBottom: '16px'
                            }}>
                                💾 Memory Details (GB)
                            </h3>
                            <ResponsiveContainer width="100%" height={350}>
                                <AreaChart data={chartData} margin={{ top: 20, right: 40, left: 20, bottom: 80 }}>
                                    <defs>
                                        <linearGradient id="memoryUsedGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={chartColors.secondary} stopOpacity={0.4} />
                                            <stop offset="50%" stopColor={chartColors.secondary} stopOpacity={0.2} />
                                            <stop offset="95%" stopColor={chartColors.secondary} stopOpacity={0.05} />
                                        </linearGradient>
                                        <linearGradient id="memoryAvailableGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={chartColors.success} stopOpacity={0.4} />
                                            <stop offset="50%" stopColor={chartColors.success} stopOpacity={0.2} />
                                            <stop offset="95%" stopColor={chartColors.success} stopOpacity={0.05} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" strokeWidth={1} />
                                    <XAxis
                                        dataKey="time"
                                        stroke="#64748b"
                                        fontSize={11}
                                        tick={{ fontSize: 10, fill: '#64748b', angle: -90, textAnchor: 'end' }}
                                        axisLine={false}
                                        tickLine={false}
                                        height={80}
                                    />
                                    <YAxis
                                        stroke="#64748b"
                                        fontSize={11}
                                        tick={{ fontSize: 10, fill: '#64748b' }}
                                        axisLine={false}
                                        tickLine={false}
                                        width={60}
                                        label={{
                                            value: 'Memory (GB)',
                                            angle: -90,
                                            position: 'insideLeft',
                                            style: { textAnchor: 'middle', fill: '#64748b', fontSize: '12px' }
                                        }}
                                    />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend
                                        verticalAlign="top"
                                        height={36}
                                        iconType="circle"
                                        wrapperStyle={{ paddingBottom: '10px' }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="memoryUsed"
                                        stackId="1"
                                        stroke={chartColors.secondary}
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill="url(#memoryUsedGradient)"
                                        name="Used Memory"
                                        dot={false}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="memoryAvailable"
                                        stackId="1"
                                        stroke={chartColors.success}
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill="url(#memoryAvailableGradient)"
                                        name="Available Memory"
                                        dot={false}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                            <div style={{ marginTop: '10px', fontSize: '12px', color: theme.text.secondary }}>
                                📊 Green shows Available Memory, Red shows Used Memory
                            </div>
                        </div>

                        {/* Additional Charts - Streamlit style */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
                            gap: '20px',
                            marginBottom: '32px'
                        }}>
                            {/* CPU Frequency */}
                            {stats.current.frequency && (
                                <div style={{
                                    backgroundColor: theme.card,
                                    border: `1px solid ${theme.border}`,
                                    borderRadius: '8px',
                                    padding: '24px',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                }}>
                                    <h3 style={{
                                        fontSize: '18px',
                                        fontWeight: '600',
                                        color: theme.text.primary,
                                        marginBottom: '16px'
                                    }}>
                                        🔄 CPU Frequency
                                    </h3>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <LineChart data={chartData} margin={{ top: 20, right: 40, left: 20, bottom: 80 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" strokeWidth={1} />
                                            <XAxis
                                                dataKey="time"
                                                stroke="#64748b"
                                                fontSize={11}
                                                tick={{ fontSize: 10, fill: '#64748b', angle: -90, textAnchor: 'end' }}
                                                axisLine={false}
                                                tickLine={false}
                                                height={80}
                                            />
                                            <YAxis
                                                stroke="#64748b"
                                                fontSize={11}
                                                tick={{ fontSize: 10, fill: '#64748b' }}
                                                axisLine={false}
                                                tickLine={false}
                                                width={60}
                                                label={{
                                                    value: 'Frequency (MHz)',
                                                    angle: -90,
                                                    position: 'insideLeft',
                                                    style: { textAnchor: 'middle', fill: '#64748b', fontSize: '12px' }
                                                }}
                                            />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Line
                                                type="monotone"
                                                dataKey="frequency"
                                                stroke={chartColors.purple}
                                                strokeWidth={3}
                                                dot={{ r: 4, fill: chartColors.purple, stroke: 'white', strokeWidth: 2 }}
                                                activeDot={{
                                                    r: 8,
                                                    stroke: chartColors.purple,
                                                    strokeWidth: 3,
                                                    fill: 'white',
                                                    style: { filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }
                                                }}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            {/* Load Average */}
                            {stats.current.load.min1 !== undefined && (
                                <div style={{
                                    backgroundColor: theme.card,
                                    border: `1px solid ${theme.border}`,
                                    borderRadius: '8px',
                                    padding: '24px',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                }}>
                                    <h3 style={{
                                        fontSize: '18px',
                                        fontWeight: '600',
                                        color: theme.text.primary,
                                        marginBottom: '16px'
                                    }}>
                                        ⚖️ Load Average
                                    </h3>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <LineChart data={chartData} margin={{ top: 20, right: 40, left: 20, bottom: 80 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" strokeWidth={1} />
                                            <XAxis
                                                dataKey="time"
                                                stroke="#64748b"
                                                fontSize={11}
                                                tick={{ fontSize: 10, fill: '#64748b', angle: -90, textAnchor: 'end' }}
                                                axisLine={false}
                                                tickLine={false}
                                                height={80}
                                            />
                                            <YAxis
                                                stroke="#64748b"
                                                fontSize={11}
                                                tick={{ fontSize: 10, fill: '#64748b' }}
                                                axisLine={false}
                                                tickLine={false}
                                                width={60}
                                                label={{
                                                    value: 'Load Average',
                                                    angle: -90,
                                                    position: 'insideLeft',
                                                    style: { textAnchor: 'middle', fill: '#64748b', fontSize: '12px' }
                                                }}
                                            />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Legend
                                                verticalAlign="top"
                                                height={36}
                                                iconType="circle"
                                                wrapperStyle={{ paddingBottom: '10px' }}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="load1min"
                                                stroke={chartColors.success}
                                                strokeWidth={3}
                                                dot={{ r: 4, fill: chartColors.success, stroke: 'white', strokeWidth: 2 }}
                                                activeDot={{
                                                    r: 8,
                                                    stroke: chartColors.success,
                                                    strokeWidth: 3,
                                                    fill: 'white',
                                                    style: { filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }
                                                }}
                                                name="1 min"
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="load5min"
                                                stroke={chartColors.secondary}
                                                strokeWidth={3}
                                                dot={{ r: 4, fill: chartColors.secondary, stroke: 'white', strokeWidth: 2 }}
                                                activeDot={{
                                                    r: 8,
                                                    stroke: chartColors.secondary,
                                                    strokeWidth: 3,
                                                    fill: 'white',
                                                    style: { filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }
                                                }}
                                                name="5 min"
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="load15min"
                                                stroke={chartColors.purple}
                                                strokeWidth={3}
                                                dot={{ r: 4, fill: chartColors.purple, stroke: 'white', strokeWidth: 2 }}
                                                activeDot={{
                                                    r: 8,
                                                    stroke: chartColors.purple,
                                                    strokeWidth: 3,
                                                    fill: 'white',
                                                    style: { filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }
                                                }}
                                                name="15 min"
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                    <div style={{ marginTop: '10px', fontSize: '12px', color: theme.text.secondary }}>
                                        📊 Green: 1min, Red: 5min, Purple: 15min load averages
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Swap Usage - Streamlit style */}
                        {stats.current.swap > 0 && (
                            <div style={{
                                backgroundColor: theme.card,
                                border: `1px solid ${theme.border}`,
                                borderRadius: '8px',
                                padding: '24px',
                                marginBottom: '32px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                            }}>
                                <h3 style={{
                                    fontSize: '18px',
                                    fontWeight: '600',
                                    color: theme.text.primary,
                                    marginBottom: '16px'
                                }}>
                                    🔄 Swap Memory Usage
                                </h3>
                                <ResponsiveContainer width="100%" height={300}>
                                    <AreaChart data={chartData} margin={{ top: 20, right: 40, left: 20, bottom: 80 }}>
                                        <defs>
                                            <linearGradient id="swapGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={chartColors.pink} stopOpacity={0.4} />
                                                <stop offset="50%" stopColor={chartColors.pink} stopOpacity={0.2} />
                                                <stop offset="95%" stopColor={chartColors.pink} stopOpacity={0.05} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" strokeWidth={1} />
                                        <XAxis
                                            dataKey="time"
                                            stroke="#64748b"
                                            fontSize={11}
                                            tick={{ fontSize: 10, fill: '#64748b', angle: -90, textAnchor: 'end' }}
                                            axisLine={false}
                                            tickLine={false}
                                            height={80}
                                        />
                                        <YAxis
                                            domain={[0, 100]}
                                            stroke="#64748b"
                                            fontSize={11}
                                            tick={{ fontSize: 10, fill: '#64748b' }}
                                            axisLine={false}
                                            tickLine={false}
                                            width={60}
                                            label={{
                                                value: 'Swap Usage (%)',
                                                angle: -90,
                                                position: 'insideLeft',
                                                style: { textAnchor: 'middle', fill: '#64748b', fontSize: '12px' }
                                            }}
                                        />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Area
                                            type="monotone"
                                            dataKey="swap"
                                            stroke={chartColors.pink}
                                            strokeWidth={3}
                                            fillOpacity={1}
                                            fill="url(#swapGradient)"
                                            dot={false}
                                            activeDot={{
                                                r: 6,
                                                stroke: chartColors.pink,
                                                strokeWidth: 2,
                                                fill: 'white'
                                            }}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {/* Per-Core CPU Usage Heatmap - Streamlit style */}
                        {filteredData.length > 0 && filteredData[0].core_usage && filteredData[0].core_usage.length > 0 && (
                            <div style={{
                                backgroundColor: theme.card,
                                border: `1px solid ${theme.border}`,
                                borderRadius: '8px',
                                padding: '24px',
                                marginBottom: '32px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                            }}>
                                <h3 style={{
                                    fontSize: '18px',
                                    fontWeight: '600',
                                    color: theme.text.primary,
                                    marginBottom: '16px'
                                }}>
                                    🔥 Per-Core CPU Usage (Latest Sample)
                                </h3>
                                {(() => {
                                    const latestData = filteredData[filteredData.length - 1];
                                    if (!latestData || !latestData.core_usage) return <div>No core data available</div>;

                                    // Helper function to get color based on usage
                                    const getColorForUsage = (usage) => {
                                        if (usage > 80) return chartColors.secondary; // Red for high
                                        if (usage > 60) return chartColors.warning;   // Amber for medium
                                        return chartColors.success;                    // Green for low
                                    };

                                    const coreData = latestData.core_usage.map((usage, index) => ({
                                        core: `Core ${index}`,
                                        usage: usage,
                                        fill: getColorForUsage(usage)
                                    }));

                                    return (
                                        <ResponsiveContainer width="100%" height={350}>
                                            <BarChart data={coreData} margin={{ top: 20, right: 40, left: 20, bottom: 20 }}>
                                                <defs>
                                                    {/* Gradients for each color state */}
                                                    <linearGradient id="coreGradientGreen" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor={chartColors.success} stopOpacity={0.9} />
                                                        <stop offset="95%" stopColor={chartColors.success} stopOpacity={0.6} />
                                                    </linearGradient>
                                                    <linearGradient id="coreGradientAmber" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor={chartColors.warning} stopOpacity={0.9} />
                                                        <stop offset="95%" stopColor={chartColors.warning} stopOpacity={0.6} />
                                                    </linearGradient>
                                                    <linearGradient id="coreGradientRed" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor={chartColors.secondary} stopOpacity={0.9} />
                                                        <stop offset="95%" stopColor={chartColors.secondary} stopOpacity={0.6} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" strokeWidth={1} />
                                                <XAxis
                                                    dataKey="core"
                                                    stroke="#64748b"
                                                    fontSize={11}
                                                    tick={{ fontSize: 10, fill: '#64748b' }}
                                                    axisLine={false}
                                                    tickLine={false}
                                                    height={40}
                                                />
                                                <YAxis
                                                    domain={[0, 100]}
                                                    stroke="#64748b"
                                                    fontSize={11}
                                                    tick={{ fontSize: 10, fill: '#64748b' }}
                                                    axisLine={false}
                                                    tickLine={false}
                                                    width={60}
                                                    label={{
                                                        value: 'CPU Usage (%)',
                                                        angle: -90,
                                                        position: 'insideLeft',
                                                        style: { textAnchor: 'middle', fill: '#64748b', fontSize: '12px' }
                                                    }}
                                                />
                                                <Tooltip
                                                    content={({ active, payload, label }) => {
                                                        if (active && payload && payload.length) {
                                                            const value = payload[0].value;
                                                            const color = getColorForUsage(value);

                                                            return (
                                                                <div style={{
                                                                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                                                    border: '1px solid #e5e7eb',
                                                                    borderRadius: '12px',
                                                                    padding: '16px',
                                                                    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
                                                                    backdropFilter: 'blur(8px)',
                                                                    fontSize: '14px',
                                                                    minWidth: '150px'
                                                                }}>
                                                                    <div style={{
                                                                        marginBottom: '8px',
                                                                        fontWeight: '600',
                                                                        color: '#1f2937',
                                                                        fontSize: '15px'
                                                                    }}>
                                                                        🔥 {label}
                                                                    </div>
                                                                    <div style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'space-between'
                                                                    }}>
                                                                        <span style={{ color: '#374151', fontWeight: '500' }}>
                                                                            CPU Usage
                                                                        </span>
                                                                        <span style={{
                                                                            fontWeight: '600',
                                                                            color: color,
                                                                            backgroundColor: 'rgba(0,0,0,0.05)',
                                                                            padding: '4px 12px',
                                                                            borderRadius: '8px',
                                                                            fontSize: '16px'
                                                                        }}>
                                                                            {value.toFixed(1)}%
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    }}
                                                />
                                                <Bar
                                                    dataKey="usage"
                                                    radius={[6, 6, 0, 0]}
                                                >
                                                    {coreData.map((entry, index) => {
                                                        let gradientId = 'coreGradientGreen';
                                                        if (entry.usage > 80) gradientId = 'coreGradientRed';
                                                        else if (entry.usage > 60) gradientId = 'coreGradientAmber';

                                                        return (
                                                            <Cell
                                                                key={`cell-${index}`}
                                                                fill={`url(#${gradientId})`}
                                                                stroke="rgba(255,255,255,0.3)"
                                                                strokeWidth={1}
                                                            />
                                                        );
                                                    })}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    );
                                })()}
                                <div style={{
                                    marginTop: '12px',
                                    fontSize: '13px',
                                    color: theme.text.secondary,
                                    textAlign: 'center'
                                }}>
                                    💡 Green = Low usage, Yellow = Moderate, Red = High usage
                                </div>
                            </div>
                        )}

                        {/* Statistics Tables - Streamlit style */}
                        <h2 style={{
                            fontSize: '28px',
                            fontWeight: '600',
                            color: theme.text.primary,
                            marginBottom: '20px',
                            marginTop: '16px'
                        }}>
                            📊 Detailed Statistics
                        </h2>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
                            gap: '20px',
                            marginBottom: '32px'
                        }}>
                            {/* CPU Statistics */}
                            <div style={{
                                backgroundColor: theme.card,
                                border: `1px solid ${theme.border}`,
                                borderRadius: '8px',
                                padding: '24px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                            }}>
                                <h3 style={{
                                    fontSize: '16px',
                                    fontWeight: '600',
                                    color: theme.text.primary,
                                    marginBottom: '16px'
                                }}>
                                    CPU Statistics
                                </h3>
                                <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: `2px solid ${theme.border}` }}>
                                            <th style={{
                                                textAlign: 'left',
                                                padding: '12px 0',
                                                fontWeight: '500',
                                                color: theme.text.secondary
                                            }}>Metric</th>
                                            <th style={{
                                                textAlign: 'right',
                                                padding: '12px 0',
                                                fontWeight: '500',
                                                color: theme.text.secondary
                                            }}>Value</th>
                                        </tr>
                                    </thead>
                                    <tbody style={{ color: theme.text.primary }}>
                                        <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                                            <td style={{ padding: '12px 0' }}>Average CPU</td>
                                            <td style={{ textAlign: 'right', fontWeight: '500' }}>{stats.averages.cpu.toFixed(2)}%</td>
                                        </tr>
                                        <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                                            <td style={{ padding: '12px 0' }}>Minimum CPU</td>
                                            <td style={{ textAlign: 'right', fontWeight: '500' }}>{stats.mins.cpu.toFixed(2)}%</td>
                                        </tr>
                                        <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                                            <td style={{ padding: '12px 0' }}>Maximum CPU</td>
                                            <td style={{ textAlign: 'right', fontWeight: '500' }}>{stats.peaks.cpu.toFixed(2)}%</td>
                                        </tr>
                                        <tr>
                                            <td style={{ padding: '12px 0' }}>Std Deviation</td>
                                            <td style={{ textAlign: 'right', fontWeight: '500' }}>{stats.std.cpu.toFixed(2)}%</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Memory Statistics */}
                            <div style={{
                                backgroundColor: theme.card,
                                border: `1px solid ${theme.border}`,
                                borderRadius: '8px',
                                padding: '24px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                            }}>
                                <h3 style={{
                                    fontSize: '16px',
                                    fontWeight: '600',
                                    color: theme.text.primary,
                                    marginBottom: '16px'
                                }}>
                                    Memory Statistics
                                </h3>
                                <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: `2px solid ${theme.border}` }}>
                                            <th style={{
                                                textAlign: 'left',
                                                padding: '12px 0',
                                                fontWeight: '500',
                                                color: theme.text.secondary
                                            }}>Metric</th>
                                            <th style={{
                                                textAlign: 'right',
                                                padding: '12px 0',
                                                fontWeight: '500',
                                                color: theme.text.secondary
                                            }}>Value</th>
                                        </tr>
                                    </thead>
                                    <tbody style={{ color: theme.text.primary }}>
                                        <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                                            <td style={{ padding: '12px 0' }}>Average Memory</td>
                                            <td style={{ textAlign: 'right', fontWeight: '500' }}>{stats.averages.memory.toFixed(2)}%</td>
                                        </tr>
                                        <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                                            <td style={{ padding: '12px 0' }}>Minimum Memory</td>
                                            <td style={{ textAlign: 'right', fontWeight: '500' }}>{stats.mins.memory.toFixed(2)}%</td>
                                        </tr>
                                        <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                                            <td style={{ padding: '12px 0' }}>Maximum Memory</td>
                                            <td style={{ textAlign: 'right', fontWeight: '500' }}>{stats.peaks.memory.toFixed(2)}%</td>
                                        </tr>
                                        <tr>
                                            <td style={{ padding: '12px 0' }}>Std Deviation</td>
                                            <td style={{ textAlign: 'right', fontWeight: '500' }}>{stats.std.memory.toFixed(2)}%</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Footer - Streamlit style */}
                        <div style={{
                            backgroundColor: theme.card,
                            border: `1px solid ${theme.border}`,
                            borderRadius: '8px',
                            padding: '16px 20px',
                            marginTop: '24px',
                            fontSize: '13px',
                            color: theme.text.secondary
                        }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '12px'
                            }}>
                                <div>
                                    <strong style={{ color: theme.text.primary }}>Server:</strong> {servers.find(s => s.log_file === selectedServer)?.server_name || 'Unknown'} (UTC)
                                </div>
                                <div>
                                    <strong style={{ color: theme.text.primary }}>Last Updated:</strong> {new Date().toLocaleString()} ({Intl.DateTimeFormat().resolvedOptions().timeZone})
                                </div>
                                <div>
                                    <strong style={{ color: theme.text.primary }}>Total Records:</strong> {filteredData.length}
                                </div>
                                {filteredData.length > 0 && (
                                    <div style={{ width: '100%', marginTop: '8px', paddingTop: '12px', borderTop: `1px solid ${theme.border}` }}>
                                        <strong style={{ color: theme.text.primary }}>Data Range:</strong>{' '}
                                        {new Date(filteredData[0].timestamp).toLocaleString()} to {new Date(filteredData[filteredData.length - 1].timestamp).toLocaleString()}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default SystemMonitoring;
