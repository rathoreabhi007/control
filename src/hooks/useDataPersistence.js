import { useCallback, useEffect, useRef } from 'react';

/**
 * Custom hook for managing data persistence with localStorage
 * Handles quota management, compression, and error recovery
 */
export const useDataPersistence = (instanceId) => {
    const saveTimeoutRef = useRef(null);
    const lastSaveRef = useRef({});

    // Safe localStorage setter with quota management
    const safeLocalStorageSet = useCallback((key, value) => {
        try {
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
    }, []);

    // Debounced save function to prevent excessive localStorage writes
    const debouncedSave = useCallback((key, data, delay = 1000) => {
        // Clear existing timeout
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        // Check if data has actually changed
        const dataString = JSON.stringify(data);
        if (lastSaveRef.current[key] === dataString) {
            return; // No change, don't save
        }

        // Set new timeout
        saveTimeoutRef.current = setTimeout(() => {
            const success = safeLocalStorageSet(key, dataString);
            if (success) {
                lastSaveRef.current[key] = dataString;
            }
        }, delay);
    }, [safeLocalStorageSet]);

    // Save node outputs with file location references only
    const saveNodeOutputs = useCallback((nodeOutputs, instanceId) => {
        const key = `nodeOutputs_${instanceId || 'default'}`;

        // Create file location reference version for storage
        const fileLocationOutputs = {};
        Object.entries(nodeOutputs).forEach(([nodeId, output]) => {
            if (output) {
                // Store only file location and metadata, no actual data
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

        debouncedSave(key, fileLocationOutputs);
    }, [debouncedSave]);

    // Save UI state
    const saveUIState = useCallback((uiState, instanceId) => {
        const key = `uiState_${instanceId || 'default'}`;
        debouncedSave(key, uiState, 500); // Shorter delay for UI state
    }, [debouncedSave]);

    // Save parameters
    const saveParameters = useCallback((params, instanceId) => {
        const key = `validatedParams_${instanceId || 'default'}`;
        debouncedSave(key, params, 2000); // Longer delay for parameters
    }, [debouncedSave]);

    // Save process IDs
    const saveProcessIds = useCallback((processIds, instanceId) => {
        const key = `processIds_${instanceId || 'default'}`;
        debouncedSave(key, processIds, 1000);
    }, [debouncedSave]);

    // Load data from localStorage
    const loadData = useCallback((key, defaultValue = null) => {
        try {
            const saved = localStorage.getItem(key);
            return saved ? JSON.parse(saved) : defaultValue;
        } catch (error) {
            console.warn(`Failed to load data from localStorage for key ${key}:`, error);
            return defaultValue;
        }
    }, []);

    // Clear all data for an instance
    const clearInstanceData = useCallback((instanceId) => {
        const keys = [
            `nodeOutputs_${instanceId}`,
            `uiState_${instanceId}`,
            `validatedParams_${instanceId}`,
            `processIds_${instanceId}`,
            `nodes_${instanceId}`
        ];

        keys.forEach(key => {
            try {
                localStorage.removeItem(key);
            } catch (error) {
                console.warn(`Failed to remove key ${key}:`, error);
            }
        });

        console.log(`🧹 Cleared all data for instance: ${instanceId}`);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    return {
        saveNodeOutputs,
        saveUIState,
        saveParameters,
        saveProcessIds,
        loadData,
        clearInstanceData,
        safeLocalStorageSet,
        debouncedSave
    };
};

