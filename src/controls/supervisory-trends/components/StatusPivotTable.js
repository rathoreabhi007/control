import React from 'react';

const StatusPivotTable = ({ title, subtitle, rows, statuses }) => {
    return (
        <div className="supervisory-elevated bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
                <div>
                    <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
                    <p className="text-xs text-gray-500">{subtitle}</p>
                </div>
                <span className="text-xs text-gray-500">{rows.length} rows</span>
            </div>

            <div className="overflow-auto">
                <table className="min-w-full border-separate border-spacing-0 text-xs">
                    <thead>
                        <tr>
                            <th className="sticky top-0 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-700 border-b border-slate-200">Period</th>
                            {statuses.map((status) => (
                                <th key={status} className="sticky top-0 bg-slate-50 px-3 py-2 text-right font-semibold text-slate-700 border-b border-slate-200">
                                    {status}
                                </th>
                            ))}
                            <th className="sticky top-0 bg-slate-50 px-3 py-2 text-right font-semibold text-slate-700 border-b border-slate-200">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.period_key} className="odd:bg-white even:bg-slate-50/50">
                                <td className="px-3 py-2 font-medium text-slate-800 border-b border-slate-100">{row.period_label}</td>
                                {statuses.map((status) => (
                                    <td key={`${row.period_key}-${status}`} className="px-3 py-2 text-right text-slate-700 border-b border-slate-100">
                                        {(row.status_counts?.[status] || 0).toLocaleString()}
                                    </td>
                                ))}
                                <td className="px-3 py-2 text-right font-semibold text-slate-900 border-b border-slate-100">
                                    {(row.total_count || 0).toLocaleString()}
                                </td>
                            </tr>
                        ))}
                        {rows.length === 0 && (
                            <tr>
                                <td className="px-3 py-8 text-center text-slate-500" colSpan={statuses.length + 2}>
                                    No data available for the current filters.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default StatusPivotTable;
