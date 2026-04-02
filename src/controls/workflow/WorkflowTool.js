// Enhanced Workflow Tool with Drag-and-Drop and Backend API Integration
// This replaces the simulated workflow with real ETL execution

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import ReactFlow, {
    Controls,
    Background,
    addEdge,
    ConnectionMode,
    useNodesState,
    useEdgesState,
    Handle,
    Position,
    MiniMap,
    Panel,
    ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
    FaFileCsv,
    FaFileAlt,
    FaFileExcel,
    FaExchangeAlt,
    FaFilter,
    FaLink,
    FaChartBar,
    FaPlay,
    FaStop,
    FaUndo,
    FaCheckCircle,
    FaTimesCircle,
    FaTrash,
    FaEdit,
    FaSpinner,
    FaGripVertical,
    FaTerminal,
    FaSave,
    FaFolderOpen,
    FaCog,
    FaExclamationTriangle,
    FaTable,
    FaCode,
} from 'react-icons/fa';
import HSBCLogo from '../../components/HSBCLogo';
import ETLLogViewer from '../../components/ETL/ETLLogViewer';
import FailureModal from '../../components/FailureModal';
import ValidationConfigModal from '../../components/ValidationConfigModal';
import { ApiService } from '../../services/api';

// API Base URL
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';

// Node types for data operations
const NODE_TYPES = {
    READ_CSV: 'read_csv',
    READ_PARQUET: 'read_parquet',
    READ_EXCEL: 'read_excel',
    CONVERT_PARQUET: 'convert_parquet',
    FILTER: 'filter',
    JOIN: 'join',
    AGGREGATE: 'aggregate',
    OUTPUT: 'output',
    PIVOT_TABLE: 'pivot_table',
    SAVE_CSV: 'save_csv',
    SAVE_EXCEL: 'save_excel',
    PYTHON_SCRIPT: 'python_script'
};

// Node definitions with parameters
const NODE_DEFINITIONS = {
    [NODE_TYPES.READ_CSV]: {
        label: 'Read CSV',
        icon: FaFileCsv,
        color: '#3B82F6',
        category: 'input',
        parameters: {
            file_path: { type: 'string', label: 'File Path', required: true, placeholder: '/path/to/file.csv' },
            delimiter: { type: 'string', label: 'Delimiter', required: false, default: ',', placeholder: ',' },
            encoding: { type: 'string', label: 'Encoding', required: false, default: 'utf-8', placeholder: 'utf-8' },
            header: { type: 'boolean', label: 'Has Header', required: false, default: true },
            skip_rows: { type: 'number', label: 'Skip Rows', required: false, default: 0, placeholder: '0' }
        }
    },
    [NODE_TYPES.READ_PARQUET]: {
        label: 'Read Parquet',
        icon: FaFileAlt,
        color: '#10B981',
        category: 'input',
        parameters: {
            file_path: { type: 'string', label: 'File Path', required: true, placeholder: '/path/to/file.parquet' },
            columns: { type: 'string', label: 'Columns (comma-separated)', required: false, placeholder: 'col1,col2,col3' },
            filters: { type: 'string', label: 'Row Filters', required: false, placeholder: 'column > 100' }
        }
    },
    [NODE_TYPES.READ_EXCEL]: {
        label: 'Read Excel',
        icon: FaFileExcel,
        color: '#059669',
        category: 'input',
        parameters: {
            file_path: { type: 'string', label: 'File Path', required: true, placeholder: '/path/to/file.xlsx' },
            sheet_name: { type: 'string', label: 'Sheet Name', required: false, placeholder: 'Sheet1' },
            header_row: { type: 'number', label: 'Header Row', required: false, default: 0, placeholder: '0' },
            skip_rows: { type: 'number', label: 'Skip Rows', required: false, default: 0, placeholder: '0' }
        }
    },
    [NODE_TYPES.CONVERT_PARQUET]: {
        label: 'Convert to Parquet',
        icon: FaExchangeAlt,
        color: '#F59E0B',
        category: 'transform',
        parameters: {
            output_path: { type: 'string', label: 'Output Path', required: true, placeholder: '/path/to/output.parquet' },
            compression: { type: 'select', label: 'Compression', required: false, default: 'snappy', options: ['snappy', 'gzip', 'brotli', 'none'] },
            partition_by: { type: 'string', label: 'Partition By', required: false, placeholder: 'date,region' }
        }
    },
    [NODE_TYPES.FILTER]: {
        label: 'Filter Data',
        icon: FaFilter,
        color: '#EF4444',
        category: 'transform',
        parameters: {
            condition: { type: 'string', label: 'Filter Condition', required: true, placeholder: 'column > 100 AND status == "active"' },
            case_sensitive: { type: 'boolean', label: 'Case Sensitive', required: false, default: false }
        }
    },
    [NODE_TYPES.JOIN]: {
        label: 'Join Data',
        icon: FaLink,
        color: '#8B5CF6',
        category: 'transform',
        parameters: {
            join_type: { type: 'select', label: 'Join Type', required: true, default: 'inner', options: ['inner', 'left', 'right', 'outer'] },
            left_key: { type: 'string', label: 'Left Key', required: true, placeholder: 'id' },
            right_key: { type: 'string', label: 'Right Key', required: true, placeholder: 'id' },
            suffixes: { type: 'string', label: 'Suffixes', required: false, default: '_x,_y', placeholder: '_left,_right' }
        }
    },
    [NODE_TYPES.AGGREGATE]: {
        label: 'Aggregate Data',
        icon: FaChartBar,
        color: '#EC4899',
        category: 'transform',
        parameters: {
            group_by: { type: 'string', label: 'Group By', required: true, placeholder: 'date,region' },
            aggregations: { type: 'string', label: 'Aggregations', required: true, placeholder: 'sum:amount,count:id,mean:value' },
            sort_by: { type: 'string', label: 'Sort By', required: false, placeholder: 'date DESC' }
        }
    },
    [NODE_TYPES.OUTPUT]: {
        label: 'Data Output',
        icon: FaCheckCircle,
        color: '#10B981',
        category: 'output',
        parameters: {
            output_type: { type: 'select', label: 'Output Type', required: true, default: 'preview', options: ['preview', 'download', 'save'] },
            max_rows: { type: 'number', label: 'Max Rows', required: false, default: 1000, placeholder: '1000' }
        }
    },
    [NODE_TYPES.PIVOT_TABLE]: {
        label: 'Pivot Table',
        icon: FaTable,
        color: '#6366F1',
        category: 'transform',
        parameters: {
            index: { type: 'string', label: 'Index Columns', required: true, placeholder: 'row_col1,row_col2' },
            columns: { type: 'string', label: 'Pivot Column', required: true, placeholder: 'category' },
            values: { type: 'string', label: 'Value Columns', required: true, placeholder: 'amount,quantity' },
            aggregate_function: { type: 'select', label: 'Aggregate Function', required: true, default: 'sum', options: ['sum', 'mean', 'count', 'min', 'max', 'first', 'last'] }
        }
    },
    [NODE_TYPES.SAVE_CSV]: {
        label: 'Save to CSV',
        icon: FaFileCsv,
        color: '#0EA5E9',
        category: 'output',
        parameters: {
            output_path: { type: 'string', label: 'Output Path', required: true, placeholder: '/path/to/output.csv' },
            delimiter: { type: 'string', label: 'Delimiter', required: false, default: ',', placeholder: ',' },
            include_header: { type: 'boolean', label: 'Include Header', required: false, default: true },
            encoding: { type: 'string', label: 'Encoding', required: false, default: 'utf-8', placeholder: 'utf-8' }
        }
    },
    [NODE_TYPES.SAVE_EXCEL]: {
        label: 'Save to Excel',
        icon: FaFileExcel,
        color: '#16A34A',
        category: 'output',
        parameters: {
            output_path: { type: 'string', label: 'Output Path', required: true, placeholder: '/path/to/output.xlsx' },
            sheet_name: { type: 'string', label: 'Sheet Name', required: false, default: 'Sheet1', placeholder: 'Sheet1' },
            include_header: { type: 'boolean', label: 'Include Header', required: false, default: true }
        }
    },
    [NODE_TYPES.PYTHON_SCRIPT]: {
        label: 'Python Script',
        icon: FaCode,
        color: '#F97316',
        category: 'transform',
        parameters: {
            script: { type: 'textarea', label: 'Python Script', required: true, rows: 12, default: 'def process(df1):\n    # Your code here\n    # df1, df2, etc. are Polars DataFrames from connected inputs\n    # Must return a single Polars or Pandas DataFrame\n    result = df1\n    return result', placeholder: 'def process(df1):\n    result = df1\n    return result' },
            function_name: { type: 'string', label: 'Function Name', required: false, default: 'process', placeholder: 'process' }
        }
    }
};

