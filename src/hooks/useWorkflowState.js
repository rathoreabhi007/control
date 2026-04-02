import { useState, useCallback, useMemo } from 'react';
import { useNodesState, useEdgesState } from 'reactflow';
import { buildDependencyMap, buildDownstreamMap, getAllDownstreamNodes } from '../utils/graph-utils';

/**
 * Custom hook for managing workflow state
 * Handles nodes, edges, dependencies, and workflow operations
 */
export const useWorkflowState = (initialNodes, initialEdges) => {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    // Build dependency maps
    const dependencyMap = useMemo(() => buildDependencyMap(edges), [edges]);
    const downstreamMap = useMemo(() => buildDownstreamMap(edges), [edges]);

    // Node status map for quick lookups
    const nodeStatusMap = useMemo(() => {
        const statusMap = {};
        nodes.forEach(node => {
            statusMap[node.id] = node.data.status;
        });
        return statusMap;
    }, [nodes]);

    // Get all downstream nodes that need to be reset
    const getDownstreamNodes = useCallback((nodeId) => {
        return Array.from(getAllDownstreamNodes(nodeId, downstreamMap));
    }, [downstreamMap]);

    // Check if a node can be run (all dependencies completed)
    const canRunNode = useCallback((nodeId) => {
        const dependencies = dependencyMap[nodeId] || [];
        return dependencies.every(depId => {
            const depNode = nodes.find(n => n.id === depId);
            return depNode && depNode.data.status === 'completed';
        });
    }, [dependencyMap, nodes]);

    // Get nodes that are ready to run
    const getReadyNodes = useCallback(() => {
        return nodes.filter(node => {
            if (node.data.status !== 'idle') return false;
            return canRunNode(node.id);
        });
    }, [nodes, canRunNode]);

    // Get nodes that are currently running
    const getRunningNodes = useCallback(() => {
        return nodes.filter(node => node.data.status === 'running');
    }, [nodes]);

    // Get nodes that have failed
    const getFailedNodes = useCallback(() => {
        return nodes.filter(node => node.data.status === 'failed');
    }, [nodes]);

    // Get completed nodes
    const getCompletedNodes = useCallback(() => {
        return nodes.filter(node => node.data.status === 'completed');
    }, [nodes]);

    // Update node status
    const updateNodeStatus = useCallback((nodeId, status) => {
        setNodes(nds => nds.map(node =>
            node.id === nodeId
                ? { ...node, data: { ...node.data, status } }
                : node
        ));
    }, [setNodes]);

    // Reset node and its downstream nodes
    const resetNodeAndDownstream = useCallback((nodeId) => {
        const toReset = getDownstreamNodes(nodeId);
        toReset.push(nodeId); // include the node itself

        setNodes(nds => nds.map(node =>
            toReset.includes(node.id)
                ? { ...node, data: { ...node.data, status: 'idle' } }
                : node
        ));

        return toReset;
    }, [getDownstreamNodes, setNodes]);

    // Reset all nodes
    const resetAllNodes = useCallback(() => {
        setNodes(nds => nds.map(node => ({
            ...node,
            data: { ...node.data, status: 'idle' }
        })));
    }, [setNodes]);

    // Check if workflow is complete
    const isWorkflowComplete = useCallback(() => {
        return nodes.every(node =>
            node.data.status === 'completed' ||
            node.data.status === 'failed' ||
            node.data.status === 'stopped'
        );
    }, [nodes]);

    // Get workflow progress
    const getWorkflowProgress = useCallback(() => {
        const total = nodes.length;
        const completed = getCompletedNodes().length;
        const failed = getFailedNodes().length;
        const running = getRunningNodes().length;
        const idle = total - completed - failed - running;

        return {
            total,
            completed,
            failed,
            running,
            idle,
            progress: total > 0 ? (completed / total) * 100 : 0
        };
    }, [nodes, getCompletedNodes, getFailedNodes, getRunningNodes]);

    // Handle edge connections
    const onConnect = useCallback((params) => {
        setEdges(eds => [...eds, params]);
    }, [setEdges]);

    // Handle edge removal
    const onEdgeDelete = useCallback((edge) => {
        setEdges(eds => eds.filter(e => e.id !== edge.id));
    }, [setEdges]);

    // Handle node selection
    const onSelectionChange = useCallback(({ nodes: selectedNodesArr }) => {
        // Handle node selection logic here if needed
        console.log('Selected nodes:', selectedNodesArr.map(n => n.id));
    }, []);

    return {
        // State
        nodes,
        edges,
        dependencyMap,
        downstreamMap,
        nodeStatusMap,

        // State setters
        setNodes,
        setEdges,
        onNodesChange,
        onEdgesChange,

        // Node operations
        updateNodeStatus,
        resetNodeAndDownstream,
        resetAllNodes,
        getDownstreamNodes,
        canRunNode,

        // Node queries
        getReadyNodes,
        getRunningNodes,
        getFailedNodes,
        getCompletedNodes,

        // Workflow status
        isWorkflowComplete,
        getWorkflowProgress,

        // Event handlers
        onConnect,
        onEdgeDelete,
        onSelectionChange
    };
};
