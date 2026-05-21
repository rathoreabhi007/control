// Converted from Next.js to Create React App

import { useState, useCallback, useRef, useEffect, useMemo, useContext, memo } from 'react';
import ReactFlow, {
    Controls,
    Background,
    addEdge,
    ConnectionMode,
    useNodesState,
    useEdgesState,
    Handle,
    Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { FaCheckCircle, FaTimesCircle, FaSpinner, FaCircle, FaPlay, FaStop, FaUndo, FaChevronLeft, FaChevronUp, FaGripLines, FaTable, FaClock, FaCheck } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { ApiService } from '../../services/api';
import WebSocketService from '../../services/websocket';
import { useUser } from '../../contexts/UserContext';
import { buildDependencyMap, buildDownstreamMap, getAllDownstreamNodes } from '../../utils/graph-utils';
import {
    buildTempFilePath,
    getInstanceDisplayLabel,
    getTempFileSubfolderDisplay,
    migrateInstanceStorage,
    replaceRecentInstance,
    resolveRenamedInstanceId,
    upsertRecentInstance,
} from '../../utils/instance-id';
import { HandlerContext } from './HandlerContext';
import DataOutputTab from '../../components/DataOutput/DataOutputTab';
import UserAttributesIcon from '../../components/UserAttributesIcon';
import DocumentSearchIcon from '../../components/DocumentSearchIcon';
import LibraryBooksIcon from '../../components/LibraryBooksIcon';
import TableEditIcon from '../../components/TableEditIcon';
import DatasetLinkedIcon from '../../components/DatasetLinkedIcon';
import TableConvertIcon from '../../components/TableConvertIcon';
import StacksIcon from '../../components/StacksIcon';
import DataInfoAlertIcon from '../../components/DataInfoAlertIcon';
import OutputIcon from '../../components/OutputIcon';
import ChangeCircleIcon from '../../components/ChangeCircleIcon';
import HSBCLogo from '../../components/HSBCLogo';
import FailedNodeIndicator from '../../components/FailedNodeIndicator';
import ETLLogViewer from '../../components/ETL/ETLLogViewer';
import '../../styles/dataOutput.css';

// Node status types (removed TypeScript types for JavaScript)

// Constants for consistent styling and configuration
const CONSTANTS = {
    // UI Dimensions - Desktop Optimized
    MIN_SIDEBAR_WIDTH: 64,
    MAX_SIDEBAR_WIDTH: 600,
    MIN_BOTTOM_BAR_HEIGHT: 300,
    DEFAULT_SIDEBAR_WIDTH: 400,

    // Colors
    COLORS: {
        SLATE_600: '#334155',
        SLATE_500: '#475569',
        SLATE_400: '#64748b',
        SLATE_300: '#cbd5e1',
        GREEN_500: '#22c55e',
        RED_500: '#ef4444',
        YELLOW_400: '#facc15',
        ORANGE_500: '#f97316',
    },

    // Status Colors
    STATUS_COLORS: {
        completed: '#22c55e',
        failed: '#ef4444',
        running: '#facc15',
        stopped: '#ef4444',
        idle: '#64748b',
        queued: '#f97316' // Orange color for queued status
    },

    // API Configuration - Enhanced with timeout and retry
    POLLING_INTERVAL: 2000,           // 2 seconds between polls (improved from 1s)
    MAX_RETRIES: 3,                   // Retry failed requests 3 times
    REQUEST_TIMEOUT: 30000,           // 30 seconds timeout for API calls
    MAX_POLLING_ATTEMPTS: 900,        // 30 minutes max (900 * 2 seconds)
    HEALTH_CHECK_INTERVAL: 10000,     // Not used - health checks only at session start
    TASK_TIMEOUT_MINUTES: 30,         // Task timeout in minutes
    USE_LEGACY_MODE: false,           // Set to true for original behavior

    // Local Storage Keys
    STORAGE_KEYS: {
        PARAMS: 'validatedParams',
        NODE_OUTPUTS: 'nodeOutputs',
        NODES: 'nodes',
        PROCESS_IDS: 'processIds',
        UI_STATE: 'uiState'
    }
};

// Add these styles at the top of the file after imports
const styles = {
    selectedNode: {
        border: `2px solid ${CONSTANTS.COLORS.SLATE_600}`,
        boxShadow: `0 0 0 2px rgba(51, 65, 85, 0.2)`,
        transform: 'scale(1.02)',
        transition: 'all 0.2s ease'
    },
    hoveredNode: {
        border: `2px solid ${CONSTANTS.COLORS.SLATE_600}`,
        boxShadow: `0 0 0 2px rgba(51, 65, 85, 0.1)`,
        transform: 'scale(1.01)',
        transition: 'all 0.2s ease'
    }
};

// Function to create fresh initial nodes for each instance
const createInitialNodes = () => [
    // Initial nodes
    {
        id: 'reading_config_comp',
        type: 'custom',
        data: { fullName: 'Reading_Config_Comp', status: 'idle' },
        position: { x: 100, y: 250 },
        draggable: false
    },
    {
        id: 'read_src_comp',
        type: 'custom',
        data: { fullName: 'Read_SRC_Comp', status: 'idle' },
        position: { x: 300, y: 100 },
        draggable: false
    },
    {
        id: 'read_tgt_comp',
        type: 'custom',
        data: { fullName: 'Read_TGT_Comp', status: 'idle' },
        position: { x: 300, y: 400 },
        draggable: false
    },
    // Top flow nodes (SRC)
    {
        id: 'pre_harmonisation_src_comp',
        type: 'custom',
        data: { fullName: 'Reading & Pre-Harmonisation_SRC', status: 'idle' },
        position: { x: 500, y: 100 },
        draggable: false
    },
    {
        id: 'harmonisation_src_comp',
        type: 'custom',
        data: { fullName: 'Harmonisation_SRC', status: 'idle' },
        position: { x: 700, y: 100 },
        draggable: false
    },
    {
        id: 'enrichment_file_search_src_comp',
        type: 'custom',
        data: { fullName: 'Enrichment File Search_SRC', status: 'idle' },
        position: { x: 900, y: 100 },
        draggable: false
    },
    {
        id: 'enrichment_src_comp',
        type: 'custom',
        data: { fullName: 'Enrichment_SRC', status: 'idle' },
        position: { x: 1100, y: 100 },
        draggable: false
    },
    {
        id: 'data_transform_src_comp',
        type: 'custom',
        data: { fullName: 'Data Transform Post Enrichment_SRC', status: 'idle' },
        position: { x: 1300, y: 100 },
        draggable: false
    },
    {
        id: 'combine_data_comp',
        type: 'custom',
        data: { fullName: 'Combine SRC and TGT Data', status: 'idle' },
        position: { x: 1500, y: 250 },
        draggable: false
    },
    {
        id: 'apply_rules_comp',
        type: 'custom',
        data: { fullName: 'Apply Rec Rules & Break Explain', status: 'idle' },
        position: { x: 1700, y: 250 },
        draggable: false
    },
    {
        id: 'output_rules_comp',
        type: 'custom',
        data: { fullName: 'Output Rules', status: 'idle' },
        position: { x: 1900, y: 250 },
        draggable: false
    },
    {
        id: 'break_rolling_comp',
        type: 'custom',
        data: { fullName: 'BreakRolling Details', status: 'idle' },
        position: { x: 2100, y: 250 },
        draggable: false
    },
    // Bottom flow nodes (TGT)
    {
        id: 'pre_harmonisation_tgt_comp',
        type: 'custom',
        data: { fullName: 'Reading & Pre-Harmonisation_TGT', status: 'idle' },
        position: { x: 500, y: 400 },
        draggable: false
    },
    {
        id: 'harmonisation_tgt_comp',
        type: 'custom',
        data: { fullName: 'Harmonisation_TGT', status: 'idle' },
        position: { x: 700, y: 400 },
        draggable: false
    },
    {
        id: 'enrichment_file_search_tgt_comp',
        type: 'custom',
        data: { fullName: 'Enrichment File Search_TGT', status: 'idle' },
        position: { x: 900, y: 400 },
        draggable: false
    },
    {
        id: 'enrichment_tgt_comp',
        type: 'custom',
        data: { fullName: 'Enrichment_TGT', status: 'idle' },
        position: { x: 1100, y: 400 },
        draggable: false
    },
    {
        id: 'data_transform_tgt_comp',
        type: 'custom',
        data: { fullName: 'Data Transform Post Enrichment_TGT', status: 'idle' },
        position: { x: 1300, y: 400 },
        draggable: false
    }
];

// Function to create fresh initial edges for each instance
const createInitialEdges = () => [
    // Initial flow to SRC
    {
        id: 'config-to-read-src',
        source: 'reading_config_comp',
        target: 'read_src_comp',
        sourceHandle: 'reading_config_comp-source',
        targetHandle: 'read_src_comp-target',
        animated: false,
        style: { stroke: '#1e293b', strokeWidth: 2 }
    },
    // Initial flow to TGT
    {
        id: 'config-to-file-search-tgt',
        source: 'reading_config_comp',
        target: 'read_tgt_comp',
        sourceHandle: 'reading_config_comp-source',
        targetHandle: 'read_tgt_comp-target',
        animated: false,
        style: { stroke: '#1e293b', strokeWidth: 2 }
    },
    // Top flow edges (SRC)
    {
        id: 'read-src-to-pre-harmonisation-src',
        source: 'read_src_comp',
        target: 'pre_harmonisation_src_comp',
        sourceHandle: 'read_src_comp-source',
        targetHandle: 'pre_harmonisation_src_comp-target',
        type: 'straight',
        animated: false,
        style: { stroke: '#1e293b', strokeWidth: 2 }
    },
    {
        id: 'pre-harmonisation-to-harmonisation-src',
        source: 'pre_harmonisation_src_comp',
        target: 'harmonisation_src_comp',
        sourceHandle: 'pre_harmonisation_src_comp-source',
        targetHandle: 'harmonisation_src_comp-target',
        type: 'straight',
        animated: false,
        style: { stroke: '#1e293b', strokeWidth: 2 }
    },
    {
        id: 'harmonisation-to-enrichment-search-src',
        source: 'harmonisation_src_comp',
        target: 'enrichment_file_search_src_comp',
        sourceHandle: 'harmonisation_src_comp-source',
        targetHandle: 'enrichment_file_search_src_comp-target',
        type: 'straight',
        animated: false,
        style: { stroke: '#1e293b', strokeWidth: 2 }
    },
    {
        id: 'enrichment-search-to-enrichment-src',
        source: 'enrichment_file_search_src_comp',
        target: 'enrichment_src_comp',
        sourceHandle: 'enrichment_file_search_src_comp-source',
        targetHandle: 'enrichment_src_comp-target',
        type: 'straight',
        animated: false,
        style: { stroke: '#1e293b', strokeWidth: 2 }
    },
    {
        id: 'enrichment-to-transform',
        source: 'enrichment_src_comp',
        target: 'data_transform_src_comp',
        sourceHandle: 'enrichment_src_comp-source',
        targetHandle: 'data_transform_src_comp-target',
        type: 'straight',
        animated: false,
        style: { stroke: '#1e293b', strokeWidth: 2 }
    },
    {
        id: 'transform-to-combine',
        source: 'data_transform_src_comp',
        target: 'combine_data_comp',
        sourceHandle: 'data_transform_src_comp-source',
        targetHandle: 'combine_data_comp-target',
        animated: false,
        style: { stroke: '#1e293b', strokeWidth: 2 }
    },
    // Bottom flow edges (TGT)
    {
        id: 'read-tgt-to-pre-harmonisation-tgt',
        source: 'read_tgt_comp',
        target: 'pre_harmonisation_tgt_comp',
        sourceHandle: 'read_tgt_comp-source',
        targetHandle: 'pre_harmonisation_tgt_comp-target',
        type: 'straight',
        animated: false,
        style: { stroke: '#1e293b', strokeWidth: 2 }
    },
    {
        id: 'pre-harmonisation-to-harmonisation-tgt',
        source: 'pre_harmonisation_tgt_comp',
        target: 'harmonisation_tgt_comp',
        sourceHandle: 'pre_harmonisation_tgt_comp-source',
        targetHandle: 'harmonisation_tgt_comp-target',
        type: 'straight',
        animated: false,
        style: { stroke: '#1e293b', strokeWidth: 2 }
    },
    {
        id: 'harmonisation-to-enrichment-search-tgt',
        source: 'harmonisation_tgt_comp',
        target: 'enrichment_file_search_tgt_comp',
        sourceHandle: 'harmonisation_tgt_comp-source',
        targetHandle: 'enrichment_file_search_tgt_comp-target',
        type: 'straight',
        animated: false,
        style: { stroke: '#1e293b', strokeWidth: 2 }
    },
    {
        id: 'enrichment-search-to-enrichment-tgt',
        source: 'enrichment_file_search_tgt_comp',
        target: 'enrichment_tgt_comp',
        sourceHandle: 'enrichment_file_search_tgt_comp-source',
        targetHandle: 'enrichment_tgt_comp-target',
        type: 'straight',
        animated: false,
        style: { stroke: '#1e293b', strokeWidth: 2 }
    },
    {
        id: 'enrichment-to-transform-tgt',
        source: 'enrichment_tgt_comp',
        target: 'data_transform_tgt_comp',
        sourceHandle: 'enrichment_tgt_comp-source',
        targetHandle: 'data_transform_tgt_comp-target',
        type: 'straight',
        animated: false,
        style: { stroke: '#1e293b', strokeWidth: 2 }
    },
    {
        id: 'transform-to-combine-tgt',
        source: 'data_transform_tgt_comp',
        target: 'combine_data_comp',
        sourceHandle: 'data_transform_tgt_comp-source',
        targetHandle: 'combine_data_comp-target',
        animated: false,
        style: { stroke: '#1e293b', strokeWidth: 2 }
    },
    // Final flow edges
    {
        id: 'combine-to-rules',
        source: 'combine_data_comp',
        target: 'apply_rules_comp',
        sourceHandle: 'combine_data_comp-source',
        targetHandle: 'apply_rules_comp-target',
        type: 'straight',
        animated: false,
        style: { stroke: '#1e293b', strokeWidth: 2 }
    },
    {
        id: 'rules-to-output',
        source: 'apply_rules_comp',
        target: 'output_rules_comp',
        sourceHandle: 'apply_rules_comp-source',
        targetHandle: 'output_rules_comp-target',
        type: 'straight',
        animated: false,
        style: { stroke: '#1e293b', strokeWidth: 2 }
    },
    {
        id: 'output-to-break',
        source: 'output_rules_comp',
        target: 'break_rolling_comp',
        sourceHandle: 'output_rules_comp-source',
        targetHandle: 'break_rolling_comp-target',
        type: 'straight',
        animated: false,
        style: { stroke: '#1e293b', strokeWidth: 2 }
    }
];

// Removed TypeScript type for run parameter validation

// Removed TypeScript type for run parameters

// Define the CustomNode component outside the main component
const CustomNode = memo(({ data, id, nodeOutputs, setSelectedNode, setSelectedTab, setIsBottomBarOpen, setActivePanel, processIds, setSelectedLogNode }) => {
    const { runNode, resetNodeAndDownstream } = useContext(HandlerContext);
    const [isHovered, setIsHovered] = useState(false);
    const [showTooltip, setShowTooltip] = useState(false);
    const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);

    const isRunning = data.status === 'running';
    const isQueued = data.status === 'queued';
    const canReset = data.status === 'failed' || data.status === 'completed' || data.status === 'stopped' || data.status === 'queued';
    const isSelected = data.selected || false;
    const canRun = data.areParamsApplied && !isRunning && !isQueued;

    // Check if node has been running too long (timeout warning)
    useEffect(() => {
        if (isRunning && data.startTime) {
            const runningTime = Date.now() - data.startTime;
            const timeoutThreshold = 30 * 60 * 1000; // 30 minutes

            if (runningTime > timeoutThreshold) {
                setShowTimeoutWarning(true);
            } else {
                setShowTimeoutWarning(false);
            }
        } else {
            setShowTimeoutWarning(false);
        }
    }, [isRunning, data.startTime]);

    // Base node style
    const baseStyle = {
        transition: 'all 0.2s ease',
        border: '2px solid transparent',
        boxShadow: 'none',
        transform: 'scale(1)'
    };

    // Compute node style based on state
    const nodeStyle = {
        ...baseStyle,
        ...(isSelected && styles.selectedNode),
        ...(isHovered && !isSelected && styles.hoveredNode),
        ...(data.style || {}) // Allow for custom styles from parent
    };



    return (
        <div
            className="relative flex flex-col items-center"
            style={nodeStyle}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => {
                setIsHovered(false);
                setShowTooltip(false);
            }}
        >
            <div
                className="relative"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '3px solid #2a2a2a',      // Enhanced border
                    borderRadius: '50%',
                    width: 68,
                    height: 68,
                    background: 'linear-gradient(145deg, #f0f0f0 0%, #d1d1d1 50%, #b8b8b8 100%)',
                    // boxShadow: `
                    //     0 8px 16px rgba(0,0,0,0.3),
                    //     0 4px 8px rgba(0,0,0,0.2),
                    //     0 2px 4px rgba(0,0,0,0.1),
                    //     inset 0 1px 0 rgba(255,255,255,0.8),
                    //     inset 0 -1px 0 rgba(0,0,0,0.2)
                    // `,
                    transform: 'perspective(500px) rotateX(5deg)',
                }}
            >
                <Handle
                    type="target"
                    position={Position.Left}
                    style={{
                        background: '#10b981',
                        border: '2px solid #ffffff',
                        width: '12px',
                        height: '12px',
                        cursor: 'pointer',
                        borderRadius: '50%',
                        top: '50%',
                        left: '-18px',
                        transform: 'translateY(-50%)',
                        position: 'absolute'
                    }}
                    id={`${id}-target`}
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    style={{
                        background: '#10b981',
                        border: '2px solid #ffffff',
                        width: '12px',
                        height: '12px',
                        cursor: 'pointer',
                        borderRadius: '50%',
                        top: '50%',
                        right: '-18px',
                        transform: 'translateY(-50%)',
                        position: 'absolute'
                    }}
                    id={`${id}-source`}
                />

                <div
                    style={{
                        border: '4px solid white',    // Middle thick white border
                        borderRadius: '50%',
                        width: 64,
                        height: 64,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'linear-gradient(145deg, #ffffff 0%, #f8f8f8 50%, #e8e8e8 100%)',
                        // boxShadow: `
                        //     inset 0 2px 4px rgba(255,255,255,0.9),
                        //     inset 0 -2px 4px rgba(0,0,0,0.1)
                        // `,
                    }}
                >
                    <div
                        style={{
                            background: `
                                radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3) 0%, transparent 50%),
                                linear-gradient(145deg, rgb(240, 20, 40) 0%, rgb(219, 0, 17) 50%, rgb(180, 0, 14) 100%)
                            `,
                            borderRadius: '50%',
                            width: 60,
                            height: 60,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                            // boxShadow: `
                            //     0 4px 8px rgba(219, 0, 17, 0.4),
                            //     0 2px 4px rgba(0,0,0,0.3),
                            //     inset 0 1px 0 rgba(255,255,255,0.3),
                            //     inset 0 -1px 0 rgba(0,0,0,0.2)
                            // `,
                            border: '1px solid rgba(150, 0, 12, 0.8)',
                        }}
                    >
                        {(() => {
                            // Function to get the appropriate icon based on node ID
                            const getNodeIcon = (nodeId) => {
                                // Reading config node
                                if (nodeId === 'reading_config_comp') {
                                    return <UserAttributesIcon size={44} color="white" />;
                                }
                                // File searching/reading nodes
                                else if (nodeId === 'read_src_comp' || nodeId === 'read_tgt_comp') {
                                    return <DocumentSearchIcon size={44} color="white" />;
                                }
                                // Pre-harmonisation nodes (reading & pre-harmonisation)
                                else if (nodeId.includes('pre_harmonisation')) {
                                    return <LibraryBooksIcon size={44} color="white" />;
                                }
                                // Harmonisation nodes (but not pre-harmonisation)
                                else if (nodeId.includes('harmonisation') && !nodeId.includes('pre_harmonisation')) {
                                    return <TableEditIcon size={44} color="white" />;
                                }
                                // Enrichment file search nodes
                                else if (nodeId.includes('enrichment_file_search')) {
                                    return <DocumentSearchIcon size={44} color="white" />;
                                }
                                // Enrichment nodes (but not file search)
                                else if (nodeId.includes('enrichment') && !nodeId.includes('file_search')) {
                                    return <DatasetLinkedIcon size={44} color="white" />;
                                }
                                // Data transform nodes
                                else if (nodeId.includes('data_transform')) {
                                    return <TableConvertIcon size={44} color="white" />;
                                }
                                // Combine data node
                                else if (nodeId === 'combine_data_comp') {
                                    return <StacksIcon size={44} color="white" />;
                                }
                                // Apply rules node
                                else if (nodeId === 'apply_rules_comp') {
                                    return <DataInfoAlertIcon size={44} color="white" />;
                                }
                                // Output rules node
                                else if (nodeId === 'output_rules_comp') {
                                    return <OutputIcon size={44} color="white" />;
                                }
                                // Break rolling node
                                else if (nodeId === 'break_rolling_comp') {
                                    return <ChangeCircleIcon size={44} color="white" />;
                                }
                                // Default fallback
                                else {
                                    return (
                                        <img
                                            src="/nodecubic.png"
                                            alt="Node"
                                            style={{
                                                width: '96%',
                                                height: '96%',
                                                objectFit: 'contain',
                                                background: 'none',
                                            }}
                                        />
                                    );
                                }
                            };

                            const icon = getNodeIcon(id);

                            // If it's an icon component (not the default image), wrap it in the styled container
                            if (typeof icon.type === 'function') {
                                return (
                                    <div style={{
                                        width: '96%',
                                        height: '96%',
                                        borderRadius: '50%',
                                        backgroundColor: 'rgba(78, 94, 103, 0.15)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        aspectRatio: '1'
                                    }}>
                                        <div style={{
                                            width: '48px',
                                            height: '48px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            {icon}
                                        </div>
                                    </div>
                                );
                            } else {
                                // For the default image, return it as-is
                                return icon;
                            }
                        })()}
                    </div>
                </div>
            </div>
            {/* Status badge below the node */}
            <div className="flex justify-center w-full">
                <div className={`relative -mt-3 z-20 w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-md
                    ${data.status === 'completed' ? 'bg-green-500' :
                        data.status === 'failed' ? 'bg-red-500' :
                            data.status === 'running' ? 'bg-yellow-400' :
                                data.status === 'queued' ? 'bg-orange-500' :
                                    data.status === 'stopped' ? 'bg-red-500' :
                                        'bg-slate-400'}
                `}>
                    {data.status === 'running' && <FaSpinner className="animate-spin text-white w-3.5 h-3.5" />}
                    {data.status === 'completed' && <FaCheckCircle className="text-white w-3.5 h-3.5" />}
                    {data.status === 'failed' && <FaTimesCircle className="text-white w-3.5 h-3.5" />}
                    {data.status === 'queued' && <FaClock className="text-white w-3.5 h-3.5" />}
                    {data.status === 'stopped' && <FaStop className="text-white w-3.5 h-3.5" />}
                    {data.status === 'standby' && <FaCircle className="text-white/80 w-3.5 h-3.5" />}
                </div>
            </div>


            {/* Node Name Label */}
            <div className="text-[10px] text-black mt-2 max-w-[120px] text-center font-semibold leading-tight px-1 bg-white/80 rounded py-0.5 shadow-sm">
                {data.fullName || id}
            </div>

            {/* Failed Node Indicator Component */}
            <FailedNodeIndicator
                nodeId={id}
                nodeData={data}
                nodeOutputs={nodeOutputs}
            />

            {/* Timeout Warning Indicator */}
            {showTimeoutWarning && (
                <div className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 z-10">
                    <FaClock className="w-3 h-3" />
                </div>
            )}

            <div className="flex gap-1 mt-1">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        canRun && runNode(id);
                    }}
                    disabled={!canRun}
                    onMouseEnter={() => setShowTooltip(true)}
                    onMouseLeave={() => setShowTooltip(false)}
                    className={`flex items-center gap-0.5 px-1.5 py-1 rounded text-[8px] relative
                        ${!canRun
                            ? 'opacity-50 cursor-not-allowed bg-slate-800 text-slate-400'
                            : 'bg-slate-800 hover:bg-slate-700 text-emerald-400'
                        }`}
                >
                    <FaPlay className="w-1.5 h-1.5" />
                    Run
                    {showTooltip && (
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-2 py-1 text-[8px] 
                            bg-slate-900 text-white rounded whitespace-nowrap z-50">
                            {canRun ? "Click to run node" : isQueued ? "Node is queued" : "Node is running"}
                        </div>
                    )}
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        data.onStop?.(id);
                    }}
                    disabled={!isRunning && !isQueued}
                    className={`flex items-center gap-0.5 px-1.5 py-1 rounded text-[8px] ${!isRunning && !isQueued
                        ? 'opacity-50 cursor-not-allowed bg-slate-800 text-slate-400'
                        : 'bg-slate-800 hover:bg-slate-700 text-red-400'
                        }`}
                >
                    <FaStop className="w-1.5 h-1.5" />
                    Stop
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        resetNodeAndDownstream(id);
                    }}
                    disabled={!canReset && !isRunning && !isQueued}
                    className={`flex items-center gap-0.5 px-1.5 py-1 rounded text-[8px] ${!canReset && !isRunning && !isQueued
                        ? 'opacity-50 cursor-not-allowed bg-slate-800 text-slate-400'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
                        }`}
                >
                    <FaUndo className="w-1.5 h-1.5" />
                    Reset
                </button>
                {processIds && processIds[id] && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLogNode({ nodeId: id, taskId: processIds[id], status: data.status });
                        }}
                        className="flex items-center gap-0.5 px-1.5 py-1 rounded text-[8px] bg-slate-800 hover:bg-slate-700 text-blue-400"
                        title="View Logs"
                    >
                        📋 Logs
                    </button>
                )}
            </div>
        </div>
    );
});