// Custom Node Component with status indicator
const DataNode = ({ data, id, selected }) => {
    const nodeDef = NODE_DEFINITIONS[data.type];
    if (!nodeDef) return null;

    const Icon = nodeDef.icon;

    // Check if parameters are configured
    const hasRequiredParams = () => {
        if (!nodeDef.parameters) return true;
        const requiredParams = Object.entries(nodeDef.parameters)
            .filter(([_, param]) => param.required)
            .map(([key, _]) => key);

        return requiredParams.every(param =>
            data.parameters && data.parameters[param] && data.parameters[param].toString().trim() !== ''
        );
    };

    const isConfigured = hasRequiredParams();

    const getStatusColor = () => {
        switch (data.status) {
            case 'completed': return 'bg-green-500';
            case 'running': return 'bg-yellow-500 animate-pulse';
            case 'failed': return 'bg-red-500';
            case 'pending': return 'bg-blue-500';
            default: return 'bg-gray-300';
        }
    };

    const getStatusIcon = () => {
        switch (data.status) {
            case 'completed': return <FaCheckCircle className="text-green-500" />;
            case 'running': return <FaSpinner className="text-yellow-500 animate-spin" />;
            case 'failed': return <FaTimesCircle className="text-red-500" />;
            default: return null;
        }
    };

    return (
        <div className={`px-4 py-3 rounded-lg border-2 shadow-lg transition-all duration-200 ${selected
            ? 'border-blue-500 shadow-blue-500/20'
            : !isConfigured
                ? 'border-orange-400 shadow-orange-400/20'
                : data.status === 'failed'
                    ? 'border-red-400 shadow-red-400/20'
                    : 'border-gray-200 hover:border-gray-300'
            }`} style={{ backgroundColor: 'white', minWidth: '200px' }}>
            {data.type === 'python_script' ? (
                [0, 1, 2, 3, 4].map((i) => (
                    <Handle
                        key={`input_${i}`}
                        type="target"
                        position={Position.Left}
                        id={`input_${i}`}
                        className="w-3 h-3 bg-gray-400 border-2 border-white"
                        style={{ top: `${20 + i * 15}%` }}
                        title={`Input ${i + 1}`}
                    />
                ))
            ) : (
                <Handle
                    type="target"
                    position={Position.Left}
                    className="w-3 h-3 bg-gray-400 border-2 border-white"
                />
            )}

            <div className="flex items-center gap-3">
                <div
                    className="p-2 rounded-lg flex-shrink-0"
                    style={{ backgroundColor: `${nodeDef.color}20` }}
                >
                    <Icon className="text-lg" style={{ color: nodeDef.color }} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm truncate flex items-center gap-2">
                        {nodeDef.label}
                        {getStatusIcon()}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                        {data.label || id}
                    </div>
                    {!isConfigured && (
                        <div className="text-xs text-orange-600 mt-1">
                            ⚠️ Configure parameters
                        </div>
                    )}
                    {data.status === 'failed' && data.error && (
                        <div className="text-xs text-red-600 mt-1 truncate" title={data.error}>
                            ❌ {data.error.substring(0, 30)}...
                        </div>
                    )}
                    {data.status === 'running' && data.taskId && (
                        <div className="text-xs text-blue-600 mt-1">
                            🔄 Task: {data.taskId.substring(0, 8)}...
                        </div>
                    )}
                </div>
            </div>

            {/* Progress bar for running tasks */}
            {data.status === 'running' && (
                <div className="mt-2 h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-yellow-500 animate-pulse" style={{ width: '100%' }} />
                </div>
            )}

            {/* Status indicator dot */}
            <div className="flex justify-between items-center mt-2">
                <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
                {data.executionTime && (
                    <div className="text-xs text-gray-400">
                        {data.executionTime}
                    </div>
                )}
            </div>

            <Handle
                type="source"
                position={Position.Right}
                className="w-3 h-3 bg-gray-400 border-2 border-white"
            />
        </div>
    );
};

