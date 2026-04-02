import React from 'react';
import StatusBadge from './StatusBadge';

/**
 * Control Card Component - Displays a single control with its latest runs
 * Receives updates via props from parent's WebSocket connection (no polling)
 */
const ControlCard = ({ control, onRunClick, onViewLogs, allRuns = [] }) => {
    // Find the relevant run for this control from the parent's allRuns data
    // This is updated in real-time via WebSocket, so no polling needed
    const lastRun = React.useMemo(() => {
        const expectedName = control.name.trim();
        
        // First, try to find a running task
        for (const run of allRuns) {
            const runTaskName = (run.task_name || run.control_name || '').trim();
            if (runTaskName === expectedName) {
                const status = (run.status || '').toLowerCase();
                if (status === 'running' || status === 'started') {
                    return run;
                }
            }
        }
        
        // If no running task, use the most recent task for this control
        for (const run of allRuns) {
            const runTaskName = (run.task_name || run.control_name || '').trim();
            if (runTaskName === expectedName) {
                return run;
            }
        }
        
        return null;
    }, [allRuns, control.name]);

    const handleRun = () => {
        // Just call onRunClick with the control - parent will handle modal
        onRunClick(control);
    };

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

    // Check if control is currently running (case-insensitive)
    const isRunning = lastRun && (
        lastRun.status?.toLowerCase() === 'running' || 
        lastRun.status?.toLowerCase() === 'started'
    );

    return (
        <div style={{
            backgroundColor: 'white',
            border: isRunning ? '2px solid #3498db' : '1px solid #ddd',
            borderRadius: '4px',
            padding: '12px',
            marginBottom: '8px',
            transition: 'all 0.2s',
            boxShadow: isRunning ? '0 2px 8px rgba(52,152,219,0.3)' : '0 1px 2px rgba(0,0,0,0.05)',
            cursor: 'pointer',
            position: 'relative'
        }}
        onMouseEnter={(e) => {
            if (!isRunning) {
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(219,0,17,0.2)';
            }
        }}
        onMouseLeave={(e) => {
            if (!isRunning) {
                e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
            } else {
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(52,152,219,0.3)';
            }
        }}
        >
            {/* Running indicator pulse animation */}
            {isRunning && (
                <div style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    width: '8px',
                    height: '8px',
                    backgroundColor: '#3498db',
                    borderRadius: '50%',
                    animation: 'pulse 2s infinite',
                    boxShadow: '0 0 0 0 rgba(52,152,219,0.7)'
                }} />
            )}
            <style>{`
                @keyframes pulse {
                    0% {
                        box-shadow: 0 0 0 0 rgba(52,152,219,0.7);
                    }
                    70% {
                        box-shadow: 0 0 0 10px rgba(52,152,219,0);
                    }
                    100% {
                        box-shadow: 0 0 0 0 rgba(52,152,219,0);
                    }
                }
            `}</style>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px'
            }}>
                {/* Control Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        marginBottom: '4px'
                    }}>
                        <h3 style={{
                            margin: 0,
                            color: '#333',
                            fontSize: '14px',
                            fontWeight: '600',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                        }}>
                            {control.name}
                        </h3>
                        {lastRun && lastRun.status && lastRun.status.trim() !== '' && (
                            <StatusBadge status={lastRun.status} size="sm" />
                        )}
                    </div>
                    <div style={{
                        display: 'flex',
                        gap: '16px',
                        fontSize: '11px',
                        color: '#999'
                    }}>
                        <span>Priority: <strong style={{ color: '#666' }}>{control.priority}</strong></span>
                        <span>Duration: <strong style={{ color: '#666' }}>{control.estimated_duration_minutes}m</strong></span>
                        <span>Frequency: <strong style={{ color: '#666' }}>{control.frequency}</strong></span>
                        {lastRun && (
                            <span>Last: <strong style={{ color: '#666' }}>{formatDate(lastRun.started_at)}</strong></span>
                        )}
                    </div>
                </div>

                {/* Run Button - Changes when running */}
                <button
                    onClick={handleRun}
                    disabled={isRunning}
                    style={{
                        backgroundColor: isRunning ? '#3498db' : '#db0011',
                        color: 'white',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: '4px',
                        cursor: isRunning ? 'not-allowed' : 'pointer',
                        fontSize: '12px',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'background-color 0.2s',
                        whiteSpace: 'nowrap',
                        opacity: isRunning ? 0.8 : 1
                    }}
                    onMouseOver={(e) => {
                        if (!isRunning) {
                            e.target.style.backgroundColor = '#a00010';
                        }
                    }}
                    onMouseOut={(e) => {
                        if (!isRunning) {
                            e.target.style.backgroundColor = '#db0011';
                        } else {
                            e.target.style.backgroundColor = '#3498db';
                        }
                    }}
                >
                    {isRunning ? '⏳ Running' : '▶ Run'}
                </button>
            </div>
        </div>
    );
};

export default ControlCard;

