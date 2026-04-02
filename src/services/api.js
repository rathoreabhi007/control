const API_BASE_URL = 'http://127.0.0.1:8000';

// Enhanced API configuration with backward compatibility
const API_CONFIG = {
    REQUEST_TIMEOUT: 30000,        // 30 seconds timeout for API calls
    POLLING_INTERVAL: 2000,        // 2 seconds between polls (improved from 1s)
    MAX_POLLING_ATTEMPTS: 900,     // 30 minutes max (900 * 2 seconds)
    RETRY_ATTEMPTS: 3,             // Retry failed requests 3 times
    RETRY_DELAY: 1000,             // 1 second delay between retries
    HEALTH_CHECK_INTERVAL: 10000,  // Not used - health checks only at session start
    CONNECTION_TIMEOUT: 10000,     // 10 seconds connection timeout
    TASK_TIMEOUT_MINUTES: 30,      // Task timeout in minutes

    // Backward compatibility settings
    LEGACY_POLLING_INTERVAL: 1000, // Original 1 second interval
    LEGACY_MAX_RETRIES: 3,         // Original retry count
};

// Completeness Control Step Names (matching backend)
const COMPLETENESS_STEPS = {
    // Initial steps
    'reading_config_comp': 'Reading_Config_Comp',
    'read_src_comp': 'Read_SRC_Comp',
    'read_tgt_comp': 'Read_TGT_Comp',

    // SRC flow steps
    'pre_harmonisation_src_comp': 'Reading & Pre-Harmonisation_SRC',
    'harmonisation_src_comp': 'Harmonisation_SRC',
    'enrichment_file_search_src_comp': 'Enrichment File Search_SRC',
    'enrichment_src_comp': 'Enrichment_SRC',
    'data_transform_src_comp': 'Data Transform Post Enrichment_SRC',

    // TGT flow steps
    'pre_harmonisation_tgt_comp': 'Reading & Pre-Harmonisation_TGT',
    'harmonisation_tgt_comp': 'Harmonisation_TGT',
    'enrichment_file_search_tgt_comp': 'Enrichment File Search_TGT',
    'enrichment_tgt_comp': 'Enrichment_TGT',
    'data_transform_tgt_comp': 'Data Transform Post Enrichment_TGT',

    // Combined steps
    'combine_data_comp': 'Combine SRC and TGT Data',
    'apply_rules_comp': 'Apply Rec Rules & Break Explain',
    'output_rules_comp': 'Output Rules',
    'break_rolling_comp': 'BreakRolling Details'
};

// Quality Control Step Names (SRC-only, no TGT)
const QUALITY_STEPS = {
    // Initial steps
    'reading_config_comp': 'Reading_Config_Comp',
    'read_src_comp': 'Read_SRC_Comp',

    // SRC flow steps
    'pre_harmonisation_src_comp': 'Reading & Pre-Harmonisation_SRC',
    'harmonisation_src_comp': 'Harmonisation_SRC',
    'enrichment_file_search_src_comp': 'Enrichment File Search_SRC',
    'enrichment_src_comp': 'Enrichment_SRC',
    'data_transform_src_comp': 'Data Transform Post Enrichment_SRC',

    // Processing steps (no TGT)
    'combine_data_comp': 'Process SRC Data',
    'apply_rules_comp': 'Apply Rec Rules & Break Explain',
    'output_rules_comp': 'Output Rules',
    'break_rolling_comp': 'BreakRolling Details'
};

// Enhanced API Service with timeout, retry, health checking, and backward compatibility
export class ApiService {
    static isBackendHealthy = true;
    static lastHealthCheck = 0;
    static useLegacyMode = false; // Flag to enable legacy behavior

