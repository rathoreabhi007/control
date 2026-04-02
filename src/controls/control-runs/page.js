import React, { useMemo, useState, useEffect } from 'react';
import ApiService from '../../services/api';
import WebSocketService from '../../services/websocket';
import ControlCard from '../../components/ControlRuns/ControlCard';
import LogViewer from '../../components/ControlRuns/LogViewer';
import RunModal from '../../components/ControlRuns/RunModal';
import StatusBadge from '../../components/ControlRuns/StatusBadge';
import { useUser } from '../../contexts/UserContext';
import HSBCLogo from '../../components/HSBCLogo';
import BulkRunModal from '../../components/ControlRuns/BulkRunModal';

const FALLBACK_CONTROLS = [
    {
        control_id: 'generic_controller',
        name: 'Data Extraction Process',
        description: 'Extract data from source systems',
        enabled: true,
        priority: 1,
        estimated_duration_minutes: 30,
        frequency: 'Daily'
    },
    {
        control_id: 'generic_controller',
        name: 'Data Transformation Process',
        description: 'Transform extracted data',
        enabled: true,
        priority: 2,
        estimated_duration_minutes: 45,
        frequency: 'Daily'
    },
    {
        control_id: 'generic_controller',
        name: 'Data Loading Process',
        description: 'Load transformed data to target',
        enabled: true,
        priority: 3,
        estimated_duration_minutes: 20,
        frequency: 'Daily'
    },
    {
        control_id: 'generic_controller',
        name: 'Data Validation Process',
        description: 'Validate loaded data',
        enabled: true,
        priority: 4,
        estimated_duration_minutes: 15,
        frequency: 'Daily'
    },
    {
        control_id: 'generic_controller',
        name: 'Report Generation Process',
        description: 'Generate daily reports',
        enabled: true,
        priority: 5,
        estimated_duration_minutes: 25,
        frequency: 'Daily'
    }
];

/**
 * Control Runs Page - Airflow-inspired control execution interface
 */
