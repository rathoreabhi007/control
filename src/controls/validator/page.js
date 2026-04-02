import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ApiService } from '../../services/api';
import { FaPlus, FaTrash, FaPlay, FaSpinner, FaExclamationTriangle, FaUpload, FaPaste } from 'react-icons/fa';
import HSBCLogo from '../../components/HSBCLogo';
import OverflowFix from '../../components/OverflowFix';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

/**
 * Transform Operations Validator
 * Test and validate data transformation operations
 */
const TransformValidator = () => {
    const [selectedOperation, setSelectedOperation] = useState('');
    const [operationParams, setOperationParams] = useState({});
    const [inputData, setInputData] = useState([]);
    const [resultData, setResultData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [operationResult, setOperationResult] = useState(null);
    const gridRef = useRef(null);

    // Enhanced theme colors with darker text
    const theme = {
        background: '#FAFAFA',
        card: '#FFFFFF',
        border: '#E0E0E0',
        text: {
            primary: '#1A1A1A',
            secondary: '#4A4A4A',
            muted: '#6B7280'
        },
        colors: {
            blue: '#0068C9',
            green: '#09AB3B',
            orange: '#FF8700',
            red: '#FF2B2B',
            purple: '#7D3AC1'
        }
    };

    // Available operations with their parameters
    const operations = useMemo(() => ({
        'SetValue': {
            description: 'Set a constant value for all rows',
            parameters: [
                { name: 'NewFieldName', type: 'text', required: true, label: 'New Field Name' },
                { name: 'Inputs', type: 'text', required: true, label: 'Value to Set' },
                { name: 'types', type: 'select', required: false, label: 'Data Type', options: ['str', 'int', 'float', 'bool'] }
            ]
        },
        'CopyField': {
            description: 'Copy values from one column to another',
            parameters: [
                { name: 'NewFieldName', type: 'text', required: true, label: 'New Field Name' },
                { name: 'Inputs', type: 'select', required: true, label: 'Source Field', options: [] },
                { name: 'types', type: 'select', required: false, label: 'Data Type', options: ['str', 'int', 'float', 'bool'] }
            ]
        },
        'MapValues': {
            description: 'Map values based on a dictionary',
            parameters: [
                { name: 'NewFieldName', type: 'text', required: true, label: 'New Field Name' },
                { name: 'Inputs', type: 'select', required: true, label: 'Source Field', options: [] },
                { name: 'mapping', type: 'json', required: true, label: 'Mapping Dictionary' },
                { name: 'types', type: 'select', required: false, label: 'Data Type', options: ['str', 'int', 'float', 'bool'] }
            ]
        },
        'Formula': {
            description: 'Apply mathematical formulas to columns',
            parameters: [
                { name: 'NewFieldName', type: 'text', required: true, label: 'New Field Name' },
                { name: 'formulastring', type: 'text', required: true, label: 'Formula (use A, B, C for fields)' },
                { name: 'Inputs', type: 'text', required: true, label: 'Field Names (comma-separated)' },
                { name: 'types', type: 'select', required: false, label: 'Data Type', options: ['str', 'int', 'float', 'bool'] }
            ]
        },
        'Concatenate': {
            description: 'Combine multiple columns into one',
            parameters: [
                { name: 'NewFieldName', type: 'text', required: true, label: 'New Field Name' },
                { name: 'Inputs', type: 'text', required: true, label: 'Field Names (comma-separated)' },
                { name: 'separator', type: 'text', required: false, label: 'Separator', defaultValue: ' ' },
                { name: 'types', type: 'select', required: false, label: 'Data Type', options: ['str', 'int', 'float', 'bool'] }
            ]
        },
        'Split': {
            description: 'Split a string column into parts',
            parameters: [
                { name: 'NewFieldName', type: 'text', required: true, label: 'New Field Name' },
                { name: 'Inputs', type: 'select', required: true, label: 'Source Field', options: [] },
                { name: 'separator', type: 'text', required: false, label: 'Separator', defaultValue: ' ' },
                { name: 'part', type: 'number', required: false, label: 'Part Index (0-based)', defaultValue: 0 },
                { name: 'types', type: 'select', required: false, label: 'Data Type', options: ['str', 'int', 'float', 'bool'] }
            ]
        },
        'Replace': {
            description: 'Replace values based on a mapping',
            parameters: [
                { name: 'NewFieldName', type: 'text', required: true, label: 'New Field Name' },
                { name: 'Inputs', type: 'select', required: true, label: 'Source Field', options: [] },
                { name: 'replacements', type: 'json', required: true, label: 'Replacements Dictionary' },
                { name: 'types', type: 'select', required: false, label: 'Data Type', options: ['str', 'int', 'float', 'bool'] }
            ]
        },
        'Conditional': {
            description: 'Apply conditional logic',
            parameters: [
                { name: 'NewFieldName', type: 'text', required: true, label: 'New Field Name' },
                { name: 'Inputs', type: 'select', required: true, label: 'Condition Field', options: [] },
                { name: 'comparator', type: 'select', required: true, label: 'Comparator', options: ['==', '!=', '>', '<', '>=', '<='] },
                { name: 'value', type: 'text', required: true, label: 'Compare Value' },
                { name: 'true_value', type: 'text', required: true, label: 'True Value' },
                { name: 'false_value', type: 'text', required: true, label: 'False Value' },
                { name: 'types', type: 'select', required: false, label: 'Data Type', options: ['str', 'int', 'float', 'bool'] }
            ]
        },
        'DateExtract': {
            description: 'Extract date components',
            parameters: [
                { name: 'NewFieldName', type: 'text', required: true, label: 'New Field Name' },
                { name: 'Inputs', type: 'select', required: true, label: 'Date Field', options: [] },
                { name: 'component', type: 'select', required: true, label: 'Date Component', options: ['year', 'month', 'day', 'weekday', 'quarter'] },
                { name: 'types', type: 'select', required: false, label: 'Data Type', options: ['str', 'int', 'float', 'bool'] }
            ]
        },
        'NumericOperation': {
            description: 'Perform numeric operations',
            parameters: [
                { name: 'NewFieldName', type: 'text', required: true, label: 'New Field Name' },
                { name: 'Inputs', type: 'text', required: true, label: 'Field Names (comma-separated)' },
                { name: 'operation', type: 'select', required: true, label: 'Operation', options: ['sum', 'mean', 'max', 'min', 'std'] },
                { name: 'types', type: 'select', required: false, label: 'Data Type', options: ['str', 'int', 'float', 'bool'] }
            ]
        },
        'StringOperation': {
            description: 'Perform string operations',
            parameters: [
                { name: 'NewFieldName', type: 'text', required: true, label: 'New Field Name' },
                { name: 'Inputs', type: 'select', required: true, label: 'Source Field', options: [] },
                { name: 'operation', type: 'select', required: true, label: 'Operation', options: ['upper', 'lower', 'length', 'strip', 'title'] },
                { name: 'types', type: 'select', required: false, label: 'Data Type', options: ['str', 'int', 'float', 'bool'] }
            ]
        }
    }), []); // Empty dependency array since operations is static

    // Get available columns from input data
    const availableColumns = useMemo(() => {
        return inputData.length > 0 ? Object.keys(inputData[0]) : [];
    }, [inputData]);

    // Create dynamic columns based on Inputs parameter
    const getDynamicColumns = () => {
        const inputsValue = operationParams.Inputs || '';
        if (inputsValue && inputsValue.trim()) {
            const columnNames = inputsValue.split(',').map(col => col.trim()).filter(col => col);
            return columnNames;
        }
        return availableColumns;
    };

    const dynamicColumns = getDynamicColumns();

    // AG Grid configuration
    const defaultColDef = {
        editable: true,
        sortable: true,
        filter: true,
        resizable: true,
        minWidth: 100,
        width: 120,
        flex: 1,
        wrapText: true,
        autoHeight: true,
        cellStyle: {
            'white-space': 'pre-wrap',
            'word-break': 'break-word',
            'overflow': 'visible'
        }
    };

    const gridOptions = {
        defaultColDef,
        enableRangeSelection: true,
        enableFillHandle: true,
        suppressRowClickSelection: false, // Allow row selection
        rowSelection: 'multiple',
        animateRows: true,
        suppressRowTransform: true,
        enableClipboard: true,
        processClipboardForExport: true,
        processClipboardForImport: true,
        suppressColumnVirtualisation: true,
        suppressRowVirtualisation: false,
        rowMultiSelectWithClick: true, // Allow multiple selection with clicks
        suppressRowDeselection: false // Allow deselecting rows
    };

    // Convert input data to AG Grid format
    const gridData = inputData.map((row, index) => ({
        ...row,
        _id: row.id || index + 1
    }));

    // Update parameter options when input data changes
    useEffect(() => {
        const updatedOperations = { ...operations };
        Object.keys(updatedOperations).forEach(opKey => {
            updatedOperations[opKey].parameters.forEach(param => {
                if (param.name === 'Inputs' && param.options) {
                    param.options = availableColumns;
                }
            });
        });
    }, [availableColumns, operations]);

    // Handle operation selection
    const handleOperationChange = (operation) => {
        setSelectedOperation(operation);
        setOperationParams({});
        setResultData([]);
        setError(null);
        setOperationResult(null);
    };

    // Handle parameter change
    const handleParamChange = (paramName, value) => {
        setOperationParams(prev => ({
            ...prev,
            [paramName]: value
        }));
    };

    // AG Grid event handlers
    const onCellValueChanged = (params) => {
        const { data, colDef, newValue } = params;
        setInputData(prev => prev.map(row =>
            row.id === data.id ? { ...row, [colDef.field]: newValue } : row
        ));
    };

    const onGridReady = (params) => {
        gridRef.current = params.api;
        // Auto-size columns to fit content
        setTimeout(() => {
            const allColumnIds = params.api.getColumns().map(col => col.getColId());
            params.api.autoSizeColumns(allColumnIds);
            // Then size to fit if needed
            params.api.sizeColumnsToFit();
        }, 100);
    };

    // Handle row selection changes
    const onSelectionChanged = () => {
        if (gridRef.current) {
            // const selectedNodes = gridRef.current.getSelectedNodes();
            // console.log('Selected rows:', selectedNodes.length);
        }
    };

    // Add new row to input data
    const addRow = () => {
        const newId = Math.max(...inputData.map(row => row.id), 0) + 1;
        const newRow = { id: newId };

        // Only use dynamic columns if they exist, otherwise don't add row
        if (dynamicColumns.length > 0) {
            dynamicColumns.forEach(col => {
                if (col !== 'id') {
                    newRow[col] = '';
                }
            });
            setInputData(prev => [...prev, newRow]);
        } else {
            alert('Please enter column names in the Inputs field first');
        }
    };

    // Remove selected rows
    const removeSelectedRows = () => {
        if (!gridRef.current) {
            alert('Grid not ready yet');
            return;
        }

        const selectedNodes = gridRef.current.getSelectedNodes();
        if (selectedNodes.length === 0) {
            alert('Please select rows to delete');
            return;
        }

        const selectedIds = selectedNodes.map(node => node.data.id);

        if (window.confirm(`Are you sure you want to delete ${selectedIds.length} row(s)?`)) {
            setInputData(prev => prev.filter(row => !selectedIds.includes(row.id)));
            // Clear selection after deletion
            gridRef.current.deselectAll();
        }
    };

    // Clear all data
    const clearAllData = () => {
        if (inputData.length === 0) {
            alert('No data to clear');
            return;
        }

        if (window.confirm(`Are you sure you want to delete all ${inputData.length} rows?`)) {
            setInputData([]);
            if (gridRef.current) {
                gridRef.current.deselectAll();
            }
        }
    };

    // Add new column to Inputs parameter
    const addColumn = () => {
        const columnName = prompt('Enter column name:');
        if (columnName && columnName.trim()) {
            const currentInputs = operationParams.Inputs || '';
            const newInputs = currentInputs ? `${currentInputs},${columnName.trim()}` : columnName.trim();
            handleParamChange('Inputs', newInputs);
        }
    };

    // Handle paste from clipboard (Excel-style)
    const handlePasteFromClipboard = async () => {
        try {
            if (dynamicColumns.length === 0) {
                alert('Please enter column names in the Inputs field first');
                return;
            }

            // Request clipboard permission and read data
            const clipboardData = await navigator.clipboard.readText();

            if (clipboardData) {
                // Parse tab-separated data (Excel format)
                const rows = clipboardData.split('\n').map(row => row.split('\t'));

                if (rows.length > 0 && rows[0].length > 0) {
                    const newData = [];

                    rows.forEach((row, rowIndex) => {
                        if (row.some(cell => cell.trim() !== '')) { // Skip empty rows
                            const newId = Math.max(...inputData.map(r => r.id), 0) + rowIndex + 1;
                            const newRow = { id: newId };

                            // Map data to existing columns
                            row.forEach((cell, colIndex) => {
                                if (colIndex < dynamicColumns.length) {
                                    const columnName = dynamicColumns[colIndex];
                                    if (columnName !== 'id') {
                                        newRow[columnName] = cell.trim();
                                    }
                                }
                            });

                            // Fill missing columns with empty values
                            dynamicColumns.forEach(col => {
                                if (col !== 'id' && !(col in newRow)) {
                                    newRow[col] = '';
                                }
                            });

                            newData.push(newRow);
                        }
                    });

                    // Add new rows to the grid
                    if (newData.length > 0) {
                        setInputData(prev => [...prev, ...newData]);
                        alert(`Successfully pasted ${newData.length} rows of data`);
                    } else {
                        alert('No valid data found to paste');
                    }
                }
            }
        } catch (error) {
            console.error('Error pasting from clipboard:', error);
            alert('Unable to access clipboard. Please try copying data to clipboard first, then click this button again.');
        }
    };

    // Update dynamic columns when Inputs parameter changes
    useEffect(() => {
        const inputsValue = operationParams.Inputs || '';
        if (inputsValue && inputsValue.trim()) {
            const newColumns = inputsValue.split(',').map(col => col.trim()).filter(col => col);

            // If no data exists, create initial empty rows
            if (inputData.length === 0) {
                const initialData = [
                    { id: 1 },
                    { id: 2 }
                ];

                // Add the dynamic columns to initial data
                initialData.forEach(row => {
                    newColumns.forEach(col => {
                        if (col !== 'id') {
                            row[col] = '';
                        }
                    });
                });

                setInputData(initialData);
            } else {
                // Add missing columns to existing data
                setInputData(prev => prev.map(row => {
                    const updatedRow = { ...row };
                    newColumns.forEach(col => {
                        if (!(col in updatedRow)) {
                            updatedRow[col] = '';
                        }
                    });
                    return updatedRow;
                }));
            }
        }

        // Auto-resize columns when columns change
        setTimeout(() => {
            if (gridRef.current) {
                const allColumnIds = gridRef.current.getColumns().map(col => col.getColId());
                gridRef.current.autoSizeColumns(allColumnIds);
                gridRef.current.sizeColumnsToFit();
            }
        }, 200);
    }, [operationParams.Inputs, inputData.length]);

    // Execute transformation
    const executeTransformation = async () => {
        if (!selectedOperation) {
            setError('Please select an operation');
            return;
        }

        // Validate required parameters
        const operationConfig = operations[selectedOperation];
        const missingParams = operationConfig.parameters
            .filter(param => param.required && (!operationParams[param.name] || operationParams[param.name] === ''))
            .map(param => param.label);

        if (missingParams.length > 0) {
            setError(`Missing required parameters: ${missingParams.join(', ')}`);
            return;
        }

        // Additional check for NewFieldName specifically
        if (!operationParams.NewFieldName || operationParams.NewFieldName.trim() === '') {
            setError('New Field Name is required');
            return;
        }

        setIsLoading(true);
        setError(null);
        setResultData([]);

        try {
            // console.log('Operation params before processing:', operationParams);
            // console.log('NewFieldName value:', operationParams.NewFieldName);

            // Prepare the operation arguments
            const operationArgs = {
                NewFieldName: operationParams.NewFieldName || '',
                Operation: selectedOperation,
                ...operationParams
            };

            // Keep NewFieldName in the operation args

            // Prepare the request payload
            const payload = {
                data: inputData,
                operation: operationArgs
            };

            // console.log('Executing transformation:', payload);
            // console.log('Operation args:', operationArgs);
            // console.log('Input data:', inputData);

            // Call the API (you'll need to implement this endpoint)
            const response = await ApiService.executeTransformOperation(payload);

            if (response.success) {
                setResultData(response.data || []);
                setOperationResult(response);
                // console.log('Transformation successful:', response);
            } else {
                setError(response.error || 'Transformation failed');
            }
        } catch (err) {
            console.error('Transformation error:', err);
            setError(err.message || 'Failed to execute transformation');
        } finally {
            setIsLoading(false);
        }
    };

    // Generate sample data based on dynamic columns
    const generateSampleData = () => {
        if (dynamicColumns.length === 0) {
            alert('Please enter column names in the Inputs field first');
            return;
        }

        const sampleData = [
            { id: 1 },
            { id: 2 },
            { id: 3 },
            { id: 4 },
            { id: 5 }
        ];

        // Add sample values based on column names
        sampleData.forEach((row, index) => {
            dynamicColumns.forEach(col => {
                if (col !== 'id') {
                    // Generate appropriate sample data based on column name
                    if (col.toLowerCase().includes('name')) {
                        const names = ['John Doe', 'Jane Smith', 'Bob Johnson', 'Alice Brown', 'Charlie Wilson'];
                        row[col] = names[index] || `User ${index + 1}`;
                    } else if (col.toLowerCase().includes('age')) {
                        row[col] = 25 + index * 5;
                    } else if (col.toLowerCase().includes('salary')) {
                        row[col] = 50000 + index * 10000;
                    } else if (col.toLowerCase().includes('department')) {
                        const depts = ['IT', 'HR', 'Finance', 'IT', 'HR'];
                        row[col] = depts[index] || 'General';
                    } else if (col.toLowerCase().includes('date')) {
                        const dates = ['2020-01-15', '2019-03-20', '2018-07-10', '2021-02-28', '2017-11-05'];
                        row[col] = dates[index] || '2020-01-01';
                    } else if (col.toLowerCase().includes('a') || col.toLowerCase().includes('b') || col.toLowerCase().includes('c')) {
                        // For formula operations, generate numeric values
                        row[col] = (10 + index * 5).toString();
                    } else {
                        row[col] = `Sample ${col} ${index + 1}`;
                    }
                }
            });
        });

        setInputData(sampleData);
    };

    // Render parameter input
    const renderParameterInput = (param) => {
        const value = operationParams[param.name] || param.defaultValue || '';

        switch (param.type) {
            case 'text':
                return (
                    <input
                        type="text"
                        value={value}
                        onChange={(e) => handleParamChange(param.name, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        placeholder={param.label}
                    />
                );
            case 'number':
                return (
                    <input
                        type="number"
                        value={value}
                        onChange={(e) => handleParamChange(param.name, parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        placeholder={param.label}
                    />
                );
            case 'select':
                return (
                    <select
                        value={value}
                        onChange={(e) => handleParamChange(param.name, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    >
                        <option value="">Select {param.label}</option>
                        {param.options?.map(option => (
                            <option key={option} value={option}>{option}</option>
                        ))}
                    </select>
                );
            case 'json':
                return (
                    <textarea
                        value={value}
                        onChange={(e) => handleParamChange(param.name, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        placeholder='{"key1": "value1", "key2": "value2"}'
                        rows={3}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <OverflowFix>
            <style jsx>{`
                .text-wrap-cell {
                    white-space: pre-wrap !important;
                    word-break: break-word !important;
                    overflow: visible !important;
                    line-height: 1.4 !important;
                }
                
                .ag-cell {
                    display: flex !important;
                    align-items: center !important;
                    padding: 8px !important;
                }
                
                .ag-cell-wrapper {
                    overflow: visible !important;
                    text-overflow: unset !important;
                }
                
                .ag-cell-value {
                    overflow: visible !important;
                    text-overflow: unset !important;
                    white-space: pre-wrap !important;
                    word-break: break-word !important;
                }
                
                .ag-theme-alpine .ag-cell {
                    border-right: 1px solid #e0e0e0 !important;
                }
                
                .ag-theme-alpine .ag-header-cell {
                    border-right: 1px solid #e0e0e0 !important;
                }
            `}</style>
            <div className="min-h-screen" style={{ backgroundColor: theme.background }}>
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
                        <div className="flex-1 flex justify-center">
                            <h1 className="text-2xl font-bold text-black text-center">
                                TRANSFORM OPERATIONS VALIDATOR
                            </h1>
                        </div>
                        <div className="flex-shrink-0 w-32"></div>
                    </div>
                </div>

                <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 h-full">
                        {/* Left Panel - Operation Configuration (1/3 width) */}
                        <div className="xl:col-span-1 space-y-6">
                            {/* Operation Selection */}
                            <div className="bg-white rounded-lg shadow-sm border p-6" style={{ borderColor: theme.border }}>
                                <h2 className="text-lg font-semibold mb-4" style={{ color: theme.text.primary }}>
                                    Select Operation
                                </h2>
                                <div className="space-y-3">
                                    <label className="block text-sm font-medium" style={{ color: theme.text.primary }}>
                                        Operation Type
                                    </label>
                                    <select
                                        value={selectedOperation}
                                        onChange={(e) => handleOperationChange(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                                    >
                                        <option value="">Select an operation...</option>
                                        {Object.keys(operations).map(op => (
                                            <option key={op} value={op}>{op}</option>
                                        ))}
                                    </select>
                                    {selectedOperation && (
                                        <p className="text-sm" style={{ color: theme.text.secondary }}>
                                            {operations[selectedOperation].description}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Operation Parameters */}
                            {selectedOperation && (
                                <div className="bg-white rounded-lg shadow-sm border p-6" style={{ borderColor: theme.border }}>
                                    <h2 className="text-lg font-semibold mb-4" style={{ color: theme.text.primary }}>
                                        Operation Parameters
                                    </h2>
                                    <div className="space-y-4">
                                        {operations[selectedOperation].parameters.map((param, index) => (
                                            <div key={index}>
                                                <label className="block text-sm font-medium mb-1" style={{ color: theme.text.primary }}>
                                                    {param.label}
                                                    {param.required && <span className="text-red-500 ml-1">*</span>}
                                                </label>
                                                {renderParameterInput(param)}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Execute Button */}
                            {selectedOperation && (
                                <div className="bg-white rounded-lg shadow-sm border p-6" style={{ borderColor: theme.border }}>
                                    <button
                                        onClick={executeTransformation}
                                        disabled={isLoading}
                                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3 px-4 rounded-md flex items-center justify-center space-x-2 transition-colors"
                                    >
                                        {isLoading ? (
                                            <FaSpinner className="animate-spin" />
                                        ) : (
                                            <FaPlay />
                                        )}
                                        <span>{isLoading ? 'Executing...' : 'Execute Transformation'}</span>
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Right Panel - Input Data and Results (2/3 width) */}
                        <div className="xl:col-span-2 space-y-6">
                            {/* Input Data */}
                            <div className="bg-white rounded-lg shadow-sm border p-6" style={{ borderColor: theme.border }}>
                                <div className="flex justify-between items-center mb-4">
                                    <h2 className="text-lg font-semibold" style={{ color: theme.text.primary }}>
                                        Input Data
                                        {dynamicColumns.length > 0 && (
                                            <span className="text-sm font-normal ml-2" style={{ color: theme.text.secondary }}>
                                                (Columns: {dynamicColumns.join(', ')})
                                            </span>
                                        )}
                                    </h2>
                                    <div className="flex space-x-2">
                                        <button
                                            onClick={generateSampleData}
                                            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors flex items-center space-x-1"
                                            style={{ color: theme.text.secondary }}
                                        >
                                            <FaUpload size={12} />
                                            <span>Generate Sample</span>
                                        </button>
                                        <button
                                            onClick={handlePasteFromClipboard}
                                            className="px-3 py-1 text-sm bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-md transition-colors flex items-center space-x-1"
                                        >
                                            <FaPaste size={12} />
                                            <span>Paste from Excel</span>
                                        </button>
                                        <button
                                            onClick={addColumn}
                                            className="px-3 py-1 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md transition-colors flex items-center space-x-1"
                                        >
                                            <FaPlus size={12} />
                                            <span>Add Column</span>
                                        </button>
                                        <button
                                            onClick={addRow}
                                            className="px-3 py-1 text-sm bg-green-100 hover:bg-green-200 text-green-700 rounded-md transition-colors flex items-center space-x-1"
                                        >
                                            <FaPlus size={12} />
                                            <span>Add Row</span>
                                        </button>
                                        <button
                                            onClick={removeSelectedRows}
                                            className="px-3 py-1 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded-md transition-colors flex items-center space-x-1"
                                        >
                                            <FaTrash size={12} />
                                            <span>Remove Row</span>
                                        </button>
                                        <button
                                            onClick={clearAllData}
                                            className="px-3 py-1 text-sm bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-md transition-colors flex items-center space-x-1"
                                        >
                                            <FaTrash size={12} />
                                            <span>Clear All</span>
                                        </button>
                                    </div>
                                </div>

                                {/* AG Grid */}
                                {dynamicColumns.length > 0 ? (
                                    <div className="ag-theme-alpine" style={{ height: '400px', width: '100%', overflow: 'auto' }}>
                                        <AgGridReact
                                            ref={gridRef}
                                            rowData={gridData}
                                            columnDefs={[
                                                // Checkbox column for selection
                                                {
                                                    headerName: '',
                                                    checkboxSelection: true,
                                                    headerCheckboxSelection: true,
                                                    width: 50,
                                                    minWidth: 50,
                                                    maxWidth: 50,
                                                    pinned: 'left',
                                                    suppressHeaderMenuButton: true,
                                                    sortable: false,
                                                    filter: false,
                                                    resizable: false,
                                                    cellStyle: { 'display': 'flex', 'align-items': 'center', 'justify-content': 'center' }
                                                },
                                                // Data columns
                                                ...dynamicColumns.map((col, index) => ({
                                                    field: col,
                                                    headerName: col,
                                                    editable: true,
                                                    cellEditor: 'agTextCellEditor',
                                                    cellEditorParams: {
                                                        maxLength: 1000
                                                    },
                                                    minWidth: 100,
                                                    width: col === 'id' ? 80 : 120,
                                                    flex: col === 'id' ? 0 : 1,
                                                    resizable: true,
                                                    sortable: true,
                                                    filter: true,
                                                    wrapText: true,
                                                    autoHeight: true,
                                                    cellStyle: {
                                                        'white-space': 'pre-wrap',
                                                        'word-break': 'break-word',
                                                        'overflow': 'visible',
                                                        'padding': '8px',
                                                        'line-height': '1.4'
                                                    },
                                                    cellClass: 'text-wrap-cell',
                                                    tooltipField: (col === 'id') ? undefined : col,
                                                    tooltipComponent: (col === 'id') ? undefined : 'agTextTooltipComponent'
                                                }))
                                            ]}
                                            defaultColDef={defaultColDef}
                                            gridOptions={gridOptions}
                                            onCellValueChanged={onCellValueChanged}
                                            onGridReady={onGridReady}
                                            onSelectionChanged={onSelectionChanged}
                                            animateRows={true}
                                            enableRangeSelection={true}
                                            enableFillHandle={true}
                                            suppressRowClickSelection={false}
                                            suppressColumnVirtualisation={true}
                                        />
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center h-48 bg-gray-50 rounded-md border-2 border-dashed border-gray-300">
                                        <div className="text-center">
                                            <p className="text-gray-500 mb-2">No columns defined</p>
                                            <p className="text-sm text-gray-400">
                                                Enter column names in the <strong>Inputs</strong> field to create your data table
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Paste Instructions */}
                                {dynamicColumns.length > 0 && (
                                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                                        <div className="flex items-start space-x-2">
                                            <FaPaste className="text-blue-600 mt-1" size={14} />
                                            <div className="text-sm text-blue-800">
                                                <p className="font-medium mb-1">💡 Paste from Excel/CSV:</p>
                                                <ul className="text-xs space-y-1 text-blue-700">
                                                    <li>• Copy data from Excel/CSV (Ctrl+C)</li>
                                                    <li>• Click "Paste from Excel" button above</li>
                                                    <li>• Or select cells in the grid and paste directly (Ctrl+V)</li>
                                                    <li>• Data will be mapped to columns: <strong>{dynamicColumns.join(', ')}</strong></li>
                                                    <li>• Use checkboxes to select rows, then "Remove Row" to delete</li>
                                                    <li>• Use "Clear All" to remove all data at once</li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Results */}
                            {(resultData.length > 0 || error) && (
                                <div className="bg-white rounded-lg shadow-sm border p-6" style={{ borderColor: theme.border }}>
                                    <h2 className="text-lg font-semibold mb-4" style={{ color: theme.text.primary }}>
                                        Transformation Results
                                    </h2>

                                    {error ? (
                                        <div className="bg-red-50 border border-red-200 rounded-md p-4 flex items-start space-x-3">
                                            <FaExclamationTriangle className="text-red-500 mt-1" />
                                            <div>
                                                <h3 className="text-red-800 font-medium">Error</h3>
                                                <p className="text-red-700 mt-1">{error}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="overflow-x-auto mb-4">
                                                <table className="w-full border-collapse">
                                                    <thead>
                                                        <tr className="border-b" style={{ borderColor: theme.border }}>
                                                            {resultData.length > 0 && Object.keys(resultData[0]).map(col => (
                                                                <th key={col} className="text-left py-2 px-3 font-medium" style={{ color: theme.text.primary }}>
                                                                    {col}
                                                                </th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {resultData.map((row, index) => (
                                                            <tr key={index} className="border-b" style={{ borderColor: theme.border }}>
                                                                {Object.values(row).map((value, colIndex) => (
                                                                    <td key={colIndex} className="py-2 px-3 text-sm" style={{ color: theme.text.primary }}>
                                                                        {value}
                                                                    </td>
                                                                ))}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>

                                            {/* Operation Result Dictionary */}
                                            {operationResult && (
                                                <div className="bg-gray-50 rounded-md p-4">
                                                    <h3 className="text-sm font-medium mb-2" style={{ color: theme.text.primary }}>
                                                        Operation Result
                                                    </h3>
                                                    <pre className="text-xs overflow-x-auto" style={{ color: theme.text.secondary }}>
                                                        {JSON.stringify(operationResult, null, 2)}
                                                    </pre>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </OverflowFix>
    );
};

export default TransformValidator;