// Utility function to safely manage localStorage quota
const safeLocalStorageSet = (key, value) => {
    try {
        // Check if the value is too large (localStorage has ~5-10MB limit)
        const sizeInBytes = new Blob([value]).size;
        const maxSize = 4 * 1024 * 1024; // 4MB limit

        if (sizeInBytes > maxSize) {
            console.warn(`Data too large for localStorage (${(sizeInBytes / 1024 / 1024).toFixed(2)}MB), skipping save`);
            return false;
        }

        localStorage.setItem(key, value);
        return true;
    } catch (error) {
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
            console.warn('localStorage quota exceeded, attempting to free space...');

            // Clear old data to free space (more aggressive cleanup)
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.includes('nodeOutputs_') || key.includes('nodes_') || key.includes('processIds_'))) {
                    keysToRemove.push(key);
                }
            }

            // Remove oldest keys first
            keysToRemove.slice(0, Math.floor(keysToRemove.length / 2)).forEach(key => {
                try {
                    localStorage.removeItem(key);
                } catch (e) {
                    console.warn('Failed to remove key:', key);
                }
            });

            // Try again after cleanup
            try {
                localStorage.setItem(key, value);
                return true;
            } catch (retryError) {
                console.warn('Still failed to save to localStorage after cleanup');
                return false;
            }
        }
        console.warn('Failed to save to localStorage:', error);
        return false;
    }
};