    // Enhanced fetch with timeout and retry logic
    static async fetchWithTimeout(url, options = {}, timeout = API_CONFIG.REQUEST_TIMEOUT) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        // If an external abort signal is provided, listen to it
        if (options.signal) {
            const externalSignal = options.signal;
            const abortHandler = () => {
                clearTimeout(timeoutId);
                controller.abort();
            };

            externalSignal.addEventListener('abort', abortHandler);

            // Clean up the listener when the request completes
            const cleanup = () => {
                externalSignal.removeEventListener('abort', abortHandler);
            };

            try {
                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal,
                });
                clearTimeout(timeoutId);
                cleanup();
                return response;
            } catch (error) {
                clearTimeout(timeoutId);
                cleanup();
                if (error.name === 'AbortError') {
                    // Check if it was aborted by external signal or timeout
                    if (externalSignal.aborted) {
                        throw error; // Re-throw AbortError for external abort
                    } else {
                        throw new Error(`Request timeout after ${timeout}ms`);
                    }
                }
                throw error;
            }
        } else {
            // Original logic for when no external signal is provided
            try {
                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal,
                });
                clearTimeout(timeoutId);
                return response;
            } catch (error) {
                clearTimeout(timeoutId);
                if (error.name === 'AbortError') {
                    throw new Error(`Request timeout after ${timeout}ms`);
                }
                throw error;
            }
        }
    }

    // Retry mechanism for failed requests
    static async retryRequest(requestFn, maxRetries = API_CONFIG.RETRY_ATTEMPTS) {
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await requestFn();
            } catch (error) {
                lastError = error;
                console.warn(`Request attempt ${attempt} failed:`, error.message);

                if (attempt < maxRetries) {
                    const delay = API_CONFIG.RETRY_DELAY * attempt; // Exponential backoff
                    // console.log(`Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw new Error(`Request failed after ${maxRetries} attempts: ${lastError.message}`);
    }

    // Health check with caching
    static async checkBackendHealth(forceCheck = false) {
        const now = Date.now();

        // Use cached result if recent and not forced
        if (!forceCheck &&
            this.isBackendHealthy &&
            (now - this.lastHealthCheck) < API_CONFIG.HEALTH_CHECK_INTERVAL) {
            return this.isBackendHealthy;
        }

        try {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/health`,
                { method: 'GET' },
                API_CONFIG.CONNECTION_TIMEOUT
            );

            this.isBackendHealthy = response.ok;
            this.lastHealthCheck = now;

            if (!response.ok) {
                console.error('Backend health check failed:', response.status);
            }

            return this.isBackendHealthy;
        } catch (error) {
            console.error('Backend health check error:', error.message);
            this.isBackendHealthy = false;
            this.lastHealthCheck = now;
            return false;
        }
    }

    // Enhanced health check with system stats
    static async healthCheck() {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(`${API_BASE_URL}/health`);
            if (!response.ok) {
                throw new Error(`Health check failed: ${response.status}`);
            }
            return response.json();
        });
    }

    // Get available steps
    static async getAvailableSteps() {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(`${API_BASE_URL}/steps`);
            if (!response.ok) {
                throw new Error('Failed to get available steps');
            }
            return response.json();
        });
    }

    // Start calculation with enhanced error handling and backward compatibility
    static async startCalculation(input) {
        // Check backend health first (unless in legacy mode)
        if (!this.useLegacyMode) {
            const isHealthy = await this.checkBackendHealth();
            if (!isHealthy) {
                throw new Error('Backend is not responding. Please check the server status.');
            }
        }

        // Prepare the request body (same as original)
        const requestBody = {
            parameters: {
                expectedRunDate: input.parameters?.expectedRunDate || "2024-01-01",
                inputConfigFilePath: input.parameters?.inputConfigFilePath || "/path/to/config",
                inputConfigFilePattern: input.parameters?.inputConfigFilePattern || "*.json",
                rootFileDir: input.parameters?.rootFileDir || "/data",
                runEnv: input.parameters?.runEnv || "production",
                tempFilePath: input.parameters?.tempFilePath || "/tmp",
                testRun: input.parameters?.testRun === 'on' // Convert 'on' string to boolean true, default false
            },
            previous_outputs: null,
            custom_params: input.customParams || null
        };

        // Process previous outputs with validation (same as original)
        if (input.previousOutputs && Object.keys(input.previousOutputs).length > 0) {
            // console.log('Processing previous outputs for enhanced ETL system');

            const processedOutputs = {};

            for (const [nodeId, output] of Object.entries(input.previousOutputs)) {
                if (output && output.status !== 'failed' && !output.fail_message) {
                    processedOutputs[nodeId] = {
                        status: output.status || 'success',
                        calculation_results: output.calculation_results || {},
                        histogram_data: output.histogram_data || [],
                        count: output.count || '0',
                        file_info: output.file_info || null,
                        input_file_info: output.input_file_info || null,
                        execution_logs: output.execution_logs || [],
                        step_type: output.step_type || nodeId,
                        processed_at: output.processed_at || new Date().toISOString()
                    };

                    // console.log(`Added previous output from ${nodeId} with file info:`, output.file_info);
                } else {
                    console.warn(`Skipping failed previous output from ${nodeId}:`, output?.fail_message || 'Unknown error');
                }
            }

            if (Object.keys(processedOutputs).length > 0) {
                requestBody.previous_outputs = processedOutputs;
                // console.log(`Sending ${Object.keys(processedOutputs).length} previous outputs to backend`);
            }
        }

        /* console.log('Request body prepared:', {
            nodeId: input.nodeId,
            hasPreviousOutputs: !!requestBody.previous_outputs,
            previousOutputKeys: requestBody.previous_outputs ? Object.keys(requestBody.previous_outputs) : [],
            customParams: requestBody.custom_params
        }); */

        // Use retry logic unless in legacy mode
        const requestFn = async () => {
            const response = await this.fetchWithTimeout(`${API_BASE_URL}/run/${input.nodeId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`API Error for ${input.nodeId}:`, errorText);
                throw new Error(`Failed to start calculation for node ${input.nodeId}: ${errorText}`);
            }

            const result = await response.json();

            return {
                process_id: result.task_id,
                status: result.status,
                pid: result.pid,
                thread_id: result.thread_id, // New field from v2
                node_id: input.nodeId
            };
        };

        if (this.useLegacyMode) {
            return await requestFn();
        } else {
            return await this.retryRequest(requestFn);
        }
    }

    // Enhanced process status with timeout and retry
    static async getProcessStatus(processId) {
        const requestFn = async () => {
            const response = await this.fetchWithTimeout(`${API_BASE_URL}/status/${processId}`);
            if (!response.ok) {
                throw new Error(`Failed to get process status: ${response.status}`);
            }

            const result = await response.json();

            return {
                process_id: processId,
                status: result.status,
                output: result.output,
                error: result.error || (result.status === 'failed' ? result.output : null),
                step_name: result.step_name,
                created_at: result.created_at,
                started_at: result.started_at,
                completed_at: result.completed_at
            };
        };

        if (this.useLegacyMode) {
            return await requestFn();
        } else {
            return await this.retryRequest(requestFn);
        }
    }

    // Enhanced process output with timeout and retry
    static async getProcessOutput(processId) {
        const requestFn = async () => {
            const response = await this.fetchWithTimeout(`${API_BASE_URL}/output/${processId}`);
            if (!response.ok) {
                throw new Error(`Failed to get process output: ${response.status}`);
            }

            const result = await response.json();
            return result.output;
        };

        if (this.useLegacyMode) {
            return await requestFn();
        } else {
            return await this.retryRequest(requestFn);
        }
    }

    // Stop process with enhanced error handling
    static async stopProcess(processId) {
        const requestFn = async () => {
            const response = await this.fetchWithTimeout(`${API_BASE_URL}/stop/${processId}`, {
                method: 'POST',
            });
            if (!response.ok) {
                throw new Error(`Failed to stop process: ${response.status}`);
            }

            const result = await response.json();

            return {
                process_id: processId,
                status: result.status,
                message: `Process ${result.status}`
            };
        };

        if (this.useLegacyMode) {
            return await requestFn();
        } else {
            return await this.retryRequest(requestFn);
        }
    }

    // Reset process
    static async resetProcess(processId) {
        try {
            await this.stopProcess(processId);
            return {
                process_id: processId,
                status: "reset",
                message: "Process reset successfully"
            };
        } catch (error) {
            throw new Error(`Failed to reset process: ${error.message}`);
        }
    }

    // Manual cleanup
    static async manualCleanup() {
        const requestFn = async () => {
            const response = await this.fetchWithTimeout(`${API_BASE_URL}/cleanup/now`, {
                method: 'POST',
            });
            if (!response.ok) {
                throw new Error(`Failed to trigger manual cleanup: ${response.status}`);
            }
            return response.json();
        };

        if (this.useLegacyMode) {
            return await requestFn();
        } else {
            return await this.retryRequest(requestFn);
        }
    }

    // Get cleanup schedule
    static async getCleanupSchedule() {
        const requestFn = async () => {
            const response = await this.fetchWithTimeout(`${API_BASE_URL}/cleanup/schedule`);
            if (!response.ok) {
                throw new Error(`Failed to get cleanup schedule: ${response.status}`);
            }
            return response.json();
        };

        if (this.useLegacyMode) {
            return await requestFn();
        } else {
            return await this.retryRequest(requestFn);
        }
    }

    // Get system statistics (new in v2)
    static async getSystemStats() {
        const requestFn = async () => {
            const response = await this.fetchWithTimeout(`${API_BASE_URL}/stats`);
            if (!response.ok) {
                throw new Error(`Failed to get system stats: ${response.status}`);
            }
            return response.json();
        };

        if (this.useLegacyMode) {
            return await requestFn();
        } else {
            return await this.retryRequest(requestFn);
        }
    }

    // Get all tasks (new in v2)
    static async getAllTasks(limit = 100) {
        const requestFn = async () => {
            const response = await this.fetchWithTimeout(`${API_BASE_URL}/tasks?limit=${limit}`);
            if (!response.ok) {
                throw new Error(`Failed to get all tasks: ${response.status}`);
            }
            return response.json();
        };

        if (this.useLegacyMode) {
            return await requestFn();
        } else {
            return await this.retryRequest(requestFn);
        }
    }

    // Helper methods (enhanced for both completeness and quality)
    static isValidStepName(stepName, instanceType = 'completeness') {
        const steps = instanceType === 'quality' ? QUALITY_STEPS : COMPLETENESS_STEPS;
        return stepName in steps;
    }

    static getStepDisplayName(stepName, instanceType = 'completeness') {
        const steps = instanceType === 'quality' ? QUALITY_STEPS : COMPLETENESS_STEPS;
        return steps[stepName] || stepName;
    }

    static getAllStepNames(instanceType = 'completeness') {
        const steps = instanceType === 'quality' ? QUALITY_STEPS : COMPLETENESS_STEPS;
        return Object.keys(steps);
    }

    // Get steps for specific instance type
    static getStepsForInstance(instanceType = 'completeness') {
        return instanceType === 'quality' ? QUALITY_STEPS : COMPLETENESS_STEPS;
    }

    // Enhanced polling with timeout and health checks (NEW)
    static async pollTaskStatus(processId, onStatusUpdate, onComplete, onError, options = {}) {
        const {
            maxAttempts = API_CONFIG.MAX_POLLING_ATTEMPTS,
            interval = API_CONFIG.POLLING_INTERVAL
        } = options;

        let attempts = 0;

        const poll = async () => {
            attempts++;

            // Removed periodic health checks during polling to reduce server load
            // Health is only checked at session start

            try {
                const status = await this.getProcessStatus(processId);

                // Call status update callback
                if (onStatusUpdate) {
                    onStatusUpdate(status, attempts);
                }

                if (status.status === 'completed') {
                    if (onComplete) {
                        onComplete(status);
                    }
                    return;
                } else if (status.status === 'failed') {
                    if (onError) {
                        onError(new Error(status.error || 'Task failed'));
                    }
                    return;
                } else if (status.status === 'cancelled' || status.status === 'stopped') {
                    if (onError) {
                        onError(new Error('Task was cancelled'));
                    }
                    return;
                } else if (status.status === 'running' || status.status === 'pending') {
                    // Continue polling
                    if (attempts >= maxAttempts) {
                        if (onError) {
                            onError(new Error(`Task timeout after ${maxAttempts} attempts (${Math.round(maxAttempts * interval / 1000)} seconds)`));
                        }
                        return;
                    }

                    setTimeout(poll, interval);
                } else {
                    // Unknown status, continue polling with warning
                    console.warn(`Unknown status: ${status.status}, continuing to poll...`);
                    if (attempts >= maxAttempts) {
                        if (onError) {
                            onError(new Error(`Task timeout with unknown status: ${status.status}`));
                        }
                        return;
                    }
                    setTimeout(poll, interval);
                }
            } catch (error) {
                console.error(`Error polling task ${processId}:`, error);

                // If it's a network error, retry a few times
                if (error.message.includes('timeout') || error.message.includes('fetch')) {
                    if (attempts < 5) { // Retry network errors up to 5 times
                        // console.log(`Retrying poll attempt ${attempts} due to network error...`);
                        setTimeout(poll, interval * 2); // Longer delay for network errors
                        return;
                    }
                }

                if (onError) {
                    onError(error);
                }
            }
        };

        // Start polling
        poll();
    }

    // Legacy polling method (for backward compatibility)
    static async legacyPollTaskStatus(processId, onStatusUpdate, onComplete, onError, options = {}) {
        const {
            maxAttempts = 17280, // 24 hours = 17280 polls (5-second intervals)
            interval = 5000,     // 5 seconds (original interval)
        } = options;

        let attempts = 0;

        const poll = async () => {
            attempts++;

            try {
                const status = await this.getProcessStatus(processId);

                // Call status update callback
                if (onStatusUpdate) {
                    onStatusUpdate(status, attempts);
                }

                if (status.status === 'completed') {
                    if (onComplete) {
                        onComplete(status);
                    }
                    return;
                } else if (status.status === 'failed') {
                    if (onError) {
                        onError(new Error(status.error || 'Task failed'));
                    }
                    return;
                } else if (status.status === 'terminated') {
                    if (onError) {
                        onError(new Error('Task was terminated'));
                    }
                    return;
                } else if (status.status === 'running') {
                    // Continue polling
                    if (attempts >= maxAttempts) {
                        if (onError) {
                            onError(new Error(`Task timeout after ${maxAttempts} attempts (${Math.round(maxAttempts * interval / 1000 / 60)} minutes)`));
                        }
                        return;
                    }

                    setTimeout(poll, interval);
                } else {
                    // Unknown status, continue polling
                    // console.log(`Unknown status for ${processId}: ${status.status} - continuing to poll`);
                    if (attempts >= maxAttempts) {
                        if (onError) {
                            onError(new Error(`Task timeout with unknown status: ${status.status}`));
                        }
                        return;
                    }
                    setTimeout(poll, interval);
                }
            } catch (error) {
                console.error(`Error polling task ${processId}:`, error);

                if (onError) {
                    onError(error);
                }
            }
        };

        // Start polling
        poll();
    }

    // Configuration methods
    static enableLegacyMode() {
        this.useLegacyMode = true;
        // console.log('Enabled legacy mode - using original polling behavior');
    }

    static disableLegacyMode() {
        this.useLegacyMode = false;
        // console.log('Disabled legacy mode - using enhanced polling behavior');
    }

    static setPollingInterval(interval) {
        API_CONFIG.POLLING_INTERVAL = interval;
        // console.log(`Set polling interval to ${interval}ms`);
    }

    static setMaxPollingAttempts(attempts) {
        API_CONFIG.MAX_POLLING_ATTEMPTS = attempts;
        // console.log(`Set max polling attempts to ${attempts}`);
    }

    static setRequestTimeout(timeout) {
        API_CONFIG.REQUEST_TIMEOUT = timeout;
        // console.log(`Set request timeout to ${timeout}ms`);
    }

    static getConfig() {
        return { ...API_CONFIG };
    }

    // CSV Data API Methods (NEW)

    // Get available CSV files
    static async getAvailableCsvFiles() {
        const requestFn = async () => {
            const response = await this.fetchWithTimeout(`${API_BASE_URL}/csv/files`);
            if (!response.ok) {
                throw new Error(`Failed to get available CSV files: ${response.status}`);
            }
            return response.json();
        };

        if (this.useLegacyMode) {
            return await requestFn();
        } else {
            return await this.retryRequest(requestFn);
        }
    }

    // Get CSV file metadata
    static async getCsvFileMetadata(filename) {
        const requestFn = async () => {
            const response = await this.fetchWithTimeout(`${API_BASE_URL}/csv/files/${filename}/metadata`);
            if (!response.ok) {
                throw new Error(`Failed to get CSV file metadata: ${response.status}`);
            }
            return response.json();
        };

        if (this.useLegacyMode) {
            return await requestFn();
        } else {
            return await this.retryRequest(requestFn);
        }
    }

    // Read CSV data with pagination - Direct file path approach
    static async readCsvData(filePath, options = {}) {
        const {
            page = 1,
            pageSize = 100,
            sortColumn = null,
            sortDirection = 'asc'
        } = options;

        const params = new URLSearchParams({
            file_path: filePath,
            page: page.toString(),
            page_size: pageSize.toString(),
            sort_direction: sortDirection
        });

        if (sortColumn) {
            params.append('sort_column', sortColumn);
        }

        const requestFn = async () => {
            const response = await this.fetchWithTimeout(`${API_BASE_URL}/csv/data?${params}`);
            if (!response.ok) {
                throw new Error(`Failed to read CSV data: ${response.status}`);
            }
            return response.json();
        };

        if (this.useLegacyMode) {
            return await requestFn();
        } else {
            return await this.retryRequest(requestFn);
        }
    }

    // Search in CSV file using direct file path (NEW - matches backend endpoint)
    static async searchCsvDataByPath(filePath, searchTerm, options = {}, abortSignal = null) {
        const {
            column = null,
            limit = 5000  // Default limit for performance
        } = options;

        const normalizedTerm = typeof searchTerm === 'string' ? searchTerm.trim() : '';
        if (!normalizedTerm) {
            throw new Error('Search term cannot be empty');
        }

        const params = new URLSearchParams({
            file_path: filePath,
            query: normalizedTerm,
            limit: limit.toString()
        });

        if (column) {
            params.append('column', column);
        }

        const requestFn = async () => {
            // Create custom fetch options with abort signal
            const fetchOptions = {};
            if (abortSignal) {
                fetchOptions.signal = abortSignal;
            }

            const response = await this.fetchWithTimeout(`${API_BASE_URL}/csv/search?${params}`, fetchOptions);
            if (!response.ok) {
                throw new Error(`Failed to search CSV data: ${response.status}`);
            }
            return response.json();
        };

        if (this.useLegacyMode) {
            return await requestFn();
        } else {
            return await this.retryRequest(requestFn);
        }
    }

    // Search in CSV file (legacy method - kept for backward compatibility)
    static async searchCsvData(filename, searchTerm, options = {}) {
        const {
            columns = null,
            caseSensitive = false
        } = options;

        const params = new URLSearchParams({
            q: searchTerm,
            case_sensitive: caseSensitive.toString()
        });

        if (columns && columns.length > 0) {
            params.append('columns', columns.join(','));
        }

        const requestFn = async () => {
            const response = await this.fetchWithTimeout(`${API_BASE_URL}/csv/files/${filename}/search?${params}`);
            if (!response.ok) {
                throw new Error(`Failed to search CSV data: ${response.status}`);
            }
            return response.json();
        };

        if (this.useLegacyMode) {
            return await requestFn();
        } else {
            return await this.retryRequest(requestFn);
        }
    }

    // Get column statistics
    static async getColumnStatistics(filename, columnName) {
        const requestFn = async () => {
            const response = await this.fetchWithTimeout(`${API_BASE_URL}/csv/files/${filename}/columns/${columnName}/stats`);
            if (!response.ok) {
                throw new Error(`Failed to get column statistics: ${response.status}`);
            }
            return response.json();
        };

        if (this.useLegacyMode) {
            return await requestFn();
        } else {
            return await this.retryRequest(requestFn);
        }
    }

    // Get CSV file registry
    static async getCsvFileRegistry() {
        const requestFn = async () => {
            const response = await this.fetchWithTimeout(`${API_BASE_URL}/csv/registry`);
            if (!response.ok) {
                throw new Error(`Failed to get CSV file registry: ${response.status}`);
            }
            return response.json();
        };

        if (this.useLegacyMode) {
            return await requestFn();
        } else {
            return await this.retryRequest(requestFn);
        }
    }

    // Register CSV file manually
    static async registerCsvFile(stepName, fileInfo) {
        const requestFn = async () => {
            const response = await this.fetchWithTimeout(`${API_BASE_URL}/csv/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    step_name: stepName,
                    file_info: fileInfo
                }),
            });
            if (!response.ok) {
                throw new Error(`Failed to register CSV file: ${response.status}`);
            }
            return response.json();
        };

        if (this.useLegacyMode) {
            return await requestFn();
        } else {
            return await this.retryRequest(requestFn);
        }
    }

    // Clear CSV cache
    static async clearCsvCache() {
        const requestFn = async () => {
            const response = await this.fetchWithTimeout(`${API_BASE_URL}/csv/cache/clear`, {
                method: 'POST',
            });
            if (!response.ok) {
                throw new Error(`Failed to clear CSV cache: ${response.status}`);
            }
            return response.json();
        };

        if (this.useLegacyMode) {
            return await requestFn();
        } else {
            return await this.retryRequest(requestFn);
        }
    }

    // Helper method to extract file path from file_info
    static extractFilePathFromFileInfo(fileInfo) {
        if (!fileInfo || !fileInfo.file_path) {
            return null;
        }

        // Return the full file path as-is for direct access
        // console.log('Using direct file path from file_info:', {
        //     file_path: fileInfo.file_path
        // });

        return fileInfo.file_path;
    }

    // Helper method to check if node has CSV file data
    static hasCsvFileData(nodeOutput) {
        return nodeOutput &&
            nodeOutput.file_info &&
            nodeOutput.file_info.file_path;
    }

    /**
     * Get Available Monitoring Servers
     * Fetches list of available monitoring log files
     * @returns {Promise<Object>} List of servers with monitoring data
     */
    static async getMonitoringServers() {
        return this.retryRequest(async () => {
            // console.log('Fetching available monitoring servers');

            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/monitoring/servers`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to fetch servers: ${response.statusText}`);
            }

            const result = await response.json();
            // console.log(`Found ${result.servers?.length || 0} monitoring servers`);

            return result;
        });
    }

    /**
     * Get System Monitoring Data
     * Fetches CPU and memory monitoring data for dashboard
     * @param {string} timeRange - Time range to fetch (1h, 6h, 12h, 24h, all)
     * @param {string} logFile - Optional path to specific log file
     * @returns {Promise<Object>} Monitoring data
     */
    static async getSystemMonitoring(timeRange = '1h', logFile = null, maxPoints = 1200) {
        return this.retryRequest(async () => {
            // console.log(`Fetching system monitoring data (range: ${timeRange}, log: ${logFile || 'default'})`);

            let url = `${API_BASE_URL}/monitoring?range=${timeRange}&max_points=${maxPoints}`;
            if (logFile) {
                url += `&log_file=${encodeURIComponent(logFile)}`;
            }

            const response = await this.fetchWithTimeout(
                url,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to fetch monitoring data: ${response.statusText}`);
            }

            const result = await response.json();
            // console.log(`Monitoring data fetched successfully (${result.data?.length || 0} records)`);

            return result;
        });
    }

    // Transform Operations API Methods

    /**
     * Execute Transform Operation
     * Executes a single data transformation operation
     * @param {Object} payload - Request payload with data and operation
     * @returns {Promise<Object>} Transformation result
     */
    static async executeTransformOperation(payload) {
        return this.retryRequest(async () => {
            // console.log('Executing transform operation:', payload);

            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/transform/execute`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to execute transformation: ${response.statusText}`);
            }

            const result = await response.json();
            // console.log('Transform operation executed successfully');

            return result;
        });
    }

    /**
     * Get Supported Transform Operations
     * Fetches list of supported transformation operations
     * @returns {Promise<Object>} List of supported operations
     */
    static async getSupportedTransformOperations() {
        return this.retryRequest(async () => {
            // console.log('Fetching supported transform operations');

            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/transform/operations`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to fetch operations: ${response.statusText}`);
            }

            const result = await response.json();
            // console.log(`Found ${result.operations?.length || 0} supported operations`);

            return result;
        });
    }

    /**
     * Execute Batch Transform Operations
     * Executes multiple transformation operations in sequence
     * @param {Object} payload - Request payload with data and operations array
     * @returns {Promise<Object>} Batch transformation result
     */
    static async executeBatchTransformOperations(payload) {
        return this.retryRequest(async () => {
            // console.log('Executing batch transform operations:', payload);

            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/transform/batch`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to execute batch transformation: ${response.statusText}`);
            }

            const result = await response.json();
            // console.log('Batch transform operations executed successfully');

            return result;
        });
    }

    /**
     * Validate Transform Operation
     * Validates an operation without executing it
     * @param {Object} payload - Request payload with operation and optional sample data
     * @returns {Promise<Object>} Validation result
     */
    static async validateTransformOperation(payload) {
        return this.retryRequest(async () => {
            // console.log('Validating transform operation:', payload);

            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/transform/validate`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to validate operation: ${response.statusText}`);
            }

            const result = await response.json();
            // console.log('Transform operation validation completed');

            return result;
        });
    }

    /**
     * Get Transform Operation Examples
     * Fetches example operations for frontend testing
     * @returns {Promise<Object>} Example operations
     */
    static async getTransformOperationExamples() {
        return this.retryRequest(async () => {
            // console.log('Fetching transform operation examples');

            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/transform/examples`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to fetch examples: ${response.statusText}`);
            }

            const result = await response.json();
            // console.log(`Found ${Object.keys(result.examples || {}).length} operation examples`);

            return result;
        });
    }

    // Control Task API Methods

    /**
     * Run Control Task
     * Starts a new control task execution
     * @param {Object} taskParams - Control task parameters
     * @returns {Promise<Object>} Task execution result
     */
    static async runControlTask(taskParams) {
        return this.retryRequest(async () => {
            // console.log('Starting control task:', taskParams.control_name);

            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/controls/run`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(taskParams),
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to start control task: ${response.statusText}`);
            }

            const result = await response.json();
            // console.log(`Control task started: ${result.task_id}`);

            return result;
        });
    }

    /**
     * Stop Control Task
     * Stops a running control task
     * @param {string} taskId - Task ID to stop
     * @param {boolean} force - Whether to force stop
     * @returns {Promise<Object>} Stop result
     */
    static async stopControlTask(taskId, force = false) {
        return this.retryRequest(async () => {
            // console.log(`Stopping control task: ${taskId} (force: ${force})`);

            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/controls/stop?task_id=${taskId}&force=${force}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to stop control task: ${response.statusText}`);
            }

            const result = await response.json();
            // console.log(`Control task stop result: ${result.status}`);

            return result;
        });
    }

    /**
     * Get Control Task Status
     * Gets the current status of a control task
     * @param {string} taskId - Task ID
     * @returns {Promise<Object>} Task status
     */
    static async getControlTaskStatus(taskId) {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/controls/status?task_id=${taskId}`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to get control task status: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    /**
     * Get Control Task Logs
     * Gets logs for a control task
     * @param {string} taskId - Task ID
     * @param {string} logType - Type of log (execution, subprocess, error, audit)
     * @param {number} lines - Number of lines to retrieve
     * @returns {Promise<Object>} Task logs
     */
    static async getControlTaskLogs(taskId, logType = 'execution', lines = 100) {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/controls/logs?task_id=${taskId}&log_type=${logType}&lines=${lines}`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to get control task logs: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    /**
     * Get Control Task History
     * Gets all logs for a control task
     * @param {string} taskId - Task ID
     * @returns {Promise<Object>} Task history
     */
    static async getControlTaskHistory(taskId) {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/controls/history?task_id=${taskId}`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to get control task history: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    /**
     * Get All Control Tasks
     * Gets list of all control tasks
     * @param {number} limit - Maximum number of tasks to return
     * @returns {Promise<Object>} List of control tasks
     */
    static async getAllControlTasks(limit = 100) {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/controls/tasks?limit=${limit}`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to get control tasks: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    /**
     * Get Control Task Statistics
     * Gets statistics about control tasks
     * @returns {Promise<Object>} Control task statistics
     */
    static async getControlTaskStats() {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/controls/stats`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to get control task stats: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    /**
     * Get Control Task Configuration
     * Gets control task configuration from control_ids.json
     * @returns {Promise<Object>} Control task configuration
     */
    static async getControlTaskConfig() {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/controls/config`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to get control task config: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    /**
     * Cleanup Control Tasks
     * Manually trigger cleanup of old control tasks
     * @returns {Promise<Object>} Cleanup result
     */
    static async cleanupControlTasks() {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/controls/cleanup`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to cleanup control tasks: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    /**
     * Get Control Status Logs (Legacy)
     * Gets control run logs with filtering capabilities for Control Status Dashboard
     * Only date filters (control_run_date, business_date) are sent to backend.
     * Other filters (reg_type, control_type, asset_type, subcategory_type, frequency, status) 
     * are applied client-side for better performance.
     * @param {Object} filters - Filter options (control_run_date, business_date, reg_type, control_type, asset_type, subcategory_type, frequency, status)
     * @param {number} limit - Maximum number of logs to return
     * @returns {Promise<Object>} Control run logs
     */
    static async getControlStatusLogs(filters = {}, limit = 1000) {
        return this.retryRequest(async () => {
            const params = new URLSearchParams();

            // Only send date filters to backend (other filters will be applied client-side)
            if (filters.control_run_date && filters.control_run_date.trim() !== '') {
                params.append('control_run_date', filters.control_run_date);
            }
            if (filters.business_date && filters.business_date.trim() !== '') {
                params.append('business_date', filters.business_date);
            }
            params.append('limit', limit.toString());

            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/controls/run-logs?${params.toString()}`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to get control run logs: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    /**
     * Get Control Run Logs Hierarchy
     * Gets unique values for hierarchy filters
     * @returns {Promise<Object>} Hierarchy filter options
     */
    static async getControlRunLogsHierarchy() {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/controls/run-logs/hierarchy`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to get control run logs hierarchy: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    // ============================================================================
    // FILE MONITORING API
    // ============================================================================

    /**
     * Get file monitoring status for a given date and file type.
     * @param {Object} params - { file_type: 'input'|'output', monitoring_date: 'YYYY-MM-DD' }
     * @param {number} limit - Maximum number of records to return
     * @returns {Promise<Object>} File monitoring status
     */
    static async getFileMonitoringStatus(params = {}, limit = 5000) {
        return this.retryRequest(async () => {
            const queryParams = new URLSearchParams();
            queryParams.append('file_type', params.file_type || 'input');
            if (params.monitoring_date) {
                queryParams.append('monitoring_date', params.monitoring_date);
            }
            queryParams.append('limit', limit.toString());

            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/file-monitoring/status?${queryParams.toString()}`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to get file monitoring status: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    /**
     * Get file monitoring hierarchy (unique filter values).
     * @param {string} fileType - 'input' or 'output'
     * @returns {Promise<Object>} Hierarchy filter options
     */
    static async getFileMonitoringHierarchy(fileType = 'input') {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/file-monitoring/hierarchy?file_type=${fileType}`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to get file monitoring hierarchy: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    // ============================================================================
    // CONTROL RUNS API (Airflow-like execution system)
    // ============================================================================

    /**
     * Get all available controls from control_ids.json
     * @returns {Promise<Object>} List of controls
     */
    static async getControls() {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/control-runs/controls`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to get controls: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    /**
     * Start a control run
     * @param {Object} params - Run parameters
     * @param {string} params.control_id - Control ID
     * @param {string} params.run_env - Run environment (DEV/UAT/PROD)
     * @param {string} params.expected_run_date - Expected run date (YYYY-MM-DD)
     * @param {string} params.task_name - Task name from control_ids.json
     * @returns {Promise<Object>} Run start response with task_id
     */
    static async startControlRun(params) {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/control-runs/start`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(params),
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to start control run: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    /**
     * Get control run status
     * @param {string} taskId - Task ID
     * @returns {Promise<Object>} Run status
     */
    static async getControlRunStatus(taskId) {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/control-runs/${taskId}/status`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to get run status: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    /**
     * Get control run logs
     * @param {string} taskId - Task ID
     * @param {string} logType - Log type (execution/subprocess/error/audit)
     * @param {number} lines - Number of lines to retrieve
     * @returns {Promise<Object>} Run logs
     */
    static async getControlRunLogs(taskId, logType = 'execution', lines = 300, fromLine = 0) {
        return this.retryRequest(async () => {
            const params = new URLSearchParams({
                log_type: logType,
                lines: lines.toString()
            });

            // Add from_line parameter for incremental loading
            if (fromLine > 0) {
                params.append('from_line', fromLine.toString());
            }

            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/control-runs/${taskId}/logs?${params.toString()}`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to get run logs: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    /**
     * Get control run history
     * @param {string} controlId - Control ID (optional)
     * @param {number} limit - Number of runs to retrieve
     * @returns {Promise<Object>} Run history
     */
    static async getControlRunHistory(controlId = null, taskName = null, limit = 3) {
        return this.retryRequest(async () => {
            const params = new URLSearchParams({ limit: limit.toString() });
            if (controlId) {
                params.append('control_id', controlId);
            }
            if (taskName) {
                params.append('task_name', taskName);
            }

            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/control-runs/history?${params.toString()}`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to get run history: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    /**
     * Stop a control run
     * @param {string} taskId - Task ID
     * @param {boolean} force - Force stop
     * @returns {Promise<Object>} Stop response
     */
    static async stopControlRun(taskId, force = false) {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/control-runs/${taskId}/stop`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ force }),
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to stop run: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    // ============================================================================
    // AUTO CONFIG DEPLOYMENT API
    // ============================================================================

    /**
     * Start an AutoConfig deployment
     * @param {Object} params - Deployment parameters
     * @param {string} params.control_id - Control ID (required)
     * @param {string} params.run_env - Run environment (optional, default: DEV)
     * @param {string} params.expected_run_date - Expected run date (optional)
     * @returns {Promise<Object>} Deployment start response with task_id
     */
    static async startAutoConfigDeployment(params) {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/auto-config/start`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(params),
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to start AutoConfig deployment: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    /**
     * Get AutoConfig deployment status
     * @param {string} taskId - Task ID
     * @returns {Promise<Object>} Deployment status
     */
    static async getAutoConfigStatus(taskId) {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/auto-config/${taskId}/status`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to get AutoConfig status: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    /**
     * Get AutoConfig deployment logs
     * @param {string} taskId - Task ID
     * @param {string} logType - Log type (execution/subprocess/error/audit)
     * @param {number} lines - Number of lines to retrieve
     * @param {number} fromLine - Starting line number for incremental loading
     * @returns {Promise<Object>} Deployment logs
     */
    static async getAutoConfigLogs(taskId, logType = 'execution', lines = 300, fromLine = 0) {
        return this.retryRequest(async () => {
            const params = new URLSearchParams({
                log_type: logType,
                lines: lines.toString()
            });

            if (fromLine > 0) {
                params.append('from_line', fromLine.toString());
            }

            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/auto-config/${taskId}/logs?${params.toString()}`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to get AutoConfig logs: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    /**
     * Get AutoConfig deployment history
     * @param {string} controlId - Control ID (optional)
     * @param {number} limit - Number of deployments to retrieve
     * @returns {Promise<Object>} Deployment history
     */
    static async getAutoConfigHistory(controlId = null, limit = 10) {
        return this.retryRequest(async () => {
            const params = new URLSearchParams({ limit: limit.toString() });
            if (controlId) {
                params.append('control_id', controlId);
            }

            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/auto-config/history?${params.toString()}`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to get AutoConfig history: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    /**
     * Stop an AutoConfig deployment
     * @param {string} taskId - Task ID
     * @param {boolean} force - Force stop
     * @returns {Promise<Object>} Stop response
     */
    static async stopAutoConfigDeployment(taskId, force = false) {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/auto-config/${taskId}/stop`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ force }),
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to stop AutoConfig deployment: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    // ============================================================================
    // WORKFLOW TOOL ETL API METHODS
    // ============================================================================

    /**
     * Workflow ETL Steps - Available operations for the Data Workflow Tool
     */
    static WORKFLOW_STEPS = {
        'read_csv': 'Read CSV File',
        'read_parquet': 'Read Parquet File',
        'read_excel': 'Read Excel File',
        'convert_parquet': 'Convert to Parquet',
        'filter': 'Filter Data',
        'join': 'Join Data',
        'aggregate': 'Aggregate Data',
        'output': 'Data Output'
    };

    /**
     * Run a workflow ETL step
     * @param {string} stepName - The step name (read_csv, filter, join, etc.)
     * @param {Object} params - Step parameters
     * @param {Object} previousOutputs - Outputs from previous nodes
     * @returns {Promise<Object>} Task start response with task_id
     */
    static async runWorkflowStep(stepName, params = {}, previousOutputs = null) {
        return this.retryRequest(async () => {
            // console.log(`Starting workflow step: ${stepName}`);

            const requestBody = {
                parameters: {
                    expectedRunDate: params.expectedRunDate || new Date().toISOString().split('T')[0],
                    inputConfigFilePath: params.inputConfigFilePath || "",
                    inputConfigFilePattern: params.inputConfigFilePattern || "",
                    rootFileDir: params.rootFileDir || "",
                    runEnv: params.runEnv || "DEV",
                    tempFilePath: params.tempFilePath || ""
                },
                previous_outputs: previousOutputs,
                custom_params: params
            };

            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/run/${stepName}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBody),
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to start workflow step: ${response.statusText}`);
            }

            const result = await response.json();
            console.log(`✅ Workflow step started: ${result.task_id}`);

            return {
                task_id: result.task_id,
                status: result.status,
                pid: result.pid,
                thread_id: result.thread_id,
                step_name: stepName,
                server_hostname: result.server_hostname,
                server_ip: result.server_ip,
                server_id: result.server_id
            };
        });
    }

    /**
     * Get workflow task status
     * @param {string} taskId - Task ID
     * @returns {Promise<Object>} Task status
     */
    static async getWorkflowTaskStatus(taskId) {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/status/${taskId}`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to get task status: ${response.statusText}`);
            }

            const result = await response.json();
            return {
                task_id: taskId,
                status: result.status,
                output: result.output,
                error: result.error,
                step_name: result.step_name,
                created_at: result.created_at,
                started_at: result.started_at,
                completed_at: result.completed_at,
                server_hostname: result.server_hostname,
                server_ip: result.server_ip,
                server_id: result.server_id,
                pid: result.pid
            };
        });
    }

    /**
     * Get workflow task output
     * @param {string} taskId - Task ID
     * @returns {Promise<Object>} Task output
     */
    static async getWorkflowTaskOutput(taskId) {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/output/${taskId}`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to get task output: ${response.statusText}`);
            }

            const result = await response.json();
            return result.output;
        });
    }

    /**
     * Stop a workflow task
     * @param {string} taskId - Task ID
     * @returns {Promise<Object>} Stop response
     */
    static async stopWorkflowTask(taskId) {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/stop/${taskId}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to stop task: ${response.statusText}`);
            }

            const result = await response.json();
            return {
                task_id: taskId,
                status: result.status,
                message: `Task ${result.status}`
            };
        });
    }

    /**
     * Get workflow task logs
     * @param {string} taskId - Task ID
     * @param {string} logType - Log type (execution or subprocess)
     * @param {boolean} stream - Whether to stream logs
     * @returns {Promise<string>} Log content
     */
    static async getWorkflowTaskLogs(taskId, logType = 'execution', stream = true) {
        try {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/etl/logs/${taskId}?log_type=${logType}&stream=${stream}`
            );

            if (!response.ok) {
                if (response.status === 404) {
                    return 'No logs available yet';
                }
                throw new Error(`Failed to get task logs: ${response.statusText}`);
            }

            return await response.text();
        } catch (error) {
            console.error(`Error fetching logs for task ${taskId}:`, error);
            return `Error loading logs: ${error.message}`;
        }
    }

    /**
     * Poll workflow task status with callbacks
     * @param {string} taskId - Task ID
     * @param {Function} onStatusUpdate - Called on each status update
     * @param {Function} onComplete - Called when task completes
     * @param {Function} onError - Called on error
     * @param {Object} options - Polling options
     */
    static async pollWorkflowTaskStatus(taskId, onStatusUpdate, onComplete, onError, options = {}) {
        const {
            maxAttempts = 1800,  // 30 minutes at 1 second intervals
            interval = 1000      // 1 second
        } = options;

        let attempts = 0;

        const poll = async () => {
            attempts++;

            try {
                const status = await this.getWorkflowTaskStatus(taskId);

                if (onStatusUpdate) {
                    onStatusUpdate(status, attempts);
                }

                if (status.status === 'completed') {
                    if (onComplete) {
                        onComplete(status);
                    }
                    return;
                } else if (status.status === 'failed') {
                    if (onError) {
                        onError(new Error(status.error || 'Task failed'));
                    }
                    return;
                } else if (status.status === 'cancelled' || status.status === 'stopped') {
                    if (onError) {
                        onError(new Error('Task was cancelled'));
                    }
                    return;
                } else if (status.status === 'running' || status.status === 'pending') {
                    if (attempts >= maxAttempts) {
                        if (onError) {
                            onError(new Error(`Task timeout after ${maxAttempts} attempts`));
                        }
                        return;
                    }
                    setTimeout(poll, interval);
                } else {
                    // Unknown status, continue polling
                    console.warn(`Unknown status: ${status.status}, continuing to poll...`);
                    if (attempts >= maxAttempts) {
                        if (onError) {
                            onError(new Error(`Task timeout with unknown status: ${status.status}`));
                        }
                        return;
                    }
                    setTimeout(poll, interval);
                }
            } catch (error) {
                console.error(`Error polling task ${taskId}:`, error);

                // Retry on network errors
                if (error.message.includes('timeout') || error.message.includes('fetch')) {
                    if (attempts < 5) {
                        console.log(`Retrying poll attempt ${attempts} due to network error...`);
                        setTimeout(poll, interval * 2);
                        return;
                    }
                }

                if (onError) {
                    onError(error);
                }
            }
        };

        poll();
    }

    /**
     * Get available workflow steps
     * @returns {Promise<Object>} Available steps
     */
    static async getAvailableWorkflowSteps() {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/steps`
            );

            if (!response.ok) {
                throw new Error(`Failed to get available steps: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    // ==================== Judgment Analytics Methods ====================

    /**
     * Get judgments with optional filters
     * @param {Object} filters - Filter parameters
     * @returns {Promise<Object>} Judgments and metadata
     */
    static async getJudgments(filters = {}) {
        return this.retryRequest(async () => {
            const params = new URLSearchParams();
            if (filters.start_date) params.append('start_date', filters.start_date);
            if (filters.end_date) params.append('end_date', filters.end_date);
            if (filters.criteria) params.append('criteria', filters.criteria);
            if (filters.min_score !== undefined) params.append('min_score', filters.min_score);
            if (filters.max_score !== undefined) params.append('max_score', filters.max_score);
            if (filters.limit) params.append('limit', filters.limit);

            const url = `${API_BASE_URL}/api/judgments/list${params.toString() ? '?' + params.toString() : ''}`;
            const response = await this.fetchWithTimeout(url);

            if (!response.ok) {
                throw new Error(`Failed to get judgments: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    /**
     * Get judgment statistics
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @returns {Promise<Object>} Statistics
     */
    static async getJudgmentStatistics(startDate = null, endDate = null) {
        return this.retryRequest(async () => {
            const params = new URLSearchParams();
            if (startDate) params.append('start_date', startDate);
            if (endDate) params.append('end_date', endDate);

            const url = `${API_BASE_URL}/api/judgments/statistics${params.toString() ? '?' + params.toString() : ''}`;
            const response = await this.fetchWithTimeout(url);

            if (!response.ok) {
                throw new Error(`Failed to get judgment statistics: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    /**
     * Get available criteria templates
     * @returns {Promise<Object>} Criteria templates
     */
    static async getCriteriaTemplates() {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/judgments/criteria-templates`
            );

            if (!response.ok) {
                throw new Error(`Failed to get criteria templates: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    /**
     * Trigger cleanup of old judgments
     * @returns {Promise<Object>} Cleanup result
     */
    static async cleanupOldJudgments() {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/judgments/cleanup`,
                { method: 'DELETE' }
            );

            if (!response.ok) {
                throw new Error(`Failed to cleanup judgments: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    /**
     * Check judgment system health
     * @returns {Promise<Object>} Health status
     */
    static async getJudgmentHealth() {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/judgments/health`
            );

            if (!response.ok) {
                throw new Error(`Failed to check judgment health: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    // ============================================================================
    // CONFIG SEARCH API METHODS
    // ============================================================================

    /**
     * Get available config types (COMP, QA, etc.)
     * @returns {Promise<Object>} Available types
     */
    static async getConfigSearchTypes() {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/config-search/types`
            );

            if (!response.ok) {
                throw new Error(`Failed to get config types: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    /**
     * Get available sheets for a type
     * @param {string} typeName - Config type (optional)
     * @returns {Promise<Object>} Available sheets
     */
    static async getConfigSearchSheets(typeName = null) {
        return this.retryRequest(async () => {
            const params = typeName ? `?type_name=${encodeURIComponent(typeName)}` : '';
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/config-search/sheets${params}`
            );

            if (!response.ok) {
                throw new Error(`Failed to get config sheets: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    /**
     * Get columns for a specific type and sheet
     * @param {string} typeName - Config type
     * @param {string} sheet - Sheet name
     * @returns {Promise<Object>} Column names
     */
    static async getConfigSearchColumns(typeName, sheet) {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/config-search/columns?type_name=${encodeURIComponent(typeName)}&sheet=${encodeURIComponent(sheet)}`
            );

            if (!response.ok) {
                throw new Error(`Failed to get config columns: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    /**
     * Search config data
     * @param {string} typeName - Config type (COMP, QA)
     * @param {string} sheet - Sheet name
     * @param {string} query - Search query
     * @param {Object} options - Search options (column, page, pageSize)
     * @returns {Promise<Object>} Search results
     */
    static async searchConfig(typeName, sheet, query, options = {}) {
        return this.retryRequest(async () => {
            const { column = null, page = 1, pageSize = 50 } = options;

            const params = new URLSearchParams({
                type_name: typeName,
                sheet: sheet,
                query: query,
                page: page.toString(),
                page_size: pageSize.toString()
            });

            if (column) {
                params.append('column', column);
            }

            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/config-search?${params.toString()}`
            );

            if (!response.ok) {
                throw new Error(`Failed to search config: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    /**
     * Get all config data without search filter
     * @param {string} typeName - Config type
     * @param {string} sheet - Sheet name
     * @param {Object} options - Options (page, pageSize, sortColumn, sortDirection)
     * @returns {Promise<Object>} All data with pagination
     */
    static async getConfigData(typeName, sheet, options = {}) {
        return this.retryRequest(async () => {
            const { page = 1, pageSize = 50, sortColumn = null, sortDirection = 'asc' } = options;

            const params = new URLSearchParams({
                type_name: typeName,
                sheet: sheet,
                page: page.toString(),
                page_size: pageSize.toString(),
                sort_direction: sortDirection
            });

            if (sortColumn) {
                params.append('sort_column', sortColumn);
            }

            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/config-search/all-data?${params.toString()}`
            );

            if (!response.ok) {
                throw new Error(`Failed to get config data: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    // ==========================================
    // Config Validator Methods
    // ==========================================

    static async startConfigValidation(filePath, controlType) {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/config-validator/validate`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ file_path: filePath, control_type: controlType }),
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to start validation: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    static async getConfigValidationStatus(taskId) {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/config-validator/${taskId}/status`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to get validation status: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    static async getConfigValidationResults(taskId) {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/config-validator/${taskId}/results`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to get validation results: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    static async getConfigValidationLogs(taskId, logType = 'execution', lines = 200) {
        return this.retryRequest(async () => {
            const params = new URLSearchParams({
                log_type: logType,
                lines: lines.toString(),
            });

            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/config-validator/${taskId}/logs?${params.toString()}`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to get validation logs: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    static async getConfigValidationHistory(limit = 20) {
        return this.retryRequest(async () => {
            const params = new URLSearchParams({ limit: limit.toString() });

            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/config-validator/history?${params.toString()}`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to get validation history: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    // ==================== Supervisory Dashboard API ====================

    static async getSupervisoryInitialLoad() {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/supervisory/initial-load`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to get initial load: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    static async getSupervisoryFilterOptions() {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/supervisory/filter-options`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to get filter options: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    static async getSupervisoryAggregations(filters = {}, groupBy = ['Regulation', 'AssetClass'], bucketSet = 'CFTC') {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/supervisory/aggregations`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filters: filters,
                        group_by: groupBy,
                        bucket_set: bucketSet
                    })
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to get aggregations: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    static async getSupervisoryTrends(filters = {}, groupBy = []) {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/supervisory/trends`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filters: filters,
                        group_by: groupBy
                    })
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to get trend analytics: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    static async getSupervisoryDetails(filters = {}, page = 1, pageSize = 50, sortColumn = null, sortDirection = 'desc', bucket = null, bucketScope = null, bucketSet = 'CFTC', mergeColumns = null, searchTerm = null, searchColumn = null) {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/supervisory/details`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filters: filters,
                        page: page,
                        page_size: pageSize,
                        sort_column: sortColumn,
                        sort_direction: sortDirection,
                        bucket: bucket,
                        bucket_scope: bucketScope,
                        bucket_set: bucketSet,
                        merge_columns: mergeColumns,
                        search_term: searchTerm,
                        search_column: searchColumn
                    })
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to get details: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    static async getSupervisorySavedFilters() {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/supervisory/saved-filters`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to get saved filters: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    static async saveSupervisoryFilter(payload) {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/supervisory/saved-filters`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to save filter: ${response.statusText}`);
            }

            return await response.json();
        });
    }

    // ==================== Reference File Search ====================

    /**
     * Get list of all known reference files
     * @returns {Promise<Object>} File list
     */
    static async getReferenceFiles() {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/reference-search/files`
            );
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to get reference files: ${response.statusText}`);
            }
            return await response.json();
        });
    }

    /**
     * Get columns for a reference file
     * @param {string} fileId - File ID from config
     * @returns {Promise<Object>} Column list
     */
    static async getReferenceFileColumns(fileId) {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/reference-search/files/${encodeURIComponent(fileId)}/columns`
            );
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to get columns: ${response.statusText}`);
            }
            return await response.json();
        });
    }

    /**
     * Browse reference file data with pagination (initial load / browse mode)
     * @param {string} fileId - File ID from config
     * @param {Object} options - Pagination and sort options
     * @returns {Promise<Object>} Paginated data
     */
    static async getReferenceFileData(fileId, options = {}) {
        return this.retryRequest(async () => {
            const { page = 1, pageSize = 50, sortColumn = null, sortDirection = 'asc' } = options;
            const params = new URLSearchParams({
                page: page.toString(),
                page_size: pageSize.toString(),
                sort_direction: sortDirection,
            });
            if (sortColumn) params.append('sort_column', sortColumn);

            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/reference-search/files/${encodeURIComponent(fileId)}/data?${params.toString()}`
            );
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to get file data: ${response.statusText}`);
            }
            return await response.json();
        });
    }

    /**
     * Search a reference file
     * @param {string} fileId - File ID from config
     * @param {string} query - Search term (supports regex)
     * @param {Object} options - column, page, pageSize, limit
     * @returns {Promise<Object>} Search results with pagination
     */
    static async searchReferenceFile(fileId, query, options = {}) {
        return this.retryRequest(async () => {
            const { column = null, page = 1, pageSize = 50, limit = 5000 } = options;
            const params = new URLSearchParams({
                query: query,
                page: page.toString(),
                page_size: pageSize.toString(),
                limit: limit.toString(),
            });
            if (column) params.append('column', column);
            if (options.dateFrom) params.append('date_from', options.dateFrom);
            if (options.dateTo) params.append('date_to', options.dateTo);
            if (options.fileRegex) params.append('file_regex', options.fileRegex);

            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/reference-search/files/${encodeURIComponent(fileId)}/search?${params.toString()}`
            );
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to search file: ${response.statusText}`);
            }
            return await response.json();
        });
    }

    /**
     * Discover actual files for a folder-type reference file spec.
     * Returns is_folder_type=false for single-file specs.
     * @param {string} fileId - File ID from config
     * @param {Object} options - dateFrom, dateTo, fileRegex
     * @returns {Promise<Object>} Discovered files list
     */
    static async discoverReferenceFileEntries(fileId, options = {}) {
        return this.retryRequest(async () => {
            const params = new URLSearchParams();
            if (options.dateFrom) params.append('date_from', options.dateFrom);
            if (options.dateTo) params.append('date_to', options.dateTo);
            if (options.fileRegex) params.append('file_regex', options.fileRegex);
            const qs = params.toString();
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/reference-search/files/${encodeURIComponent(fileId)}/discover${qs ? '?' + qs : ''}`
            );
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to discover files: ${response.statusText}`);
            }
            return await response.json();
        });
    }

    /**
     * Search a reference file for multiple values (Excel paste mode)
     * @param {string} fileId - File ID from config
     * @param {string[]} values - Array of values to match
     * @param {string} column - Column to search in (required)
     * @param {Object} options - exactMatch, page, pageSize, limit
     * @returns {Promise<Object>} Search results with pagination
     */
    static async searchReferenceFileMulti(fileId, values, column, options = {}) {
        return this.retryRequest(async () => {
            const {
                exactMatch = true, page = 1, pageSize = 50, limit = 5000,
                dateFrom = null, dateTo = null, fileRegex = null,
            } = options;

            const body = {
                column,
                values,
                exact_match: exactMatch,
                page,
                page_size: pageSize,
                limit,
            };
            if (dateFrom) body.date_from = dateFrom;
            if (dateTo) body.date_to = dateTo;
            if (fileRegex) body.file_regex = fileRegex;

            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/reference-search/files/${encodeURIComponent(fileId)}/search-multi`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                }
            );
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to multi-search file: ${response.statusText}`);
            }
            return await response.json();
        });
    }

    static async deleteSupervisoryFilter(filterId) {
        return this.retryRequest(async () => {
            const response = await this.fetchWithTimeout(
                `${API_BASE_URL}/api/supervisory/saved-filters/${filterId}`,
                {
                    method: 'DELETE'
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to delete filter: ${response.statusText}`);
            }

            return await response.json();
        });
    }
}

export default ApiService;
