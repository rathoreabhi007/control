/**
 * FailureModal Component
 * 
 * Centered overlay modal that displays detailed error information
 * when a workflow node fails during execution.
 */

import { useState } from 'react';
import {
    FaExclamationTriangle,
    FaTimes,
    FaTerminal,
    FaRedo,
    FaChevronDown,
    FaChevronUp,
    FaCopy,
    FaCheck
} from 'react-icons/fa';

const FailureModal = ({
    isOpen,
    onClose,
    failureInfo,
    onViewLogs,
    onRetryNode
}) => {
    const [showStackTrace, setShowStackTrace] = useState(false);
    const [copied, setCopied] = useState(false);

    if (!isOpen || !failureInfo) return null;

    const {
        nodeId,
        nodeName,
        nodeType,
        error,
        stackTrace,
        timestamp,
        taskId
    } = failureInfo;

    const handleCopyError = async () => {
        const errorText = `
Node: ${nodeName} (${nodeType})
Node ID: ${nodeId}
Time: ${timestamp}
Error: ${error}
${stackTrace ? `Stack Trace:\n${stackTrace}` : ''}
        `.trim();

        try {
            await navigator.clipboard.writeText(errorText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100]"
            onClick={handleBackdropClick}
        >
            <div
                className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-red-600 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-white">
                        <div className="p-2 bg-red-500 rounded-full">
                            <FaExclamationTriangle className="text-xl" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold">Workflow Execution Failed</h2>
                            <p className="text-red-100 text-sm">Node execution error</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-white/80 hover:text-white p-2 hover:bg-red-500 rounded-full transition-colors"
                    >
                        <FaTimes />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    {/* Node Info */}
                    <div className="bg-gray-50 rounded-lg p-4">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                                <span className="text-gray-500">Failed Node</span>
                                <p className="font-medium text-gray-900">{nodeName}</p>
                            </div>
                            <div>
                                <span className="text-gray-500">Node Type</span>
                                <p className="font-medium text-gray-900">{nodeType}</p>
                            </div>
                            <div>
                                <span className="text-gray-500">Node ID</span>
                                <p className="font-mono text-xs text-gray-600">{nodeId}</p>
                            </div>
                            <div>
                                <span className="text-gray-500">Timestamp</span>
                                <p className="text-gray-600 text-xs">
                                    {timestamp ? new Date(timestamp).toLocaleString() : 'N/A'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Error Message */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium text-gray-700">Error Message</label>
                            <button
                                onClick={handleCopyError}
                                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                            >
                                {copied ? <FaCheck className="text-green-500" /> : <FaCopy />}
                                {copied ? 'Copied!' : 'Copy'}
                            </button>
                        </div>
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                            <p className="text-red-800 text-sm font-mono whitespace-pre-wrap break-words">
                                {error || 'Unknown error occurred'}
                            </p>
                        </div>
                    </div>

                    {/* Stack Trace (Collapsible) */}
                    {stackTrace && (
                        <div>
                            <button
                                onClick={() => setShowStackTrace(!showStackTrace)}
                                className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                            >
                                {showStackTrace ? <FaChevronUp /> : <FaChevronDown />}
                                Stack Trace
                            </button>
                            {showStackTrace && (
                                <div className="mt-2 bg-gray-900 rounded-lg p-3 max-h-[200px] overflow-auto">
                                    <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
                                        {stackTrace}
                                    </pre>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-3">
                    {taskId && onViewLogs && (
                        <button
                            onClick={() => onViewLogs(taskId, nodeId)}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            <FaTerminal />
                            View Logs
                        </button>
                    )}
                    {onRetryNode && (
                        <button
                            onClick={() => onRetryNode(nodeId)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            <FaRedo />
                            Retry Node
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="px-4 py-2 border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FailureModal;