export default function CompletenessControl({ instanceId }) {
    // Get current user for role-based access
    const { currentUser } = useUser();
    const isAdmin = currentUser?.roles?.includes('admin') || false;
    const navigate = useNavigate();

    const userKey = (currentUser?.username || currentUser?.email || currentUser?.name || 'anonymous').toString();
    const recentInstancesKey = `recent_instances:completeness:${userKey}`;
    const [recentInstancesOpen, setRecentInstancesOpen] = useState(false);
    const [recentInstances, setRecentInstances] = useState([]);

    useEffect(() => {
        if (!instanceId) return;
        const next = upsertRecentInstance(recentInstancesKey, instanceId);
        setRecentInstances(next);
    }, [instanceId, recentInstancesKey]);

    // Define instance-specific localStorage keys
    const paramKey = `${CONSTANTS.STORAGE_KEYS.PARAMS}_${instanceId || 'default'}`;
    const nodeOutputsKey = `${CONSTANTS.STORAGE_KEYS.NODE_OUTPUTS}_${instanceId || 'default'}`;
    const nodesKey = `${CONSTANTS.STORAGE_KEYS.NODES}_${instanceId || 'default'}`;
    const processIdsKey = `${CONSTANTS.STORAGE_KEYS.PROCESS_IDS}_${instanceId || 'default'}`;
    const uiStateKey = `${CONSTANTS.STORAGE_KEYS.UI_STATE}_${instanceId || 'default'}`;

    // Cleanup function for browser close/tab close
    // useEffect(() => {
    //     const handleBeforeUnload = (e) => {
    //         console.log(`🧹 Browser closing - Cleaning up storage for instance: ${instanceId}`);

    //         // Clear instance-specific localStorage
    //         try {
    //             localStorage.removeItem(paramKey);
    //             localStorage.removeItem(nodeOutputsKey);
    //             localStorage.removeItem(nodesKey);
    //             localStorage.removeItem(processIdsKey);
    //             localStorage.removeItem(uiStateKey);

    //             console.log('✅ Instance storage cleared successfully');
    //         } catch (error) {
    //             console.error('❌ Error cleaning up storage:', error);
    //         }
    //     };

    //     // Add event listener for browser close
    //     window.addEventListener('beforeunload', handleBeforeUnload);

    //     // Cleanup on component unmount (tab navigation)
    //     return () => {
    //         window.removeEventListener('beforeunload', handleBeforeUnload);
    //     };
    // }, [instanceId, paramKey, nodeOutputsKey, nodesKey, processIdsKey, uiStateKey]);

    // Restore UI state from localStorage
    const getStoredUIState = () => {
        const saved = localStorage.getItem(uiStateKey);
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch {
                return {};
            }
        }
        return {};
    };

    const storedUIState = getStoredUIState();

    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [sidebarWidth, setSidebarWidth] = useState(CONSTANTS.DEFAULT_SIDEBAR_WIDTH);
    const [isResizing, setIsResizing] = useState(false);
    const [isBottomBarOpen, setIsBottomBarOpen] = useState(storedUIState.isBottomBarOpen || false);
    const [activePanel, setActivePanel] = useState(storedUIState.activePanel || null);
    const [bottomBarHeight, setBottomBarHeight] = useState(() => {
        // Desktop-optimized initial height
        if (typeof window !== 'undefined') {
            const vh = window.innerHeight;
            return Math.min(Math.max(vh * 0.4, 300), vh * 0.7); // 40-70% of viewport height for desktop
        }
        return 400; // desktop fallback
    });
    const [isResizingBottom, setIsResizingBottom] = useState(false);
    const [selectedNode, setSelectedNode] = useState(storedUIState.selectedNode || null);
    const [selectedTab, setSelectedTab] = useState(storedUIState.selectedTab || 'histogram');

    // Auto-switch to fail tab when selected node fails
    useEffect(() => {
        if (selectedNode && selectedNode.data.status === 'failed') {
            console.log('🔴 Node failed, auto-switching to Fail Message tab');
            setSelectedTab('fail');
        }
    }, [selectedNode]);
    const [dataViewLocked, setDataViewLocked] = useState(false); // Track if data view is locked open
    const [areParamsApplied, setAreParamsApplied] = useState(() => {
        const saved = localStorage.getItem(paramKey);
        if (!saved) return false;
        try {
            const params = JSON.parse(saved);
            return Object.values(params).every(v => v && String(v).trim() !== '');
        } catch {
            return false;
        }
    });
    const resizeRef = useRef(null);
    const minWidth = CONSTANTS.MIN_SIDEBAR_WIDTH;
    const maxWidth = CONSTANTS.MAX_SIDEBAR_WIDTH;
    const minHeight = CONSTANTS.MIN_BOTTOM_BAR_HEIGHT;  // Desktop minimum height
    const maxHeight = typeof window !== 'undefined' ? window.innerHeight * 0.8 : 800;  // Max 80% of viewport for desktop
    const nodeTimeouts = useRef({});
    const [runParams, setRunParams] = useState(() => {
        const saved = localStorage.getItem(paramKey);
        return saved
            ? JSON.parse(saved)
            : {
                expectedRunDate: '',
                inputConfigFilePath: '',
                inputConfigFilePattern: '',
                rootFileDir: '',
                runEnv: '',
                tempFilePath: '',
                testRun: 'off'
            };
    });

    const tempFileBasePrefix = useMemo(() => {
        const userId = (currentUser?.id ?? '').toString().trim();
        return userId ? `/REGQA/TTRControls/GarbageTemp/${userId}/` : '';
    }, [currentUser?.id]);

    useEffect(() => {
        if (!tempFileBasePrefix || !instanceId) return;

        const path = buildTempFilePath(tempFileBasePrefix, instanceId);
        setRunParams((prev) => {
            if (prev?.tempFilePath === path) return prev;
            return { ...(prev || {}), tempFilePath: path };
        });
    }, [tempFileBasePrefix, instanceId]);
    const [selectedLogNode, setSelectedLogNode] = useState(null); // For log viewer
    const [processIds, setProcessIds] = useState(() => {
        const savedProcessIds = localStorage.getItem(processIdsKey);
        if (savedProcessIds) {
            try {
                return JSON.parse(savedProcessIds);
            } catch {
                return {};
            }
        }
        return {};
    });

    const [invalidFields, setInvalidFields] = useState(new Set());
    const [validatedParams, setValidatedParams] = useState(null);
    const [selectedNodes] = useState(new Set());

    // Synchronous ref for node outputs to avoid async state issues
    const nodeOutputsRef = useRef({});

    const [nodeOutputs, setNodeOutputs] = useState(() => {
        const savedOutputs = localStorage.getItem(nodeOutputsKey);
        if (savedOutputs) {
            try {
                const parsed = JSON.parse(savedOutputs);
                // Initialize the ref with restored data
                nodeOutputsRef.current = parsed;
                console.log('🔄 Restored node outputs from localStorage:', Object.keys(parsed));
                // Log table sizes for verification
                Object.entries(parsed).forEach(([nodeId, output]) => {
                    if (output?.calculation_results?.table_size) {
                        console.log(`   - ${nodeId}: ${output.calculation_results.table_size}`);
                    }
                });
                return parsed;
            } catch (error) {
                console.warn('Failed to parse saved node outputs:', error);
                return {};
            }
        }
        return {};
    });

    // Keep ref synchronized with state
    useEffect(() => {
        nodeOutputsRef.current = nodeOutputs;
    }, [nodeOutputs]);

    // Helper function to update both state and ref simultaneously
    const updateNodeOutput = useCallback((nodeId, output) => {
        nodeOutputsRef.current = { ...nodeOutputsRef.current, [nodeId]: output };
        setNodeOutputs(prev => ({ ...prev, [nodeId]: output }));
    }, []);

    const cancelledNodesRef = useRef(new Set());
    const forceUpdate = useState({})[1];

    // Add validation state
    const [paramValidation, setParamValidation] = useState({
        isValid: false,
        message: ''
    });

    // Add this at the top level of CompletenessControl, with other useState hooks

    const [histogramFilterType, setHistogramFilterType] = useState('contains');
    const [histogramFilterValue, setHistogramFilterValue] = useState('');

    // Enhanced health monitoring state
    const [isBackendHealthy, setIsBackendHealthy] = useState(true);
    const [backendHealthMessage, setBackendHealthMessage] = useState('');
    // const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);

    // Column selector for Data Output tab


    // Restore nodes from localStorage if available, otherwise use initialNodes
    const restoredNodes = (() => {
        const saved = localStorage.getItem(nodesKey);
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch {
                // fallback to initialNodes
            }
        }
        return createInitialNodes();
    })();
    const [nodes, setNodes, onNodesChange] = useNodesState(
        restoredNodes.map((node) => ({
            ...node,
            data: {
                ...node.data,
                areParamsApplied,
                nodeOutputs,
                setSelectedNode
            }
        }))
    );

    const [edges, setEdges, onEdgesChange] = useEdgesState(createInitialEdges());

    // Create refs for edges to avoid dependency issues in onStop
    const edgesRef = useRef(edges);
    const setEdgesRef = useRef(setEdges);

    // Update edges ref when edges change
    useEffect(() => {
        edgesRef.current = edges;
        setEdgesRef.current = setEdges;
    }, [edges, setEdges]);

    // Build dependency and downstream maps from edges
    const dependencyMap = useMemo(() => buildDependencyMap(edges), [edges]);
    const downstreamMap = useMemo(() => buildDownstreamMap(edges), [edges]);

    // Helper: get node status map
    const nodeStatusMap = useMemo(() => {
        const map = {};
        nodes.forEach(n => { map[n.id] = n.data.status; });
        return map;
    }, [nodes]);

    // Use validatedParams and selectedNodes for debugging and state tracking
    useEffect(() => {
        if (validatedParams) {
            console.log('📋 Validated parameters updated:', Object.keys(validatedParams));
        }
    }, [validatedParams]);

    useEffect(() => {
        if (selectedNodes.size > 0) {
            console.log('🎯 Selected nodes updated:', Array.from(selectedNodes));
        }
    }, [selectedNodes]);

    // Memoize data transformations for AgGridTable with better optimization


    const updateNodeStatus = useCallback((nodeId, status) => {
        console.log(`Node ${nodeId} status updated to: ${status}`);

        // Update node status
        setNodes(nds => nds.map(node =>
            node.id === nodeId
                ? { ...node, data: { ...node.data, status } }
                : node
        ));

        // Update edge colors and labels based on source node status
        setEdges(eds => eds.map(edge => {
            if (edge.source === nodeId) {
                const sourceOutput = nodeOutputs?.[nodeId];
                // sourceOutput is used for data processing but not directly referenced
                // Use the count field from backend response (total rows generated)
                // instead of table length (frontend-limited rows)
                const rowCount = sourceOutput?.count ? parseInt(sourceOutput.count) :
                    sourceOutput?.calculation_results?.table?.length;

                return {
                    ...edge,
                    style: {
                        ...edge.style,
                        stroke: status === 'completed' ? '#22c55e' :
                            status === 'queued' ? '#f97316' : '#1e293b'
                    },
                    label: status === 'completed' && rowCount && rowCount > 0 ?
                        rowCount.toLocaleString() : undefined,
                    labelStyle: {
                        fill: '#1f2937',
                        fontWeight: 'bold',
                        fontSize: '11px',
                        cursor: 'pointer'
                    },
                    labelBgStyle: {
                        fill: '#ffffff',
                        fillOpacity: 0.95,
                        stroke: '#3b82f6',
                        strokeWidth: 2,
                        cursor: 'pointer'
                    },
                    labelBgPadding: [6, 12],
                    labelBgBorderRadius: 6
                };
            }
            return edge;
        }));
    }, [setNodes, setEdges, nodeOutputs]);

    // Function to handle connections
    const onConnect = useCallback((params) => {
        // Add source and target handles to the connection
        const connection = {
            ...params,
            sourceHandle: `${params.source}-source`,
            targetHandle: `${params.target}-target`
        };
        setEdges((eds) => addEdge(connection, eds));
    }, [setEdges]);

    // Handle edge click to show data view
    const onEdgeClick = useCallback((event, edge) => {
        event.stopPropagation();

        // Only show data view if edge has a label (meaning it has data)
        if (edge.label) {
            const sourceNodeId = edge.source;
            const sourceNode = nodes.find(n => n.id === sourceNodeId);

            if (sourceNode && sourceNode.data.status === 'completed') {
                const output = (nodeOutputs && nodeOutputs[sourceNodeId]) ? nodeOutputs[sourceNodeId] : {};

                // Batch state updates to prevent flickering
                setTimeout(() => {
                    setSelectedNode({
                        id: sourceNodeId,
                        data: {
                            ...sourceNode.data,
                            output
                        }
                    });
                    setSelectedTab('histogram');
                    setIsBottomBarOpen(true);
                    setActivePanel('bottombar');
                    setDataViewLocked(true); // Lock the data view open
                }, 0);
            }
        }
    }, [nodes, nodeOutputs, setSelectedNode, setSelectedTab, setIsBottomBarOpen, setActivePanel]);

    // Handle node double click to show data view
    const onNodeDoubleClick = useCallback((event, node) => {
        event.stopPropagation();

        console.log(`🖱️ Node double-clicked: ${node.id}, status: ${node.data.status}`);
        console.log(`🖱️ Current selectedNode:`, selectedNode?.id);

        // Only show data view if node has completed and has output data
        if (node.data.status === 'completed') {
            const output = (nodeOutputs && nodeOutputs[node.id]) ? nodeOutputs[node.id] : {};

            console.log(`📊 Node ${node.id} output:`, {
                hasOutput: !!output,
                outputKeys: output ? Object.keys(output) : null,
                hasData: !!(output?.calculation_results?.table),
                hasHistogram: !!(output?.histogram_data),
                headers: output?.calculation_results?.headers?.slice(0, 3) // Show first 3 headers
            });

            // Batch state updates to prevent flickering
            setTimeout(() => {
                const newSelectedNode = {
                    id: node.id,
                    data: {
                        ...node.data,
                        output
                    }
                };

                console.log(`🔄 Setting new selectedNode:`, {
                    id: newSelectedNode.id,
                    fullName: newSelectedNode.data.fullName,
                    hasOutput: !!newSelectedNode.data.output,
                    headers: newSelectedNode.data.output?.calculation_results?.headers?.slice(0, 3)
                });

                setSelectedNode(newSelectedNode);
                setSelectedTab('histogram');
                setIsBottomBarOpen(true);
                setActivePanel('bottombar');
                setDataViewLocked(true); // Lock the data view open
            }, 0);
        } else {
            console.log(`⚠️ Node ${node.id} not completed (status: ${node.data.status}), no data to show`);
        }
    }, [nodeOutputs, setSelectedNode, setSelectedTab, setIsBottomBarOpen, setActivePanel, selectedNode]);

    // Cleanup timeouts on unmount
    useEffect(() => {
        return () => {
            // Clear all timeouts and intervals
            Object.values(nodeTimeouts.current).forEach(timeout => {
                if (typeof timeout === 'number') {
                    clearTimeout(timeout);
                    clearInterval(timeout);
                }
            });
            // Reset refs to prevent memory leaks
            nodeTimeouts.current = {};
            cancelledNodesRef.current.clear();
        };
    }, []);

    const handleParamChange = (param, value) => {
        // Clean the input value by trimming whitespace
        const cleanValue = value.trim();

        if (param === 'tempFilePath') return;

        setRunParams(prev => ({
            ...prev,
            [param]: cleanValue
        }));

        // Clear the error state for this field when user types
        if (invalidFields.has(param)) {
            const newInvalidFields = new Set(invalidFields);
            newInvalidFields.delete(param);
            setInvalidFields(newInvalidFields);
        }
    };

    const validateParameters = useCallback(() => {
        const forcedTempFilePath = tempFileBasePrefix && instanceId
            ? buildTempFilePath(tempFileBasePrefix, instanceId)
            : (runParams?.tempFilePath ?? '');
        const newInvalidFields = new Set();
        let hasErrors = false;

        // Check each parameter for empty or whitespace-only values
        Object.entries({ ...(runParams || {}), tempFilePath: forcedTempFilePath }).forEach(([key, value]) => {
            if (!value || (typeof value === 'string' && value.trim() === '')) {
                newInvalidFields.add(key);
                hasErrors = true;
                console.log(`❌ Validation Error: ${key} is empty or contains only whitespace`);
            }
        });

        setInvalidFields(newInvalidFields);

        setParamValidation({
            isValid: !hasErrors,
            message: hasErrors ? 'Please fill in all required fields' : 'Parameters are valid'
        });

        if (!hasErrors) {
            const paramsToSave = { ...(runParams || {}), tempFilePath: forcedTempFilePath };
            console.log('✅ All parameters are valid:', paramsToSave);
            const success = safeLocalStorageSet(paramKey, JSON.stringify(paramsToSave));
            if (!success) {
                console.warn('Failed to save parameters to localStorage');
            }
            setValidatedParams(paramsToSave);
            setAreParamsApplied(true);
        } else {
            try {
                localStorage.removeItem(paramKey);
            } catch (error) {
                console.warn('Failed to remove parameters from localStorage:', error);
            }
            setAreParamsApplied(false);
        }

        return !hasErrors;
    }, [runParams, paramKey, tempFileBasePrefix, instanceId]);

    const handleApplyParams = useCallback(() => {
        const isValid = validateParameters();
        if (!isValid) {
            setAreParamsApplied(false);
            return false;
        }

        const rename = resolveRenamedInstanceId(
            instanceId,
            runParams?.inputConfigFilePattern,
            'completeness'
        );
        const effectiveInstanceId = rename?.newInstanceId || instanceId;

        if (rename) {
            migrateInstanceStorage(instanceId, rename.newInstanceId);
            if (tempFileBasePrefix) {
                const newPath = buildTempFilePath(tempFileBasePrefix, rename.newInstanceId);
                const paramsKey = `validatedParams_${rename.newInstanceId}`;
                try {
                    const raw = localStorage.getItem(paramsKey);
                    if (raw) {
                        const saved = JSON.parse(raw);
                        saved.tempFilePath = newPath;
                        localStorage.setItem(paramsKey, JSON.stringify(saved));
                    }
                } catch {
                    // ignore storage errors
                }
            }
            const next = replaceRecentInstance(
                recentInstancesKey,
                instanceId,
                rename.newInstanceId,
                rename.configSlug
            );
            setRecentInstances(next);
            navigate(`/instances/completeness/${rename.newInstanceId}`, { replace: true });
        } else if (tempFileBasePrefix && effectiveInstanceId) {
            const path = buildTempFilePath(tempFileBasePrefix, effectiveInstanceId);
            setRunParams((prev) => ({ ...(prev || {}), tempFilePath: path }));
        }

        setAreParamsApplied(true);
        return true;
    }, [
        validateParameters,
        instanceId,
        runParams,
        tempFileBasePrefix,
        recentInstancesKey,
        navigate,
    ]);

    // Enhanced input styling to match the new design
    const getInputStyle = (fieldName) => {
        const baseStyle = "w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 transition-all duration-200 text-xs text-gray-800 bg-gray-50 border-gray-300 hover:border-gray-400 focus:border-blue-500 focus:ring-blue-200 focus:bg-white";
        return invalidFields.has(fieldName)
            ? `${baseStyle} border-red-400 bg-red-50 focus:ring-red-300 focus:border-red-500`
            : baseStyle;
    };

    // Enhanced parameter input fields JSX with filtering support
    const renderParameterInputs = (filterFields = null) => {
        const fieldsToRender = filterFields
            ? Object.entries(runParams).filter(([key]) => filterFields.includes(key))
            : Object.entries(runParams);

        return (
            <div className="space-y-4">
                {fieldsToRender.map(([key, value]) => (
                    <div key={key} className="flex flex-col">
                        <label className="text-xs font-semibold text-gray-700 mb-1.5">
                            {key.charAt(0).toUpperCase() + key.slice(1)}
                            {invalidFields.has(key) && (
                                <span className="text-red-500 ml-1">*</span>
                            )}
                        </label>
                        {key === 'runEnv' ? (
                            <select
                                value={value || ''}
                                onChange={(e) => handleParamChange(key, e.target.value)}
                                className={`${getInputStyle(key)} text-gray-800`}
                            >
                                <option value="" className="text-gray-600">Select Environment</option>
                                <option value="development" className="text-gray-800">Development</option>
                                <option value="staging" className="text-gray-800">Staging</option>
                                {isAdmin && <option value="production" className="text-gray-800">Production</option>}
                            </select>
                        ) : key === 'testRun' ? (
                            <select
                                value={value || 'off'}
                                onChange={(e) => handleParamChange(key, e.target.value)}
                                className={`${getInputStyle(key)} text-gray-800`}
                            >
                                <option value="off" className="text-gray-800">Off</option>
                                <option value="on" className="text-gray-800">On</option>
                            </select>
                        ) : key === 'tempFilePath' ? (
                            <div className="flex items-stretch rounded-lg border border-gray-300 bg-gray-50 overflow-hidden">
                                <div
                                    className="px-3 py-2 text-xs text-gray-700 bg-gray-100 border-r border-gray-300 whitespace-nowrap"
                                    title={tempFileBasePrefix || 'Waiting for user...'}
                                >
                                    {tempFileBasePrefix || '/REGQA/TTRControls/GarbageTemp/<userId>/'}
                                </div>
                                <input
                                    type="text"
                                    readOnly
                                    value={instanceId ? getTempFileSubfolderDisplay(instanceId) : ''}
                                    className="flex-1 px-3 py-2 text-xs text-gray-800 bg-gray-100 cursor-default focus:outline-none"
                                    placeholder="Set when instance is named"
                                    disabled={!tempFileBasePrefix || !instanceId}
                                    title={value || buildTempFilePath(tempFileBasePrefix, instanceId)}
                                />
                            </div>
                        ) : (
                            <input
                                type="text"
                                value={value || ''}
                                onChange={(e) => handleParamChange(key, e.target.value)}
                                className={getInputStyle(key)}
                                onFocus={() => {
                                    if (invalidFields.has(key)) {
                                        const newInvalidFields = new Set(invalidFields);
                                        newInvalidFields.delete(key);
                                        setInvalidFields(newInvalidFields);
                                    }
                                }}
                                placeholder={`Enter ${(key.charAt(0).toUpperCase() + key.slice(1)).replace(/([A-Z])/g, ' $1')}`}
                            />
                        )}
                        {invalidFields.has(key) && (
                            <p className="mt-1 text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                                This field is required
                            </p>
                        )}
                    </div>
                ))}
            </div>
        );
    };

    // Function to reset all nodes
    const resetAllNodes = useCallback(() => {
        // Clear all node outputs from localStorage
        localStorage.removeItem(nodeOutputsKey);
        setNodeOutputs({});

        // Reset all process IDs
        setProcessIds({});
        localStorage.removeItem(processIdsKey);

        // Reset UI state
        setIsBottomBarOpen(false);
        setActivePanel(null);
        setSelectedNode(null);
        setSelectedTab('histogram');
        localStorage.removeItem(uiStateKey);

        // Reset all node statuses to idle and clear all visual states
        setNodes(nds => nds.map(node => ({
            ...node,
            data: {
                ...node.data,
                status: 'idle',
                output: undefined,
                selected: false,
                style: undefined // Clear any custom styles
            },
            style: undefined, // Clear node-level styles
            selected: false // Clear ReactFlow's internal selection state
        })));

        // Clear any running timeouts
        Object.values(nodeTimeouts.current).forEach(timeout => {
            clearInterval(timeout);
        });
        nodeTimeouts.current = {};

        // Clear selected nodes (not needed as this state was removed)

        // Clear selected node in output panel
        setSelectedNode(null);

        // Cancel all running/cancelled nodes
        cancelledNodesRef.current = new Set();
        forceUpdate({});

        console.log('🧹 Reset all nodes and cleared all data');
    }, [setNodes, nodeOutputsKey, forceUpdate, processIdsKey, uiStateKey]);



    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isResizing && !isResizingBottom) return;

            if (isResizingBottom) {
                const height = document.documentElement.clientHeight - e.clientY;
                const clampedHeight = Math.min(Math.max(height, minHeight), maxHeight);
                setBottomBarHeight(clampedHeight);
            }
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            setIsResizingBottom(false);
        };

        if (isResizing || isResizingBottom) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, isResizingBottom, minHeight, maxHeight]);

    // Handle window resize for desktop optimization
    useEffect(() => {
        const handleWindowResize = () => {
            const vh = window.innerHeight;
            const newMaxHeight = vh * 0.8;
            const newMinHeight = 300; // Desktop minimum

            // Adjust bottom bar height if it's outside the new bounds
            setBottomBarHeight(prev => {
                if (prev > newMaxHeight) return newMaxHeight;
                if (prev < newMinHeight) return newMinHeight;
                return prev;
            });
        };

        window.addEventListener('resize', handleWindowResize);
        return () => window.removeEventListener('resize', handleWindowResize);
    }, []);

    // Update localStorage whenever nodeOutputs changes - store only file locations
    useEffect(() => {
        try {
            // Store only file location references and metadata, no actual data
            const fileLocationOutputs = {};

            Object.keys(nodeOutputs).forEach(nodeId => {
                const output = nodeOutputs[nodeId];
                if (output) {
                    fileLocationOutputs[nodeId] = {
                        status: output.status,
                        count: output.count,
                        fail_message: output.fail_message,
                        execution_logs: output.execution_logs,
                        // Store file location references instead of data
                        file_info: output.file_info,
                        input_file_info: output.input_file_info,
                        // Store metadata about data structure without the actual data
                        data_metadata: output.calculation_results ? {
                            headers: output.calculation_results.headers,
                            table_size: output.calculation_results.table ?
                                `${output.calculation_results.headers?.length || 0}x${output.calculation_results.table.length || 0}` : '0x0',
                            has_data: !!output.calculation_results.table
                        } : null,
                        histogram_data: output.histogram_data
                    };
                }
            });

            const success = safeLocalStorageSet(nodeOutputsKey, JSON.stringify(fileLocationOutputs));
            if (success) {
                console.log('💾 Saved file location references to localStorage (no data cached)');
            }
        } catch (error) {
            console.warn('Failed to save file location references:', error);
        }
    }, [nodeOutputs, nodeOutputsKey]);

    // Update localStorage whenever processIds changes
    useEffect(() => {
        try {
            safeLocalStorageSet(processIdsKey, JSON.stringify(processIds));
            console.log('💾 Saved process IDs to localStorage');
        } catch (error) {
            console.warn('Failed to save process IDs:', error);
        }
    }, [processIds, processIdsKey]);

    // Update localStorage whenever UI state changes
    useEffect(() => {
        const uiState = {
            isBottomBarOpen,
            activePanel,
            selectedNode,
            selectedTab
        };
        try {
            safeLocalStorageSet(uiStateKey, JSON.stringify(uiState));
            console.log('💾 Saved UI state to localStorage');
        } catch (error) {
            console.warn('Failed to save UI state:', error);
        }
    }, [isBottomBarOpen, activePanel, selectedNode, selectedTab, uiStateKey]);

    // Backend health monitoring - only check at session start
    useEffect(() => {
        const checkHealth = async () => {
            try {
                console.log('🔍 Completeness: Performing initial backend health check...');
                const isHealthy = await ApiService.checkBackendHealth(true);
                setIsBackendHealthy(isHealthy);
                setBackendHealthMessage(isHealthy ? 'Backend is healthy' : 'Backend is not responding');
                console.log('✅ Completeness: Initial health check completed:', isHealthy ? 'Healthy' : 'Unhealthy');
            } catch (error) {
                console.error('❌ Completeness: Initial health check failed:', error.message);
                setIsBackendHealthy(false);
                setBackendHealthMessage(`Backend error: ${error.message}`);
            }
        };

        // Only perform initial health check at session start
        checkHealth();

        // No periodic health checks to reduce server load
    }, []);



    // Update the onSelectionChange handler
    const onSelectionChange = useCallback(({ nodes: selectedNodesArr }) => {
        const selectedIds = new Set(selectedNodesArr.map(n => n.id));

        // Update nodes with selection state
        setNodes(nds => nds.map(node => ({
            ...node,
            data: {
                ...node.data,
                selected: selectedIds.has(node.id)
            }
        })));

        // Only clear selectedNode if data view is not locked
        if (!dataViewLocked) {
            setSelectedNode(null);
        }
    }, [setNodes, dataViewLocked]);

    // Refactored runNodeWithDependencies to pass previousOutputs down the chain
    const runNodeWithDependencies = useCallback(async (
        nodeId,
        runNodeFn,
        dependencyMap,
        nodeStatusMap,
        nodeOutputs,
        alreadyRun = new Set(),
        path = []
    ) => {
        // Cancel if node is in cancelledNodes
        if (cancelledNodesRef.current.has(nodeId)) {
            console.log(`Node ${nodeId} dependency run cancelled.`);
            return;
        }
        if (alreadyRun.has(nodeId) || nodeStatusMap[nodeId] === 'completed') return nodeOutputs[nodeId];
        if (path.includes(nodeId)) throw new Error(`Cycle detected: ${[...path, nodeId].join(' -> ')}`);

        // Set node to queued status if it has dependencies and is not already running
        const deps = dependencyMap[nodeId] || [];
        if (deps.length > 0 && nodeStatusMap[nodeId] !== 'running') {
            updateNodeStatus(nodeId, 'queued');
        }

        let prevOutputs = { ...nodeOutputs };

        // Check if this is the combine_data_comp node that needs parallel SRC/TGT execution
        if (nodeId === 'combine_data_comp') {
            console.log(`🔄 Running SRC and TGT branches in parallel for ${nodeId}`);

            // Run SRC and TGT branches in parallel - allow both to complete even if one fails
            const results = await Promise.allSettled([
                runNodeWithDependencies('data_transform_src_comp', runNodeFn, dependencyMap, nodeStatusMap, prevOutputs, alreadyRun, [...path, nodeId]),
                runNodeWithDependencies('data_transform_tgt_comp', runNodeFn, dependencyMap, nodeStatusMap, prevOutputs, alreadyRun, [...path, nodeId])
            ]);

            // Process SRC result
            if (results[0].status === 'fulfilled') {
                prevOutputs['data_transform_src_comp'] = results[0].value;
                console.log('✅ SRC branch completed successfully');
            } else {
                console.error('❌ SRC branch failed:', results[0].reason);
            }

            // Process TGT result
            if (results[1].status === 'fulfilled') {
                prevOutputs['data_transform_tgt_comp'] = results[1].value;
                console.log('✅ TGT branch completed successfully');
            } else {
                console.error('❌ TGT branch failed:', results[1].reason);
            }

            // If both failed, throw error to stop execution
            if (results[0].status === 'rejected' && results[1].status === 'rejected') {
                console.error('❌ Both SRC and TGT branches failed');
                throw new Error('Both SRC and TGT branches failed');
            }

            // If one failed, log warning but continue (the combine node will handle partial data)
            if (results[0].status === 'rejected' || results[1].status === 'rejected') {
                const failedBranch = results[0].status === 'rejected' ? 'SRC' : 'TGT';
                const successBranch = results[0].status === 'fulfilled' ? 'SRC' : 'TGT';
                console.warn(`⚠️ ${failedBranch} branch failed, but ${successBranch} branch completed successfully`);
            }
        } else {
            // For all other nodes (including endpoint nodes), run their actual dependencies from dependencyMap
            for (let dep of deps) {
                const depOutput = await runNodeWithDependencies(dep, runNodeFn, dependencyMap, nodeStatusMap, prevOutputs, alreadyRun, [...path, nodeId]);
                prevOutputs[dep] = depOutput;
            }
        }
        // Now run the node, passing prevOutputs
        if (cancelledNodesRef.current.has(nodeId)) {
            console.log(`Node ${nodeId} run cancelled (post-deps).`);
            return;
        }
        const output = await runNodeFn(nodeId, prevOutputs);
        alreadyRun.add(nodeId);
        return output;
    }, [updateNodeStatus]);

    // Enhanced node runner with detailed logging and proper failed node handling
    const runNodeAndWait = useCallback(async (nodeId) => {
        console.log(`🚀 Starting runNodeAndWait for node: ${nodeId}`);

        try {
            // Check if node is already running
            const currentNode = nodes.find(n => n.id === nodeId);
            if (currentNode?.data.status === 'running') {
                console.log(`⚠️ Node ${nodeId} is already running, skipping...`);
                return null;
            }

            // 🚀 IMMEDIATE UI FEEDBACK - Show "running" status instantly
            console.log(`⚡ Setting ${nodeId} to 'running' status immediately for better UX`);
            updateNodeStatus(nodeId, 'running');
            setNodes(nds => nds.map(node =>
                node.id === nodeId
                    ? { ...node, data: { ...node.data, startTime: Date.now() } }
                    : node
            ));

            console.log(`📋 Preparing to run node: ${nodeId}`);

            // Get node outputs for previous steps with proper validation
            const previousOutputs = {};
            const dependencies = dependencyMap[nodeId] || [];

            console.log(`🔗 Dependencies for ${nodeId}:`, dependencies);

            // Validate that all dependencies completed successfully
            for (const depId of dependencies) {
                const depNode = nodes.find(n => n.id === depId);
                if (!depNode) {
                    console.error(`❌ Dependency node ${depId} not found`);
                    updateNodeStatus(nodeId, 'failed');
                    return null;
                }

                // Check if dependency has output using synchronous ref
                const depOutput = nodeOutputsRef.current[depId];

                if (!depOutput) {
                    console.error(`❌ Dependency ${depId} has no output (not completed)`);
                    console.log(`🔍 Available outputs in ref:`, Object.keys(nodeOutputsRef.current));
                    console.log(`🔍 Available outputs in state:`, Object.keys(nodeOutputs));
                    updateNodeStatus(nodeId, 'failed');
                    return null;
                }

                // Validate that the dependency output is successful
                if (depOutput.status === 'failed' || depOutput.fail_message) {
                    console.error(`❌ Dependency ${depId} failed: ${depOutput.fail_message}`);
                    updateNodeStatus(nodeId, 'failed');
                    return null;
                }

                console.log(`✅ Dependency ${depId} completed successfully`);

                // Add the dependency output to previous outputs
                previousOutputs[depId] = depOutput;
                console.log(`📤 Added previous output from ${depId} to ${nodeId}`);
            }

            // Prepare input parameters with proper structure for enhanced ETL
            const input = {
                nodeId: nodeId,
                parameters: validatedParams,
                previousOutputs: Object.keys(previousOutputs).length > 0 ? previousOutputs : null,
                customParams: {
                    step_type: nodeId,
                    timestamp: new Date().toISOString()
                }
            };

            console.log(`📤 Sending request for node ${nodeId}:`, {
                nodeId: input.nodeId,
                hasPreviousOutputs: !!input.previousOutputs,
                previousOutputKeys: input.previousOutputs ? Object.keys(input.previousOutputs) : [],
                customParams: input.customParams
            });

            // Start the calculation
            const response = await ApiService.startCalculation(input);
            console.log(`✅ Started calculation for ${nodeId}:`, response);

            // Store process ID
            setProcessIds(prev => ({ ...prev, [nodeId]: response.process_id }));
            console.log(`💾 Stored process ID for ${nodeId}: ${response.process_id}`);

            // Status already updated above for immediate UI feedback
            console.log(`🔄 Node ${nodeId} already set to 'running' status for immediate UX`);

            // Use WebSocket for real-time updates (with fallback to polling)
            console.log(`🔌 Starting WebSocket subscription for ${nodeId} (process_id: ${response.process_id})`);

            // Connect WebSocket if not already connected
            WebSocketService.connect();

            // Use WebSocket if available, otherwise fallback to polling
            if (!CONSTANTS.USE_LEGACY_MODE) {
                return new Promise((resolve, reject) => {
                    let isResolved = false;
                    let timeoutId = null;
                    const processId = response.process_id;

                    // Set timeout for task completion (30 minutes)
                    const maxWaitTime = CONSTANTS.TASK_TIMEOUT_MINUTES * 60 * 1000;
                    timeoutId = setTimeout(() => {
                        if (!isResolved) {
                            console.error(`⏰ Node ${nodeId} timed out after ${CONSTANTS.TASK_TIMEOUT_MINUTES} minutes`);
                            WebSocketService.unsubscribe(processId);
                            updateNodeStatus(nodeId, 'failed');
                            updateNodeOutput(nodeId, {
                                status: 'failed',
                                fail_message: `Task timed out after ${CONSTANTS.TASK_TIMEOUT_MINUTES} minutes`,
                                execution_logs: [`Task timed out`]
                            });
                            isResolved = true;
                            reject(new Error('Task timed out'));
                        }
                    }, maxWaitTime);

                    // Subscribe to task status updates via WebSocket
                    WebSocketService.subscribe(processId, (statusData) => {
                        if (isResolved) {
                            console.log(`⚠️ WebSocket callback called for ${nodeId} but already resolved, ignoring`);
                            return;
                        }

                        const status = (statusData.status || '').toLowerCase();
                        console.log(`📊 WebSocket status update for ${nodeId}:`, {
                            status: status,
                            originalStatus: statusData.status,
                            fullStatusData: statusData
                        });

                        // Check if node has been cancelled
                        if (cancelledNodesRef.current.has(nodeId)) {
                            console.log(`🛑 Node ${nodeId} was cancelled, unsubscribing`);
                            WebSocketService.unsubscribe(processId);
                            if (timeoutId) clearTimeout(timeoutId);
                            updateNodeStatus(nodeId, 'stopped');
                            isResolved = true;
                            reject(new Error('Node was cancelled'));
                            return;
                        }

                        // Check if node status is already stopped
                        const currentNode = nodes.find(n => n.id === nodeId);
                        if (currentNode?.data.status === 'stopped') {
                            console.log(`🛑 Node ${nodeId} is already stopped, unsubscribing`);
                            WebSocketService.unsubscribe(processId);
                            if (timeoutId) clearTimeout(timeoutId);
                            isResolved = true;
                            reject(new Error('Node was stopped'));
                            return;
                        }

                        // Handle status updates
                        console.log(`🔍 Checking status for ${nodeId}: status="${status}", type=${typeof status}, length=${status.length}`);
                        if (status === 'completed') {
                            console.log(`✅ Node ${nodeId} completed via WebSocket! Status matched 'completed'`);

                            // Unsubscribe and clear timeout
                            WebSocketService.unsubscribe(processId);
                            if (timeoutId) clearTimeout(timeoutId);

                            // Get output
                            ApiService.getProcessOutput(processId)
                                .then(output => {
                                    if (isResolved) return;

                                    console.log(`📥 Retrieved output for ${nodeId}:`, {
                                        hasOutput: !!output,
                                        outputType: typeof output,
                                        outputKeys: output ? Object.keys(output) : null
                                    });

                                    // Validate the output before storing
                                    if (output && output.status === 'failed') {
                                        console.error(`❌ Node ${nodeId} returned failed status in output`);
                                        updateNodeStatus(nodeId, 'failed');
                                        updateNodeOutput(nodeId, output);
                                        isResolved = true;
                                        reject(new Error('Node returned failed status'));
                                        return;
                                    }

                                    if (output && output.fail_message) {
                                        console.error(`❌ Node ${nodeId} has fail message: ${output.fail_message}`);
                                        updateNodeStatus(nodeId, 'failed');
                                        updateNodeOutput(nodeId, output);
                                        isResolved = true;
                                        reject(new Error(output.fail_message));
                                        return;
                                    }

                                    updateNodeOutput(nodeId, output);
                                    console.log(`💾 Stored output for ${nodeId}`);

                                    updateNodeStatus(nodeId, 'completed');
                                    console.log(`✅ Updated ${nodeId} status to 'completed'`);

                                    isResolved = true;
                                    resolve(output);
                                })
                                .catch(outputError => {
                                    if (isResolved) return;
                                    console.error(`❌ Error getting output for ${nodeId}:`, outputError);
                                    updateNodeStatus(nodeId, 'failed');
                                    console.log(`❌ Updated ${nodeId} status to 'failed' due to output error`);
                                    isResolved = true;
                                    reject(outputError);
                                });
                        } else if (status === 'failed') {
                            console.error(`❌ Node ${nodeId} failed via WebSocket`);

                            // Unsubscribe and clear timeout
                            WebSocketService.unsubscribe(processId);
                            if (timeoutId) clearTimeout(timeoutId);

                            const errorMsg = statusData.error || statusData.fail_message || 'Task failed';
                            updateNodeStatus(nodeId, 'failed');
                            updateNodeOutput(nodeId, {
                                status: 'failed',
                                fail_message: errorMsg,
                                execution_logs: statusData.execution_logs || [`Task failed: ${errorMsg}`]
                            });

                            isResolved = true;
                            reject(new Error(errorMsg));
                        } else if (status === 'running' || status === 'started') {
                            // Update status to running (already set, but keep in sync)
                            updateNodeStatus(nodeId, 'running');
                        }
                    });

                    // Fallback to polling if WebSocket is not connected after 2 seconds
                    setTimeout(() => {
                        const wsStatus = WebSocketService.getStatus();
                        if (!wsStatus.isConnected && !isResolved) {
                            console.warn(`⚠️ WebSocket not connected, falling back to polling for ${nodeId}`);
                            WebSocketService.unsubscribe(processId);

                            // Fallback to polling
                            ApiService.pollTaskStatus(
                                processId,
                                (status, attempts) => {
                                    if (isResolved) return;
                                    console.log(`📊 Polling status update for ${nodeId} (attempt ${attempts}):`, status.status);

                                    if (cancelledNodesRef.current.has(nodeId)) {
                                        updateNodeStatus(nodeId, 'stopped');
                                        if (timeoutId) clearTimeout(timeoutId);
                                        isResolved = true;
                                        reject(new Error('Node was cancelled'));
                                        return;
                                    }

                                    const currentNode = nodes.find(n => n.id === nodeId);
                                    if (currentNode?.data.status === 'stopped') {
                                        if (timeoutId) clearTimeout(timeoutId);
                                        isResolved = true;
                                        reject(new Error('Node was stopped'));
                                        return;
                                    }
                                },
                                async (finalStatus) => {
                                    if (isResolved) return;
                                    if (timeoutId) clearTimeout(timeoutId);

                                    try {
                                        const output = await ApiService.getProcessOutput(processId);
                                        if (output && output.status === 'failed') {
                                            updateNodeStatus(nodeId, 'failed');
                                            updateNodeOutput(nodeId, output);
                                            isResolved = true;
                                            reject(new Error('Node returned failed status'));
                                            return;
                                        }
                                        if (output && output.fail_message) {
                                            updateNodeStatus(nodeId, 'failed');
                                            updateNodeOutput(nodeId, output);
                                            isResolved = true;
                                            reject(new Error(output.fail_message));
                                            return;
                                        }
                                        updateNodeOutput(nodeId, output);
                                        updateNodeStatus(nodeId, 'completed');
                                        isResolved = true;
                                        resolve(output);
                                    } catch (outputError) {
                                        updateNodeStatus(nodeId, 'failed');
                                        isResolved = true;
                                        reject(outputError);
                                    }
                                },
                                (error) => {
                                    if (isResolved) return;
                                    if (timeoutId) clearTimeout(timeoutId);

                                    if (error.message.includes('timeout')) {
                                        updateNodeStatus(nodeId, 'failed');
                                        updateNodeOutput(nodeId, {
                                            status: 'failed',
                                            fail_message: `Task timed out after ${CONSTANTS.TASK_TIMEOUT_MINUTES} minutes`,
                                            execution_logs: [`Task timed out: ${error.message}`]
                                        });
                                    } else if (error.message.includes('Backend is not responding')) {
                                        updateNodeStatus(nodeId, 'failed');
                                        updateNodeOutput(nodeId, {
                                            status: 'failed',
                                            fail_message: 'Backend is not responding. Please check server status.',
                                            execution_logs: [`Backend health check failed: ${error.message}`]
                                        });
                                    } else if (error.message.includes('Node was cancelled') || error.message.includes('Node was stopped')) {
                                        updateNodeStatus(nodeId, 'stopped');
                                    } else {
                                        updateNodeStatus(nodeId, 'failed');
                                        updateNodeOutput(nodeId, {
                                            status: 'failed',
                                            fail_message: error.message,
                                            execution_logs: [`Task failed: ${error.message}`]
                                        });
                                    }
                                    isResolved = true;
                                    reject(error);
                                },
                                {
                                    maxAttempts: CONSTANTS.MAX_POLLING_ATTEMPTS,
                                    interval: CONSTANTS.POLLING_INTERVAL,
                                    healthCheckInterval: CONSTANTS.HEALTH_CHECK_INTERVAL
                                }
                            );
                        }
                    }, 2000);
                });
            } else {
                // Legacy polling mode (original behavior)
                console.log(`⏰ Starting legacy polling for ${nodeId} - Interval: 5000ms (Will continue until completion)`);

                return new Promise((resolve, reject) => {
                    ApiService.legacyPollTaskStatus(
                        response.process_id,
                        // Status update callback
                        (status, attempts) => {
                            console.log(`📊 Legacy status update for ${nodeId} (attempt ${attempts}):`, status.status);

                            // Check if node has been cancelled
                            if (cancelledNodesRef.current.has(nodeId)) {
                                console.log(`🛑 Node ${nodeId} was cancelled, stopping polling`);
                                updateNodeStatus(nodeId, 'stopped');
                                reject(new Error('Node was cancelled'));
                                return;
                            }
                        },
                        // Completion callback
                        async (finalStatus) => {
                            console.log(`✅ Node ${nodeId} completed successfully!`);

                            try {
                                const output = await ApiService.getProcessOutput(response.process_id);
                                updateNodeOutput(nodeId, output);
                                updateNodeStatus(nodeId, 'completed');
                                resolve(output);
                            } catch (outputError) {
                                console.error(`❌ Error getting output for ${nodeId}:`, outputError);
                                updateNodeStatus(nodeId, 'failed');
                                reject(outputError);
                            }
                        },
                        // Error callback
                        (error) => {
                            console.error(`❌ Node ${nodeId} legacy polling error:`, error);
                            updateNodeStatus(nodeId, 'failed');
                            reject(error);
                        },
                        // Legacy configuration
                        {
                            maxAttempts: 17280,  // 24 hours = 17280 polls (5-second intervals)
                            interval: 5000       // 5 seconds (original interval)
                        }
                    );
                });
            }

        } catch (error) {
            console.error(`❌ Error in runNodeAndWait for ${nodeId}:`, error);
            console.error(`❌ Error details:`, {
                message: error.message,
                stack: error.stack,
                nodeId: nodeId
            });

            // Only set to failed if the node is not idle
            setNodes(nds => nds.map(node =>
                node.id === nodeId && node.data.status !== 'idle'
                    ? { ...node, data: { ...node.data, status: 'failed' } }
                    : node
            ));
            console.log(`❌ Set ${nodeId} status to 'failed' due to execution error`);
        }
    }, [nodes, setNodes, updateNodeStatus, updateNodeOutput, dependencyMap, nodeOutputs, validatedParams]);

    // Chain-dependency aware node runner with enhanced failed node handling
    const runNode = useCallback(async (nodeId) => {
        cancelledNodesRef.current = new Set();
        try {
            // Check if any dependencies have failed
            const dependencies = dependencyMap[nodeId] || [];
            for (const depId of dependencies) {
                const depNode = nodes.find(n => n.id === depId);
                if (depNode && depNode.data.status === 'failed') {
                    console.error(`❌ Cannot run ${nodeId}: dependency ${depId} has failed`);
                    updateNodeStatus(nodeId, 'failed');
                    return;
                }
            }

            await runNodeWithDependencies(
                nodeId,
                runNodeAndWait,
                dependencyMap,
                nodeStatusMap,
                nodeOutputs
            );
        } catch (err) {
            console.error(`❌ Error in runNode for ${nodeId}:`, err);
            updateNodeStatus(nodeId, 'failed');
            // Handle failure silently - no popup window
            console.log(`Node ${nodeId} failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }, [dependencyMap, nodeStatusMap, runNodeAndWait, nodeOutputs, runNodeWithDependencies, nodes, updateNodeStatus]);

    // Downstream reset logic
    const resetNodeAndDownstream = useCallback(async (nodeId) => {
        const toReset = Array.from(getAllDownstreamNodes(nodeId, downstreamMap));
        toReset.push(nodeId); // include the node itself
        // Add all to cancelledNodesRef
        toReset.forEach(id => cancelledNodesRef.current.add(id));

        // Reset nodes
        for (const id of toReset) {
            if (processIds[id]) {
                try { await ApiService.resetProcess(processIds[id]); } catch { }
            }
            if (nodeTimeouts.current[id]) {
                clearInterval(nodeTimeouts.current[id]);
                delete nodeTimeouts.current[id];
            }
            updateNodeStatus(id, 'idle');
            setNodeOutputs(prev => {
                const updated = { ...prev };
                delete updated[id];
                // localStorage is now handled by useEffect with lightweight data
                return updated;
            });
        }

        // Clear processIds for reset nodes so the Logs button disappears
        setProcessIds(prev => {
            const updated = { ...(prev || {}) };
            toReset.forEach(id => {
                delete updated[id];
            });
            return updated;
        });

        // Close log viewer if it was opened for a reset node
        setSelectedLogNode(prev => {
            if (!prev) return prev;
            return toReset.includes(prev.nodeId) ? null : prev;
        });

        // Reset edge colors and labels for all affected edges
        setEdges(eds => eds.map(edge => {
            if (toReset.includes(edge.source)) {
                return {
                    ...edge,
                    style: {
                        ...edge.style,
                        stroke: '#1e293b'
                    },
                    label: undefined, // Clear the data count label
                    labelStyle: undefined,
                    labelBgStyle: undefined
                };
            }
            return edge;
        }));
    }, [downstreamMap, processIds, updateNodeStatus, setNodeOutputs, setEdges, setProcessIds, setSelectedLogNode]);

    // Update nodes when areParamsApplied changes
    useEffect(() => {
        setNodes(nodes => nodes.map(node => ({
            ...node,
            data: {
                ...node.data,
                areParamsApplied
            }
        })));
    }, [areParamsApplied, setNodes]);

    // Update edge labels when nodeOutputs change
    useEffect(() => {
        setEdges(eds => eds.map(edge => {
            const sourceOutput = nodeOutputs && nodeOutputs[edge.source];
            // Use the count field from backend response (total rows generated)
            // instead of table length (frontend-limited rows)
            const rowCount = sourceOutput?.count ? parseInt(sourceOutput.count) :
                sourceOutput?.calculation_results?.table?.length;
            const sourceNode = nodes.find(n => n.id === edge.source);
            const sourceStatus = sourceNode?.data?.status;

            return {
                ...edge,
                label: sourceStatus === 'completed' && rowCount && rowCount > 0 ?
                    rowCount.toLocaleString() : undefined,
                labelStyle: {
                    fill: '#1f2937',
                    fontWeight: 'bold',
                    fontSize: '11px',
                    cursor: 'pointer'
                },
                labelBgStyle: {
                    fill: '#ffffff',
                    fillOpacity: 0.95,
                    stroke: '#3b82f6',
                    strokeWidth: 2,
                    cursor: 'pointer'
                },
                labelBgPadding: [6, 12],
                labelBgBorderRadius: 6
            };
        }));
    }, [nodeOutputs, nodes, setEdges]);

    // Define nodeTypes with the required props
    const nodeTypes = useMemo(() => ({
        custom: (props) => (
            <CustomNode
                {...props}
                nodeOutputs={nodeOutputs}
                setSelectedNode={setSelectedNode}
                setSelectedTab={setSelectedTab}
                setIsBottomBarOpen={setIsBottomBarOpen}
                setActivePanel={setActivePanel}
                processIds={processIds}
                setSelectedLogNode={setSelectedLogNode}
            />
        )
    }), [nodeOutputs, setSelectedNode, setSelectedTab, setIsBottomBarOpen, setActivePanel, processIds, setSelectedLogNode]);

    // Persist nodes to localStorage whenever they change
    useEffect(() => {
        const success = safeLocalStorageSet(nodesKey, JSON.stringify(nodes));
        if (!success) {
            console.warn('Failed to save nodes to localStorage');
        }
    }, [nodes, nodesKey, nodeOutputsKey]);

    // Add the onStop handler - data view safe implementation
    const onStop = useCallback(async (nodeId) => {
        try {
            // Add the stopped node to cancelled nodes
            cancelledNodesRef.current.add(nodeId);

            // Get current values using refs to avoid dependencies
            const currentDownstreamMap = buildDownstreamMap(edgesRef.current);
            const downstreamNodes = Array.from(getAllDownstreamNodes(nodeId, currentDownstreamMap));

            // Set all downstream nodes to idle status (they were queued/running)
            downstreamNodes.forEach(downstreamId => {
                if (downstreamId !== nodeId) { // Don't update the stopped node itself
                    // Use updateNodeStatus which will handle the node state update
                    updateNodeStatus(downstreamId, 'idle');
                    // Also add to cancelled nodes to prevent them from running
                    cancelledNodesRef.current.add(downstreamId);
                }
            });

            // Update edge styling for all affected edges using ref
            setEdgesRef.current(eds => eds.map(edge => {
                if (downstreamNodes.includes(edge.source)) {
                    return {
                        ...edge,
                        style: {
                            ...edge.style,
                            stroke: '#1e293b' // Reset to default color
                        }
                    };
                }
                return edge;
            }));

            const processId = processIds[nodeId];
            if (!processId) {
                console.warn(`No processId found for node ${nodeId}`);
                return;
            }
            try {
                await ApiService.stopProcess(processId);
                updateNodeStatus(nodeId, 'stopped');
            } catch (error) {
                console.error(`Failed to stop process for node ${nodeId}:`, error);
            }
        } catch (error) {
            console.error('Error in onStop:', error);
        }
    }, [processIds, updateNodeStatus]);

    // Inject onStop into node data with stable approach
    useEffect(() => {
        setNodes(nds =>
            nds.map(node => ({
                ...node,
                data: {
                    ...node.data,
                    onStop
                }
            }))
        );
    }, [onStop, setNodes]);

    // Add error boundary and loading state
    const [hasError, setHasError] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Set loading to false after component mounts
        const timer = setTimeout(() => {
            setIsLoading(false);
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    // Error boundary
    if (hasError) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'white', color: 'black' }}>
                <div className="text-center">
                    <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        Reload Page
                    </button>
                </div>
            </div>
        );
    }

    // Loading state
    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'white', color: 'black' }}>
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <div className="text-lg">Loading Completeness Control...</div>
                </div>
            </div>
        );
    }

    try {
        return (
            <HandlerContext.Provider value={{ runNode, resetNodeAndDownstream }}>
                <div className="min-h-screen" style={{ backgroundColor: 'white' }}>
                    {/* Main Content */}
                    <div
                        className="flex flex-col h-screen transition-all duration-300 ease-in-out"
                        style={{
                            marginRight: isSidebarOpen ? `${sidebarWidth}px` : '32px'
                        }}
                    >
                        {/* Flow Container */}
                        <div
                            className="flex-1 overflow-hidden flex flex-col"
                            style={{
                                height: isBottomBarOpen
                                    ? `calc(100vh - ${bottomBarHeight}px)`
                                    : 'calc(100vh - 48px)'
                            }}
                        >
                            <div
                                className="border-b border-slate-200 px-8 py-4"
                                style={{
                                    backgroundColor: 'white',
                                    height: '80px', // Fixed desktop header height
                                    boxShadow: `
                                    0 4px 8px rgba(0,0,0,0.15),
                                    0 8px 16px rgba(0,0,0,0.1),
                                    0 2px 4px rgba(0,0,0,0.1),
                                    inset 0 2px 0 rgba(255,255,255,0.8),
                                    inset 0 -2px 0 rgba(0,0,0,0.1)
                                `
                                }}
                            >
                                <div className="flex items-center justify-between h-full">
                                    {/* HSBC Logo and Name - Left */}
                                    <div className="flex items-center flex-shrink-0">
                                        <HSBCLogo
                                            height={64}
                                            className="mr-4"
                                        />
                                    </div>

                                    {/* Professional Title - Center */}
                                    <div className="flex-1 flex justify-center">
                                        <h1 className="text-2xl font-bold text-black text-center">
                                            GENERIC COMPLETENESS CONTROL
                                        </h1>
                                    </div>

                                    {/* Backend Health Indicator - Right */}
                                    <div className="flex-shrink-0 flex items-center gap-2">
                                        <div className={`px-3 py-1 rounded-lg text-sm font-medium ${isBackendHealthy ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                            }`}>
                                            {isBackendHealthy ? '🟢' : '🔴'} {backendHealthMessage}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div
                                className="relative h-full"
                                style={{
                                    background: 'white',
                                    boxShadow: `
                                    inset 0 4px 8px rgba(0,0,0,0.08),
                                    inset 0 2px 4px rgba(0,0,0,0.05),
                                    inset 0 8px 16px rgba(0,0,0,0.02),
                                    inset 0 -2px 4px rgba(255,255,255,0.9),
                                    0 1px 0 rgba(255,255,255,0.95)
                                `,
                                    border: '24px solid #f5f5f5',
                                    borderRadius: '8px'
                                }}
                                onClick={() => setActivePanel(null)}
                            >
                                <ReactFlow
                                    nodes={nodes}
                                    edges={edges}
                                    onNodesChange={onNodesChange}
                                    onEdgesChange={onEdgesChange}
                                    onConnect={onConnect}
                                    onEdgeClick={onEdgeClick}
                                    onNodeDoubleClick={onNodeDoubleClick}
                                    nodeTypes={nodeTypes}
                                    connectionMode={ConnectionMode.Loose}
                                    fitView
                                    minZoom={0.5}
                                    maxZoom={2}
                                    nodesDraggable={false}
                                    panOnDrag={true}
                                    zoomOnScroll={false}
                                    preventScrolling={true}
                                    className="bg-transparent"
                                    selectNodesOnDrag={false}
                                    onSelectionChange={onSelectionChange}
                                    multiSelectionKeyCode="Control"
                                    proOptions={{ hideAttribution: true }}
                                >
                                    <Background
                                        color="#f3f4f6"
                                        gap={20}
                                        className="bg-white"
                                    />
                                    <Controls className="bg-slate-800 border border-slate-700/50 rounded-lg" />
                                </ReactFlow>
                            </div>
                        </div>

                        {/* Bottom Data View Bar with Resize Handle */}
                        <div
                            className={`
                            relative bg-white border-t border-slate-200
                            transition-all duration-300 ease-in-out
                            ${!isBottomBarOpen ? 'h-12' : ''}
                        `}
                            style={{
                                height: isBottomBarOpen ? `${bottomBarHeight}px` : '48px',
                                minHeight: isBottomBarOpen ? `${minHeight}px` : '48px',
                                maxHeight: isBottomBarOpen ? `${maxHeight}px` : '48px',
                                transition: isResizingBottom ? 'none' : undefined,
                                zIndex: activePanel === 'bottombar' ? 50 : 10,

                            }}
                            onClick={() => setActivePanel('bottombar')}
                        >
                            {/* Resize Handle - only show when open */}
                            {isBottomBarOpen && (
                                <div
                                    className={`
                                    absolute -top-1 left-0 w-full h-2 cursor-row-resize z-10
                                    ${isResizingBottom ? 'bg-slate-700' : 'bg-transparent hover:bg-slate-700/30'}
                                    transition-colors
                                `}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        setIsResizingBottom(true);
                                    }}
                                >
                                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                                        <FaGripLines className="text-slate-700/70" />
                                    </div>
                                </div>
                            )}

                            {/* Header Bar */}
                            <div className="flex items-center justify-between h-12 px-4 border-b border-slate-700/50">
                                {/* Tab Buttons - Left */}
                                <div className="flex gap-1">
                                    <button onClick={() => setSelectedTab('histogram')} className={`px-2 py-1 rounded text-xs ${selectedTab === 'histogram' ? 'bg-slate-800 text-emerald-400' : 'bg-slate-700 text-slate-300'}`}>Histogram</button>
                                    <button onClick={() => setSelectedTab('data')} className={`px-2 py-1 rounded text-xs ${selectedTab === 'data' ? 'bg-slate-800 text-emerald-400' : 'bg-slate-700 text-slate-300'}`}>Data Output</button>
                                    <button onClick={() => setSelectedTab('log')} className={`px-2 py-1 rounded text-xs ${selectedTab === 'log' ? 'bg-slate-800 text-emerald-400' : 'bg-slate-700 text-slate-300'}`}>Log</button>
                                    <button onClick={() => setSelectedTab('fail')} className={`px-2 py-1 rounded text-xs ${selectedTab === 'fail' ? 'bg-slate-800 text-emerald-400' : 'bg-slate-700 text-slate-300'}`}>Fail Message</button>
                                </div>

                                {/* DataView Button - Center */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsBottomBarOpen(!isBottomBarOpen);
                                        // Unlock data view when user explicitly closes it
                                        if (isBottomBarOpen) {
                                            setDataViewLocked(false);
                                        }
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors shadow-md"
                                >
                                    <FaTable className="w-4 h-4" />
                                    <span>DataView</span>
                                    {selectedNode && (
                                        <>
                                            <span className="w-1 h-1 bg-white rounded-full"></span>
                                            <span className="text-sm">
                                                {selectedNode.data.fullName || selectedNode.id}
                                            </span>
                                        </>
                                    )}
                                    <FaChevronUp
                                        className={`
                                        w-3 h-3 transition-transform duration-300
                                    ${isBottomBarOpen ? '' : 'rotate-180'}
                                `}
                                    />
                                </button>

                                {/* Spacer - Right */}
                                <div className="w-16"></div>
                            </div>

                            {/* Content - only show when open */}
                            {isBottomBarOpen && (
                                <div className="h-[calc(100%-48px)] px-4 overflow-y-auto">
                                    {selectedNode ? (
                                        <div className="flex-1 text-sm text-slate-300 h-full overflow-hidden">
                                            {/* Tab Content */}
                                            <div className="mt-2">
                                                {selectedTab === 'histogram' && (
                                                    <div>
                                                        {/* Show histogram data with statistics */}
                                                        {selectedNode.data.output?.histogram_data ? (
                                                            <div className="flex flex-col h-full">
                                                                <div className="mb-2">
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                        <span className="font-semibold text-black text-sm">Histogram Analysis ({selectedNode.data.output.histogram_data.length} columns)</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <select
                                                                            value={histogramFilterType}
                                                                            onChange={e => setHistogramFilterType(e.target.value)}
                                                                            className="px-3 py-1 rounded bg-white text-black text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                                        >
                                                                            <option value="contains">Contains</option>
                                                                            <option value="equals">Equals</option>
                                                                            <option value="startsWith">Starts With</option>
                                                                            <option value="endsWith">Ends With</option>
                                                                        </select>
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Filter column names..."
                                                                            value={histogramFilterValue}
                                                                            onChange={e => setHistogramFilterValue(e.target.value)}
                                                                            className="px-3 py-1 rounded bg-white text-black text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 flex-1"
                                                                            style={{ minWidth: 120 }}
                                                                        />
                                                                        <button
                                                                            onClick={() => {
                                                                                setHistogramFilterValue('');
                                                                                setHistogramFilterType('contains');
                                                                            }}
                                                                            className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-black text-sm border border-gray-300 transition-colors"
                                                                        >
                                                                            Reset
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                <div
                                                                    className="border border-gray-300 rounded bg-blue-100 overflow-auto"
                                                                    style={{
                                                                        height: `${bottomBarHeight - 140}px`
                                                                    }}
                                                                >
                                                                    <div className="p-4">
                                                                        {(() => {
                                                                            const histogramData = selectedNode.data.output.histogram_data;
                                                                            const filteredHistogram = histogramData.filter((item) => {
                                                                                if (!histogramFilterValue) return true;

                                                                                const columnName = item.column_name.toLowerCase();
                                                                                const filterValue = histogramFilterValue.toLowerCase();

                                                                                switch (histogramFilterType) {
                                                                                    case 'equals':
                                                                                        return columnName === filterValue;
                                                                                    case 'startsWith':
                                                                                        return columnName.startsWith(filterValue);
                                                                                    case 'endsWith':
                                                                                        return columnName.endsWith(filterValue);
                                                                                    case 'contains':
                                                                                    default:
                                                                                        return columnName.includes(filterValue);
                                                                                }
                                                                            });

                                                                            return filteredHistogram.length > 0 ? (
                                                                                <div className="space-y-3">
                                                                                    {filteredHistogram.map((item, idx) => (
                                                                                        <div key={idx} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                                                                                            <div className="flex items-center justify-between mb-3">
                                                                                                <h3 className="text-lg font-semibold text-gray-800">
                                                                                                    {item.column_name}
                                                                                                </h3>
                                                                                                <span className={`px-2 py-1 rounded text-xs font-medium ${item.data_type === 'text' ? 'bg-blue-100 text-blue-800' :
                                                                                                    item.data_type === 'numeric' ? 'bg-green-100 text-green-800' :
                                                                                                        'bg-gray-100 text-gray-800'
                                                                                                    }`}>
                                                                                                    {item.data_type}
                                                                                                </span>
                                                                                            </div>

                                                                                            <div className="grid grid-cols-2 gap-4 mb-3">
                                                                                                <div>
                                                                                                    <span className="text-sm font-medium text-gray-600">Total Values:</span>
                                                                                                    <span className="ml-2 text-sm text-gray-800">{item.total_values.toLocaleString()}</span>
                                                                                                </div>
                                                                                                <div>
                                                                                                    <span className="text-sm font-medium text-gray-600">Unique Values:</span>
                                                                                                    <span className="ml-2 text-sm text-gray-800">{item.unique_count.toLocaleString()}</span>
                                                                                                </div>
                                                                                            </div>

                                                                                            {/* Display Top 5 Values with Counts */}
                                                                                            {item.top_values && item.top_values.length > 0 && (
                                                                                                <div className="mt-3 pt-3 border-t border-gray-200">
                                                                                                    <h4 className="text-sm font-medium text-gray-700 mb-2">Top 5 Most Frequent Values:</h4>
                                                                                                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-3">
                                                                                                        <div className="space-y-2">
                                                                                                            {item.top_values.map((topValue, topIdx) => {
                                                                                                                const percentage = ((topValue.count / item.total_values) * 100).toFixed(2);
                                                                                                                const maxCount = Math.max(...item.top_values.map(tv => tv.count));
                                                                                                                const barWidth = (topValue.count / maxCount) * 100;

                                                                                                                return (
                                                                                                                    <div key={topIdx} className="bg-white rounded border border-blue-200 p-2 shadow-sm">
                                                                                                                        <div className="flex items-center justify-between mb-1">
                                                                                                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                                                                                <span className="text-blue-600 font-bold text-sm w-6 text-center flex-shrink-0">#{topIdx + 1}</span>
                                                                                                                                <span
                                                                                                                                    className="text-gray-800 font-mono text-sm truncate flex-1"
                                                                                                                                    title={String(topValue.value)}
                                                                                                                                >
                                                                                                                                    {String(topValue.value).length > 40 ?
                                                                                                                                        String(topValue.value).substring(0, 40) + '...' :
                                                                                                                                        String(topValue.value)
                                                                                                                                    }
                                                                                                                                </span>
                                                                                                                            </div>
                                                                                                                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                                                                                                                <span className="text-gray-600 text-xs font-medium">{percentage}%</span>
                                                                                                                                <span className="text-blue-600 text-sm font-bold bg-blue-100 px-2 py-1 rounded">
                                                                                                                                    {topValue.count.toLocaleString()}
                                                                                                                                </span>
                                                                                                                            </div>
                                                                                                                        </div>
                                                                                                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                                                                                                            <div
                                                                                                                                className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full transition-all duration-300"
                                                                                                                                style={{ width: `${barWidth}%` }}
                                                                                                                            ></div>
                                                                                                                        </div>
                                                                                                                    </div>
                                                                                                                );
                                                                                                            })}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </div>
                                                                                            )}

                                                                                            {/* Display first 50 unique values - Backend provides first 50 unique values as requested */}
                                                                                            {item.unique_values && item.unique_values.length > 0 && (
                                                                                                <div className="mt-3 pt-3 border-t border-gray-200">
                                                                                                    <div className="flex items-center justify-between mb-2">
                                                                                                        <h4 className="text-sm font-medium text-gray-700">Unique Values Preview:</h4>
                                                                                                        <span className="text-xs text-gray-500">
                                                                                                            Showing {Math.min(item.unique_values.length, 50)} of {item.unique_count.toLocaleString()} unique
                                                                                                        </span>
                                                                                                    </div>
                                                                                                    <div className="max-h-60 overflow-y-auto bg-white rounded border border-gray-300 p-3">
                                                                                                        <div className="space-y-1">
                                                                                                            {item.unique_values.slice(0, 50).map((value, valIdx) => (
                                                                                                                <div key={valIdx} className="flex items-center text-sm p-2 hover:bg-blue-50 rounded border border-transparent hover:border-blue-200 transition-colors">
                                                                                                                    <span className="text-blue-600 w-8 text-right mr-3 font-medium">{valIdx + 1}.</span>
                                                                                                                    <span
                                                                                                                        className="text-gray-800 font-mono flex-1 break-all"
                                                                                                                        title={String(value)}
                                                                                                                    >
                                                                                                                        {String(value).length > 100 ?
                                                                                                                            String(value).substring(0, 100) + '...' :
                                                                                                                            String(value)
                                                                                                                        }
                                                                                                                    </span>
                                                                                                                </div>
                                                                                                            ))}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                    {item.unique_count > 50 && (
                                                                                                        <div className="mt-2 text-xs text-gray-500 text-center">
                                                                                                            ... and {item.unique_count - 50} more unique values
                                                                                                        </div>
                                                                                                    )}
                                                                                                </div>
                                                                                            )}

                                                                                            {/* Note: Summary and distribution data removed from backend for performance */}
                                                                                            {/* Only unique values are displayed now */}
                                                                                        </div>
                                                                                    ))}
                                                                                    <div className="mt-4 text-sm text-gray-600 border-t border-gray-200 pt-2">
                                                                                        Showing {filteredHistogram.length} of {histogramData.length} columns
                                                                                    </div>
                                                                                </div>
                                                                            ) : (
                                                                                <div className="text-gray-600 text-center py-8">No columns found matching the filter criteria.</div>
                                                                            );
                                                                        })()}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div>No columns found.</div>
                                                        )}
                                                    </div>
                                                )}
                                                {selectedTab === 'data' && (
                                                    <div>
                                                        {/* New Optimized Data Output Tab */}
                                                        {(selectedNode.data.output?.calculation_results?.headers && selectedNode.data.output?.calculation_results?.table) ||
                                                            (selectedNode.data.output?.file_info && selectedNode.data.output?.status === 'success') ? (
                                                            <div className="flex flex-col h-full">
                                                                <DataOutputTab
                                                                    key={`data-output-${selectedNode.id}`}
                                                                    selectedNode={selectedNode}
                                                                    bottomBarHeight={bottomBarHeight}
                                                                    onError={(error) => {
                                                                        console.error('Data Output Error:', error);
                                                                        // Handle error - could show notification or fallback
                                                                    }}
                                                                />
                                                            </div>
                                                        ) : selectedNode.data.output?.calculation_results ? (
                                                            <div>
                                                                <h3 className="text-emerald-400 font-medium mb-2">Calculation Results:</h3>
                                                                <div
                                                                    className="bg-slate-900/50 rounded p-2 overflow-y-auto"
                                                                    style={{ height: `${bottomBarHeight - 100}px` }}
                                                                >
                                                                    <pre className="text-slate-300 whitespace-pre-wrap">
                                                                        {JSON.stringify(selectedNode.data.output.calculation_results, null, 2)}
                                                                    </pre>
                                                                </div>
                                                            </div>
                                                        ) : 'No data output. Please run the Node to see data.'}
                                                    </div>
                                                )}
                                                {selectedTab === 'log' && (
                                                    <div>
                                                        {/* Execution Logs */}
                                                        {selectedNode.data.output?.execution_logs ? (
                                                            <div>
                                                                <h3 className="text-emerald-400 font-medium mb-2">Execution Logs:</h3>
                                                                <div
                                                                    className="bg-slate-900/50 rounded p-2 space-y-1 overflow-y-auto"
                                                                    style={{ height: `${bottomBarHeight - 100}px` }}
                                                                >
                                                                    {selectedNode.data.output.execution_logs.map((log, index) => (
                                                                        <div key={index} className="text-slate-300">
                                                                            {log}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ) : 'No logs.'}
                                                    </div>
                                                )}
                                                {selectedTab === 'fail' && (
                                                    <div className="h-full overflow-auto">
                                                        {/* Fail Message display - Enhanced */}
                                                        {selectedNode.data.output?.fail_message || selectedNode.data.output?.error || selectedNode.data.status === 'failed' ? (
                                                            <div className="space-y-4 p-2">
                                                                {/* Error Banner */}
                                                                <div className="bg-red-600 text-white rounded-lg p-4 shadow-lg">
                                                                    <div className="flex items-center gap-3 mb-2">
                                                                        <FaTimesCircle className="w-8 h-8" />
                                                                        <div>
                                                                            <h3 className="text-xl font-bold">Node Execution Failed</h3>
                                                                            <p className="text-red-100 text-sm">Node: {selectedNode.data.fullName || selectedNode.id}</p>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Error Message */}
                                                                <div className="bg-white border-2 border-red-300 rounded-lg p-4 shadow">
                                                                    <h4 className="text-base font-bold text-red-900 mb-3 flex items-center gap-2">
                                                                        <FaTimesCircle className="text-red-600" />
                                                                        Error Details
                                                                    </h4>
                                                                    <div className="bg-red-50 p-4 rounded border-l-4 border-red-500">
                                                                        <pre className="text-sm text-red-800 whitespace-pre-wrap font-mono leading-relaxed">
                                                                            {selectedNode.data.output?.fail_message ||
                                                                                selectedNode.data.output?.error ||
                                                                                'Node failed but no error message provided'}
                                                                        </pre>
                                                                    </div>
                                                                </div>

                                                                {/* Execution Logs */}
                                                                {selectedNode.data.output?.execution_logs && selectedNode.data.output.execution_logs.length > 0 && (
                                                                    <div className="bg-white border border-red-200 rounded-lg p-4 shadow">
                                                                        <h4 className="text-base font-bold text-red-800 mb-3">Execution Logs:</h4>
                                                                        <div className="bg-red-50 p-3 rounded border max-h-96 overflow-auto">
                                                                            {selectedNode.data.output.execution_logs.map((log, index) => (
                                                                                <div key={index} className="mb-2 p-2 bg-white rounded border-l-2 border-red-400">
                                                                                    <span className="text-red-700 font-semibold">[{index + 1}]</span>{' '}
                                                                                    <span className="text-gray-800">{log}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Node Status Info */}
                                                                <div className="bg-gray-100 border border-gray-300 rounded-lg p-4">
                                                                    <h4 className="text-sm font-bold text-gray-800 mb-2">Node Information:</h4>
                                                                    <div className="space-y-1 text-sm text-gray-700">
                                                                        <p><strong>Node ID:</strong> {selectedNode.id}</p>
                                                                        <p><strong>Node Name:</strong> {selectedNode.data.fullName}</p>
                                                                        <p><strong>Status:</strong> <span className="text-red-600 font-semibold">{selectedNode.data.status}</span></p>
                                                                        {selectedNode.data.output?.step_type && (
                                                                            <p><strong>Step Type:</strong> {selectedNode.data.output.step_type}</p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col items-center justify-center py-12">
                                                                <FaCheckCircle className="w-16 h-16 text-green-500 mb-4" />
                                                                <div className="text-green-700 text-center text-lg font-semibold">
                                                                    No Errors
                                                                </div>
                                                                <div className="text-gray-600 text-center mt-2">
                                                                    This node executed successfully without any errors.
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center h-full text-slate-400">
                                            Select a node to view its output
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Collapsed state indicator - removed since we now have the button */}
                        </div>
                    </div>



                    {/* Right Sidebar */}
                    <div
                        ref={resizeRef}
                        className={`
                        fixed right-0 top-20 h-[calc(100vh-5rem)] bg-white border-l border-slate-200
                    transition-all duration-300 ease-in-out
                    ${!isSidebarOpen ? 'w-12' : ''}
                `}
                        style={{
                            width: isSidebarOpen ? `${sidebarWidth}px` : '32px',
                            transition: isResizing ? 'none' : undefined,
                            zIndex: activePanel === 'sidebar' ? 50 : 20
                        }}
                        // Removed double click functionality
                        onClick={() => setActivePanel('sidebar')}
                    >
                        {/* Resize Handle */}
                        <div
                            className={`
                            absolute left-0 top-0 h-full w-1 cursor-col-resize
                            ${isResizing ? 'bg-slate-700' : 'hover:bg-slate-700/30'}
                            transition-colors
                        `}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                setIsResizing(true);

                                const startX = e.pageX;
                                const startWidth = sidebarWidth;

                                const handleMouseMove = (moveEvent) => {
                                    const deltaX = startX - moveEvent.pageX;
                                    const newWidth = Math.min(Math.max(startWidth + deltaX, minWidth), maxWidth);
                                    setSidebarWidth(newWidth);
                                };

                                const handleMouseUp = () => {
                                    document.removeEventListener('mousemove', handleMouseMove);
                                    document.removeEventListener('mouseup', handleMouseUp);
                                    setIsResizing(false);
                                };

                                document.addEventListener('mousemove', handleMouseMove);
                                document.addEventListener('mouseup', handleMouseUp);
                            }}
                        />

                        {/* Run Parameters Button - Vertical (when closed) */}
                        {!isSidebarOpen && (
                            <div className="flex items-center justify-center h-full px-0">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsSidebarOpen(!isSidebarOpen);
                                    }}
                                    className="flex flex-col items-center gap-2 px-1 py-8 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-medium transition-colors shadow-md w-8"
                                    style={{
                                        writingMode: 'vertical-rl',
                                        textOrientation: 'mixed'
                                    }}
                                >
                                    <span style={{ transform: 'rotate(180deg)' }}>
                                        Run Parameters
                                    </span>
                                    <FaChevronLeft
                                        className={`
                                        w-3 h-3 transition-transform duration-300
                                ${isSidebarOpen ? '' : 'rotate-180'}
                            `}
                                    />
                                </button>
                            </div>
                        )}

                        {/* Collapse Button (when open) - Bottom */}
                        {isSidebarOpen && (
                            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center h-16 px-0 border-t border-slate-700/50 bg-white">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsSidebarOpen(!isSidebarOpen);
                                    }}
                                    className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors shadow-md"
                                >
                                    <span>Run Parameters</span>
                                    <FaChevronLeft
                                        className={`
                                        w-3 h-3 transition-transform duration-300
                                        ${isSidebarOpen ? '' : 'rotate-180'}
                                    `}
                                    />
                                </button>
                            </div>
                        )}

                        {/* Sidebar Content */}
                        {isSidebarOpen && (
                            <div className="px-3 py-3 overflow-y-auto h-full bg-gray-50">
                                <div className="space-y-4">
                                    {/* Recent Instances (per user) */}
                                    <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
                                        <div className="flex items-center justify-between gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setRecentInstancesOpen((v) => !v)}
                                                className="w-full px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-medium transition-colors shadow-sm"
                                                title="Recent instances"
                                            >
                                                Recent instances
                                            </button>
                                        </div>

                                        {recentInstancesOpen && (
                                            <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
                                                {recentInstances.length === 0 ? (
                                                    <div className="px-3 py-3 text-xs text-gray-500">
                                                        No recent instances yet.
                                                    </div>
                                                ) : (
                                                    recentInstances.map((item) => (
                                                        <div key={item.instanceId} className="flex items-stretch border-b border-gray-100 last:border-b-0">
                                                            <button
                                                                type="button"
                                                                onClick={() => navigate(`/instances/completeness/${item.instanceId}`)}
                                                                className="flex-1 text-left px-3 py-2 hover:bg-gray-50"
                                                                title={item.instanceId}
                                                            >
                                                                <div className="text-xs font-semibold text-gray-800 truncate">
                                                                    {getInstanceDisplayLabel(item)}
                                                                </div>
                                                                {item.lastVisitedAt && (
                                                                    <div className="text-[11px] text-gray-500">
                                                                        {new Date(item.lastVisitedAt).toLocaleString()}
                                                                    </div>
                                                                )}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const text = String(item.instanceId || '');
                                                                    if (!text) return;
                                                                    if (navigator?.clipboard?.writeText) {
                                                                        navigator.clipboard.writeText(text).catch(() => { });
                                                                    }
                                                                }}
                                                                className="px-3 text-xs font-bold text-gray-700 hover:bg-gray-100 border-l border-gray-100"
                                                                title="Copy instance id"
                                                            >
                                                                Copy
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => window.open(`/instances/completeness/${item.instanceId}`, '_blank')}
                                                                className="px-3 text-xs font-bold text-blue-700 hover:bg-blue-50 border-l border-gray-100"
                                                                title="Open in new tab"
                                                            >
                                                                Open
                                                            </button>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* CONFIGURATION Section */}
                                    <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
                                        <h4 className="text-gray-800 font-bold text-xs uppercase mb-3 tracking-wide">CONFIGURATION</h4>
                                        <div className="space-y-3">
                                            {renderParameterInputs(['inputConfigFilePath', 'inputConfigFilePattern', 'rootFileDir'])}
                                        </div>
                                    </div>

                                    {/* ENVIRONMENT Section */}
                                    <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
                                        <h4 className="text-gray-800 font-bold text-xs uppercase mb-3 tracking-wide">ENVIRONMENT</h4>
                                        <div className="space-y-3">
                                            {renderParameterInputs(['runEnv', 'expectedRunDate', 'testRun'])}
                                        </div>
                                    </div>

                                    {/* SYSTEM Section */}
                                    <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
                                        <h4 className="text-gray-800 font-bold text-xs uppercase mb-3 tracking-wide">SYSTEM</h4>
                                        <div className="space-y-3">
                                            {renderParameterInputs(['tempFilePath'])}
                                        </div>
                                    </div>

                                    {/* ACTIONS Section */}
                                    <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
                                        <h4 className="text-gray-800 font-bold text-xs uppercase mb-3 tracking-wide">ACTIONS</h4>
                                        <div className="space-y-2">
                                            {/* Apply Parameters Button */}
                                            <button
                                                onClick={handleApplyParams}
                                                className="w-full px-3 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs 
                                            font-medium transition-all duration-200 shadow-sm hover:shadow-md flex items-center justify-center gap-1.5"
                                            >
                                                <FaCheck className="w-3 h-3" />
                                                Apply Parameters
                                            </button>

                                            {/* Reset All Button */}
                                            <button
                                                onClick={resetAllNodes}
                                                className="w-full px-3 py-2.5 bg-gray-700 hover:bg-gray-800 text-white rounded-lg text-xs 
                                            font-medium transition-all duration-200 shadow-sm hover:shadow-md flex items-center justify-center gap-1.5"
                                            >
                                                <FaUndo className="w-3 h-3" />
                                                Reset All Nodes
                                            </button>
                                        </div>

                                        {/* Validation Message */}
                                        {paramValidation.message && (
                                            <div className={`mt-2 p-2 rounded-lg text-xs ${paramValidation.isValid
                                                ? 'bg-green-50 text-green-800 border border-green-200'
                                                : 'bg-red-50 text-red-800 border border-red-200'
                                                }`}>
                                                {paramValidation.message}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                </div>

                {/* ETL Log Viewer Modal */}
                {selectedLogNode && (
                    <ETLLogViewer
                        taskId={selectedLogNode.taskId}
                        nodeId={selectedLogNode.nodeId}
                        onClose={() => setSelectedLogNode(null)}
                        taskStatus={selectedLogNode.status}
                    />
                )}
            </HandlerContext.Provider>
        );
    } catch (error) {
        console.error('Error rendering CompletenessControl:', error);
        setHasError(true);
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'white', color: 'black' }}>
                <div className="text-center">
                    <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
                    <p className="mb-4 text-red-600">{error.message}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        Reload Page
                    </button>
                </div>
            </div>
        );
    }
} 