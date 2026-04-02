import React from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';

const ChartsSection = ({
    selectedColumns,
    chartData,
    activeAgeBuckets,
    activeBucketVisuals,
    chartGroupColumn,
    onChartGroupColumnChange
}) => {
    return (
        <div className="supervisory-elevated bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-900">
                    Unremediated by {chartGroupColumn?.label || 'Dimension'}
                </h3>
                <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500">Group by:</label>
                    <select
                        value={chartGroupColumn?.field || ''}
                        onChange={(e) => {
                            const col = selectedColumns.find(c => c.field === e.target.value);
                            if (col) onChartGroupColumnChange(col);
                        }}
                        className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
                    >
                        {selectedColumns.map(col => (
                            <option key={col.field} value={col.field}>{col.label}</option>
                        ))}
                    </select>
                </div>
            </div>
            <div style={{ height: 'calc(100vh - 460px)', minHeight: '350px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={80} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip
                            contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
                            formatter={(value, name) => [value.toLocaleString(), name.replace('unremediated_', 'Unrem ').replace('total_', 'Total ')]}
                        />
                        <Legend formatter={(value) => value.replace('unremediated_', 'Unrem ').replace('total_', 'Total ')} wrapperStyle={{ fontSize: '11px' }} />
                        {activeAgeBuckets.map((bucket) => (
                            <Bar key={`unremediated_${bucket}`} dataKey={`unremediated_${bucket}`} stackId="unremediated" fill={activeBucketVisuals.chartColors[bucket]} name={`unremediated_${bucket}`} />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default ChartsSection;
