import { FaCheckCircle, FaTimesCircle, FaExclamationTriangle } from 'react-icons/fa';

const ValidationSummary = ({ summary, validationPassed, onSheetClick }) => {
    if (!summary) return null;

    const {
        total_errors = 0,
        total_warnings = 0,
        total_issues = 0,
        errors_by_sheet = {},
        errors_by_type = {},
        validation_duration_seconds = 0,
    } = summary;

    const hasIssues = total_issues > 0 || total_errors > 0 || total_warnings > 0;
    const hasErrors = total_errors > 0;

    // Three states: clean (green), warnings only (yellow), errors (red)
    const bgClass = !hasIssues
        ? 'bg-green-50 border-green-200'
        : hasErrors
            ? 'bg-red-50 border-red-200'
            : 'bg-yellow-50 border-yellow-200';

    const statusIcon = !hasIssues
        ? <FaCheckCircle className="text-green-500 text-2xl" />
        : hasErrors
            ? <FaTimesCircle className="text-red-500 text-2xl" />
            : <FaExclamationTriangle className="text-yellow-500 text-2xl" />;

    const statusText = !hasIssues
        ? 'VALIDATION PASSED'
        : hasErrors
            ? 'VALIDATION FAILED'
            : 'VALIDATION PASSED WITH WARNINGS';

    const statusColor = !hasIssues
        ? 'text-green-700'
        : hasErrors
            ? 'text-red-700'
            : 'text-yellow-700';

    return (
        <div className={`rounded-lg border p-4 mb-4 ${bgClass}`}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                    {statusIcon}
                    <span className={`text-lg font-bold ${statusColor}`}>
                        {statusText}
                    </span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                    {total_errors > 0 && (
                        <span className="flex items-center gap-1 text-red-600 font-medium">
                            <FaTimesCircle />
                            {total_errors} {total_errors === 1 ? 'Error' : 'Errors'}
                        </span>
                    )}
                    {total_warnings > 0 && (
                        <span className="flex items-center gap-1 text-yellow-600 font-medium">
                            <FaExclamationTriangle />
                            {total_warnings} {total_warnings === 1 ? 'Warning' : 'Warnings'}
                        </span>
                    )}
                    {validation_duration_seconds > 0 && (
                        <span className="text-gray-500">
                            {validation_duration_seconds.toFixed(1)}s
                        </span>
                    )}
                </div>
            </div>

            {hasIssues && (
                <div className="flex flex-wrap gap-4 text-sm">
                    {/* Issues by Sheet */}
                    {Object.keys(errors_by_sheet).length > 0 && (
                        <div>
                            <span className="text-gray-600 font-medium mr-2">By Sheet:</span>
                            {Object.entries(errors_by_sheet).map(([sheet, count]) => (
                                <button
                                    key={sheet}
                                    onClick={() => onSheetClick && onSheetClick(sheet)}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded mr-1 hover:opacity-80 transition-colors cursor-pointer ${
                                        hasErrors ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                    }`}
                                >
                                    {sheet}
                                    <span className="font-bold">({count})</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Issues by Type */}
                    {Object.keys(errors_by_type).length > 0 && (
                        <div>
                            <span className="text-gray-600 font-medium mr-2">By Type:</span>
                            {Object.entries(errors_by_type).map(([type, count]) => (
                                <span
                                    key={type}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 text-gray-700 mr-1"
                                >
                                    {type}
                                    <span className="font-bold">({count})</span>
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ValidationSummary;