// Draggable Palette Item Component
const DraggablePaletteItem = ({ type, definition }) => {
    const Icon = definition.icon;

    const onDragStart = (event) => {
        event.dataTransfer.setData('application/reactflow', type);
        event.dataTransfer.effectAllowed = 'move';
    };

    return (
        <div
            draggable
            onDragStart={onDragStart}
            className="flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors cursor-grab active:cursor-grabbing border border-transparent hover:border-gray-200"
            title={`Drag to add ${definition.label} to workflow`}
        >
            <FaGripVertical className="text-gray-400 text-xs" />
            <div
                className="p-1.5 rounded"
                style={{ backgroundColor: `${definition.color}20` }}
            >
                <Icon className="text-sm" style={{ color: definition.color }} />
            </div>
            <span className="flex-1">{definition.label}</span>
        </div>
    );
};

// Node Palette Component with drag support
const NodePalette = ({ onAddNode }) => {
    const categories = {
        input: { label: 'Input Operations', icon: '📥' },
        transform: { label: 'Transform Operations', icon: '🔄' },
        output: { label: 'Output Operations', icon: '📤' }
    };

    const nodesByCategory = Object.entries(NODE_DEFINITIONS).reduce((acc, [type, def]) => {
        const category = def.category || 'transform';
        if (!acc[category]) acc[category] = [];
        acc[category].push({ type, ...def });
        return acc;
    }, {});

    return (
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Data Operations</h3>
            <p className="text-xs text-gray-500 mb-3">
                🖱️ Drag operations to canvas or click to add
            </p>

            {Object.entries(categories).map(([catKey, catDef]) => (
                nodesByCategory[catKey] && nodesByCategory[catKey].length > 0 && (
                    <div key={catKey} className="mb-4">
                        <div className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                            <span>{catDef.icon}</span>
                            <span>{catDef.label}</span>
                        </div>
                        <div className="space-y-1">
                            {nodesByCategory[catKey].map((node) => (
                                <div key={node.type} onClick={() => onAddNode(node.type)}>
                                    <DraggablePaletteItem type={node.type} definition={node} />
                                </div>
                            ))}
                        </div>
                    </div>
                )
            ))}
        </div>
    );
};

