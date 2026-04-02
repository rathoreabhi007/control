import React from 'react';
import StatusBadge from '../../../components/ControlRuns/StatusBadge';
import { formatDate, formatDuration } from '../utils';

const RunningStatus = ({
    filteredRuns,
    filterStatus,
    setFilterStatus,
    statusCounts,
    handleStopRun,
    handleViewLogs,
    handleRerun
}) => {
    return (
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
                                            onClick={() => handleRerun(run)}
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
    );
};

export default RunningStatus;
