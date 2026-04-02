import React, { useState, useEffect } from 'react';
import ApiService from '../../services/api';
import WebSocketService from '../../services/websocket';
import LogViewer from '../../components/ControlRuns/LogViewer';
import StatusBadge from '../../components/ControlRuns/StatusBadge';
import HSBCLogo from '../../components/HSBCLogo';

/**
 * AutoConfig Deployment Page - Similar to control-runs but for auto_config.py
 */
const AutoConfigDeploymentPage = () => {
    const [loading, setLoading] = useState(true);
    const [selectedRun, setSelectedRun] = useState(null);
    const [allRuns, setAllRuns] = useState([]);
    const [filterStatus, setFilterStatus] = useState('all');
    const [isRunning, setIsRunning] = useState(false);

    // Multi-select control IDs from control_ids.json
    const [availableControls, setAvailableControls] = useState([]);
    const [selectedControlIds, setSelectedControlIds] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [controlsLoading, setControlsLoading] = useState(true);
    const [showDropdown, setShowDropdown] = useState(false);

    // User comment field
    const [userComment, setUserComment] = useState('');
    const [commentError, setCommentError] = useState('');

    // AutoFlag toggle
    const [autoFlag, setAutoFlag] = useState(false);

    // Expected run date
    const [expectedRunDate, setExpectedRunDate] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        // Initial load: Cache history and load controls
        const initialLoad = async () => {
            try {
                // console.log('Loading AutoConfig deployment history and controls...');

                // Load available controls from control_ids.json via API
                try {
                    const controlsResponse = await fetch('http://127.0.0.1:8000/api/auto-config/controls');
                    if (controlsResponse.ok) {
                        const data = await controlsResponse.json();
                        setAvailableControls(data.controls || []);
                        // console.log(`Loaded ${data.controls?.length || 0} available controls`);
                    } else {
                        console.error('Failed to load controls, status:', controlsResponse.status);
                    }
                } catch (err) {
                    console.error('Failed to load controls:', err);
                }
                setControlsLoading(false);

                // Load all historical runs
                const historyResponse = await ApiService.getAutoConfigHistory(null, 50);
                const runs = historyResponse.history || historyResponse.runs || [];
                setAllRuns(runs);

                // console.log(`Cached ${runs.length} historical AutoConfig deployments`);

            } catch (err) {
                console.error('Failed to load initial cache:', err);
            } finally {
                setLoading(false);
            }
        };

        initialLoad();

        // Connect WebSocket (with automatic reconnection)
        WebSocketService.connect();

        // Subscribe to runs updates via WebSocket
        WebSocketService.onRunsUpdate((runs) => {
            // Filter for auto_config tasks only
            const autoConfigRuns = runs.filter(run =>
                run.task_name?.includes('AutoConfig') || run.control_name === 'auto_config'
            );
            // Update all auto_config tasks (including completed/failed status changes)
            setAllRuns(prevRuns => {
                const prevMap = new Map(prevRuns.map(r => [r.task_id, r]));
                const updatedMap = new Map(prevMap);
                let hasUpdates = false;

                autoConfigRuns.forEach(run => {
                    const status = (run.status || '').toLowerCase();
                    const isFinalState = status === 'completed' || status === 'success' ||
                        status === 'failed' || status === 'error' ||
                        status === 'stopped' || status === 'killed';
                    const isActiveState = status === 'running' || status === 'started';

                    // Accept updates for: existing tasks, active tasks, or tasks in final states
                    if (prevMap.has(run.task_id) || isActiveState || isFinalState) {
                        const existing = updatedMap.get(run.task_id);
                        // Only update if this is newer information or if we don't have the task yet
                        if (!existing ||
                            (run.updated_at && existing.updated_at && run.updated_at >= existing.updated_at) ||
                            !existing.updated_at) {
                            updatedMap.set(run.task_id, run);
                            hasUpdates = true;
                        }
                    }
                });

                // Only trigger re-render if there were actual updates
                return hasUpdates ? Array.from(updatedMap.values()) : prevRuns;
            });
        });

        const unsubscribeConnect = WebSocketService.onConnect(() => {
            // console.log('WebSocket connected');
        });

        const unsubscribeDisconnect = WebSocketService.onDisconnect(() => {
            console.warn('WebSocket disconnected');
        });

        return () => {
            unsubscribeConnect();
            unsubscribeDisconnect();
        };
    }, []);

    // History is cached on initial load, only refresh if needed
    const loadAllRuns = async () => {
        try {
            const response = await ApiService.getAutoConfigHistory(null, 50);
            const runs = response.history || response.runs || [];
            setAllRuns(runs);
        } catch (err) {
            console.error('Failed to load all runs:', err);
        }
    };

    // Filter controls based on search query
    const filteredControls = React.useMemo(() => {
        if (!searchQuery.trim()) return availableControls;
        const query = searchQuery.toLowerCase();
        return availableControls.filter(c =>
            c.name?.toLowerCase().includes(query) ||
            c.control_id?.toLowerCase().includes(query) ||
            c.description?.toLowerCase().includes(query)
        );
    }, [availableControls, searchQuery]);

    // Toggle control selection
    const toggleControlSelection = (control) => {
        setSelectedControlIds(prev => {
            const controlKey = `${control.control_id}|${control.name}`;
            if (prev.some(c => `${c.control_id}|${c.name}` === controlKey)) {
                return prev.filter(c => `${c.control_id}|${c.name}` !== controlKey);
            } else {
                return [...prev, control];
            }
        });
    };

    // Remove a selected control
    const removeSelectedControl = (control) => {
        const controlKey = `${control.control_id}|${control.name}`;
        setSelectedControlIds(prev => prev.filter(c => `${c.control_id}|${c.name}` !== controlKey));
    };

    const validateComment = (value) => {
        if (!value.trim()) {
            return 'Comment is required';
        }
        if (!value.trim().startsWith('CTRLS-') && !value.trim().startsWith('TRCF-')) {
            return 'Comment must start with CTRLS- or TRCF-';
        }
        return '';
    };

    const handleCommentChange = (e) => {
        const value = e.target.value;
        setUserComment(value);
        if (commentError) {
            setCommentError(validateComment(value));
        }
    };

    const handleCommentBlur = () => {
        setCommentError(validateComment(userComment));
    };

    const handleStartDeployment = async () => {
        if (selectedControlIds.length === 0) {
            alert('Please select at least one control');
            return;
        }

        const error = validateComment(userComment);
        if (error) {
            setCommentError(error);
            return;
        }

        try {
            setIsRunning(true);
            const controlNames = selectedControlIds.map(c => c.name);
            console.log('Starting AutoConfig deployment with controls:', controlNames);

            const response = await ApiService.startAutoConfigDeployment({
                control_ids: controlNames,
                user_comment: userComment.trim(),
                auto_flag: autoFlag,
                run_env: 'DEV',
                expected_run_date: expectedRunDate || new Date().toISOString().split('T')[0]
            });

            console.log('AutoConfig deployment started:', response);

            // Check if the deployment failed (API returns 200 but status is failed)
            if (response.status === 'failed') {
                const errorMsg = response.error || response.validation_errors?.join(', ') || 'Unknown error';
                alert(`Deployment failed: ${errorMsg}`);
                // Reload runs to show the failed run in history
                setTimeout(loadAllRuns, 500);
                return;
            }

            // WebSocket will automatically update the runs list
            const wsStatus = WebSocketService.getStatus();
            if (!wsStatus.isConnected) {
                setTimeout(loadAllRuns, 1000);
            }

            // Clear inputs after successful start
            setSelectedControlIds([]);
            setUserComment('');
            setSearchQuery('');
        } catch (err) {
            console.error('Failed to start AutoConfig deployment:', err);
            alert(`Failed to start deployment: ${err.message}`);
        } finally {
            setIsRunning(false);
        }
    };

    const handleViewLogs = (run) => {
        setSelectedRun(run);
    };

    const handleStopRun = async (run) => {
        if (!window.confirm(`Are you sure you want to stop AutoConfig deployment for "${run.control_id}"?`)) {
            return;
        }

        try {
            await ApiService.stopAutoConfigDeployment(run.task_id, false);
            // WebSocket will automatically update the runs list
            const wsStatus = WebSocketService.getStatus();
            if (!wsStatus.isConnected) {
                setTimeout(loadAllRuns, 1000);
            }
        } catch (err) {
            console.error('Failed to stop deployment:', err);
            alert(`Failed to stop deployment: ${err.message}`);
        }
    };

    const handleCloseLogViewer = () => {
        setSelectedRun(null);
    };

    // Filter runs based on status
    const filteredRuns = React.useMemo(() => {
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
                return status === 'running' || status === 'started';
            }

            return status === filter;
        });

        // Sort: running tasks first, then by updated_at desc
        filtered.sort((a, b) => {
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

        return filtered;
    }, [allRuns, filterStatus]);

    const getStatusCounts = () => {
        const counts = {
            all: allRuns.length,
            running: 0,
            success: 0,
            failed: 0,
            stopped: 0
        };

        allRuns.forEach(run => {
            const status = run.status.toLowerCase();
            if (status === 'running' || status === 'started') {
                counts.running++;
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

    const formatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        const date = new Date(dateStr);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                fontSize: '18px',
                color: '#666'
            }}>
                Loading AutoConfig Deployment...
            </div>
        );
    }

    return (
        <div style={{
            padding: '20px',
            backgroundColor: '#f5f5f5',
            minHeight: '100vh',
            fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
            {/* Header */}
            <div className="border-b border-slate-200 px-8 py-4"
                style={{
                    backgroundColor: 'white',
                    height: '80px',
                    marginBottom: '20px',
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
                            AUTOCONFIG DEPLOYMENT
                        </h1>
                    </div>
                    <div className="flex-shrink-0 w-32"></div>
                </div>
            </div>

            {/* Deployment Form */}
            <div style={{
                backgroundColor: 'white',
                border: '1px solid #ddd',
                borderRadius: '4px',
                padding: '20px',
                marginBottom: '20px'
            }}>
                <h2 style={{
                    margin: '0 0 16px 0',
                    fontSize: '18px',
                    fontWeight: '600',
                    color: '#333'
                }}>
                    Start New Deployment
                </h2>

                {/* Control Selection Section */}
                <div style={{ marginBottom: '16px' }}>
                    <label style={{
                        display: 'block',
                        marginBottom: '8px',
                        fontSize: '14px',
                        fontWeight: '500',
                        color: '#333'
                    }}>
                        Select Controls * ({selectedControlIds.length} selected)
                    </label>

                    {/* Selected Controls as Chips */}
                    {selectedControlIds.length > 0 && (
                        <div style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '8px',
                            marginBottom: '8px'
                        }}>
                            {selectedControlIds.map((control, idx) => (
                                <div
                                    key={`${control.control_id}-${control.name}-${idx}`}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '4px 10px',
                                        backgroundColor: '#e7f3ff',
                                        border: '1px solid #007bff',
                                        borderRadius: '16px',
                                        fontSize: '13px',
                                        color: '#007bff'
                                    }}
                                >
                                    <span>{control.name}</span>
                                    <button
                                        onClick={() => removeSelectedControl(control)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            padding: '0',
                                            fontSize: '16px',
                                            color: '#007bff',
                                            lineHeight: '1'
                                        }}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Search Input / Dropdown Toggle */}
                    <div style={{ position: 'relative' }}>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setShowDropdown(true);
                            }}
                            onFocus={() => setShowDropdown(true)}
                            placeholder={controlsLoading ? "Loading controls..." : "Search and select controls..."}
                            disabled={isRunning || controlsLoading}
                            style={{
                                width: '100%',
                                padding: '10px',
                                fontSize: '14px',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                boxSizing: 'border-box'
                            }}
                        />

                        {/* Dropdown List */}
                        {showDropdown && !controlsLoading && (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    maxHeight: '200px',
                                    overflowY: 'auto',
                                    backgroundColor: 'white',
                                    border: '1px solid #ddd',
                                    borderTop: 'none',
                                    borderRadius: '0 0 4px 4px',
                                    zIndex: 1000,
                                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                                }}
                            >
                                {filteredControls.length === 0 ? (
                                    <div style={{ padding: '10px', color: '#999', textAlign: 'center' }}>
                                        No controls found
                                    </div>
                                ) : (
                                    filteredControls.map((control, idx) => {
                                        const isSelected = selectedControlIds.some(c =>
                                            `${c.control_id}|${c.name}` === `${control.control_id}|${control.name}`
                                        );
                                        return (
                                            <div
                                                key={`${control.control_id}-${control.name}-${idx}`}
                                                onClick={() => toggleControlSelection(control)}
                                                style={{
                                                    padding: '10px 12px',
                                                    cursor: 'pointer',
                                                    backgroundColor: isSelected ? '#e7f3ff' : 'white',
                                                    borderBottom: '1px solid #eee',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '10px'
                                                }}
                                                onMouseEnter={(e) => e.target.style.backgroundColor = isSelected ? '#d0e8ff' : '#f5f5f5'}
                                                onMouseLeave={(e) => e.target.style.backgroundColor = isSelected ? '#e7f3ff' : 'white'}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    readOnly
                                                    style={{ pointerEvents: 'none' }}
                                                />
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: '500', fontSize: '14px' }}>{control.name}</div>
                                                    <div style={{ fontSize: '12px', color: '#666' }}>{control.description}</div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}
                    </div>

                    {/* Click outside to close dropdown */}
                    {showDropdown && (
                        <div
                            style={{
                                position: 'fixed',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                zIndex: 999
                            }}
                            onClick={() => setShowDropdown(false)}
                        />
                    )}
                </div>

                {/* User Comment Section */}
                <div style={{ marginBottom: '16px' }}>
                    <label style={{
                        display: 'block',
                        marginBottom: '8px',
                        fontSize: '14px',
                        fontWeight: '500',
                        color: '#333'
                    }}>
                        Comment * <span style={{ fontWeight: '400', color: '#888', fontSize: '12px' }}>(must start with CTRLS- or TRCF-)</span>
                    </label>
                    <textarea
                        value={userComment}
                        onChange={handleCommentChange}
                        onBlur={handleCommentBlur}
                        placeholder="e.g. CTRLS-1234 deployment for..."
                        disabled={isRunning}
                        rows={3}
                        style={{
                            width: '100%',
                            padding: '10px',
                            fontSize: '14px',
                            border: `1px solid ${commentError ? '#dc3545' : '#ddd'}`,
                            borderRadius: '4px',
                            boxSizing: 'border-box',
                            resize: 'vertical',
                            fontFamily: 'inherit'
                        }}
                    />
                    {commentError && (
                        <div style={{ color: '#dc3545', fontSize: '12px', marginTop: '4px' }}>
                            {commentError}
                        </div>
                    )}
                </div>

                {/* Date Selection Section */}
                <div style={{ marginBottom: '16px' }}>
                    <label style={{
                        display: 'block',
                        marginBottom: '8px',
                        fontSize: '14px',
                        fontWeight: '500',
                        color: '#333'
                    }}>
                        Expected Run Date
                    </label>
                    <input
                        type="date"
                        value={expectedRunDate}
                        onChange={(e) => setExpectedRunDate(e.target.value)}
                        disabled={isRunning}
                        style={{
                            width: '100%',
                            padding: '10px',
                            fontSize: '14px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            boxSizing: 'border-box'
                        }}
                    />
                </div>

                {/* AutoFlag Toggle */}
                <div style={{
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                }}>
                    <label style={{
                        fontSize: '14px',
                        fontWeight: '500',
                        color: '#333',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <div
                            onClick={() => !isRunning && setAutoFlag(!autoFlag)}
                            style={{
                                width: '44px',
                                height: '24px',
                                backgroundColor: autoFlag ? '#007bff' : '#ccc',
                                borderRadius: '12px',
                                position: 'relative',
                                cursor: isRunning ? 'not-allowed' : 'pointer',
                                transition: 'background-color 0.2s ease'
                            }}
                        >
                            <div style={{
                                width: '20px',
                                height: '20px',
                                backgroundColor: 'white',
                                borderRadius: '50%',
                                position: 'absolute',
                                top: '2px',
                                left: autoFlag ? '22px' : '2px',
                                transition: 'left 0.2s ease',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                            }} />
                        </div>
                        AutoFlag: <strong>{autoFlag ? 'True' : 'False'}</strong>
                    </label>
                </div>
                <button
                    onClick={handleStartDeployment}
                    disabled={isRunning || selectedControlIds.length === 0 || !!validateComment(userComment)}
                    style={{
                        padding: '10px 24px',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: 'white',
                        backgroundColor: isRunning || selectedControlIds.length === 0 || !!validateComment(userComment) ? '#ccc' : '#007bff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: isRunning || selectedControlIds.length === 0 || !!validateComment(userComment) ? 'not-allowed' : 'pointer'
                    }}
                >
                    {isRunning ? 'Starting...' : `Start Deployment${selectedControlIds.length > 0 ? ` (${selectedControlIds.length} control${selectedControlIds.length > 1 ? 's' : ''})` : ''}`}
                </button>
            </div>

            {/* Status Filters */}
            <div style={{
                backgroundColor: 'white',
                border: '1px solid #ddd',
                borderRadius: '4px',
                padding: '16px',
                marginBottom: '20px'
            }}>
                <div style={{
                    display: 'flex',
                    gap: '12px',
                    flexWrap: 'wrap',
                    alignItems: 'center'
                }}>
                    <button
                        onClick={() => setFilterStatus('all')}
                        style={{
                            padding: '8px 16px',
                            fontSize: '14px',
                            fontWeight: filterStatus === 'all' ? '600' : '400',
                            color: filterStatus === 'all' ? '#007bff' : '#666',
                            backgroundColor: filterStatus === 'all' ? '#e7f3ff' : 'transparent',
                            border: '1px solid',
                            borderColor: filterStatus === 'all' ? '#007bff' : '#ddd',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        All ({statusCounts.all})
                    </button>
                    <button
                        onClick={() => setFilterStatus('running')}
                        style={{
                            padding: '8px 16px',
                            fontSize: '14px',
                            fontWeight: filterStatus === 'running' ? '600' : '400',
                            color: filterStatus === 'running' ? '#007bff' : '#666',
                            backgroundColor: filterStatus === 'running' ? '#e7f3ff' : 'transparent',
                            border: '1px solid',
                            borderColor: filterStatus === 'running' ? '#007bff' : '#ddd',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Running ({statusCounts.running})
                    </button>
                    <button
                        onClick={() => setFilterStatus('success')}
                        style={{
                            padding: '8px 16px',
                            fontSize: '14px',
                            fontWeight: filterStatus === 'success' ? '600' : '400',
                            color: filterStatus === 'success' ? '#28a745' : '#666',
                            backgroundColor: filterStatus === 'success' ? '#e7f3ff' : 'transparent',
                            border: '1px solid',
                            borderColor: filterStatus === 'success' ? '#28a745' : '#ddd',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Success ({statusCounts.success})
                    </button>
                    <button
                        onClick={() => setFilterStatus('failed')}
                        style={{
                            padding: '8px 16px',
                            fontSize: '14px',
                            fontWeight: filterStatus === 'failed' ? '600' : '400',
                            color: filterStatus === 'failed' ? '#dc3545' : '#666',
                            backgroundColor: filterStatus === 'failed' ? '#e7f3ff' : 'transparent',
                            border: '1px solid',
                            borderColor: filterStatus === 'failed' ? '#dc3545' : '#ddd',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Failed ({statusCounts.failed})
                    </button>
                    <button
                        onClick={() => setFilterStatus('stopped')}
                        style={{
                            padding: '8px 16px',
                            fontSize: '14px',
                            fontWeight: filterStatus === 'stopped' ? '600' : '400',
                            color: filterStatus === 'stopped' ? '#ffc107' : '#666',
                            backgroundColor: filterStatus === 'stopped' ? '#e7f3ff' : 'transparent',
                            border: '1px solid',
                            borderColor: filterStatus === 'stopped' ? '#ffc107' : '#ddd',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Stopped ({statusCounts.stopped})
                    </button>
                </div>
            </div>

            {/* Runs List */}
            <div style={{
                backgroundColor: 'white',
                border: '1px solid #ddd',
                borderRadius: '4px',
                padding: '16px',
                maxHeight: 'calc(100vh - 400px)',
                overflowY: 'auto'
            }}>
                <h2 style={{
                    margin: '0 0 12px 0',
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#333'
                }}>
                    Deployment History ({filteredRuns.length})
                </h2>
                {filteredRuns.length === 0 ? (
                    <div style={{
                        padding: '40px',
                        textAlign: 'center',
                        color: '#999'
                    }}>
                        No deployments found
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gap: '12px'
                    }}>
                        {filteredRuns.map(run => {
                            const isRunningStatus = run.status?.toLowerCase() === 'running' ||
                                run.status?.toLowerCase() === 'started';

                            return (
                                <div
                                    key={run.task_id}
                                    style={{
                                        border: '1px solid #ddd',
                                        borderRadius: '4px',
                                        padding: '16px',
                                        backgroundColor: isRunningStatus ? '#f8f9fa' : 'white',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}
                                >
                                    <div style={{ flex: 1 }}>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            marginBottom: '8px'
                                        }}>
                                            <StatusBadge status={run.status} />
                                            <span style={{
                                                fontSize: '16px',
                                                fontWeight: '600',
                                                color: '#333'
                                            }}>
                                                {/* Display logic: Use control_id if available and not 'auto_config',
                                                    otherwise try to parse task_name, fallback to generic ID */}
                                                {(run.control_id && run.control_id !== 'auto_config')
                                                    ? run.control_id
                                                    : (run.task_name && run.task_name.includes('AutoConfig Deployment'))
                                                        ? run.task_name.replace('AutoConfig Deployment - ', '')
                                                        : (run.control_id || 'Unknown Control ID')
                                                }
                                            </span>
                                        </div>
                                        <div style={{
                                            fontSize: '12px',
                                            color: '#666',
                                            display: 'flex',
                                            gap: '16px'
                                        }}>
                                            <span>Task ID: {run.task_id.substring(0, 8)}...</span>
                                            <span>Started: {formatDate(run.started_at)}</span>
                                            {run.completed_at && (
                                                <span>Completed: {formatDate(run.completed_at)}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{
                                        display: 'flex',
                                        gap: '8px'
                                    }}>
                                        <button
                                            onClick={() => handleViewLogs(run)}
                                            style={{
                                                padding: '6px 12px',
                                                fontSize: '12px',
                                                color: '#007bff',
                                                backgroundColor: 'transparent',
                                                border: '1px solid #007bff',
                                                borderRadius: '4px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            View Logs
                                        </button>
                                        {isRunningStatus && (
                                            <button
                                                onClick={() => handleStopRun(run)}
                                                style={{
                                                    padding: '6px 12px',
                                                    fontSize: '12px',
                                                    color: '#dc3545',
                                                    backgroundColor: 'transparent',
                                                    border: '1px solid #dc3545',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Stop
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Log Viewer Modal */}
            {selectedRun && (
                <LogViewer
                    taskId={selectedRun.task_id}
                    onClose={handleCloseLogViewer}
                    taskStatus={selectedRun.status}
                    endpointPrefix="auto-config"
                />
            )}
        </div>
    );
};

export default AutoConfigDeploymentPage;

