import React from 'react';

/**
 * Status Badge Component - Airflow-style status indicators
 */
const StatusBadge = ({ status, size = 'md' }) => {
    const getStatusConfig = (status) => {
        const statusLower = status?.toLowerCase() || 'unknown';
        
        switch (statusLower) {
            case 'success':
            case 'completed':
                return {
                    bg: '#2ecc71',
                    text: 'Success',
                    icon: '✓'
                };
            case 'running':
            case 'started':
                return {
                    bg: '#3498db',
                    text: 'Running',
                    icon: '▶'
                };
            case 'queued':
            case 'pending':
                return {
                    bg: '#95a5a6',
                    text: 'Queued',
                    icon: '⏸'
                };
            case 'failed':
            case 'error':
                return {
                    bg: '#e74c3c',
                    text: 'Failed',
                    icon: '✗'
                };
            case 'stopped':
            case 'killed':
                return {
                    bg: '#e67e22',
                    text: 'Stopped',
                    icon: '■'
                };
            case 'skipped':
                return {
                    bg: '#f39c12',
                    text: 'Skipped',
                    icon: '⊘'
                };
            default:
                return {
                    bg: '#95a5a6',
                    text: 'Unknown',
                    icon: '?'
                };
        }
    };

    const config = getStatusConfig(status);
    
    const sizeStyles = {
        sm: {
            fontSize: '11px',
            padding: '2px 8px',
            iconSize: '10px'
        },
        md: {
            fontSize: '13px',
            padding: '4px 12px',
            iconSize: '12px'
        },
        lg: {
            fontSize: '15px',
            padding: '6px 16px',
            iconSize: '14px'
        }
    };

    const currentSize = sizeStyles[size] || sizeStyles.md;

    return (
        <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: config.bg,
            color: 'white',
            padding: currentSize.padding,
            borderRadius: '4px',
            fontSize: currentSize.fontSize,
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
            <span style={{ fontSize: currentSize.iconSize }}>{config.icon}</span>
            <span>{config.text}</span>
        </span>
    );
};

export default StatusBadge;

