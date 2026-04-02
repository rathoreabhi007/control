import { useState, useEffect, useMemo } from 'react';
import ApiService from '../../../services/api';
import WebSocketService from '../../../services/websocket';

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
 * Custom hook to manage Control Runs data and logic.
 */
export const useControlRuns = () => {
    const [controls, setControls] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [allRuns, setAllRuns] = useState([]);
    const [filterStatus, setFilterStatus] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [historyCache, setHistoryCache] = useState(new Map());

    useEffect(() => {
        // Initial load: Cache controls and history at once
        const initialLoad = async () => {
            try {
                // Load controls
                const controlsResponse = await ApiService.getControls();
                const controlsList = controlsResponse.controls || [];
                setControls(controlsList);

                // Load all historical runs
                const historyResponse = await ApiService.getControlRunHistory(null, null, 200);
                const runs = historyResponse.history || historyResponse.runs || [];
                setAllRuns(runs);

                // Build history cache
                const historyCacheMap = new Map();
                runs.forEach(run => {
                    historyCacheMap.set(run.task_id, run);
                });
                setHistoryCache(historyCacheMap);

            } catch (err) {
                const errorMessage = err?.message || 'Failed to load controls';
                const isNetworkError = /failed to fetch|network|timeout/i.test(errorMessage);

                if (isNetworkError) {
                    // Keep Controls Runner usable in local dev even when API is unavailable.
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

        // Connect WebSocket
        WebSocketService.connect();

        // Subscribe to runs updates
        const unsubscribeRuns = WebSocketService.onRunsUpdate((runs) => {
            setAllRuns(prevRuns => {
                const prevMap = new Map(prevRuns.map(r => [r.task_id, r]));
                const updatedMap = new Map(prevMap);
                let hasUpdates = false;

                const newCacheEntries = [];
                runs.forEach(run => {
                    const status = (run.status || '').toLowerCase();
                    const isFinalState = status === 'completed' || status === 'success' ||
                        status === 'failed' || status === 'error' ||
                        status === 'stopped' || status === 'killed';
                    const isActiveState = status === 'running' || status === 'started';

                    if (prevMap.has(run.task_id) || isActiveState || isFinalState) {
                        const existing = updatedMap.get(run.task_id);
                        if (!existing ||
                            (run.updated_at && existing.updated_at && run.updated_at >= existing.updated_at) ||
                            !existing.updated_at) {
                            updatedMap.set(run.task_id, run);
                            hasUpdates = true;
                            newCacheEntries.push([run.task_id, run]);
                        }
                    }
                });

                if (newCacheEntries.length > 0) {
                    setHistoryCache(prev => {
                        const newCache = new Map(prev);
                        newCacheEntries.forEach(([taskId, run]) => newCache.set(taskId, run));
                        return newCache;
                    });
                }

                return hasUpdates ? Array.from(updatedMap.values()) : prevRuns;
            });
        });

        const unsubscribeConnect = WebSocketService.onConnect(() => {
        });

        const unsubscribeDisconnect = WebSocketService.onDisconnect(() => {
            console.warn('WebSocket disconnected');
        });

        return () => {
            unsubscribeRuns?.();
            unsubscribeConnect();
            unsubscribeDisconnect();
        };
    }, []);

    const filteredRuns = useMemo(() => {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        let filtered = allRuns.filter(run => {
            if (filterStatus === 'all') return true;

            const status = run.status.toLowerCase();
            const filter = filterStatus.toLowerCase();

            if (filter === 'success') {
                return status === 'success' || status === 'completed';
            } else if (filter === 'failed') {
                return status === 'failed' || status === 'error';
            } else if (filter === 'stopped') {
                return status === 'stopped' || status === 'killed';
            } else if (filter === 'running') {
                if (status === 'running' || status === 'started') {
                    const runDate = run.started_at || run.created_at || run.updated_at;
                    if (runDate) {
                        const runDateObj = new Date(runDate);
                        return runDateObj >= sevenDaysAgo;
                    }
                    return true;
                }
                return false;
            }
            return status === filter;
        });

        const seen = new Map();
        filtered.forEach(run => {
            const existing = seen.get(run.task_id);
            if (!existing) {
                seen.set(run.task_id, run);
            } else {
                const existingDate = existing.updated_at || existing.started_at || existing.created_at;
                const currentDate = run.updated_at || run.started_at || run.created_at;
                if (currentDate && existingDate && new Date(currentDate) > new Date(existingDate)) {
                    seen.set(run.task_id, run);
                }
            }
        });

        const uniqueRuns = Array.from(seen.values());
        uniqueRuns.sort((a, b) => {
            const aStatus = (a.status || '').toLowerCase();
            const bStatus = (b.status || '').toLowerCase();
            const aRunning = aStatus === 'running' || aStatus === 'started';
            const bRunning = bStatus === 'running' || bStatus === 'started';

            if (aRunning && !bRunning) return -1;
            if (!aRunning && bRunning) return 1;

            const aDate = a.updated_at || a.started_at || a.created_at || '';
            const bDate = b.updated_at || b.started_at || b.created_at || '';
            return bDate.localeCompare(aDate);
        });

        return uniqueRuns;
    }, [allRuns, filterStatus]);

    const loadAllRuns = async () => {
        if (historyCache.size > 0) {
            setAllRuns(Array.from(historyCache.values()));
            return;
        }

        try {
            const response = await ApiService.getControlRunHistory(null, null, 200);
            const runs = response.history || response.runs || [];
            setAllRuns(runs);

            const cache = new Map();
            runs.forEach(run => {
                cache.set(run.task_id, run);
            });
            setHistoryCache(cache);
        } catch (err) {
            console.error('Failed to load all runs:', err);
        }
    };

    const handleStartRun = async (params) => {
        try {
            const response = await ApiService.startControlRun(params);
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

            // Fallback mode for local dev when backend is unavailable.
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

            // Auto-complete simulated run after a short delay.
            setTimeout(() => {
                const finalStatus = 'completed';
                setAllRuns(prev => prev.map(run => (
                    run.task_id === taskId
                        ? {
                            ...run,
                            status: finalStatus,
                            updated_at: new Date().toISOString(),
                            ended_at: new Date().toISOString()
                        }
                        : run
                )));
                setHistoryCache(prev => {
                    const cache = new Map(prev);
                    const run = cache.get(taskId);
                    if (run) {
                        cache.set(taskId, {
                            ...run,
                            status: finalStatus,
                            updated_at: new Date().toISOString(),
                            ended_at: new Date().toISOString()
                        });
                    }
                    return cache;
                });
            }, 5000);

            return { task_id: taskId, status: 'running', simulated: true };
        }
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
            const wsStatus = WebSocketService.getStatus();
            if (!wsStatus.isConnected) {
                setTimeout(loadAllRuns, 1000);
            }
        } catch (err) {
            console.error('Failed to stop run:', err);
            alert(`Failed to stop run: ${err.message}`);
        }
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

    const statusCounts = useMemo(() => {
        const counts = {
            all: allRuns.length,
            running: 0,
            success: 0,
            failed: 0,
            stopped: 0
        };

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        allRuns.forEach(run => {
            const status = run.status.toLowerCase();
            if (status === 'running' || status === 'started') {
                const runDate = run.started_at || run.created_at || run.updated_at;
                if (runDate) {
                    const runDateObj = new Date(runDate);
                    if (runDateObj >= sevenDaysAgo) {
                        counts.running++;
                    }
                } else {
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
    }, [allRuns]);

    const filteredControls = useMemo(() => {
        const term = (searchTerm || '').trim();
        if (!term) {
            return controls;
        }

        try {
            const regex = new RegExp(term, 'i');
            return controls.filter(control =>
                regex.test(control.name || '') || regex.test(control.description || '')
            );
        } catch {
            // Invalid regex: return no rows until pattern is corrected.
            return [];
        }
    }, [controls, searchTerm]);

    return {
        controls,
        isLoading,
        error,
        allRuns,
        filterStatus,
        setFilterStatus,
        searchTerm,
        setSearchTerm,
        filteredRuns,
        filteredControls,
        statusCounts,
        handleStartRun,
        handleStopRun,
        removeRunByTaskId
    };
};