const ControlRunsPage = () => {
    const { hasAccess, loading: userLoading } = useUser();
    const [controls, setControls] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedRun, setSelectedRun] = useState(null);
    const [selectedControl, setSelectedControl] = useState(null);
    const [showBatchModal, setShowBatchModal] = useState(false);
    const [allRuns, setAllRuns] = useState([]);
    const [filterStatus, setFilterStatus] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [historyCache, setHistoryCache] = useState(new Map());

    useEffect(() => {
        // Initial load: Cache controls and history at once
        const initialLoad = async () => {
            try {
                // Load controls (cached in state, no need for separate cache)
                const controlsResponse = await ApiService.getControls();
                const controlsList = controlsResponse.controls || [];
                setControls(controlsList);

                // Load all historical runs (higher limit for initial cache)
                const historyResponse = await ApiService.getControlRunHistory(null, null, 200);
                const runs = historyResponse.history || historyResponse.runs || [];
                setAllRuns(runs);

                // Build history cache (task_id -> run data)
                const historyCacheMap = new Map();
                runs.forEach(run => {
                    historyCacheMap.set(run.task_id, run);
                });
                setHistoryCache(historyCacheMap);

            } catch (err) {
                const errorMessage = err?.message || 'Failed to load controls';
                const isNetworkError = /failed to fetch|network|timeout|backend is not responding/i.test(errorMessage);
                if (isNetworkError) {
                    setControls(FALLBACK_CONTROLS);
                    setAllRuns([]);
                    setError(null);
                } else {
                    console.error('Failed to load initial cache:', err);
                    setError(errorMessage);
                }
            } finally {
                setIsLoading(false);
            }
        };

        initialLoad();

        // Connect WebSocket (with automatic reconnection)
        WebSocketService.connect();

        // Subscribe to runs updates via WebSocket - only for running processes
        WebSocketService.onRunsUpdate((runs) => {
            // Update runs that are being tracked or are in active states
            setAllRuns(prevRuns => {
                const prevMap = new Map(prevRuns.map(r => [r.task_id, r]));
                const updatedMap = new Map(prevMap);
                let hasUpdates = false;

                // Update only running tasks or new tasks
                runs.forEach(run => {
                    const status = (run.status || '').toLowerCase();

                    // Update if:
                    // 1. We are already tracking this task (it's in prevMap) -> update to ANY status (completed, failed, etc.)
                    // 2. It is a new task that is running/started
                    // 3. Task just completed/failed (to catch final status updates)
                    const isFinalState = status === 'completed' || status === 'success' ||
                        status === 'failed' || status === 'error' ||
                        status === 'stopped' || status === 'killed';
                    const isActiveState = status === 'running' || status === 'started';

                    if (prevMap.has(run.task_id) || isActiveState || isFinalState) {
                        const existing = updatedMap.get(run.task_id);
                        // Only update if this is newer information
                        if (!existing ||
                            (run.updated_at && existing.updated_at && run.updated_at >= existing.updated_at) ||
                            !existing.updated_at) {
                            updatedMap.set(run.task_id, run);
                            hasUpdates = true;
                            // Update history cache
                            setHistoryCache(prev => {
                                const newCache = new Map(prev);
                                newCache.set(run.task_id, run);
                                return newCache;
                            });
                        }
                    }
                });

                return hasUpdates ? Array.from(updatedMap.values()) : prevRuns;
            });
        });

        // Monitor connection status
        const unsubscribeConnect = WebSocketService.onConnect(() => {
        });

        const unsubscribeDisconnect = WebSocketService.onDisconnect(() => {
            console.warn('WebSocket disconnected');
        });

        return () => {
            unsubscribeConnect();
            unsubscribeDisconnect();
            // Don't disconnect WebSocket here - it's a singleton used by other pages
        };
    }, []);

    // Filter runs based on status and date
    // For running status, only show last 7 days
    const filteredRuns = React.useMemo(() => {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        let filtered = allRuns.filter(run => {
            if (filterStatus === 'all') return true;

            const status = run.status.toLowerCase();
            const filter = filterStatus.toLowerCase();

            // Handle status aliases
            if (filter === 'success') {
                return status === 'success' || status === 'completed';
            } else if (filter === 'failed') {
                return status === 'failed' || status === 'error';
            } else if (filter === 'stopped') {
                return status === 'stopped' || status === 'killed';
            } else if (filter === 'running') {
                // For running status, only show last 7 days
                if (status === 'running' || status === 'started') {
                    const runDate = run.started_at || run.created_at || run.updated_at;
                    if (runDate) {
                        const runDateObj = new Date(runDate);
                        return runDateObj >= sevenDaysAgo;
                    }
                    // If no date, include it (might be currently running)
                    return true;
                }
                return false;
            }

            return status === filter;
        });

        // Deduplicate by task_id (keep the most recent one)
        const seen = new Map();
        filtered.forEach(run => {
            const existing = seen.get(run.task_id);
            if (!existing) {
                seen.set(run.task_id, run);
            } else {
                // Compare dates and keep the more recent one
                const existingDate = existing.updated_at || existing.started_at || existing.created_at;
                const currentDate = run.updated_at || run.started_at || run.created_at;
                if (currentDate && existingDate && new Date(currentDate) > new Date(existingDate)) {
                    seen.set(run.task_id, run);
                }
            }
        });

        // Convert back to array and sort
        const uniqueRuns = Array.from(seen.values());

        // Sort: running tasks first, then by updated_at desc
        uniqueRuns.sort((a, b) => {
            const aStatus = (a.status || '').toLowerCase();
            const bStatus = (b.status || '').toLowerCase();
            const aRunning = aStatus === 'running' || aStatus === 'started';
            const bRunning = bStatus === 'running' || bStatus === 'started';

            if (aRunning && !bRunning) return -1;
            if (!aRunning && bRunning) return 1;

            // Both same running status, sort by date
            const aDate = a.updated_at || a.started_at || a.created_at || '';
            const bDate = b.updated_at || b.started_at || b.created_at || '';
            return bDate.localeCompare(aDate); // Descending (newest first)
        });

        return uniqueRuns;
    }, [allRuns, filterStatus]);

    // History is cached on initial load, only refresh if needed
    const loadAllRuns = async () => {
        // Use cached history if available
        if (historyCache.size > 0) {
            setAllRuns(Array.from(historyCache.values()));
            return;
        }

        try {
            // Get all runs (no filter) with limit 200 for cache
            const response = await ApiService.getControlRunHistory(null, null, 200);
            const runs = response.history || response.runs || [];
            setAllRuns(runs);

            // Update cache
            const cache = new Map();
            runs.forEach(run => {
                cache.set(run.task_id, run);
            });
            setHistoryCache(cache);
        } catch (err) {
            console.error('Failed to load all runs:', err);
        }
    };

    const handleRunClick = (control) => {
        setSelectedControl(control);
    };

    const removeRunByTaskId = (taskId) => {
        if (!taskId) return;
        setAllRuns(prev => prev.filter(run => run.task_id !== taskId));
        setHistoryCache(prev => {
            const cache = new Map(prev);
            cache.delete(taskId);
            return cache;
        });
    };

    const handleRerunClick = (run) => {
        removeRunByTaskId(run.task_id);

        const matchedControl = controls.find(
            (control) =>
                (run.control_id && control.control_id === run.control_id && control.name === (run.task_name || run.control_name)) ||
                control.name === (run.task_name || run.control_name)
        );

        if (matchedControl) {
            setSelectedControl(matchedControl);
            return;
        }

        setSelectedControl({
            control_id: run.control_id || 'generic_controller',
            name: run.task_name || run.control_name || 'Control',
            description: `Re-run for ${run.task_name || run.control_name || 'control'}`,
            enabled: true
        });
    };

    const handleStartRun = async (params) => {
        try {
            const response = await ApiService.startControlRun(params);

            // WebSocket will automatically update the runs list, no need to manually reload
            // Only reload if WebSocket is not connected
            const wsStatus = WebSocketService.getStatus();
            if (!wsStatus.isConnected) {
                setTimeout(loadAllRuns, 1000);
            }
            return response;
        } catch (err) {
            const errorMessage = err?.message || 'Failed to start run';
            const isNetworkError = /failed to fetch|network|timeout|backend is not responding/i.test(errorMessage);

            if (!isNetworkError) {
                console.error('Failed to start run:', err);
                throw err;
            }

            // Local simulated run when backend is down.
            const now = new Date();
            const taskId = `local-${now.getTime()}`;
            const simulatedRun = {
                task_id: taskId,
                control_id: params.control_id,
                task_name: params.task_name,
                control_name: params.task_name,
                run_env: params.run_env,
                expected_run_date: params.expected_run_date,
                status: 'running',
                started_at: now.toISOString(),
                created_at: now.toISOString(),
                updated_at: now.toISOString(),
                simulated: true
            };

            setAllRuns(prev => [simulatedRun, ...prev]);
            setHistoryCache(prev => {
                const cache = new Map(prev);
                cache.set(taskId, simulatedRun);
                return cache;
            });

            setTimeout(() => {
                const nowIso = new Date().toISOString();
                setAllRuns(prev => prev.map(run => (
                    run.task_id === taskId
                        ? { ...run, status: 'completed', updated_at: nowIso, ended_at: nowIso }
                        : run
                )));
                setHistoryCache(prev => {
                    const cache = new Map(prev);
                    const current = cache.get(taskId);
                    if (current) {
                        cache.set(taskId, { ...current, status: 'completed', updated_at: nowIso, ended_at: nowIso });
                    }
                    return cache;
                });
            }, 5000);

            return { task_id: taskId, status: 'running', simulated: true };
        }
    };

    const handleViewLogs = (run) => {
        setSelectedRun(run);
    };

    const handleStopRun = async (run) => {
        if (!window.confirm(`Are you sure you want to stop "${run.control_name}"?`)) {
            return;
        }

        if (run.simulated || String(run.task_id).startsWith('local-')) {
            const nowIso = new Date().toISOString();
            setAllRuns(prev => prev.map(item => (
                item.task_id === run.task_id
                    ? { ...item, status: 'stopped', updated_at: nowIso, ended_at: nowIso }
                    : item
            )));
            setHistoryCache(prev => {
                const cache = new Map(prev);
                const current = cache.get(run.task_id);
                if (current) {
                    cache.set(run.task_id, { ...current, status: 'stopped', updated_at: nowIso, ended_at: nowIso });
                }
                return cache;
            });
            return;
        }

        try {
            await ApiService.stopControlRun(run.task_id, false);
            // WebSocket will automatically update the runs list, no need to manually reload
            // Only reload if WebSocket is not connected
            const wsStatus = WebSocketService.getStatus();
            if (!wsStatus.isConnected) {
                setTimeout(loadAllRuns, 1000);
            }
        } catch (err) {
            console.error('Failed to stop run:', err);
            alert(`Failed to stop run: ${err.message}`);
        }
    };

    const handleCloseLogViewer = () => {
        setSelectedRun(null);
    };

    const handleCloseRunModal = () => {
        setSelectedControl(null);
    };

    const regexError = useMemo(() => {
        const term = (searchTerm || '').trim();
        if (!term) return '';
        try {
            new RegExp(term, 'i');
            return '';
        } catch (e) {
            return e?.message || 'Invalid regex pattern';
        }
    }, [searchTerm]);

    // Filter controls based on regex search (always-on)
    const filteredControls = useMemo(() => {
        const term = (searchTerm || '').trim();
        if (!term) return controls;
        try {
            const regex = new RegExp(term, 'i');
            return controls.filter(control =>
                regex.test(control.name || '') || regex.test(control.description || '')
            );
        } catch {
            return [];
        }
    }, [controls, searchTerm]);

    const getStatusCounts = () => {
        const counts = {
            all: allRuns.length,
            running: 0,
            success: 0,
            failed: 0,
            stopped: 0
        };

        // For running count, only count last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        allRuns.forEach(run => {
            const status = run.status.toLowerCase();
            if (status === 'running' || status === 'started') {
                // Only count running tasks from last 7 days
                const runDate = run.started_at || run.created_at || run.updated_at;
                if (runDate) {
                    const runDateObj = new Date(runDate);
                    if (runDateObj >= sevenDaysAgo) {
                        counts.running++;
                    }
                } else {
                    // If no date, count it (might be currently running)
                    counts.running++;
                }
            } else if (status === 'success' || status === 'completed') {
                counts.success++;
            } else if (status === 'failed' || status === 'error') {
                counts.failed++;
            } else if (status === 'stopped' || status === 'killed') {
                counts.stopped++;
            }
        });

        return counts;
    };

    const statusCounts = getStatusCounts();

    if (userLoading) {
        return (
            <div style={{
                minHeight: '100vh',
                backgroundColor: '#f5f5f5',
                color: '#333',
                padding: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '18px', color: '#666' }}>Loading user permissions...</div>
                </div>
            </div>
        );
    }

    if (!hasAccess('control-run')) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="p-8 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-200 rounded-lg shadow-md">
                    <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
                    <p>You do not have permission to view the Control Runs page.</p>
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div style={{
                minHeight: '100vh',
                backgroundColor: '#f5f5f5',
                color: '#333',
                padding: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
                    <div style={{ fontSize: '18px', color: '#666' }}>Loading controls...</div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{
                minHeight: '100vh',
                backgroundColor: '#f5f5f5',
                color: '#333',
                padding: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <div style={{
                    textAlign: 'center',
                    backgroundColor: 'white',
                    border: '2px solid #db0011',
                    borderRadius: '8px',
                    padding: '40px',
                    maxWidth: '500px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
                    <h2 style={{ margin: '0 0 8px 0', fontSize: '24px', color: '#db0011' }}>Error Loading Controls</h2>
                    <p style={{ color: '#666', margin: '0 0 20px 0' }}>{error}</p>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            backgroundColor: '#db0011',
                            color: 'white',
                            border: 'none',
                            padding: '12px 24px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: '600'
                        }}
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            minHeight: '100vh',
            backgroundColor: '#f5f5f5',
            color: '#333',
            padding: '0'
        }}>
            {/* Header */}
            <div className="border-b border-slate-200 px-8 py-4"
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
                }}>
                <div className="flex items-center justify-between h-full">
                    <div className="flex items-center flex-shrink-0">
                        <HSBCLogo height={64} className="mr-4" />
                    </div>
                    <div className="flex-1 flex justify-center">
                        <h1 className="text-2xl font-bold text-black text-center">
                            CONTROL RUNS
                        </h1>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-2">
                        <div className="px-3 py-1 rounded-lg text-sm font-medium bg-gray-100 text-gray-600">
                            Last updated: {new Date().toLocaleTimeString()}
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div style={{
                maxWidth: '1800px',
                margin: '0 auto',
                padding: '20px',
                display: 'grid',
                gridTemplateColumns: '1fr 450px',
                gap: '20px',
                alignItems: 'start'
            }}>
                {/* Left Column - Controls List */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px'
                }}>
                    {/* Stats Bar */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(5, 1fr)',
                        gap: '12px'
                    }}>
                        <div style={{
                            backgroundColor: 'white',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            padding: '12px',
                            textAlign: 'center',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}>
                            <div style={{ fontSize: '24px', fontWeight: '700', color: '#db0011' }}>
                                {controls.length}
                            </div>
                            <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                                Total Controls
                            </div>
                        </div>
                        <div style={{
                            backgroundColor: 'white',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            padding: '12px',
                            textAlign: 'center',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}>
                            <div style={{ fontSize: '24px', fontWeight: '700', color: '#3498db' }}>
                                {statusCounts.running}
                            </div>
                            <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                                Running
                            </div>
                        </div>
                        <div style={{
                            backgroundColor: 'white',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            padding: '12px',
                            textAlign: 'center',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}>
                            <div style={{ fontSize: '24px', fontWeight: '700', color: '#2ecc71' }}>
                                {statusCounts.success}
                            </div>
                            <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                                Successful
                            </div>
                        </div>
                        <div style={{
                            backgroundColor: 'white',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            padding: '12px',
                            textAlign: 'center',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}>
                            <div style={{ fontSize: '24px', fontWeight: '700', color: '#db0011' }}>
                                {statusCounts.failed}
                            </div>
                            <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                                Failed
                            </div>
                        </div>
                        <div style={{
                            backgroundColor: 'white',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            padding: '12px',
                            textAlign: 'center',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}>
                            <div style={{ fontSize: '24px', fontWeight: '700', color: '#666' }}>
                                {statusCounts.all}
                            </div>
                            <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                                Total Runs
                            </div>
                        </div>
                    </div>

                    {/* Search Bar */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            type="button"
                            onClick={() => setShowBatchModal(true)}
                            style={{
                                padding: '8px 12px',
                                backgroundColor: '#db0011',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: 700
                            }}
                        >
                            Batch Control Run
                        </button>
                    </div>
                    <input
                        type="text"
                        placeholder="Search controls with regex..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '10px 16px',
                            backgroundColor: 'white',
                            color: '#333',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            fontSize: '14px',
                            outline: 'none',
                            transition: 'border-color 0.2s',
                            boxSizing: 'border-box'
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#db0011'}
                        onBlur={(e) => e.target.style.borderColor = '#ddd'}
                    />
                    <div style={{
                        color: '#666',
                        fontSize: '12px',
                        marginTop: '10px'
                    }}>
                        Regex hint: use <code>.*</code> for any text, <code>^</code> for starts with, and <code>$</code> for ends with. Example: <code>^Data.*Process$</code>
                    </div>
                    {regexError && (
                        <div style={{
                            marginTop: '10px',
                            padding: '8px 10px',
                            backgroundColor: '#fff5f5',
                            border: '1px solid #db0011',
                            borderRadius: '4px',
                            color: '#db0011',
                            fontSize: '12px'
                        }}>
                            Invalid regex: {regexError}
                        </div>
                    )}

                    {/* Controls List */}
                    <div style={{
                        backgroundColor: 'white',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        padding: '16px',
                        maxHeight: 'calc(100vh - 280px)',
                        overflowY: 'auto'
                    }}>
                        <h2 style={{
                            margin: '0 0 12px 0',
                            fontSize: '16px',
                            fontWeight: '600',
                            color: '#333'
                        }}>
                            Controls ({filteredControls.length})
                        </h2>
                        {filteredControls.length === 0 ? (
                            <div style={{
                                padding: '40px',
                                textAlign: 'center',
                                color: '#999'
                            }}>
                                No controls found matching "{searchTerm}"
                            </div>
                        ) : (
                            filteredControls.map(control => (
                                <ControlCard
                                    key={control.control_id + control.name}
                                    control={control}
                                    onRunClick={handleRunClick}
                                    onViewLogs={handleViewLogs}
                                    allRuns={allRuns}
                                />
                            ))
                        )}
                    </div>
                </div>

                {/* Right Column - Running Status */}
                <div style={{
                    position: 'sticky',
                    top: '110px'
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        padding: '16px',
                        maxHeight: 'calc(100vh - 140px)',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        {/* Header */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '12px',
                            paddingBottom: '12px',
                            borderBottom: '2px solid #db0011'
                        }}>
                            <h2 style={{
                                margin: 0,
                                fontSize: '16px',
                                fontWeight: '600',
                                color: '#333'
                            }}>
                                Running Status
                            </h2>
                            <div style={{ fontSize: '12px', color: '#999' }}>
                                {filteredRuns.length} runs
                            </div>
                        </div>

                        {/* Filter Buttons */}
                        <div style={{
                            display: 'flex',
                            gap: '6px',
                            marginBottom: '12px',
                            flexWrap: 'wrap'
                        }}>
                            {['all', 'running', 'success', 'failed', 'stopped'].map(status => (
                                <button
                                    key={status}
                                    onClick={() => setFilterStatus(status)}
                                    style={{
                                        padding: '4px 10px',
                                        backgroundColor: filterStatus === status ? '#db0011' : 'white',
                                        color: filterStatus === status ? 'white' : '#666',
                                        border: `1px solid ${filterStatus === status ? '#db0011' : '#ddd'}`,
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '11px',
                                        textTransform: 'capitalize',
                                        transition: 'all 0.2s',
                                        fontWeight: '500'
                                    }}
                                >
                                    {status} ({statusCounts[status]})
                                </button>
                            ))}
                        </div>

                        {/* Runs List */}
                        <div style={{
                            overflowY: 'auto',
                            flex: 1
                        }}>
                            {filteredRuns.length === 0 ? (
                                <div style={{
                                    padding: '40px 20px',
                                    textAlign: 'center',
                                    color: '#999'
                                }}>
                                    No runs found
                                </div>
                            ) : (
                                filteredRuns.map(run => (
                                    <div
                                        key={run.task_id}
                                        style={{
                                            padding: '12px',
                                            borderBottom: '1px solid #f0f0f0',
                                            transition: 'background-color 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9f9f9'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                                    >
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'flex-start',
                                            marginBottom: '8px'
                                        }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    fontSize: '13px',
                                                    fontWeight: '600',
                                                    color: '#333',
                                                    marginBottom: '4px',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    {run.task_name || run.control_name}
                                                </div>
                                                <div style={{
                                                    display: 'flex',
                                                    gap: '8px',
                                                    alignItems: 'center',
                                                    fontSize: '11px',
                                                    color: '#666'
                                                }}>
                                                    <StatusBadge status={run.status} size="sm" />
                                                    <span style={{
                                                        backgroundColor: '#db0011',
                                                        color: 'white',
                                                        padding: '2px 6px',
                                                        borderRadius: '3px',
                                                        fontSize: '10px',
                                                        fontWeight: '600'
                                                    }}>
                                                        {run.run_env}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{
                                            fontSize: '11px',
                                            color: '#999',
                                            marginBottom: '8px'
                                        }}>
                                            {formatDate(run.started_at)} • Duration: {formatDuration(run.started_at, run.ended_at || run.completed_at)}
                                        </div>
                                        <div style={{
                                            display: 'flex',
                                            gap: '8px'
                                        }}>
                                            {(run.status?.toLowerCase() === 'running' || run.status?.toLowerCase() === 'started') && (
                                                <button
                                                    onClick={() => handleStopRun(run)}
                                                    style={{
                                                        backgroundColor: '#db0011',
                                                        color: 'white',
                                                        border: 'none',
                                                        padding: '6px 12px',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        fontSize: '11px',
                                                        fontWeight: '600',
                                                        flex: 1,
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onMouseOver={(e) => {
                                                        e.target.style.backgroundColor = '#a00010';
                                                    }}
                                                    onMouseOut={(e) => {
                                                        e.target.style.backgroundColor = '#db0011';
                                                    }}
                                                >
                                                    ⏹ Stop
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleViewLogs(run)}
                                                style={{
                                                    backgroundColor: 'white',
                                                    color: '#db0011',
                                                    border: '1px solid #db0011',
                                                    padding: '6px 12px',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                    fontSize: '11px',
                                                    fontWeight: '600',
                                                    flex: 1,
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseOver={(e) => {
                                                    e.target.style.backgroundColor = '#db0011';
                                                    e.target.style.color = 'white';
                                                }}
                                                onMouseOut={(e) => {
                                                    e.target.style.backgroundColor = 'white';
                                                    e.target.style.color = '#db0011';
                                                }}
                                            >
                                                View Logs
                                            </button>
                                            {(
                                                run.status?.toLowerCase() === 'failed' ||
                                                run.status?.toLowerCase() === 'error' ||
                                                run.status?.toLowerCase() === 'success' ||
                                                run.status?.toLowerCase() === 'completed'
                                            ) && (
                                                    <button
                                                        onClick={() => handleRerunClick(run)}
                                                        style={{
                                                            backgroundColor: '#db0011',
                                                            color: 'white',
                                                            border: 'none',
                                                            padding: '6px 12px',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer',
                                                            fontSize: '11px',
                                                            fontWeight: '600',
                                                            flex: 1,
                                                            transition: 'all 0.2s'
                                                        }}
                                                        onMouseOver={(e) => {
                                                            e.target.style.backgroundColor = '#a00010';
                                                        }}
                                                        onMouseOut={(e) => {
                                                            e.target.style.backgroundColor = '#db0011';
                                                        }}
                                                    >
                                                        Re-run
                                                    </button>
                                                )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals */}
            {selectedRun && (
                <LogViewer
                    taskId={selectedRun.task_id}
                    onClose={handleCloseLogViewer}
                    taskStatus={selectedRun.status}
                />
            )}
            {selectedControl && (
                <RunModal
                    control={selectedControl}
                    onRun={handleStartRun}
                    onClose={handleCloseRunModal}
                />
            )}
            {showBatchModal && (
                <BulkRunModal
                    controls={controls}
                    onStartRun={handleStartRun}
                    onClose={() => setShowBatchModal(false)}
                />
            )}
        </div>
    );
};

// Helper functions
const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const formatDuration = (startTime, endTime) => {
    if (!startTime) return 'N/A';
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const duration = Math.floor((end - start) / 1000);

    if (duration < 60) return `${duration}s`;
    if (duration < 3600) return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
};

export default ControlRunsPage;
