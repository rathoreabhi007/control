import React, { useState, useEffect, useRef, useCallback } from 'react';

// Get API base URL from environment or default
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';

/**
 * Log Viewer Component - Airflow-style log viewer with tabs
 * Supports both control-runs and auto-config endpoints
 */
const LogViewer = ({ taskId, onClose, taskStatus = null, endpointPrefix = 'control-runs' }) => {
    const [logType, setLogType] = useState('execution');
    const [logs, setLogs] = useState('');
    const [loading, setLoading] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const logContainerRef = useRef(null);
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
    const [lastLineCount, setLastLineCount] = useState(0);

    const logTypes = [
        { value: 'execution', label: 'Execution' },
        { value: 'subprocess', label: 'Subprocess' },
        { value: 'error', label: 'Error' },
        { value: 'audit', label: 'Audit' }
    ];

    // Check if task is running
    const isTaskRunning = taskStatus && (
        taskStatus.toLowerCase() === 'running' || 
        taskStatus.toLowerCase() === 'started'
    );

    const loadLogs = useCallback(async (incremental = false) => {
        setLoading(true);
        try {
            // Read logs via API endpoint with streaming support
            // Path: /api/{endpointPrefix}/logs/{task_id}/{log_type}?stream=true
            const logUrl = `${API_BASE_URL}/api/${endpointPrefix}/logs/${taskId}/${logType}?stream=true`;
            
            const response = await fetch(logUrl);
            
            if (!response.ok) {
                if (response.status === 404) {
                    setLogs('No logs available yet');
                    return;
                }
                throw new Error(`Failed to load logs: ${response.statusText}`);
            }
            
            // Stream the response in chunks
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let accumulatedContent = '';
            
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    // Decode chunk and append
                    const chunk = decoder.decode(value, { stream: true });
                    accumulatedContent += chunk;
                    
                    // Update logs incrementally as chunks arrive (for better UX)
                    if (!incremental || lastLineCount === 0) {
                        setLogs(accumulatedContent);
                    } else {
                        // For incremental, only append new content
                        const newContent = accumulatedContent.slice(
                            accumulatedContent.split('\n').slice(0, lastLineCount).join('\n').length
                        );
                        if (newContent) {
                            setLogs(prevLogs => prevLogs + newContent);
                        }
                    }
                }
                
                // Count lines from final content
                const lines = accumulatedContent.split('\n');
                const lineCount = lines.length;
                setLastLineCount(lineCount);
                
            } finally {
                reader.releaseLock();
            }
        } catch (error) {
            console.error('Failed to load logs:', error);
            setLogs(prevLogs => prevLogs + `\n[Error loading logs: ${error.message}]`);
        } finally {
            setLoading(false);
        }
    }, [taskId, logType, lastLineCount, endpointPrefix]);

    // Initial load - reset when task or log type changes
    useEffect(() => {
        setLastLineCount(0); // Reset line count when task or log type changes
        setLogs(''); // Clear logs
        const loadInitial = async () => {
            setLoading(true);
            try {
                // Read logs via API endpoint with streaming support
                // Path: /api/{endpointPrefix}/logs/{task_id}/{log_type}?stream=true
                const logUrl = `${API_BASE_URL}/api/${endpointPrefix}/logs/${taskId}/${logType}?stream=true`;
                
                const response = await fetch(logUrl);
                
                if (!response.ok) {
                    if (response.status === 404) {
                        setLogs('No logs available yet');
                        return;
                    }
                    throw new Error(`Failed to load logs: ${response.statusText}`);
                }
                
                // Stream the response in chunks for real-time display
                const reader = response.body.getReader();
                const decoder = new TextDecoder('utf-8');
                let accumulatedContent = '';
                
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        
                        // Decode chunk and append
                        const chunk = decoder.decode(value, { stream: true });
                        accumulatedContent += chunk;
                        
                        // Update logs as chunks arrive for real-time display
                        setLogs(accumulatedContent);
                    }
                    
                    // Count lines from final content
                    const lines = accumulatedContent.split('\n');
                    const lineCount = lines.length;
                    setLastLineCount(lineCount);
                } finally {
                    reader.releaseLock();
                }
            } catch (error) {
                console.error('Failed to load logs:', error);
                setLogs(`Error loading logs: ${error.message}`);
            } finally {
                setLoading(false);
            }
        };
        loadInitial();
    }, [taskId, logType, endpointPrefix]);

    // Auto-refresh: only poll when task is running, and less frequently for completed tasks
    useEffect(() => {
        if (!autoRefresh) return;
        
        // Determine polling interval based on task status
        const pollInterval = isTaskRunning ? 5000 : 30000; // 5s for running, 30s for completed
        
        const interval = setInterval(() => {
            // Use incremental loading if task is running and we have existing logs
            const useIncremental = isTaskRunning && lastLineCount > 0;
            loadLogs(useIncremental);
        }, pollInterval);
        
        return () => clearInterval(interval);
    }, [autoRefresh, isTaskRunning, loadLogs, lastLineCount]);

    useEffect(() => {
        // Auto-scroll to bottom when new logs arrive
        if (shouldAutoScroll && logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs, shouldAutoScroll]);

    const handleScroll = () => {
        const container = logContainerRef.current;
        if (container) {
            const isAtBottom = container.scrollHeight - container.scrollTop === container.clientHeight;
            setShouldAutoScroll(isAtBottom);
        }
    };

    const downloadLogs = () => {
        const blob = new Blob([logs], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${taskId}_${logType}_logs.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
        }}>
            <div style={{
                backgroundColor: 'white',
                border: '2px solid #db0011',
                borderRadius: '8px',
                width: '100%',
                maxWidth: '1200px',
                height: '80vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '2px solid #db0011',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: 'white'
                }}>
                    <div>
                        <h2 style={{ margin: 0, color: '#db0011', fontSize: '18px', fontWeight: '600' }}>
                            Task Logs
                        </h2>
                        <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: '13px' }}>
                            Task ID: {taskId}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            backgroundColor: 'white',
                            color: '#666',
                            border: '1px solid #ddd',
                            padding: '8px 16px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px'
                        }}
                    >
                        ✕ Close
                    </button>
                </div>

                {/* Log Type Tabs */}
                <div style={{
                    display: 'flex',
                    gap: '4px',
                    padding: '12px 20px',
                    borderBottom: '1px solid #ddd',
                    backgroundColor: '#f9f9f9'
                }}>
                    {logTypes.map(type => (
                        <button
                            key={type.value}
                            onClick={() => setLogType(type.value)}
                            style={{
                                backgroundColor: logType === type.value ? '#db0011' : 'white',
                                color: logType === type.value ? 'white' : '#666',
                                border: logType === type.value ? 'none' : '1px solid #ddd',
                                padding: '8px 16px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: logType === type.value ? '600' : '400',
                                transition: 'all 0.2s'
                            }}
                        >
                            {type.label}
                        </button>
                    ))}
                </div>

                {/* Controls */}
                <div style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '12px 20px',
                    borderBottom: '1px solid #ddd',
                    backgroundColor: '#f9f9f9',
                    alignItems: 'center'
                }}>
                    <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        color: '#666',
                        fontSize: '13px',
                        cursor: 'pointer'
                    }}>
                        <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={(e) => setAutoRefresh(e.target.checked)}
                            style={{ cursor: 'pointer' }}
                        />
                        Auto-refresh ({isTaskRunning ? '5s' : '30s'})
                    </label>
                    <button
                        onClick={loadLogs}
                        disabled={loading}
                        style={{
                            backgroundColor: loading ? '#999' : '#db0011',
                            color: 'white',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '4px',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            fontSize: '13px'
                        }}
                    >
                        {loading ? '⏳' : '🔄'} Refresh
                    </button>
                    <button
                        onClick={downloadLogs}
                        style={{
                            backgroundColor: '#666',
                            color: 'white',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '13px'
                        }}
                    >
                        ⬇ Download
                    </button>
                    <div style={{ marginLeft: 'auto', color: '#666', fontSize: '12px' }}>
                        {shouldAutoScroll ? '📌 Auto-scrolling' : '📜 Manual scroll'}
                    </div>
                </div>

                {/* Log Content */}
                <div
                    ref={logContainerRef}
                    onScroll={handleScroll}
                    style={{
                        flex: 1,
                        padding: '16px 20px',
                        overflow: 'auto',
                        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                        fontSize: '13px',
                        lineHeight: '1.6',
                        color: '#333',
                        backgroundColor: '#f5f5f5',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word'
                    }}
                >
                    {logs}
                </div>
            </div>
        </div>
    );
};

export default LogViewer;

