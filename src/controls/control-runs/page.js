import React, { useState } from 'react';
import LogViewer from '../../components/ControlRuns/LogViewer';
import RunModal from '../../components/ControlRuns/RunModal';
import BulkRunModal from '../../components/ControlRuns/BulkRunModal';
import { useUser } from '../../contexts/UserContext';
import HSBCLogo from '../../components/HSBCLogo';

// New Sub-components and Hooks
import { useControlRuns } from './hooks/useControlRuns';
import StatsBar from './components/StatsBar';
import ControlsList from './components/ControlsList';
import RunningStatus from './components/RunningStatus';

/**
 * Control Runs Page - Airflow-inspired control execution interface
 */
const ControlRunsPage = () => {
    const { hasAccess, loading: userLoading } = useUser();

    // Custom hook for logic and state
    const {
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
    } = useControlRuns();

    // Modal states
    const [selectedRun, setSelectedRun] = useState(null);
    const [selectedControl, setSelectedControl] = useState(null);
    const [showBulkRun, setShowBulkRun] = useState(false);

    const handleRunClick = (control) => {
        setSelectedControl(control);
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

        // Fallback: construct a minimal control object from run data.
        setSelectedControl({
            control_id: run.control_id || 'generic_controller',
            name: run.task_name || run.control_name || 'Control',
            description: `Re-run for ${run.task_name || run.control_name || 'control'}`,
            enabled: true
        });
    };

    const handleViewLogs = (run) => {
        setSelectedRun(run);
    };

    const handleCloseLogViewer = () => {
        setSelectedRun(null);
    };

    const handleCloseRunModal = () => {
        setSelectedControl(null);
    };

    if (userLoading) {
        return (
            <div style={fullPageCenterStyle}>
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
            <div style={fullPageCenterStyle}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
                    <div style={{ fontSize: '18px', color: '#666' }}>Loading controls...</div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={fullPageCenterStyle}>
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
                        style={retryButtonStyle}
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
                    <StatsBar
                        controlsCount={controls.length}
                        statusCounts={statusCounts}
                    />

                    <ControlsList
                        searchTerm={searchTerm}
                        onSearchChange={setSearchTerm}
                        filteredControls={filteredControls}
                        handleRunClick={handleRunClick}
                        handleViewLogs={handleViewLogs}
                        allRuns={allRuns}
                        onBulkRunClick={() => setShowBulkRun(true)}
                    />
                </div>

                {/* Right Column - Running Status */}
                <RunningStatus
                    filteredRuns={filteredRuns}
                    filterStatus={filterStatus}
                    setFilterStatus={setFilterStatus}
                    statusCounts={statusCounts}
                    handleStopRun={handleStopRun}
                    handleViewLogs={handleViewLogs}
                    handleRerun={handleRerunClick}
                />
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
            {showBulkRun && (
                <BulkRunModal
                    controls={controls}
                    onStartRun={handleStartRun}
                    onClose={() => setShowBulkRun(false)}
                />
            )}
        </div>
    );
};

// Internal styles
const fullPageCenterStyle = {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    color: '#333',
    padding: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
};

const retryButtonStyle = {
    backgroundColor: '#db0011',
    color: 'white',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600'
};

export default ControlRunsPage;