// Parameter Configuration Modal
const ParameterModal = ({ node, isOpen, onClose, onSave }) => {
    const [parameters, setParameters] = useState({});
    const nodeDef = NODE_DEFINITIONS[node?.data?.type];

    useEffect(() => {
        if (node && isOpen) {
            setParameters(node.data.parameters || {});
        }
    }, [node, isOpen]);

    const handleParameterChange = (key, value) => {
        setParameters(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const handleSave = () => {
        onSave(node.id, parameters);
        onClose();
    };

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    if (!isOpen || !node || !nodeDef) return null;

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            onClick={handleBackdropClick}
        >
            <div
                className={`bg-white rounded-lg p-6 w-full mx-4 max-h-[80vh] overflow-y-auto ${node?.data?.type === 'python_script' ? 'max-w-2xl' : 'max-w-md'}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                        Configure {nodeDef.label}
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600"
                    >
                        <FaTimesCircle />
                    </button>
                </div>

                <div className="space-y-4">
                    {Object.entries(nodeDef.parameters || {}).map(([key, param]) => (
                        <div key={key}>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                {param.label}
                                {param.required && <span className="text-red-500 ml-1">*</span>}
                            </label>

                            {param.type === 'string' && (
                                <input
                                    type="text"
                                    value={parameters[key] || param.default || ''}
                                    onChange={(e) => handleParameterChange(key, e.target.value)}
                                    placeholder={param.placeholder}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            )}

                            {param.type === 'number' && (
                                <input
                                    type="number"
                                    value={parameters[key] || param.default || ''}
                                    onChange={(e) => handleParameterChange(key, e.target.value)}
                                    placeholder={param.placeholder}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            )}

                            {param.type === 'boolean' && (
                                <select
                                    value={parameters[key] !== undefined ? parameters[key] : param.default}
                                    onChange={(e) => handleParameterChange(key, e.target.value === 'true')}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value={true}>True</option>
                                    <option value={false}>False</option>
                                </select>
                            )}

                            {param.type === 'select' && (
                                <select
                                    value={parameters[key] || param.default}
                                    onChange={(e) => handleParameterChange(key, e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    {param.options.map(option => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                            )}

                            {param.type === 'textarea' && (
                                <textarea
                                    value={parameters[key] || param.default || ''}
                                    onChange={(e) => handleParameterChange(key, e.target.value)}
                                    placeholder={param.placeholder}
                                    rows={param.rows || 10}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                    spellCheck={false}
                                />
                            )}
                        </div>
                    ))}
                </div>

                <div className="flex gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};

// Log Panel Component
const LogPanel = ({ taskId, nodeId, isOpen, onClose, taskStatus }) => {
    const [logs, setLogs] = useState('');
    const [loading, setLoading] = useState(false);
    const logContainerRef = useRef(null);

    const loadLogs = useCallback(async () => {
        if (!taskId) return;

        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/etl/logs/${taskId}?stream=true`);
            if (response.ok) {
                const text = await response.text();
                setLogs(text);
            } else {
                setLogs('No logs available yet');
            }
        } catch (error) {
            setLogs(`Error loading logs: ${error.message}`);
        } finally {
            setLoading(false);
        }
    }, [taskId]);

    useEffect(() => {
        if (isOpen && taskId) {
            loadLogs();

            // Auto-refresh while running
            const interval = taskStatus === 'running'
                ? setInterval(loadLogs, 3000)
                : null;

            return () => interval && clearInterval(interval);
        }
    }, [isOpen, taskId, taskStatus, loadLogs]);

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    if (!isOpen) return null;

    return (
        <div className="fixed bottom-0 left-64 right-0 h-64 bg-gray-900 border-t border-gray-700 z-40 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
                <div className="flex items-center gap-2 text-white">
                    <FaTerminal />
                    <span className="text-sm font-medium">
                        Logs: {nodeId || 'No task selected'}
                    </span>
                    {taskStatus === 'running' && (
                        <span className="text-xs text-yellow-400 animate-pulse">● Running</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={loadLogs}
                        disabled={loading}
                        className="px-2 py-1 text-xs bg-gray-700 text-white rounded hover:bg-gray-600"
                    >
                        {loading ? <FaSpinner className="animate-spin" /> : '🔄 Refresh'}
                    </button>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white"
                    >
                        <FaTimesCircle />
                    </button>
                </div>
            </div>
            <div
                ref={logContainerRef}
                className="flex-1 overflow-auto p-4 font-mono text-xs text-green-400 whitespace-pre-wrap"
            >
                {logs || 'No logs available'}
            </div>
        </div>
    );
};

// Main Workflow Component
function WorkflowToolInner({ instanceId }) {
    const reactFlowWrapper = useRef(null);
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [reactFlowInstance, setReactFlowInstance] = useState(null);
    const [selectedNode, setSelectedNode] = useState(null);
    const [isParameterModalOpen, setIsParameterModalOpen] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [workflowStatus, setWorkflowStatus] = useState('idle');
    const [nodeOutputs, setNodeOutputs] = useState({});
    const [contextMenu, setContextMenu] = useState(null);

    // Log panel state
    const [isLogPanelOpen, setIsLogPanelOpen] = useState(false);
    const [selectedTaskForLogs, setSelectedTaskForLogs] = useState(null);

    // Full-screen log viewer state
    const [logViewerTask, setLogViewerTask] = useState(null);

    // Failure modal state
    const [failureInfo, setFailureInfo] = useState(null);
    const [isFailureModalOpen, setIsFailureModalOpen] = useState(false);

    // Validation config modal state
    const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
    const [validationNode, setValidationNode] = useState(null);

    // Session tracking for single node execution
    const [currentSessionId, setCurrentSessionId] = useState(null);

    // Abort controller for stopping tasks
    const abortControllerRef = useRef(null);

    const nodeTypes = useMemo(() => ({
        dataNode: DataNode
    }), []);

    // Handle drop from palette
    const onDrop = useCallback(
        (event) => {
            event.preventDefault();

            const type = event.dataTransfer.getData('application/reactflow');
            if (!type || !NODE_DEFINITIONS[type]) {
                return;
            }

            // Get the position where the node was dropped
            const position = reactFlowInstance.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            const newNode = {
                id: `${type}_${Date.now()}`,
                type: 'dataNode',
                position,
                data: {
                    type,
                    label: NODE_DEFINITIONS[type].label,
                    status: 'idle',
                    parameters: {}
                }
            };

            setNodes((nds) => [...nds, newNode]);
        },
        [reactFlowInstance, setNodes]
    );

    const onDragOver = useCallback((event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    // Add new node (click to add)
    const addNode = useCallback((type) => {
        const newNode = {
            id: `${type}_${Date.now()}`,
            type: 'dataNode',
            position: { x: 250 + Math.random() * 100, y: 100 + nodes.length * 100 },
            data: {
                type,
                label: NODE_DEFINITIONS[type].label,
                status: 'idle',
                parameters: {}
            }
        };
        setNodes(nds => [...nds, newNode]);
    }, [setNodes, nodes.length]);

    // Handle node selection
    const onNodeClick = useCallback((event, node) => {
        setSelectedNode(node);
        setIsParameterModalOpen(true);
    }, []);

    // Node context menu handler
    const onNodeContextMenu = useCallback((event, node) => {
        event.preventDefault();
        setSelectedNode(node);
        setContextMenu({
            x: event.clientX,
            y: event.clientY,
            nodeId: node.id
        });
    }, []);

    // Close context menu when clicking outside
    const onPaneClick = useCallback(() => {
        setContextMenu(null);
    }, []);

    // Save node parameters
    const saveNodeParameters = useCallback((nodeId, parameters) => {
        setNodes(nds => nds.map(node =>
            node.id === nodeId
                ? { ...node, data: { ...node.data, parameters } }
                : node
        ));
    }, [setNodes]);

    // Handle connections
    const onConnect = useCallback((params) => {
        setEdges(eds => addEdge(params, eds));
    }, [setEdges]);

    // Update node status
    const updateNodeStatus = useCallback((nodeId, status, extra = {}) => {
        setNodes(nds => nds.map(node =>
            node.id === nodeId
                ? { ...node, data: { ...node.data, status, ...extra } }
                : node
        ));
    }, [setNodes]);

    // Get execution order based on edges (topological sort)
    const getExecutionOrder = useCallback(() => {
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        const inDegree = new Map();
        const adjacencyList = new Map();

        // Initialize
        nodes.forEach(node => {
            inDegree.set(node.id, 0);
            adjacencyList.set(node.id, []);
        });

        // Build adjacency list and count in-degrees
        edges.forEach(edge => {
            adjacencyList.get(edge.source)?.push(edge.target);
            inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
        });

        // Find nodes with no dependencies
        const queue = [];
        inDegree.forEach((degree, nodeId) => {
            if (degree === 0) queue.push(nodeId);
        });

        const order = [];
        while (queue.length > 0) {
            const nodeId = queue.shift();
            order.push(nodeMap.get(nodeId));

            adjacencyList.get(nodeId)?.forEach(neighbor => {
                inDegree.set(neighbor, inDegree.get(neighbor) - 1);
                if (inDegree.get(neighbor) === 0) {
                    queue.push(neighbor);
                }
            });
        }

        return order;
    }, [nodes, edges]);

    // Get previous outputs for a node
    const getPreviousOutputs = useCallback((nodeId) => {
        const previousOutputs = {};

        edges.forEach(edge => {
            if (edge.target === nodeId) {
                const sourceOutput = nodeOutputs[edge.source];
                if (sourceOutput) {
                    previousOutputs[edge.source] = sourceOutput;
                }
            }
        });

        return previousOutputs;
    }, [edges, nodeOutputs]);

    // Run a single node
    const runNode = useCallback(async (node) => {
        const startTime = Date.now();

        try {
            updateNodeStatus(node.id, 'running');

            // Prepare parameters
            const previousOutputs = getPreviousOutputs(node.id);

            // Start the ETL task
            const result = await ApiService.startCalculation({
                nodeId: node.data.type,
                parameters: {
                    expectedRunDate: new Date().toISOString().split('T')[0],
                    ...node.data.parameters
                },
                previousOutputs,
                customParams: node.data.parameters
            });

            const taskId = result.process_id;
            updateNodeStatus(node.id, 'running', { taskId });

            // Set up for log viewing
            setSelectedTaskForLogs({ taskId, nodeId: node.id, status: 'running' });

            // Poll for completion
            return new Promise((resolve, reject) => {
                ApiService.pollTaskStatus(
                    taskId,
                    // onStatusUpdate
                    (status, attempts) => {
                        // console.log(`Task ${taskId} status: ${status.status} (attempt ${attempts})`);
                    },
                    // onComplete
                    async (status) => {
                        const executionTime = ((Date.now() - startTime) / 1000).toFixed(1) + 's';

                        // Get the full output
                        const output = await ApiService.getProcessOutput(taskId);

                        // Store the output
                        setNodeOutputs(prev => ({
                            ...prev,
                            [node.id]: output
                        }));

                        updateNodeStatus(node.id, 'completed', {
                            taskId,
                            executionTime,
                            output
                        });

                        setSelectedTaskForLogs(prev =>
                            prev?.taskId === taskId ? { ...prev, status: 'completed' } : prev
                        );

                        resolve(output);
                    },
                    // onError
                    (error) => {
                        const executionTime = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
                        updateNodeStatus(node.id, 'failed', {
                            taskId,
                            executionTime,
                            error: error.message
                        });

                        setSelectedTaskForLogs(prev =>
                            prev?.taskId === taskId ? { ...prev, status: 'failed' } : prev
                        );

                        reject(error);
                    }
                );
            });
        } catch (error) {
            const executionTime = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
            updateNodeStatus(node.id, 'failed', {
                executionTime,
                error: error.message
            });
            throw error;
        }
    }, [updateNodeStatus, getPreviousOutputs]);

    // Run workflow
    const runWorkflow = useCallback(async () => {
        if (nodes.length === 0) return;

        setIsRunning(true);
        setWorkflowStatus('running');
        setFailureInfo(null);
        setIsFailureModalOpen(false);
        abortControllerRef.current = new AbortController();

        try {
            // Get execution order
            const executionOrder = getExecutionOrder();

            // Run nodes in order
            for (const node of executionOrder) {
                // Check if aborted
                if (abortControllerRef.current.signal.aborted) {
                    throw new Error('Workflow stopped by user');
                }

                await runNode(node);
            }

            setWorkflowStatus('completed');
        } catch (error) {
            console.error('Workflow error:', error);
            setWorkflowStatus('failed');

            // Find the failed node for the failure modal
            const failedNode = nodes.find(n => n.data.status === 'failed');
            if (failedNode) {
                setFailureInfo({
                    nodeId: failedNode.id,
                    nodeName: failedNode.data.label || failedNode.id,
                    nodeType: failedNode.data.type,
                    error: failedNode.data.error || error.message,
                    taskId: failedNode.data.taskId,
                    timestamp: new Date().toISOString()
                });
                setIsFailureModalOpen(true);
            }
        } finally {
            setIsRunning(false);
        }
    }, [nodes, getExecutionOrder, runNode]);

    // Run a single node (using cached upstream data)
    const runSingleNode = useCallback(async (nodeId) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;

        // Check if we have a session from previous run
        if (!currentSessionId) {
            alert('Please run the full workflow first to create a session with upstream data.');
            return;
        }

        const startTime = Date.now();
        updateNodeStatus(nodeId, 'running');

        try {
            // Find upstream node IDs from edges
            const upstreamNodeIds = edges
                .filter(e => e.target === nodeId)
                .map(e => e.source);

            // Call the single node execution API
            const response = await fetch(`${API_BASE_URL}/api/workflows/execute-node`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': 'anonymous'
                },
                body: JSON.stringify({
                    session_id: currentSessionId,
                    node_id: nodeId,
                    node_config: {
                        type: node.data.type,
                        parameters: node.data.parameters || {},
                        upstream_nodes: upstreamNodeIds
                    },
                    use_cached_inputs: true
                })
            });

            const result = await response.json();
            const executionTime = ((Date.now() - startTime) / 1000).toFixed(1) + 's';

            if (result.status === 'completed') {
                updateNodeStatus(nodeId, 'completed', {
                    executionTime,
                    output: result
                });

                // Store output for downstream use
                setNodeOutputs(prev => ({
                    ...prev,
                    [nodeId]: result
                }));
            } else {
                updateNodeStatus(nodeId, 'failed', {
                    executionTime,
                    error: result.error || 'Execution failed'
                });

                // Show failure modal
                setFailureInfo({
                    nodeId: nodeId,
                    nodeName: node.data.label || nodeId,
                    nodeType: node.data.type,
                    error: result.error || 'Execution failed',
                    timestamp: new Date().toISOString()
                });
                setIsFailureModalOpen(true);
            }
        } catch (error) {
            const executionTime = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
            updateNodeStatus(nodeId, 'failed', {
                executionTime,
                error: error.message
            });

            // Show failure modal
            setFailureInfo({
                nodeId: nodeId,
                nodeName: node.data.label || nodeId,
                nodeType: node.data.type,
                error: error.message,
                timestamp: new Date().toISOString()
            });
            setIsFailureModalOpen(true);
        }
    }, [nodes, edges, currentSessionId, updateNodeStatus]);

    // Save validation rules for a node
    const saveNodeValidations = useCallback((nodeId, validations) => {
        setNodes(nds => nds.map(node =>
            node.id === nodeId
                ? { ...node, data: { ...node.data, validations } }
                : node
        ));
    }, [setNodes]);

    // Open validation configuration modal
    const openValidationModal = useCallback((node) => {
        setValidationNode(node);
        setIsValidationModalOpen(true);
    }, []);

    // Stop workflow
    const stopWorkflow = useCallback(async () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        // Stop all running tasks
        const runningNodes = nodes.filter(n => n.data.status === 'running');
        for (const node of runningNodes) {
            if (node.data.taskId) {
                try {
                    await ApiService.stopProcess(node.data.taskId);
                } catch (error) {
                    console.error(`Failed to stop task ${node.data.taskId}:`, error);
                }
            }
            updateNodeStatus(node.id, 'idle');
        }

        setIsRunning(false);
        setWorkflowStatus('stopped');
    }, [nodes, updateNodeStatus]);

    // Reset workflow
    const resetWorkflow = useCallback(() => {
        setWorkflowStatus('idle');
        setNodes(nds => nds.map(node => ({
            ...node,
            data: {
                ...node.data,
                status: 'idle',
                taskId: undefined,
                executionTime: undefined,
                error: undefined,
                output: undefined
            }
        })));
        setNodeOutputs({});
        setSelectedTaskForLogs(null);
        setIsLogPanelOpen(false);
    }, [setNodes]);

    // Delete selected node
    const deleteSelectedNode = useCallback(() => {
        if (selectedNode) {
            setNodes(nds => nds.filter(node => node.id !== selectedNode.id));
            setEdges(eds => eds.filter(edge =>
                edge.source !== selectedNode.id && edge.target !== selectedNode.id
            ));
            setSelectedNode(null);
            setContextMenu(null);
        }
    }, [selectedNode, setNodes, setEdges]);

    // View logs for a node
    const viewNodeLogs = useCallback((node) => {
        if (node.data.taskId) {
            setLogViewerTask({
                taskId: node.data.taskId,
                nodeId: node.id,
                status: node.data.status
            });
        }
    }, []);

    // State for workflow management
    const [savedWorkflows, setSavedWorkflows] = useState([]);
    const [showWorkflowList, setShowWorkflowList] = useState(false);
    const [workflowName, setWorkflowName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Fetch saved workflows list
    const fetchWorkflowList = useCallback(async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/workflows/list?instance_id=${instanceId}`);
            if (response.ok) {
                const data = await response.json();
                setSavedWorkflows(data.workflows || []);
            }
        } catch (error) {
            console.error('Error fetching workflows:', error);
        }
    }, [instanceId]);

    // Save workflow to server
    const saveWorkflow = useCallback(async () => {
        if (nodes.length === 0) {
            alert('No nodes to save. Add some operations first.');
            return;
        }

        const name = workflowName.trim() || prompt('Enter a name for this workflow:', `Workflow ${new Date().toLocaleDateString()}`);
        if (!name) return;

        setIsSaving(true);
        try {
            const workflow = {
                name,
                instance_id: instanceId,
                nodes: nodes.map(n => ({
                    ...n,
                    data: {
                        ...n.data,
                        status: 'idle',
                        taskId: undefined,
                        executionTime: undefined,
                        error: undefined
                    }
                })),
                edges,
                metadata: {
                    nodeCount: nodes.length,
                    edgeCount: edges.length
                }
            };

            const response = await fetch(`${API_BASE_URL}/api/workflows/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(workflow)
            });

            if (response.ok) {
                const result = await response.json();
                setWorkflowName(name);
                alert(`✅ Workflow "${result.name}" saved successfully! (Version ${result.version})`);
                fetchWorkflowList();
            } else {
                const error = await response.json();
                alert(`❌ Failed to save workflow: ${error.detail}`);
            }
        } catch (error) {
            console.error('Error saving workflow:', error);
            alert(`❌ Error saving workflow: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    }, [nodes, edges, instanceId, workflowName, fetchWorkflowList]);

    // Load workflow from server
    const loadWorkflow = useCallback(async (workflowId) => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/workflows/load/${workflowId}`);

            if (response.ok) {
                const data = await response.json();
                const workflow = data.workflow;

                setNodes(workflow.nodes || []);
                setEdges(workflow.edges || []);
                setWorkflowName(workflow.name || '');
                setShowWorkflowList(false);

                alert(`✅ Workflow "${workflow.name}" loaded successfully!`);
            } else {
                const error = await response.json();
                alert(`❌ Failed to load workflow: ${error.detail}`);
            }
        } catch (error) {
            console.error('Error loading workflow:', error);
            alert(`❌ Error loading workflow: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [setNodes, setEdges]);

    // Delete workflow from server
    const deleteWorkflow = useCallback(async (workflowId, workflowName) => {
        if (!window.confirm(`Are you sure you want to delete "${workflowName}"?`)) {
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/workflows/delete/${workflowId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                alert(`✅ Workflow "${workflowName}" deleted.`);
                fetchWorkflowList();
            } else {
                const error = await response.json();
                alert(`❌ Failed to delete workflow: ${error.detail}`);
            }
        } catch (error) {
            console.error('Error deleting workflow:', error);
            alert(`❌ Error deleting workflow: ${error.message}`);
        }
    }, [fetchWorkflowList]);

    // Fetch workflow list on mount
    useEffect(() => {
        fetchWorkflowList();
    }, [fetchWorkflowList]);

    return (
        <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5', color: 'black' }}>
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-8 py-4 shadow-sm">
                <div className="flex items-center justify-between">
                    <div className="flex items-center">
                        <HSBCLogo height={48} className="mr-4" />
                        <div>
                            <h1 className="text-2xl font-bold text-black">
                                Data Workflow Tool
                            </h1>
                            <p className="text-gray-600 text-sm">
                                Instance ID: {instanceId}
                            </p>
                            <p className="text-gray-500 text-xs mt-1">
                                🖱️ Drag operations from palette • Click nodes to configure • Connect nodes to build workflow
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Workflow name indicator */}
                        {workflowName && (
                            <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                📁 {workflowName}
                            </span>
                        )}
                        <button
                            onClick={saveWorkflow}
                            disabled={isSaving || nodes.length === 0}
                            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${isSaving || nodes.length === 0
                                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                : 'bg-blue-100 hover:bg-blue-200 text-blue-700'
                                }`}
                        >
                            {isSaving ? <FaSpinner className="animate-spin" /> : <FaSave />}
                            {isSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                            onClick={() => {
                                fetchWorkflowList();
                                setShowWorkflowList(true);
                            }}
                            disabled={isLoading}
                            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
                        >
                            {isLoading ? <FaSpinner className="animate-spin" /> : <FaFolderOpen />}
                            Load
                        </button>
                        <div className="w-px h-8 bg-gray-300" />
                        <button
                            onClick={runWorkflow}
                            disabled={isRunning || nodes.length === 0}
                            className={`px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-2 ${isRunning || nodes.length === 0
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-green-600 hover:bg-green-700 text-white'
                                }`}
                        >
                            {isRunning ? <FaSpinner className="animate-spin" /> : <FaPlay />}
                            {isRunning ? 'Running...' : 'Run Workflow'}
                        </button>
                        <button
                            onClick={stopWorkflow}
                            disabled={!isRunning}
                            className={`px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-2 ${!isRunning
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-red-600 hover:bg-red-700 text-white'
                                }`}
                        >
                            <FaStop />
                            Stop
                        </button>
                        <button
                            onClick={resetWorkflow}
                            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md font-medium transition-colors flex items-center gap-2"
                        >
                            <FaUndo />
                            Reset
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex h-[calc(100vh-100px)]">
                {/* Left Sidebar - Node Palette */}
                <div className="w-64 bg-white border-r border-gray-200 p-4 overflow-y-auto">
                    <NodePalette onAddNode={addNode} />

                    {/* Workflow Status */}
                    <div className="mt-6 bg-white border border-gray-200 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">Workflow Status</h3>
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600">Status</span>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${workflowStatus === 'running' ? 'bg-yellow-100 text-yellow-800' :
                                    workflowStatus === 'completed' ? 'bg-green-100 text-green-800' :
                                        workflowStatus === 'stopped' ? 'bg-red-100 text-red-800' :
                                            workflowStatus === 'failed' ? 'bg-red-100 text-red-800' :
                                                'bg-gray-100 text-gray-800'
                                    }`}>
                                    {workflowStatus.charAt(0).toUpperCase() + workflowStatus.slice(1)}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600">Nodes</span>
                                <span className="text-sm font-medium">{nodes.length}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600">Connections</span>
                                <span className="text-sm font-medium">{edges.length}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600">Completed</span>
                                <span className="text-sm font-medium text-green-600">
                                    {nodes.filter(n => n.data.status === 'completed').length}/{nodes.length}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="mt-4">
                        <button
                            onClick={() => setIsLogPanelOpen(!isLogPanelOpen)}
                            className="w-full px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                            <FaTerminal />
                            {isLogPanelOpen ? 'Hide Logs' : 'Show Logs'}
                        </button>
                    </div>
                </div>

                {/* Main Workflow Area */}
                <div className="flex-1 relative" ref={reactFlowWrapper}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onNodeClick={onNodeClick}
                        onNodeContextMenu={onNodeContextMenu}
                        onPaneClick={onPaneClick}
                        onDrop={onDrop}
                        onDragOver={onDragOver}
                        onInit={setReactFlowInstance}
                        nodeTypes={nodeTypes}
                        connectionMode={ConnectionMode.Loose}
                        fitView
                        minZoom={0.5}
                        maxZoom={2}
                        className="bg-gray-50"
                    >
                        <Background color="#e5e7eb" gap={20} />
                        <Controls className="bg-white border border-gray-200 rounded-lg shadow-sm" />
                        <MiniMap
                            className="bg-white border border-gray-200 rounded-lg shadow-sm"
                            nodeColor={(node) => {
                                const status = node.data?.status;
                                if (status === 'completed') return '#10B981';
                                if (status === 'running') return '#F59E0B';
                                if (status === 'failed') return '#EF4444';
                                return '#9CA3AF';
                            }}
                        />

                        {/* Drop zone indicator */}
                        <Panel position="top-center" className="bg-blue-100 border border-blue-300 rounded-lg shadow-sm p-2 text-blue-700 text-sm">
                            📦 Drop operations here to add to workflow
                        </Panel>
                    </ReactFlow>
                </div>
            </div>

            {/* Parameter Configuration Modal */}
            <ParameterModal
                node={selectedNode}
                isOpen={isParameterModalOpen}
                onClose={() => {
                    setIsParameterModalOpen(false);
                }}
                onSave={saveNodeParameters}
            />

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="fixed bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1"
                    style={{
                        left: contextMenu.x,
                        top: contextMenu.y
                    }}
                >
                    <button
                        onClick={() => {
                            runSingleNode(contextMenu.nodeId);
                            setContextMenu(null);
                        }}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-green-700 hover:bg-green-50 w-full text-left"
                    >
                        <FaPlay />
                        Run This Node
                    </button>
                    <button
                        onClick={() => {
                            const node = nodes.find(n => n.id === contextMenu.nodeId);
                            setSelectedNode(node);
                            setIsParameterModalOpen(true);
                            setContextMenu(null);
                        }}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
                    >
                        <FaEdit />
                        Edit Parameters
                    </button>
                    <button
                        onClick={() => {
                            const node = nodes.find(n => n.id === contextMenu.nodeId);
                            if (node) openValidationModal(node);
                            setContextMenu(null);
                        }}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 w-full text-left"
                    >
                        <FaCog />
                        Configure Validations
                    </button>
                    <button
                        onClick={() => {
                            const node = nodes.find(n => n.id === contextMenu.nodeId);
                            if (node) viewNodeLogs(node);
                            setContextMenu(null);
                        }}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
                    >
                        <FaTerminal />
                        View Logs
                    </button>
                    <hr className="my-1" />
                    <button
                        onClick={() => {
                            deleteSelectedNode();
                        }}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left"
                    >
                        <FaTrash />
                        Delete Node
                    </button>
                </div>
            )}

            {/* Log Panel */}
            <LogPanel
                taskId={selectedTaskForLogs?.taskId}
                nodeId={selectedTaskForLogs?.nodeId}
                isOpen={isLogPanelOpen}
                onClose={() => setIsLogPanelOpen(false)}
                taskStatus={selectedTaskForLogs?.status}
            />

            {/* Full-screen Log Viewer */}
            {logViewerTask && (
                <ETLLogViewer
                    taskId={logViewerTask.taskId}
                    nodeId={logViewerTask.nodeId}
                    taskStatus={logViewerTask.status}
                    onClose={() => setLogViewerTask(null)}
                />
            )}

            {/* Workflow List Modal */}
            {showWorkflowList && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
                    onClick={() => setShowWorkflowList(false)}
                >
                    <div
                        className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900">
                                📂 Saved Workflows
                            </h3>
                            <button
                                onClick={() => setShowWorkflowList(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <FaTimesCircle size={20} />
                            </button>
                        </div>

                        {savedWorkflows.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                <FaFolderOpen className="mx-auto text-4xl mb-3 text-gray-300" />
                                <p>No saved workflows yet</p>
                                <p className="text-sm mt-1">Create a workflow and click Save to store it</p>
                            </div>
                        ) : (
                            <div className="overflow-y-auto flex-1">
                                <table className="w-full">
                                    <thead className="bg-gray-50 sticky top-0">
                                        <tr>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nodes</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Updated</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {savedWorkflows.map((workflow) => (
                                            <tr key={workflow.workflow_id} className="hover:bg-gray-50">
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-gray-900">{workflow.name}</div>
                                                    {workflow.description && (
                                                        <div className="text-xs text-gray-500">{workflow.description}</div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-600">
                                                    {workflow.node_count} nodes, {workflow.edge_count} edges
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-500">
                                                    {workflow.updated_at ? new Date(workflow.updated_at).toLocaleString() : '-'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => loadWorkflow(workflow.workflow_id)}
                                                            disabled={isLoading}
                                                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
                                                        >
                                                            Load
                                                        </button>
                                                        <button
                                                            onClick={() => deleteWorkflow(workflow.workflow_id, workflow.name)}
                                                            className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-sm font-medium transition-colors"
                                                        >
                                                            <FaTrash />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center">
                            <span className="text-sm text-gray-500">
                                {savedWorkflows.length} workflow{savedWorkflows.length !== 1 ? 's' : ''} saved
                            </span>
                            <button
                                onClick={() => setShowWorkflowList(false)}
                                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md text-sm font-medium"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Failure Modal */}
            <FailureModal
                isOpen={isFailureModalOpen}
                onClose={() => setIsFailureModalOpen(false)}
                failureInfo={failureInfo}
                onViewLogs={(taskId, nodeId) => {
                    setLogViewerTask({
                        taskId,
                        nodeId,
                        status: 'failed'
                    });
                    setIsFailureModalOpen(false);
                }}
                onRetryNode={(nodeId) => {
                    setIsFailureModalOpen(false);
                    runSingleNode(nodeId);
                }}
            />

            {/* Validation Configuration Modal */}
            <ValidationConfigModal
                isOpen={isValidationModalOpen}
                onClose={() => {
                    setIsValidationModalOpen(false);
                    setValidationNode(null);
                }}
                onSave={saveNodeValidations}
                nodeId={validationNode?.id}
                nodeName={validationNode?.data?.label || validationNode?.id}
                nodeType={validationNode?.data?.type}
                initialValidations={validationNode?.data?.validations || []}
                columns={validationNode?.data?.output?.columns || []}
            />
        </div>
    );
}

// Wrapper with ReactFlowProvider
export default function WorkflowTool({ instanceId }) {
    return (
        <ReactFlowProvider>
            <WorkflowToolInner instanceId={instanceId} />
        </ReactFlowProvider>
    );
}

