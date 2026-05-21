import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import ApiService from '../../services/api';
import HSBCLogo from '../../components/HSBCLogo';
import ValidationSummary from './ValidationSummary';
import { FaCheckCircle, FaPlay, FaTimes, FaTimesCircle, FaSpinner, FaHistory, FaExclamationTriangle } from 'react-icons/fa';

ModuleRegistry.registerModules([AllCommunityModule]);

const ConfigValidatorPage = () => {
    // Input state
    const [filePath, setFilePath] = useState('');
    const [controlType, setControlType] = useState('');

    // Validation state
    const [validationState, setValidationState] = useState('idle'); // idle | validating | completed | failed | error
    const [results, setResults] = useState(null);
    const [error, setError] = useState(null);

    // Sheet display state
    const [activeSheet, setActiveSheet] = useState('');
    const [sheetNames, setSheetNames] = useState([]);

    // History state
    const [history, setHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(false);

    // Polling ref
    const pollingRef = useRef(null);

    // Load history on mount
    useEffect(() => {
        loadHistory();
    }, []);

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
            }
        };
    }, []);

    const loadHistory = async () => {
        try {
            const response = await ApiService.getConfigValidationHistory(20);
            setHistory(response.history || []);
        } catch (err) {
            // History loading is non-critical
        }
    };

    const handleValidate = async () => {
        if (!controlType) {
            setError('Please select a control type');
            return;
        }
        if (!filePath.trim()) {
            setError('Please enter a file path');
            return;
        }

        setError(null);
        setResults(null);
        setValidationState('validating');
        setSheetNames([]);
        setActiveSheet('');

        try {
            const response = await ApiService.startConfigValidation(filePath.trim(), controlType);
            const newTaskId = response.task_id;

            // Start polling for status
            pollingRef.current = setInterval(async () => {
                try {
                    const status = await ApiService.getConfigValidationStatus(newTaskId);
                    const taskStatus = (status.status || '').toLowerCase();

                    if (taskStatus === 'completed' || taskStatus === 'success') {
                        clearInterval(pollingRef.current);
                        pollingRef.current = null;
                        await fetchResults(newTaskId);
                    } else if (taskStatus === 'failed' || taskStatus === 'error') {
                        clearInterval(pollingRef.current);
                        pollingRef.current = null;
                        setValidationState('error');
                        setError(`Validation process failed. Check logs for task ${newTaskId}`);
                        // Still try to fetch results (might have partial data)
                        try {
                            await fetchResults(newTaskId);
                        } catch {
                            // No results available
                        }
                    }
                } catch (err) {
                    // Polling error - keep trying
                }
            }, 2000);

        } catch (err) {
            setValidationState('error');
            setError(err.message);
        }
    };

    const fetchResults = async (tid) => {
        try {
            const data = await ApiService.getConfigValidationResults(tid);

            if (data.status === 'failed' && data.error) {
                setValidationState('error');
                setError(data.error);
                return;
            }

            setResults(data);

            // Build sheet names list
            const names = data.sheet_names || [];
            const allNames = [...names];
            // Show Validation tab whenever it exists with data (errors OR warnings)
            if (data.sheets && data.sheets['Validation'] && data.sheets['Validation'].row_count > 0) {
                allNames.push('Validation');
            }
            setSheetNames(allNames);

            // Set first sheet as active
            if (allNames.length > 0) {
                setActiveSheet(allNames[0]);
            }

            // Determine state: failed if any issues exist, completed if clean
            const hasIssues = data.summary && (data.summary.total_issues > 0 || data.summary.total_errors > 0 || data.summary.total_warnings > 0);
            setValidationState(hasIssues ? 'failed' : 'completed');
            loadHistory(); // Refresh history
        } catch (err) {
            setValidationState('error');
            setError(`Failed to fetch results: ${err.message}`);
        }
    };

    const handleClear = () => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
        setFilePath('');
        setControlType('');
        setValidationState('idle');
        setResults(null);
        setError(null);
        setSheetNames([]);
        setActiveSheet('');
    };

    const handleHistoryClick = async (item) => {
        setFilePath(item.file_path || '');
        setShowHistory(false);

        if (item.has_results && item.task_id) {
            setValidationState('validating');
            await fetchResults(item.task_id);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && validationState !== 'validating') {
            handleValidate();
        }
    };

    // AG Grid data for active sheet
    const activeSheetData = useMemo(() => {
        if (!results || !results.sheets || !activeSheet) return [];
        const sheet = results.sheets[activeSheet];
        return sheet ? (sheet.data || []) : [];
    }, [results, activeSheet]);

    // AG Grid column definitions for active sheet
    const columnDefs = useMemo(() => {
        if (!results || !results.sheets || !activeSheet) return [];
        const sheet = results.sheets[activeSheet];
        if (!sheet || !sheet.columns) return [];

        return sheet.columns.map(col => ({
            headerName: col,
            field: col,
            minWidth: 120,
            flex: 1,
            resizable: true,
            sortable: true,
            filter: true,
        }));
    }, [results, activeSheet]);

    const defaultColDef = useMemo(() => ({
        sortable: true,
        filter: true,
        resizable: true,
        minWidth: 100,
    }), []);

    // Row styling for Validation sheet
    const getRowStyle = useCallback((params) => {
        if (activeSheet !== 'Validation') return null;
        const severity = params.data?.Severity;
        if (severity === 'ERROR') {
            return { backgroundColor: '#FEE2E2' };
        }
        if (severity === 'WARNING') {
            return { backgroundColor: '#FEF3C7' };
        }
        if (severity === 'INFO') {
            return { backgroundColor: '#DBEAFE' };
        }
        return null;
    }, [activeSheet]);

    // Get error count badge for a sheet tab
    const getSheetErrorCount = (sheetName) => {
        if (!results || !results.sheets) return 0;
        const sheet = results.sheets[sheetName];
        return sheet?.error_count || 0;
    };

    return (
        <div className="min-h-screen supervisory-page-canvas flex flex-col">
            {/* Loading Overlay */}
            {validationState === 'validating' && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-8 flex flex-col items-center shadow-xl">
                        <div className="animate-spin rounded-full h-16 w-16 border-4 border-red-500 border-t-transparent mb-4"></div>
                        <p className="text-gray-700 text-lg font-medium">Validating config...</p>
                        <p className="text-gray-500 text-sm mt-1">{filePath.split(/[/\\]/).pop()}</p>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="supervisory-app-header bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between" style={{ height: '64px' }}>
                <div className="flex items-center justify-between h-full w-full">
                    <div className="flex items-center gap-4">
                        <HSBCLogo height={40} />
                        <div>
                            <h1 className="text-lg font-semibold text-gray-900">CONFIG VALIDATOR</h1>
                            <p className="text-xs supervisory-app-subtitle">Validate configuration files across sheets</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowHistory(!showHistory)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                        >
                            <FaHistory />
                            History
                        </button>
                        <div className="supervisory-app-badge px-2.5 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">
                            {new Date().toLocaleDateString()}
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-4 overflow-y-auto">
                {/* File Path Input */}
                <div className="supervisory-surface supervisory-elevated rounded-lg border border-gray-200 p-4 mb-4">
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                            Control Type:
                        </label>
                        <select
                            value={controlType}
                            onChange={(e) => setControlType(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg supervisory-field text-sm"
                            disabled={validationState === 'validating'}
                        >
                            <option value="">Select</option>
                            <option value="QA">QA</option>
                            <option value="COMP">COMP</option>
                        </select>
                        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                            File Path:
                        </label>
                        <input
                            type="text"
                            value={filePath}
                            onChange={(e) => setFilePath(e.target.value)}
                            onKeyDown={handleKeyPress}
                            placeholder="Enter path to Excel config file (e.g., /path/to/config.xlsx)"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg supervisory-field text-sm"
                            disabled={validationState === 'validating'}
                        />
                        <button
                            onClick={handleValidate}
                            disabled={validationState === 'validating' || !filePath.trim() || !controlType}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
                        >
                            {validationState === 'validating' ? (
                                <FaSpinner className="animate-spin" />
                            ) : (
                                <FaPlay />
                            )}
                            Validate
                        </button>
                        <button
                            onClick={handleClear}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm font-medium"
                        >
                            <FaTimes />
                            Clear
                        </button>
                    </div>
                </div>

                {/* Error Display */}
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                        {error}
                    </div>
                )}

                {/* Validation Summary */}
                {results && results.summary && (
                    <ValidationSummary
                        summary={results.summary}
                        validationPassed={results.validation_passed}
                        onSheetClick={(sheet) => setActiveSheet(sheet)}
                    />
                )}

                {/* Sheet Tabs + Grid */}
                {sheetNames.length > 0 && (
                    <div className="supervisory-surface supervisory-elevated rounded-lg border border-gray-200">
                        {/* Sheet Tabs */}
                        <div className="flex items-center border-b border-gray-200 px-2 pt-2 overflow-x-auto">
                            {sheetNames.map((name) => {
                                const isValidation = name === 'Validation';
                                const errorCount = getSheetErrorCount(name);
                                const isActive = activeSheet === name;

                                return (
                                    <button
                                        key={name}
                                        onClick={() => setActiveSheet(name)}
                                        className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${isActive
                                                ? isValidation
                                                    ? 'bg-red-50 text-red-700 border border-b-0 border-red-200'
                                                    : 'bg-white text-gray-900 border border-b-0 border-gray-200'
                                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                            }`}
                                    >
                                        {isValidation && (
                                            <FaExclamationTriangle className="text-red-500" />
                                        )}
                                        {name}
                                        {errorCount > 0 && !isValidation && (
                                            <span className="px-1.5 py-0.5 text-xs rounded-full bg-red-100 text-red-600 font-bold">
                                                {errorCount}
                                            </span>
                                        )}
                                        {isValidation && results?.sheets?.Validation && (
                                            <span className="px-1.5 py-0.5 text-xs rounded-full bg-red-500 text-white font-bold">
                                                {results.sheets.Validation.row_count}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Sheet Info Bar */}
                        <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between text-sm text-gray-500">
                            <span>
                                {activeSheet}
                                {results?.sheets?.[activeSheet] && (
                                    <> - {results.sheets[activeSheet].row_count} rows, {results.sheets[activeSheet].columns?.length || 0} columns</>
                                )}
                            </span>
                            {results?.validated_file_path && (
                                <span className="text-gray-400">
                                    Validated file: {results.validated_file_path}
                                </span>
                            )}
                        </div>

                        {/* AG Grid */}
                        <div className="ag-theme-alpine config-grid-theme" style={{ height: 'calc(100vh - 400px)', minHeight: '400px', width: '100%' }}>
                            <AgGridReact
                                rowData={activeSheetData}
                                columnDefs={columnDefs}
                                defaultColDef={defaultColDef}
                                theme="legacy"
                                animateRows={true}
                                pagination={false}
                                enableCellTextSelection={true}
                                ensureDomOrder={true}
                                getRowStyle={getRowStyle}
                            />
                        </div>
                    </div>
                )}

                {/* Initial State */}
                {validationState === 'idle' && !results && !error && (
                    <div className="supervisory-surface supervisory-elevated rounded-lg border border-gray-200 p-12 text-center">
                        <FaCheckCircle className="text-6xl text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-700 mb-2">Ready to Validate</h3>
                        <p className="text-gray-500 max-w-md mx-auto">
                            Enter the path to an Excel configuration file above and click Validate to check for errors across all sheets.
                        </p>
                    </div>
                )}

                {/* History Panel */}
                {showHistory && history.length > 0 && (
                    <div className="mt-4 supervisory-surface supervisory-elevated rounded-lg border border-gray-200">
                        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                            <span className="font-medium text-gray-700 flex items-center gap-2">
                                <FaHistory className="text-gray-400" />
                                Recent Validations
                            </span>
                            <button
                                onClick={() => setShowHistory(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <FaTimes />
                            </button>
                        </div>
                        <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                            {history.map((item) => {
                                const fileName = item.file_path?.split(/[/\\]/).pop() || 'unknown';
                                const status = (item.status || '').toLowerCase();
                                const passed = item.validation_passed;
                                const timeAgo = getTimeAgo(item.completed_at || item.created_at);

                                return (
                                    <button
                                        key={item.task_id}
                                        onClick={() => handleHistoryClick(item)}
                                        className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-3">
                                            {passed === true && (
                                                <FaCheckCircle className="text-green-500 flex-shrink-0" />
                                            )}
                                            {passed === false && (
                                                <FaTimesCircle className="text-red-500 flex-shrink-0" />
                                            )}
                                            {passed === null && (
                                                <FaSpinner className={`text-gray-400 flex-shrink-0 ${status === 'running' ? 'animate-spin' : ''}`} />
                                            )}
                                            <div>
                                                <div className="text-sm font-medium text-gray-800">{fileName}</div>
                                                <div className="text-xs text-gray-500">{item.file_path}</div>
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            {item.total_errors !== null && item.total_errors !== undefined && (
                                                <div className="text-xs text-red-500 font-medium">{item.total_errors} errors</div>
                                            )}
                                            <div className="text-xs text-gray-400">{timeAgo}</div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

function getTimeAgo(isoString) {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}d ago`;
    } catch {
        return '';
    }
}

export default ConfigValidatorPage;
