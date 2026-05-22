/**
 * ValidationConfigModal Component
 * 
 * Modal for configuring validation rules for workflow nodes.
 * Supports row count, column existence, null percentage, and custom expression validations.
 */

import { useState, useEffect } from 'react';
import {
    FaTimes,
    FaPlus,
    FaTrash,
    FaCheck,
    FaCheckCircle
} from 'react-icons/fa';

// Validation rule types
export const VALIDATION_TYPES = {
    ROW_COUNT_MIN: {
        value: 'row_count_min',
        label: 'Minimum Row Count',
        description: 'Output must have at least X rows',
        valueType: 'number',
        placeholder: 'Minimum rows (e.g., 100)'
    },
    ROW_COUNT_MAX: {
        value: 'row_count_max',
        label: 'Maximum Row Count',
        description: 'Output must have at most X rows',
        valueType: 'number',
        placeholder: 'Maximum rows (e.g., 10000)'
    },
    COLUMN_EXISTS: {
        value: 'column_exists',
        label: 'Column Must Exist',
        description: 'Output must contain specified column',
        valueType: 'string',
        placeholder: 'Column name'
    },
    NULL_PERCENTAGE_MAX: {
        value: 'null_percentage_max',
        label: 'Max Null Percentage',
        description: 'Column null values must not exceed X%',
        valueType: 'percentage',
        placeholder: '10',
        requiresColumn: true
    },
    EXPRESSION: {
        value: 'expression',
        label: 'Custom Expression',
        description: 'Polars-compatible filter expression',
        valueType: 'expression',
        placeholder: 'e.g., column_name > 0'
    }
};

/**
 * Single Validation Rule Row
 */
const ValidationRuleRow = ({
    rule,
    index,
    columns = [],
    onUpdate,
    onRemove
}) => {
    const ruleType = Object.values(VALIDATION_TYPES).find(t => t.value === rule.type);

    return (
        <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex-1 grid grid-cols-2 gap-3">
                {/* Rule Type */}
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Rule Type</label>
                    <select
                        value={rule.type}
                        onChange={(e) => onUpdate({ ...rule, type: e.target.value, column: '', value: '' })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        {Object.values(VALIDATION_TYPES).map((type) => (
                            <option key={type.value} value={type.value}>
                                {type.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Column Select (if required) */}
                {ruleType?.requiresColumn && (
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Column</label>
                        <select
                            value={rule.column || ''}
                            onChange={(e) => onUpdate({ ...rule, column: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">Select column...</option>
                            {columns.map((col) => (
                                <option key={col} value={col}>{col}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Value Input */}
                <div className={ruleType?.requiresColumn ? '' : 'col-span-1'}>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                        Value
                        {ruleType?.valueType === 'percentage' && ' (%)'}
                    </label>
                    <input
                        type={ruleType?.valueType === 'number' || ruleType?.valueType === 'percentage' ? 'number' : 'text'}
                        value={rule.value || ''}
                        onChange={(e) => onUpdate({ ...rule, value: e.target.value })}
                        placeholder={ruleType?.placeholder}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                {/* Error Message (optional custom) */}
                <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                        Custom Error Message (optional)
                    </label>
                    <input
                        type="text"
                        value={rule.errorMessage || ''}
                        onChange={(e) => onUpdate({ ...rule, errorMessage: e.target.value })}
                        placeholder="Optional custom error message"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            </div>

            {/* Remove Button */}
            <button
                onClick={onRemove}
                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors mt-5"
                title="Remove rule"
            >
                <FaTrash />
            </button>
        </div>
    );
};

/**
 * Main ValidationConfigModal Component
 */
const ValidationConfigModal = ({
    isOpen,
    onClose,
    onSave,
    nodeId,
    nodeName,
    nodeType,
    initialValidations = [],
    columns = []
}) => {
    const [validations, setValidations] = useState([]);

    useEffect(() => {
        if (isOpen) {
            setValidations(initialValidations.length > 0
                ? initialValidations
                : []
            );
        }
    }, [isOpen, initialValidations]);

    const addValidation = () => {
        setValidations(prev => [...prev, {
            id: Date.now(),
            type: VALIDATION_TYPES.ROW_COUNT_MIN.value,
            value: '',
            column: '',
            errorMessage: ''
        }]);
    };

    const updateValidation = (index, updated) => {
        setValidations(prev => {
            const newValidations = [...prev];
            newValidations[index] = updated;
            return newValidations;
        });
    };

    const removeValidation = (index) => {
        setValidations(prev => prev.filter((_, i) => i !== index));
    };

    const handleSave = () => {
        // Filter out incomplete validations
        const validRules = validations.filter(v => v.type && v.value);
        onSave(nodeId, validRules);
        onClose();
    };

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            onClick={handleBackdropClick}
        >
            <div
                className="bg-white rounded-xl shadow-lg max-w-2xl w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">
                            Configure Validations
                        </h2>
                        <p className="text-sm text-gray-500">
                            {nodeName} ({nodeType})
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <FaTimes />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Info Box */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                        <p className="text-sm text-blue-800">
                            <strong>Validations</strong> run after node execution. If any validation fails,
                            the workflow will stop and display an error.
                        </p>
                    </div>

                    {/* Validation Rules */}
                    {validations.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <FaCheckCircle className="mx-auto text-3xl text-gray-300 mb-2" />
                            <p>No validation rules configured</p>
                            <p className="text-sm">Click "Add Validation" to create a rule</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {validations.map((rule, index) => (
                                <ValidationRuleRow
                                    key={rule.id}
                                    rule={rule}
                                    index={index}
                                    columns={columns}
                                    onUpdate={(updated) => updateValidation(index, updated)}
                                    onRemove={() => removeValidation(index)}
                                />
                            ))}
                        </div>
                    )}

                    {/* Add Button */}
                    <button
                        onClick={addValidation}
                        className="mt-4 flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors w-full justify-center border-2 border-dashed border-blue-200"
                    >
                        <FaPlus />
                        Add Validation Rule
                    </button>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                    <span className="text-sm text-gray-500">
                        {validations.length} validation{validations.length !== 1 ? 's' : ''} configured
                    </span>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            <FaCheck />
                            Save Validations
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ValidationConfigModal;
