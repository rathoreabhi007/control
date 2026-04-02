import React from 'react';

const SummaryCard = ({ title, value, color, subtitle, small }) => (
    <div
        className={`supervisory-kpi-card rounded-lg border border-slate-200 border-l-4 ${small ? 'p-2' : 'p-4'}`}
        style={{ borderLeftColor: color }}
    >
        <div className={`text-gray-500 font-medium ${small ? 'text-xs' : 'text-sm'}`}>{title}</div>
        <div className={`font-bold mt-1 ${small ? 'text-lg' : 'text-2xl'}`} style={{ color }}>
            {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
        {subtitle && <div className="text-xs text-gray-400 mt-1">{subtitle}</div>}
    </div>
);

export default SummaryCard;
