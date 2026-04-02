import React, { memo, useState, useCallback } from 'react';
import { FaCheckCircle, FaTimesCircle } from 'react-icons/fa';

/**
 * Parameter Form Component
 * Handles parameter input, validation, and application
 */
const ParameterForm = memo(({
    runParams,
    setRunParams,
    handleApplyParams,
    paramValidation,
    areParamsApplied,
    invalidFields,
    instanceId
}) => {
    const [showValidation, setShowValidation] = useState(false);

    const handleParamChange = useCallback((param, value) => {
        // Clean the input value by trimming whitespace
        const cleanValue = value.trim();

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
    }, [setRunParams, invalidFields, setInvalidFields]);

    const renderParameterInputs = useCallback(() => {
        const parameters = [
            { key: 'expectedRunDate', label: 'Expected Run Date', type: 'date', placeholder: '2024-01-01' },
            { key: 'inputConfigFilePath', label: 'Input Config File Path', type: 'text', placeholder: '/path/to/config' },
            { key: 'inputConfigFilePattern', label: 'Input Config File Pattern', type: 'text', placeholder: '*.json' },
            { key: 'rootFileDir', label: 'Root File Directory', type: 'text', placeholder: '/data' },
            { key: 'runEnv', label: 'Run Environment', type: 'text', placeholder: 'production' },
            { key: 'tempFilePath', label: 'Temp File Path', type: 'text', placeholder: '/tmp' }
        ];

        return parameters.map(({ key, label, type, placeholder }) => (
            <div key={key} className="space-y-2">
                <label className="block text-sm font-medium text-slate-300">
                    {label}
                    <span className="text-red-400 ml-1">*</span>
                </label>
                <input
                    type={type}
                    value={runParams[key] || ''}
                    onChange={(e) => handleParamChange(key, e.target.value)}
                    placeholder={placeholder}
                    className={`w-full px-3 py-2 bg-slate-800 border rounded-md text-slate-200 placeholder-slate-400 
                        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors
                        ${invalidFields.has(key) ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-slate-600'}
                        ${areParamsApplied ? 'border-green-500' : ''}`}
                />
                {invalidFields.has(key) && (
                    <p className="text-red-400 text-xs">
                        This field is required
                    </p>
                )}
            </div>
        ));
    }, [runParams, handleParamChange, invalidFields, areParamsApplied]);

    return (
        <div className="space-y-4">
            {/* Form Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-200">
                    Run Parameters
                </h3>
                <div className="flex items-center gap-2">
                    {areParamsApplied && (
                        <div className="flex items-center gap-1 text-green-400">
                            <FaCheckCircle className="text-sm" />
                            <span className="text-xs">Applied</span>
                        </div>
                    )}
                    <button
                        onClick={() => setShowValidation(!showValidation)}
                        className="text-xs text-slate-400 hover:text-slate-300 transition-colors"
                    >
                        {showValidation ? 'Hide' : 'Show'} Validation
                    </button>
                </div>
            </div>

            {/* Form fields */}
            <div className="space-y-4">
                {renderParameterInputs()}
            </div>

            {/* Validation Message */}
            {showValidation && paramValidation.message && (
                <div className={`p-3 rounded-md border ${paramValidation.isValid
                        ? 'bg-green-900/20 border-green-500 text-green-400'
                        : 'bg-red-900/20 border-red-500 text-red-400'
                    }`}>
                    <div className="flex items-center gap-2">
                        {paramValidation.isValid ? (
                            <FaCheckCircle className="text-sm" />
                        ) : (
                            <FaTimesCircle className="text-sm" />
                        )}
                        <span className="text-sm">{paramValidation.message}</span>
                    </div>
                </div>
            )}

            {/* Apply Button */}
            <button
                onClick={handleApplyParams}
                className={`w-full px-4 py-3 rounded-md font-medium transition-colors shadow-lg 
                    focus:ring-2 focus:ring-blue-500/50 active:transform active:scale-[0.98]
                    ${areParamsApplied
                        ? 'bg-green-600 hover:bg-green-700 text-white shadow-green-900/20'
                        : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-900/20'
                    }`}
            >
                {areParamsApplied ? 'Parameters Applied' : 'Apply Parameters'}
            </button>

            {/* Instance Info */}
            <div className="text-xs text-slate-500 text-center">
                Instance: {instanceId}
            </div>
        </div>
    );
});

ParameterForm.displayName = 'ParameterForm';

export default ParameterForm;

