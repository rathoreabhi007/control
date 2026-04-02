// Converted from Next.js to Create React App

import { useState, useCallback, useEffect, useMemo, createContext, useContext } from 'react';
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
    FaCog,
    FaCheckCircle,
    FaTimesCircle,
    FaTrash,
    FaTable,
    FaEye,
    FaEdit,
    FaDownload,
    FaSpinner,
    FaExclamationTriangle,
    FaTerminal, FaSave, FaFolderOpen,
    FaCode
} from 'react-icons/fa';
import HSBCLogo from '../../components/HSBCLogo';
import DataOutputTab from '../../components/DataOutput/DataOutputTab';
import DataGrid from '../../components/DataGrid/DataGrid';
import DataGridFilters from '../../components/DataGridFilters';
import LoadWorkflowModal from '../../components/LoadWorkflowModal';
import FailureModal from '../../components/FailureModal';
import ValidationConfigModal from '../../components/ValidationConfigModal';
import { useUser } from '../../contexts/UserContext';

const API_BASE_URL = 'http://127.0.0.1:8000';

// Context for node actions
const WorkflowActionContext = createContext({
    onRunNode: () => { },
    onViewData: () => { },
    onViewLogs: () => { }
});

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
        parameters: {
            condition: { type: 'string', label: 'Filter Condition', required: true, placeholder: 'column > 100 AND status == "active"' },
            case_sensitive: { type: 'boolean', label: 'Case Sensitive', required: false, default: false }
        }
    },
    [NODE_TYPES.JOIN]: {
        label: 'Join Data',
        icon: FaLink,
        color: '#8B5CF6',
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
        parameters: {
            output_type: { type: 'select', label: 'Output Type', required: true, default: 'preview', options: ['preview', 'download', 'save'] },
            max_rows: { type: 'number', label: 'Max Rows', required: false, default: 1000, placeholder: '1000' }
        }
    },
    [NODE_TYPES.PIVOT_TABLE]: {
        label: 'Pivot Table',
        icon: FaTable,
        color: '#6366F1',
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
        parameters: {
            script: { type: 'textarea', label: 'Python Script', required: true, rows: 12, default: 'def process(df1):\n    # Your code here\n    # df1, df2, etc. are Polars DataFrames from connected inputs\n    # Must return a single Polars or Pandas DataFrame\n    result = df1\n    return result', placeholder: 'def process(df1):\n    result = df1\n    return result' },
            function_name: { type: 'string', label: 'Function Name', required: false, default: 'process', placeholder: 'process' }
        }
    }
};

