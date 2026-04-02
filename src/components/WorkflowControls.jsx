import React, { memo } from 'react';
import { FaPlay, FaStop, FaUndo, FaCog } from 'react-icons/fa';

/**
 * Workflow Controls Component
 * Handles run, stop, reset, and configuration actions
 */
const WorkflowControls = memo(({
    onRunAll,
    onResetAll,
    onConfigureNext,
    isRunningAll,
    nodes,
    areParamsApplied,
    instanceId
}) => {
    // Check if any nodes are unconfigured
    const hasUnconfiguredNodes = nodes.some(node => {
        // This is a simplified check - in reality, you'd check if nodes have required parameters
        return node.data.status === 'idle' && !node.data.parameters;
    });

    // Check if workflow can be run
    const canRunWorkflow = areParamsApplied && !isRunningAll && nodes.length > 0;

    return (
        <div className="space-y-4">
            {/* Workflow Status */}
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">Workflow Status</h3>
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-400">Total Nodes</span>
                        <span className="text-sm font-medium text-slate-200">{nodes.length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-400">Parameters Applied</span>
                        <span className={`text-sm font-medium ${areParamsApplied ? 'text-green-400' : 'text-red-400'}`}>
                            {areParamsApplied ? 'Yes' : 'No'}
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-400">Status</span>
                        <span className={`text-sm font-medium ${isRunningAll ? 'text-yellow-400' :
                                areParamsApplied ? 'text-green-400' : 'text-slate-400'
                            }`}>
                            {isRunningAll ? 'Running' : areParamsApplied ? 'Ready' : 'Not Ready'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Control Buttons */}
            <div className="space-y-3">
                {/* Run All Button */}
                <button
                    onClick={onRunAll}
                    disabled={!canRunWorkflow}
                    className={`w-full px-4 py-3 rounded-md font-medium transition-colors shadow-lg 
                        focus:ring-2 focus:ring-blue-500/50 active:transform active:scale-[0.98]
                        ${canRunWorkflow
                            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-900/20'
                            : 'bg-slate-600 text-slate-400 cursor-not-allowed'
                        }`}
                >
                    <div className="flex items-center justify-center gap-2">
                        {isRunningAll ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                <span>Running...</span>
                            </>
                        ) : (
                            <>
                                <FaPlay className="text-sm" />
                                <span>Run All Nodes</span>
                            </>
                        )}
                    </div>
                </button>

                {/* Stop All Button */}
                <button
                    onClick={() => {
                        // This would need to be implemented in the parent component
                        console.log('Stop all nodes clicked');
                    }}
                    disabled={!isRunningAll}
                    className={`w-full px-4 py-3 rounded-md font-medium transition-colors shadow-lg 
                        focus:ring-2 focus:ring-red-500/50 active:transform active:scale-[0.98]
                        ${isRunningAll
                            ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-900/20'
                            : 'bg-slate-600 text-slate-400 cursor-not-allowed'
                        }`}
                >
                    <div className="flex items-center justify-center gap-2">
                        <FaStop className="text-sm" />
                        <span>Stop All</span>
                    </div>
                </button>

                {/* Reset All Button */}
                <button
                    onClick={onResetAll}
                    className="w-full px-4 py-3 bg-slate-600 hover:bg-slate-700 text-white rounded-md font-medium 
                        transition-colors shadow-lg shadow-slate-900/20 focus:ring-2 focus:ring-slate-500/50 
                        active:transform active:scale-[0.98]"
                >
                    <div className="flex items-center justify-center gap-2">
                        <FaUndo className="text-sm" />
                        <span>Reset All Nodes</span>
                    </div>
                </button>

                {/* Configure Next Button */}
                {hasUnconfiguredNodes && (
                    <button
                        onClick={onConfigureNext}
                        className="w-full px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-md font-medium 
                            transition-colors shadow-lg shadow-orange-900/20 focus:ring-2 focus:ring-orange-500/50 
                            active:transform active:scale-[0.98]"
                    >
                        <div className="flex items-center justify-center gap-2">
                            <FaCog className="text-sm" />
                            <span>Configure Next</span>
                        </div>
                    </button>
                )}
            </div>

            {/* Instance Info */}
            <div className="text-xs text-slate-500 text-center">
                Instance: {instanceId}
            </div>
        </div>
    );
});

WorkflowControls.displayName = 'WorkflowControls';

export default WorkflowControls;

