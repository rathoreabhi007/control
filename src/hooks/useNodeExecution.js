import { useCallback, useRef } from 'react';
import { ApiService } from '../services/api';

/**
 * Custom hook for managing node execution logic
 * Extracted from completeness control to improve maintainability
 */
export const useNodeExecution = (nodes, setNodes, nodeOutputs, setNodeOutputs, validatedParams) => {
    const nodeTimeouts = useRef({});
    const cancelledNodesRef = useRef(new Set());
    const nodeOutputsRef = useRef({});

    // Keep ref synchronized with state
    const updateNodeOutput = useCallback((nodeId, output) => {
        nodeOutputsRef.current = { ...nodeOutputsRef.current, [nodeId]: output };
        setNodeOutputs(prev => ({ ...prev, [nodeId]: output }));
    }, [setNodeOutputs]);

    const updateNodeStatus = useCallback((nodeId, status) => {
        setNodes(nds => nds.map(node =>
            node.id === nodeId
                ? { ...node, data: { ...node.data, status } }
                : node
        ));
    }, [setNodes]);

    const runNodeAndWait = useCallback(async (nodeId, dependencyMap) => {
        // console.log(`🚀 Starting runNodeAndWait for node: ${nodeId}`);

        try {
            // Check if node is already running
            const currentNode = nodes.find(n => n.id === nodeId);
            if (currentNode?.data.status === 'running') {
                // console.log(`⚠️ Node ${nodeId} is already running, skipping...`);
                return null;
            }

            // console.log(`📋 Preparing to run node: ${nodeId}`);

            // Get node outputs for previous steps with proper validation
            const previousOutputs = {};
            const dependencies = dependencyMap[nodeId] || [];

            // console.log(`🔗 Dependencies for ${nodeId}:`, dependencies);

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
                    // console.log(`🔍 Available outputs in ref:`, Object.keys(nodeOutputsRef.current));
                    // console.log(`🔍 Available outputs in state:`, Object.keys(nodeOutputs));
                    updateNodeStatus(nodeId, 'failed');
                    return null;
                }

                // Validate that the dependency output is successful
                if (depOutput.status === 'failed' || depOutput.fail_message) {
                    console.error(`❌ Dependency ${depId} failed: ${depOutput.fail_message}`);
                    updateNodeStatus(nodeId, 'failed');
                    return null;
                }

                // console.log(`✅ Dependency ${depId} completed successfully`);
                // console.log(`📤 Added previous output from ${depId} to ${nodeId}`);

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

            // console.log(`📤 Sending request for node ${nodeId}:`, {
            //     nodeId: input.nodeId,
            //     hasPreviousOutputs: !!input.previousOutputs,
            //     previousOutputKeys: input.previousOutputs ? Object.keys(input.previousOutputs) : [],
            //     customParams: input.customParams
            // });

            // Start the calculation
            const response = await ApiService.startCalculation(input);
            // console.log(`✅ Started calculation for ${nodeId}:`, response);
            // console.log(`🔄 Updated ${nodeId} status to 'running'`);

            // Update node status to running
            updateNodeStatus(nodeId, 'running');
            console.log(`🔄 Updated ${nodeId} status to 'running'`);

            // Poll for completion with enhanced logging and failed status handling
            const pollInterval = 5000; // 5 seconds
            const MAX_POLL_ATTEMPTS = 100; // Maximum 8+ minutes at 5-second intervals
            let pollCount = 0;

            console.log(`⏰ Starting polling for ${nodeId} - Interval: ${pollInterval}ms (Max attempts: ${MAX_POLL_ATTEMPTS})`);

            while (pollCount < MAX_POLL_ATTEMPTS) {
                pollCount++;
                console.log(`🔄 Polling status for node ${nodeId} (Process ID: ${response.process_id}) - Attempt ${pollCount}/${MAX_POLL_ATTEMPTS}`);

                // Check if node has been cancelled
                if (cancelledNodesRef.current.has(nodeId)) {
                    // console.log(`🛑 Node ${nodeId} was cancelled, stopping polling`);
                    updateNodeStatus(nodeId, 'stopped');
                    return null;
                }

                // Check if node status is already stopped
                const currentNode = nodes.find(n => n.id === nodeId);
                if (currentNode?.data.status === 'stopped') {
                    // console.log(`🛑 Node ${nodeId} is already stopped, stopping polling`);
                    return null;
                }

                try {
                    const status = await ApiService.getProcessStatus(response.process_id);
                    // console.log(`📊 Status response for ${nodeId}:`, {
                    //     process_id: status.process_id,
                    //     status: status.status,
                    //     hasOutput: !!status.output,
                    //     hasError: !!status.error,
                    //     pollCount: pollCount
                    // });

                    if (status.status === 'completed') {
                        // console.log(`✅ Node ${nodeId} completed successfully!`);

                        // Get the output
                        try {
                            const output = await ApiService.getProcessOutput(response.process_id);
                            // console.log(`📥 Retrieved output for ${nodeId}:`, {
                            //     hasOutput: !!output,
                            //     outputType: typeof output,
                            //     outputKeys: output ? Object.keys(output) : null
                            // });

                            // Validate the output before storing
                            if (output && output.status === 'failed') {
                                console.error(`❌ Node ${nodeId} returned failed status in output`);
                                updateNodeStatus(nodeId, 'failed');
                                updateNodeOutput(nodeId, output);
                                return null;
                            }

                            if (output && output.fail_message) {
                                console.error(`❌ Node ${nodeId} has fail message: ${output.fail_message}`);
                                updateNodeStatus(nodeId, 'failed');
                                updateNodeOutput(nodeId, output);
                                return null;
                            }

                            updateNodeOutput(nodeId, output);
                            console.log(`💾 Stored output for ${nodeId}`);

                            updateNodeStatus(nodeId, 'completed');
                            console.log(`✅ Updated ${nodeId} status to 'completed'`);

                            return output;
                        } catch (outputError) {
                            console.error(`❌ Error getting output for ${nodeId}:`, outputError);
                            updateNodeStatus(nodeId, 'failed');
                            // console.log(`❌ Updated ${nodeId} status to 'failed' due to output error`);
                            break;
                        }
                    } else if (status.status === 'failed') {
                        console.error(`❌ Node ${nodeId} failed:`, status.error);
                        updateNodeStatus(nodeId, 'failed');
                        // console.log(`❌ Updated ${nodeId} status to 'failed'`);

                        // Store the error output for display
                        updateNodeOutput(nodeId, {
                            status: 'failed',
                            fail_message: status.error || 'Unknown error occurred',
                            execution_logs: [`Node ${nodeId} failed: ${status.error}`]
                        });
                        break;
                    } else if (status.status === 'terminated') {
                        console.log(`🛑 Node ${nodeId} was terminated - STOPPING POLLING`);
                        updateNodeStatus(nodeId, 'stopped');
                        console.log(`🛑 Updated ${nodeId} status to 'stopped' due to termination`);
                        console.log(`🛑 Breaking out of polling loop for ${nodeId}`);
                        break;
                    } else if (status.status === 'running') {
                        console.log(`⏳ Node ${nodeId} still running... (${status.status}) - Poll count: ${pollCount}`);
                        await new Promise(res => setTimeout(res, pollInterval));
                    } else {
                        console.log(`❓ Unknown status for ${nodeId}: ${status.status} - continuing to poll`);
                        await new Promise(res => setTimeout(res, pollInterval));
                    }

                    // Check if we've reached max poll attempts
                    if (pollCount >= MAX_POLL_ATTEMPTS) {
                        console.error(`❌ Node ${nodeId} exceeded maximum poll attempts (${MAX_POLL_ATTEMPTS}), marking as failed`);
                        updateNodeStatus(nodeId, 'failed');
                        updateNodeOutput(nodeId, {
                            status: 'failed',
                            fail_message: `Node exceeded maximum poll attempts (${MAX_POLL_ATTEMPTS}). The operation may still be running on the server.`,
                            execution_logs: [`Node ${nodeId} exceeded maximum poll attempts: ${MAX_POLL_ATTEMPTS}`]
                        });
                        break;
                    }
                } catch (error) {
                    console.error(`❌ Error polling node ${nodeId}:`, error);
                    console.error(`❌ Error details:`, {
                        message: error.message,
                        stack: error.stack,
                        pollCount: pollCount
                    });

                    // Only set to failed if the node is not idle and not cancelled
                    if (!cancelledNodesRef.current.has(nodeId)) {
                        setNodes(nds => nds.map(node =>
                            node.id === nodeId && node.data.status !== 'idle'
                                ? { ...node, data: { ...node.data, status: 'failed' } }
                                : node
                        ));
                        // console.log(`❌ Set ${nodeId} status to 'failed' due to polling error`);
                    } else {
                        // console.log(`🛑 Node ${nodeId} was cancelled during error, not setting to failed`);
                    }
                    break; // Exit the loop on error
                }
            }

            return null;
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
            // console.log(`❌ Set ${nodeId} status to 'failed' due to execution error`);
        }
    }, [nodes, setNodes, updateNodeStatus, updateNodeOutput, validatedParams]);

    const stopNode = useCallback(async (nodeId, processIds) => {
        if (processIds[nodeId]) {
            try {
                await ApiService.stopProcess(processIds[nodeId]);
                // console.log(`🛑 Stopped process for node ${nodeId}`);
            } catch (error) {
                console.error(`❌ Error stopping process for node ${nodeId}:`, error);
            }
        }

        // Clear any timeouts for this node
        if (nodeTimeouts.current[nodeId]) {
            clearInterval(nodeTimeouts.current[nodeId]);
            delete nodeTimeouts.current[nodeId];
        }

        // Mark as cancelled
        cancelledNodesRef.current.add(nodeId);

        // Update status
        updateNodeStatus(nodeId, 'stopped');
        // console.log(`🛑 Updated ${nodeId} status to 'stopped'`);
    }, [updateNodeStatus]);

    const resetNode = useCallback(async (nodeId, processIds) => {
        if (processIds[nodeId]) {
            try {
                await ApiService.resetProcess(processIds[nodeId]);
            } catch (error) {
                console.error(`❌ Error resetting process for node ${nodeId}:`, error);
            }
        }

        // Clear timeouts
        if (nodeTimeouts.current[nodeId]) {
            clearInterval(nodeTimeouts.current[nodeId]);
            delete nodeTimeouts.current[nodeId];
        }

        // Mark as cancelled
        cancelledNodesRef.current.add(nodeId);

        // Reset status and clear output
        updateNodeStatus(nodeId, 'idle');
        setNodeOutputs(prev => {
            const updated = { ...prev };
            delete updated[nodeId];
            return updated;
        });

        // console.log(`🔄 Reset node ${nodeId} to idle state`);
    }, [updateNodeStatus, setNodeOutputs]);

    return {
        runNodeAndWait,
        stopNode,
        resetNode,
        updateNodeStatus,
        updateNodeOutput,
        nodeTimeouts,
        cancelledNodesRef,
        nodeOutputsRef
    };
};