// Custom Node Component
const DataNode = ({ data, id, selected }) => {
    const nodeDef = NODE_DEFINITIONS[data.type];
    const Icon = nodeDef.icon;
    const { onRunNode, onViewData, onViewLogs } = useContext(WorkflowActionContext);

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

    const handleRunClick = (e) => {
        e.stopPropagation();
        onRunNode(id);
    };

    const handleViewDataClick = (e) => {
        e.stopPropagation();
        onViewData(id);
    };

    const handleViewLogsClick = (e) => {
        e.stopPropagation();
        onViewLogs(id);
    };

    return (
        <div className={`rounded-lg border-2 shadow-lg transition-all duration-200 overflow-hidden ${selected
            ? 'border-blue-500 shadow-blue-500/20'
            : !isConfigured
                ? 'border-orange-400 shadow-orange-400/20'
                : 'border-gray-200 hover:border-gray-300'
            }`} style={{ backgroundColor: 'white', minWidth: '180px' }}>
            {/* Main content area */}
            <div className="px-4 py-3">
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
                        <div className="font-medium text-gray-900 text-sm truncate">
                            {nodeDef.label}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                            {data.label || data.id}
                        </div>
                        {!isConfigured && (
                            <div className="text-xs text-orange-600 mt-1">
                                Configure parameters
                            </div>
                        )}
                        {data.status === 'failed' && (
                            <div className="text-xs text-red-600 mt-1 truncate">
                                Failed
                            </div>
                        )}
                    </div>
                </div>

                <Handle
                    type="source"
                    position={Position.Right}
                    className="w-3 h-3 bg-gray-400 border-2 border-white"
                />
            </div>

            {/* Action Bar - Only show on hover or selected */}
            <div className="flex border-t border-gray-100 bg-gray-50 items-center divide-x divide-gray-200">
                <button
                    onClick={handleRunClick}
                    className={`flex-1 py-1.5 flex justify-center items-center hover:bg-green-50 text-green-600 transition-colors ${data.status === 'running' ? 'animate-pulse' : ''}`}
                    title="Run Node"
                >
                    {data.status === 'running' ? <FaSpinner className="animate-spin text-xs" /> : <FaPlay className="text-xs" />}
                </button>

                {data.status === 'completed' && (
                    <button
                        onClick={handleViewDataClick}
                        className="flex-1 py-1.5 flex justify-center items-center hover:bg-blue-50 text-blue-600 transition-colors"
                        title="View Data"
                    >
                        <FaTable className="text-xs" />
                    </button>
                )}

                {(data.status === 'completed' || data.status === 'failed') && (
                    <button
                        onClick={handleViewLogsClick}
                        className="flex-1 py-1.5 flex justify-center items-center hover:bg-gray-100 text-gray-600 transition-colors"
                        title="View Logs"
                    >
                        <FaTerminal className="text-xs" />
                    </button>
                )}
            </div>

            {/* Status Indicator (Top Right Corner) */}
            <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${data.status === 'completed' ? 'bg-green-500' :
                data.status === 'running' ? 'bg-yellow-500' :
                    data.status === 'failed' ? 'bg-red-500' :
                        'hidden'
                }`} />
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

    if (!isOpen || !node || !nodeDef) {
        /* console.log('ParameterModal Debug - Modal not showing:', {
            isOpen,
            node: !!node,
            nodeDef: !!nodeDef,
            nodeType: node?.data?.type,
            availableTypes: Object.keys(NODE_DEFINITIONS)
        }); */
        return null;
    }

    /* console.log('ParameterModal Debug - Modal should show:', {
        isOpen,
        nodeType: node?.data?.type,
        nodeDef: nodeDef?.label,
        parameters: Object.keys(nodeDef.parameters || {})
    }); */

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

// Node Palette Component
const NodePalette = ({ onAddNode }) => {
    return (
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Data Operations</h3>
            <p className="text-xs text-gray-600 mb-3">
                Click on nodes after adding them to configure parameters
            </p>
            <div className="space-y-2">
                {Object.entries(NODE_DEFINITIONS).map(([type, def]) => {
                    const Icon = def.icon;
                    return (
                        <button
                            key={type}
                            onClick={() => onAddNode(type)}
                            className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
                            title={`Add ${def.label} node. Click on the node after adding to configure parameters.`}
                        >
                            <div
                                className="p-1 rounded"
                                style={{ backgroundColor: `${def.color}20` }}
                            >
                                <Icon className="text-sm" style={{ color: def.color }} />
                            </div>
                            <span>{def.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

// Log Panel Component
const LogPanel = ({ sessionId, nodeId, nodeName, isOpen, onClose, userId }) => {
    const [logs, setLogs] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const loadLogs = async () => {
            if (!sessionId || !nodeId || !isOpen) return;

            setLoading(true);
            try {
                const response = await fetch(`${API_BASE_URL}/api/workflows/session/${sessionId}/nodes/${nodeId}/logs`, {
                    headers: {
                        'x-user-id': userId || 'anonymous'
                    }
                });
                if (response.ok) {
                    const data = await response.json();
                    setLogs(data.logs || 'No logs available.');
                } else {
                    setLogs('Failed to load logs.');
                }
            } catch (error) {
                setLogs(`Error loading logs: ${error.message}`);
            } finally {
                setLoading(false);
            }
        };

        if (isOpen) {
            loadLogs();
        }
    }, [sessionId, nodeId, isOpen, userId]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-96 bg-gray-900 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out border-l border-gray-700 font-mono text-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
                <div className="flex items-center gap-2 text-gray-100">
                    <FaTerminal className="text-gray-400" />
                    <span className="font-semibold truncate max-w-[200px]">{nodeName || nodeId}</span>
                </div>
                <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-white p-1 hover:bg-gray-700 rounded transition-colors"
                >
                    <FaTimesCircle />
                </button>
            </div>
            <div className="flex-1 overflow-auto p-4 text-gray-300 whitespace-pre-wrap">
                {loading ? (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        <FaSpinner className="animate-spin text-2xl mb-2" />
                        <span className="block">Loading logs...</span>
                    </div>
                ) : (
                    logs || <span className="text-gray-600 italic">No output logs recorded.</span>
                )}
            </div>
        </div>
    );
};

export default function WorkflowTool({ instanceId }) {
    // Get user context for API calls
    const { currentUser } = useUser();
    const userId = currentUser?.id || currentUser?.username || 'anonymous';

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [selectedNode, setSelectedNode] = useState(null);
    const [isParameterModalOpen, setIsParameterModalOpen] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [workflowStatus, setWorkflowStatus] = useState('idle');
    const [selectedNodeForOutput, setSelectedNodeForOutput] = useState(null);
    const [isOutputPanelOpen, setIsOutputPanelOpen] = useState(false);
    const [nodeOutputs, setNodeOutputs] = useState({});

    // Session management state
    const [sessionId, setSessionId] = useState(null);
    const [executionError, setExecutionError] = useState(null);

    // Data grid state
    const [gridData, setGridData] = useState([]);
    const [isGridLoading, setIsGridLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [totalRows, setTotalRows] = useState(0);
    const [selectedNodeForGrid, setSelectedNodeForGrid] = useState(null);
    const [isGridVisible, setIsGridVisible] = useState(false);
    const [contextMenu, setContextMenu] = useState(null);

    // Failure modal state
    const [failureInfo, setFailureInfo] = useState(null);
    const [isFailureModalOpen, setIsFailureModalOpen] = useState(false);

    // Validation config modal state
    const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
    const [validationNode, setValidationNode] = useState(null);

    // Log panel state
    const [isLogPanelOpen, setIsLogPanelOpen] = useState(false);
    const [selectedNodeForLogs, setSelectedNodeForLogs] = useState(null);

    // Data Grid state
    const [gridFilters, setGridFilters] = useState([]);
    const [gridVisibleColumns, setGridVisibleColumns] = useState(null);
    const [gridAllColumns, setGridAllColumns] = useState([]);
    const [panelHeight, setPanelHeight] = useState(400);
    const [isResizing, setIsResizing] = useState(false);

    // Resize handlers
    const handleMouseDown = useCallback((e) => {
        setIsResizing(true);
        e.preventDefault();
    }, []);

    const handleMouseMove = useCallback((e) => {
        if (!isResizing) return;
        const newHeight = window.innerHeight - e.clientY;
        // Min height 200px, max height window - 100px
        if (newHeight > 200 && newHeight < window.innerHeight - 100) {
            setPanelHeight(newHeight);
        }
    }, [isResizing]);

    const handleMouseUp = useCallback(() => {
        setIsResizing(false);
    }, []);

    useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'ns-resize';
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'default';
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'default';
        };
    }, [isResizing, handleMouseMove, handleMouseUp]);

    const nodeTypes = useMemo(() => ({
        dataNode: DataNode
    }), []);

    // Load workflow modal state
    const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);

    // Effect to lazy load data for Data Output view
    useEffect(() => {
        if (!selectedNodeForOutput || !sessionId) return;

        const nodeId = selectedNodeForOutput.id;
        const output = nodeOutputs[nodeId];

        // Only load if table is empty but has rows
        if (output && output.count > 0 &&
            (!output.calculation_results.table || output.calculation_results.table.length === 0)) {

            const loadPreview = async () => {
                try {
                    const response = await fetch(
                        `${API_BASE_URL}/api/workflows/session/${sessionId}/data/${nodeId}?page=1&page_size=50`,
                        {
                            headers: { 'x-user-id': userId }
                        }
                    );

                    if (response.ok) {
                        const result = await response.json();
                        const headers = result.columns || [];
                        const rows = (result.data || []).map(row =>
                            headers.map(col => row[col] !== undefined ? row[col] : '')
                        );

                        setNodeOutputs(prev => ({
                            ...prev,
                            [nodeId]: {
                                ...prev[nodeId],
                                calculation_results: {
                                    ...prev[nodeId].calculation_results,
                                    table: rows
                                }
                            }
                        }));
                    }
                } catch (err) {
                    console.error('Error loading output preview:', err);
                }
            };

            loadPreview();
        }
    }, [selectedNodeForOutput, sessionId, userId, nodeOutputs]);

    // Add new node
    const addNode = useCallback((type) => {
        const newNode = {
            id: `${type}_${Date.now()}`,
            type: 'dataNode',
            position: { x: 100, y: 100 },
            data: {
                type,
                label: NODE_DEFINITIONS[type].label,
                status: 'idle',
                parameters: {}
            }
        };
        setNodes(nds => [...nds, newNode]);
    }, [setNodes]);

    // Handle node selection
    const onNodeClick = useCallback((event, node) => {
        // console.log('Node clicked:', node);
        // console.log('Node data:', node.data);
        // console.log('Node type:', node.data.type);
        // console.log('Available types:', Object.keys(NODE_DEFINITIONS));
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

    // Run workflow - calls real backend API
    const runWorkflow = useCallback(async () => {
        setIsRunning(true);
        setWorkflowStatus('running');
        setExecutionError(null);

        // Reset all node statuses to pending
        setNodes(nds => nds.map(n => ({
            ...n,
            data: { ...n.data, status: 'pending' }
        })));

        try {
            // Prepare workflow data for API
            const workflowData = {
                workflow_id: instanceId,
                workflow_name: `Workflow ${instanceId}`,
                nodes: nodes.map(n => ({
                    id: n.id,
                    data: {
                        type: n.data.type,
                        parameters: n.data.parameters || {}
                    }
                })),
                edges: edges.map(e => ({
                    source: e.source,
                    target: e.target
                }))
            };

            // Call the execute endpoint
            const response = await fetch(`${API_BASE_URL}/api/workflows/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId
                },
                body: JSON.stringify(workflowData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Workflow execution failed');
            }

            const result = await response.json();

            // Store session ID for data retrieval
            setSessionId(result.session_id);

            // Update node statuses from results
            if (result.results) {
                Object.entries(result.results).forEach(([nodeId, nodeResult]) => {
                    setNodes(nds => nds.map(n =>
                        n.id === nodeId
                            ? { ...n, data: { ...n.data, status: nodeResult.status || 'completed' } }
                            : n
                    ));

                    // Store node outputs for display
                    if (nodeResult.status === 'completed') {
                        setNodeOutputs(prev => ({
                            ...prev,
                            [nodeId]: {
                                calculation_results: {
                                    headers: nodeResult.columns || [],
                                    table: [],
                                    table_size: `${nodeResult.columns?.length || 0}x${nodeResult.row_count || 0}`
                                },
                                count: nodeResult.row_count || 0
                            }
                        }));
                    }
                });
            }

            setWorkflowStatus(result.status || 'completed');

            if (result.error) {
                setExecutionError(result.error);
            }

        } catch (error) {
            setExecutionError(error.message);
            setWorkflowStatus('failed');

            // Mark all pending nodes as failed
            setNodes(nds => nds.map(n => ({
                ...n,
                data: {
                    ...n.data,
                    status: n.data.status === 'pending' ? 'failed' : n.data.status
                }
            })));
        } finally {
            setIsRunning(false);
        }
    }, [nodes, edges, instanceId, userId, setNodes]);

    // Stop workflow
    const stopWorkflow = useCallback(() => {
        setIsRunning(false);
        setWorkflowStatus('stopped');
        setNodes(nds => nds.map(node => ({
            ...node,
            data: { ...node.data, status: 'idle' }
        })));
    }, [setNodes]);

    // Reset workflow and cleanup session
    const resetWorkflow = useCallback(async () => {
        // Cleanup session on backend if exists
        if (sessionId) {
            try {
                await fetch(`${API_BASE_URL}/api/workflows/session/${sessionId}`, {
                    method: 'DELETE',
                    headers: {
                        'x-user-id': userId
                    }
                });
            } catch (error) {
                console.error('Error cleaning up session:', error);
            }
        }

        setWorkflowStatus('idle');
        setNodes(nds => nds.map(node => ({
            ...node,
            data: { ...node.data, status: 'idle' }
        })));
        setNodeOutputs({});
        setSelectedNodeForOutput(null);
        setIsOutputPanelOpen(false);
        setSessionId(null);
        setExecutionError(null);
        setGridData([]);
        setIsGridVisible(false);
    }, [setNodes, sessionId, userId]);

    // Save Workflow
    const saveWorkflow = useCallback(async () => {
        const name = prompt('Enter workflow name:', `Workflow ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`);
        if (!name) return;

        try {
            const workflowData = {
                name,
                description: 'Saved from UI',
                instance_id: instanceId,
                nodes: nodes.map(n => ({
                    id: n.id,
                    type: n.data.type, // Save simplified type structure
                    position: n.position,
                    data: {
                        type: n.data.type,
                        label: n.data.label,
                        parameters: n.data.parameters
                    }
                })),
                edges: edges
            };

            const response = await fetch(`${API_BASE_URL}/api/workflows/save`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId
                },
                body: JSON.stringify(workflowData)
            });

            if (!response.ok) throw new Error('Failed to save workflow');

            const result = await response.json();
            alert(`Workflow saved successfully! (v${result.version})`);

        } catch (error) {
            console.error('Error saving workflow:', error);
            alert(`Error saving workflow: ${error.message}`);
        }
    }, [nodes, edges, instanceId, userId]);

    // Load Workflow
    const loadWorkflow = useCallback(async (workflowId) => {
        try {
            setIsLoadModalOpen(false);
            const response = await fetch(`${API_BASE_URL}/api/workflows/load/${workflowId}`, {
                headers: {
                    'x-user-id': userId
                }
            });

            if (!response.ok) throw new Error('Failed to load workflow');

            const { workflow } = await response.json();

            // Reset state
            setSessionId(null);
            setNodeOutputs({});
            setGridData([]);
            setIsGridVisible(false);
            setWorkflowStatus('idle');
            setExecutionError(null);

            // Restore nodes and edges
            // Need to reconstruct full node objects from saved data
            const restoredNodes = workflow.nodes.map(n => ({
                id: n.id,
                type: 'dataNode', // Always dataNode for now
                position: n.position,
                data: {
                    type: n.data.type,
                    label: n.data.label || NODE_DEFINITIONS[n.data.type]?.label || n.data.type,
                    status: 'idle',
                    parameters: n.data.parameters || {}
                }
            }));

            setNodes(restoredNodes);
            setEdges(workflow.edges);

            // Optionally update instanceId if we want to track loaded workflow
            // setInstanceId(workflow.instance_id || `loaded-${workflowId}-${Date.now()}`);

        } catch (error) {
            console.error('Error loading workflow:', error);
            alert(`Error loading workflow: ${error.message}`);
        }
    }, [setNodes, setEdges, userId]);

    // Delete selected node
    const deleteSelectedNode = useCallback(() => {
        if (selectedNode) {
            setNodes(nds => nds.filter(node => node.id !== selectedNode.id));
            setEdges(eds => eds.filter(edge =>
                edge.source !== selectedNode.id && edge.target !== selectedNode.id
            ));
            setSelectedNode(null);
        }
    }, [selectedNode, setNodes, setEdges]);

    // Load data for grid - calls real backend API
    const loadGridData = useCallback(async (nodeId, page = 1, size = 25, filtersOverride = null, colsOverride = null) => {
        if (!nodeId || !sessionId) {
            setGridData([]);
            setTotalRows(0);
            setSelectedNodeForGrid(nodeId);
            setIsGridVisible(true);
            return;
        }

        setIsGridLoading(true);
        // Use overrides if provided, otherwise use current state
        const activeFilters = filtersOverride !== null ? filtersOverride : gridFilters;
        const activeColumns = colsOverride !== null ? colsOverride : gridVisibleColumns;

        try {
            // Use filtering endpoint
            const response = await fetch(
                `${API_BASE_URL}/api/workflows/session/${sessionId}/data/${nodeId}/filtered`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-user-id': userId
                    },
                    body: JSON.stringify({
                        filters: activeFilters,
                        columns: activeColumns,
                        page: page,
                        page_size: size
                    })
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to load data');
            }

            const result = await response.json();

            // Convert API response to grid format
            // API returns: { data: [{col1: val1, ...}, ...], columns: [...], total_rows: N }
            const resultColumns = result.columns || [];

            // Map list of dicts to list of lists (DataGrid format)
            const headers = resultColumns;
            const rows = (result.data || []).map(row =>
                headers.map(col => row[col] !== undefined ? row[col] : '')
            );

            setGridData([headers, ...rows]);
            setTotalRows(result.pagination?.total_rows || result.total_rows || 0);
            setCurrentPage(result.pagination?.page || page);
            setPageSize(result.pagination?.page_size || size);

            // Update available columns metadata
            setGridAllColumns(result.all_columns || result.columns || []);

            setSelectedNodeForGrid(nodeId);
            setIsGridVisible(true);

        } catch (error) {
            console.error('Error loading grid data:', error);
            setGridData([]);
            setTotalRows(0);
            setExecutionError(`Failed to load data: ${error.message}`);
        } finally {
            setIsGridLoading(false);
        }
    }, [sessionId, userId, gridFilters, gridVisibleColumns]);

    // Handle filter changes
    const handleFiltersChange = useCallback((newFilters) => {
        setGridFilters(newFilters);
        if (selectedNodeForGrid) {
            loadGridData(selectedNodeForGrid, 1, pageSize, newFilters, null);
        }
    }, [selectedNodeForGrid, pageSize, loadGridData]);

    // Handle column visibility changes
    const handleColumnsChange = useCallback((newColumns) => {
        setGridVisibleColumns(newColumns);
        if (selectedNodeForGrid) {
            loadGridData(selectedNodeForGrid, 1, pageSize, null, newColumns);
        }
    }, [selectedNodeForGrid, pageSize, loadGridData]);

    // Handle page change
    const handlePageChange = useCallback((page) => {
        loadGridData(selectedNodeForGrid, page, pageSize);
    }, [selectedNodeForGrid, pageSize, loadGridData]);

    // Handle page size change
    const handlePageSizeChange = useCallback((newSize) => {
        loadGridData(selectedNodeForGrid, 1, newSize);
    }, [selectedNodeForGrid, loadGridData]);

    // View data for a node
    const viewNodeData = useCallback((nodeOrId) => {
        const nodeId = typeof nodeOrId === 'string' ? nodeOrId : nodeOrId?.id;
        const node = typeof nodeOrId === 'string'
            ? nodes.find(n => n.id === nodeOrId)
            : nodeOrId;

        if (node && node.data.status === 'completed') {
            loadGridData(nodeId, 1, pageSize);
        }
    }, [loadGridData, pageSize, nodes]);

    // Run a single node (using cached upstream data)
    const runSingleNode = useCallback(async (nodeId) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;

        // Check if we have a session from previous run
        if (!sessionId) {
            alert('Please run the full workflow first to create a session with upstream data.');
            return;
        }

        // Update node status to running
        setNodes(nds => nds.map(n =>
            n.id === nodeId
                ? { ...n, data: { ...n.data, status: 'running' } }
                : n
        ));

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
                    'x-user-id': userId
                },
                body: JSON.stringify({
                    session_id: sessionId,
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

            if (result.status === 'completed') {
                setNodes(nds => nds.map(n =>
                    n.id === nodeId
                        ? { ...n, data: { ...n.data, status: 'completed' } }
                        : n
                ));

                // Update node outputs
                setNodeOutputs(prev => ({
                    ...prev,
                    [nodeId]: {
                        calculation_results: {
                            headers: result.columns || [],
                            table: [],
                            table_size: `${result.columns?.length || 0}x${result.row_count || 0}`
                        },
                        count: result.row_count || 0
                    }
                }));
            } else {
                setNodes(nds => nds.map(n =>
                    n.id === nodeId
                        ? { ...n, data: { ...n.data, status: 'failed' } }
                        : n
                ));

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
            setNodes(nds => nds.map(n =>
                n.id === nodeId
                    ? { ...n, data: { ...n.data, status: 'failed' } }
                    : n
            ));

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
    }, [nodes, edges, sessionId, userId, setNodes]);

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

    // View logs for a node
    const viewNodeLogs = useCallback((nodeOrId) => {
        // const nodeId = typeof nodeOrId === 'string' ? nodeOrId : nodeOrId?.id;
        const node = typeof nodeOrId === 'string'
            ? nodes.find(n => n.id === nodeOrId)
            : nodeOrId;

        if (node) {
            setSelectedNodeForLogs(node);
            setIsLogPanelOpen(true);
        }
    }, [nodes]);

    // Context value for nodes
    const contextValue = useMemo(() => ({
        onRunNode: runSingleNode,
        onViewData: viewNodeData,
        onViewLogs: viewNodeLogs
    }), [runSingleNode, viewNodeData, viewNodeLogs]);

    return (
        <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5', color: 'black' }}>
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
                    <div className="flex-1 flex justify-center gap-4">
                        <button
                            onClick={saveWorkflow}
                            className="px-4 py-2 bg-white text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors flex items-center gap-2"
                        >
                            <FaSave /> Save
                        </button>
                        <button
                            onClick={() => setIsLoadModalOpen(true)}
                            className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
                        >
                            <FaFolderOpen /> Load
                        </button>
                        <h1 className="text-2xl font-bold text-black text-center pt-1">
                            DATA WORKFLOW TOOL
                        </h1>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-3">
                        <button
                            onClick={runWorkflow}
                            disabled={isRunning || nodes.length === 0}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${isRunning || nodes.length === 0
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-green-600 hover:bg-green-700 text-white'
                                }`}
                        >
                            <FaPlay className="inline mr-1" />
                            Run
                        </button>
                        <button
                            onClick={stopWorkflow}
                            disabled={!isRunning}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${!isRunning
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-red-600 hover:bg-red-700 text-white'
                                }`}
                        >
                            <FaStop className="inline mr-1" />
                            Stop
                        </button>
                        <button
                            onClick={resetWorkflow}
                            className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded-md text-sm font-medium transition-colors"
                        >
                            <FaUndo className="inline mr-1" />
                            Reset
                        </button>
                        {nodes.length > 0 && (
                            <button
                                onClick={() => {
                                    const unconfiguredNode = nodes.find(node => {
                                        const nodeDef = NODE_DEFINITIONS[node.data.type];
                                        if (!nodeDef.parameters) return false;
                                        const requiredParams = Object.entries(nodeDef.parameters)
                                            .filter(([_, param]) => param.required)
                                            .map(([key, _]) => key);
                                        return !requiredParams.every(param =>
                                            node.data.parameters && node.data.parameters[param] && node.data.parameters[param].toString().trim() !== ''
                                        );
                                    });
                                    if (unconfiguredNode) {
                                        setSelectedNode(unconfiguredNode);
                                        setIsParameterModalOpen(true);
                                    }
                                }}
                                className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-md text-sm font-medium transition-colors"
                            >
                                <FaEdit className="inline mr-1" />
                                Configure
                            </button>
                        )}
                        {selectedNode && (
                            <button
                                onClick={deleteSelectedNode}
                                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors"
                            >
                                <FaTrash className="inline mr-1" />
                                Delete
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex h-[calc(100vh-80px)]">
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
                                        workflowStatus === 'stopped' || workflowStatus === 'failed' ? 'bg-red-100 text-red-800' :
                                            'bg-gray-100 text-gray-800'
                                    }`}>
                                    {workflowStatus === 'running' && <FaSpinner className="inline mr-1 animate-spin" />}
                                    {workflowStatus.charAt(0).toUpperCase() + workflowStatus.slice(1)}
                                </span>
                            </div>
                            {sessionId && (
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600">Session</span>
                                    <span className="text-xs font-mono text-gray-500 truncate max-w-[100px]" title={sessionId}>
                                        {sessionId.substring(0, 8)}...
                                    </span>
                                </div>
                            )}
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600">Nodes</span>
                                <span className="text-sm font-medium">{nodes.length}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600">Connections</span>
                                <span className="text-sm font-medium">{edges.length}</span>
                            </div>
                            {nodes.length > 0 && (
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600">Configured</span>
                                    <span className={`text-sm font-medium ${nodes.every(node => {
                                        const nodeDef = NODE_DEFINITIONS[node.data.type];
                                        if (!nodeDef.parameters) return true;
                                        const requiredParams = Object.entries(nodeDef.parameters)
                                            .filter(([_, param]) => param.required)
                                            .map(([key, _]) => key);
                                        return requiredParams.every(param =>
                                            node.data.parameters && node.data.parameters[param] && node.data.parameters[param].toString().trim() !== ''
                                        );
                                    })
                                        ? 'text-green-600'
                                        : 'text-orange-600'
                                        }`}>
                                        {nodes.filter(node => {
                                            const nodeDef = NODE_DEFINITIONS[node.data.type];
                                            if (!nodeDef.parameters) return true;
                                            const requiredParams = Object.entries(nodeDef.parameters)
                                                .filter(([_, param]) => param.required)
                                                .map(([key, _]) => key);
                                            return requiredParams.every(param =>
                                                node.data.parameters && node.data.parameters[param] && node.data.parameters[param].toString().trim() !== ''
                                            );
                                        }).length}/{nodes.length}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Error Display */}
                        {executionError && (
                            <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-md">
                                <div className="flex items-start gap-2">
                                    <FaExclamationTriangle className="text-red-500 mt-0.5 flex-shrink-0" />
                                    <div className="text-xs text-red-700 break-words">
                                        {executionError}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Quick View Data Section */}
                        {sessionId && workflowStatus === 'completed' && (
                            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
                                <div className="text-xs font-medium text-green-800 mb-2">
                                    Workflow completed! View results:
                                </div>
                                <div className="space-y-1">
                                    {nodes.filter(n => n.data.status === 'completed').map(node => (
                                        <button
                                            key={node.id}
                                            onClick={() => viewNodeData(node)}
                                            className="w-full text-left px-2 py-1 text-xs bg-white border border-green-300 rounded hover:bg-green-100 transition-colors flex items-center gap-2"
                                        >
                                            <FaTable className="text-green-600" />
                                            <span className="truncate">{node.data.label}</span>
                                            <span className="text-gray-400 ml-auto">
                                                {nodeOutputs[node.id]?.count || 0} rows
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Workflow Area */}
                <div className="flex-1 relative">
                    <WorkflowActionContext.Provider value={contextValue}>
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={onConnect}
                            onNodeClick={onNodeClick}
                            onNodeContextMenu={onNodeContextMenu}
                            onPaneClick={onPaneClick}
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
                                nodeColor="#3B82F6"
                            />

                            {/* Output Panel Toggle */}
                            <Panel position="top-right" className="bg-white border border-gray-200 rounded-lg shadow-sm p-2">
                                <button
                                    onClick={() => setIsOutputPanelOpen(!isOutputPanelOpen)}
                                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                                >
                                    {isOutputPanelOpen ? 'Hide' : 'Show'} Output
                                </button>
                            </Panel>

                            {/* Grid Toggle */}
                            <Panel position="top-right" className="bg-white border border-gray-200 rounded-lg shadow-sm p-2" style={{ top: '60px' }}>
                                <button
                                    onClick={() => setIsGridVisible(!isGridVisible)}
                                    className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                                >
                                    <FaTable className="inline mr-1" />
                                    {isGridVisible ? 'Hide' : 'Show'} Grid
                                </button>
                            </Panel>
                        </ReactFlow>
                    </WorkflowActionContext.Provider>
                </div>

                {/* Right Sidebar - Output Panel */}
                {isOutputPanelOpen && (
                    <div className="w-80 bg-white border-l border-gray-200 p-4 overflow-y-auto">
                        <h3 className="text-sm font-semibold text-gray-900 mb-4">Data Output</h3>

                        {nodes.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                <FaCog className="mx-auto text-4xl mb-2" />
                                <p>Add nodes to see data output</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {nodes.map(node => {
                                    const output = nodeOutputs[node.id];
                                    const isCompleted = node.data.status === 'completed';

                                    return (
                                        <div
                                            key={node.id}
                                            className={`p-3 border rounded-lg transition-colors ${selectedNodeForOutput?.id === node.id
                                                ? 'border-blue-500 bg-blue-50'
                                                : 'border-gray-200 hover:border-gray-300'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-sm font-medium text-gray-900 truncate">
                                                    {node.data.label}
                                                </span>
                                                <div className={`w-2 h-2 rounded-full ${isCompleted ? 'bg-green-500' : 'bg-gray-300'
                                                    }`} />
                                            </div>
                                            <div className="text-xs text-gray-500 mb-2">
                                                {isCompleted && output
                                                    ? `${output.count} records`
                                                    : 'No data'
                                                }
                                            </div>
                                            {/* Action buttons for completed nodes */}
                                            {isCompleted && sessionId && (
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            viewNodeData(node);
                                                        }}
                                                        className="flex-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center justify-center gap-1"
                                                    >
                                                        <FaTable />
                                                        View Data
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedNodeForOutput(node);
                                                        }}
                                                        className="flex-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center justify-center gap-1"
                                                    >
                                                        <FaEye />
                                                        Details
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
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
                            setSelectedNodeForOutput(nodes.find(n => n.id === contextMenu.nodeId));
                            setContextMenu(null);
                        }}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
                    >
                        <FaEye />
                        View Output
                    </button>
                    <button
                        onClick={() => {
                            viewNodeData(contextMenu.nodeId);
                            setContextMenu(null);
                        }}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
                    >
                        <FaTable />
                        View Data Grid
                    </button>
                    <hr className="my-1" />
                    <button
                        onClick={() => {
                            deleteSelectedNode();
                            setContextMenu(null);
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
                sessionId={sessionId}
                nodeId={selectedNodeForLogs?.id}
                nodeName={selectedNodeForLogs?.data?.label}
                isOpen={isLogPanelOpen}
                onClose={() => setIsLogPanelOpen(false)}
                userId={userId}
            />

            {/* Load Workflow Modal */}
            <LoadWorkflowModal
                isOpen={isLoadModalOpen}
                onClose={() => setIsLoadModalOpen(false)}
                onLoad={loadWorkflow}
                userId={userId}
            />

            {/* Data Grid Panel */}
            {isGridVisible && (
                <div
                    className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40 flex flex-col transition-none"
                    style={{ height: `${panelHeight}px` }}
                >
                    {/* Resize Handle */}
                    <div
                        className="w-full h-1 bg-gray-200 hover:bg-blue-400 cursor-ns-resize transition-colors absolute top-0 left-0 right-0 z-50"
                        onMouseDown={handleMouseDown}
                        title="Drag to resize"
                    />

                    <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-none pt-5">
                        <h3 className="text-lg font-semibold text-gray-900">
                            Data Grid: {selectedNodeForGrid ? nodes.find(n => n.id === selectedNodeForGrid)?.data.label : 'No node selected'}
                        </h3>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => selectedNodeForGrid && loadGridData(selectedNodeForGrid, 1, pageSize)}
                                className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                            >
                                <FaDownload className="inline mr-1" />
                                Refresh
                            </button>
                            <button
                                onClick={() => setIsGridVisible(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <FaTimesCircle />
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 flex flex-col p-4 bg-gray-50/50 min-h-0">
                        <div className="mb-4 flex-none">
                            <DataGridFilters
                                columns={gridAllColumns}
                                initialFilters={gridFilters}
                                initialVisibleColumns={gridVisibleColumns}
                                onFiltersChange={handleFiltersChange}
                                onColumnsChange={handleColumnsChange}
                            />
                        </div>
                        <div className="flex-1 overflow-hidden bg-white rounded-lg shadow-sm border border-gray-200 min-h-0">
                            <DataGrid
                                data={gridData}
                                isLoading={isGridLoading}
                                onPageChange={handlePageChange}
                                onPageSizeChange={handlePageSizeChange}
                                currentPage={currentPage}
                                pageSize={pageSize}
                                totalRows={totalRows}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Data Output Modal */}
            {selectedNodeForOutput && nodeOutputs[selectedNodeForOutput.id] && (
                <div
                    key={`modal-${selectedNodeForOutput.id}`}
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
                >
                    <div className="bg-white rounded-lg w-[90vw] h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between p-4 border-b border-gray-200">
                            <h3 className="text-lg font-semibold text-gray-900">
                                Data Output: {selectedNodeForOutput.data.label}
                            </h3>
                            <button
                                onClick={() => setSelectedNodeForOutput(null)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <FaTimesCircle />
                            </button>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <DataOutputTab
                                key={`output-tab-${selectedNodeForOutput.id}`}
                                selectedNode={{
                                    id: selectedNodeForOutput.id,
                                    data: {
                                        output: nodeOutputs[selectedNodeForOutput.id]
                                    }
                                }}
                                bottomBarHeight={window.innerHeight * 0.8}
                                onError={(error) => console.error('Data Output Error:', error)}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Failure Modal */}
            <FailureModal
                isOpen={isFailureModalOpen}
                onClose={() => setIsFailureModalOpen(false)}
                failureInfo={failureInfo}
                onViewLogs={() => {
                    // Could add log viewer integration here
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
                columns={nodeOutputs[validationNode?.id]?.calculation_results?.headers || []}
            />
        </div>
    );
}
