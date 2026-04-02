import React, { useState, useEffect } from 'react';
import { FaTimes, FaSpinner, FaTrash, FaFileCode, FaSync, FaSearch } from 'react-icons/fa';

const API_BASE_URL = 'http://127.0.0.1:8000';

const LoadWorkflowModal = ({ isOpen, onClose, onLoad, userId }) => {
    const [workflows, setWorkflows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchWorkflows = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_BASE_URL}/api/workflows/list?limit=100`);
            if (!response.ok) throw new Error('Failed to fetch workflows');
            const data = await response.json();
            setWorkflows(data.workflows || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchWorkflows();
        }
    }, [isOpen]);

    const handleDelete = async (workflowId, e) => {
        e.stopPropagation();
        if (!window.confirm('Are you sure you want to delete this workflow?')) return;

        try {
            const response = await fetch(`${API_BASE_URL}/api/workflows/${workflowId}`, {
                method: 'DELETE',
                headers: {
                    'x-user-id': userId || 'anonymous'
                }
            });

            if (response.ok) {
                setWorkflows(prev => prev.filter(w => w.workflow_id !== workflowId));
            } else {
                alert('Failed to delete workflow');
            }
        } catch (error) {
            console.error('Error deleting workflow:', error);
            alert('Error deleting workflow');
        }
    };

    const filteredWorkflows = workflows.filter(w =>
        w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (w.description && w.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg w-[600px] h-[500px] flex flex-col shadow-xl">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900">Load Workflow</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <FaTimes />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="p-4 border-b border-gray-100 flex gap-2">
                    <div className="flex-1 relative">
                        <FaSearch className="absolute left-3 top-3 text-gray-400 text-sm" />
                        <input
                            type="text"
                            placeholder="Search saved workflows..."
                            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={fetchWorkflows}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-md"
                        title="Refresh list"
                    >
                        <FaSync className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <FaSpinner className="animate-spin text-2xl text-blue-500" />
                        </div>
                    ) : error ? (
                        <div className="text-red-500 text-center py-8">
                            {error}
                        </div>
                    ) : filteredWorkflows.length === 0 ? (
                        <div className="text-gray-500 text-center py-8">
                            No workflows found.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredWorkflows.map(workflow => (
                                <div
                                    key={workflow.workflow_id}
                                    onClick={() => onLoad(workflow.workflow_id)}
                                    className="bg-white p-3 rounded-lg border border-gray-200 hover:border-blue-400 hover:shadow-sm cursor-pointer transition-all group"
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-start gap-3">
                                            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                                                <FaFileCode />
                                            </div>
                                            <div>
                                                <h4 className="font-medium text-gray-900">{workflow.name}</h4>
                                                <div className="flex gap-2 text-xs text-gray-500 mt-1">
                                                    <span>{workflow.node_count} nodes</span>
                                                    <span>•</span>
                                                    <span>{new Date(workflow.updated_at).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={(e) => handleDelete(workflow.workflow_id, e)}
                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                                            title="Delete workflow"
                                        >
                                            <FaTrash size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LoadWorkflowModal;
