import React, { useEffect, useMemo, useState } from 'react';
import {
    Bar,
    CartesianGrid,
    ComposedChart,
    Legend,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';

const PLAN_COLORS = ['#1d4ed8', '#059669', '#d97706', '#7c3aed', '#c2410c', '#be123c', '#0f766e'];

function buildPlanColorMap(series) {
    const plans = [...new Set((series || []).map((item) => item.plan))];
    return Object.fromEntries(plans.map((plan, index) => [plan, PLAN_COLORS[index % PLAN_COLORS.length]]));
}

function aggregateMonthlyChart(chart, selectedPlans) {
    const series = (chart?.series || []).filter((item) => selectedPlans.has(item.plan));
    const planColorMap = buildPlanColorMap(series);
    const byPeriod = new Map();

    (chart?.data || []).forEach((row) => {
        const key = row.period_key;
        if (!byPeriod.has(key)) {
            const base = {
                period_key: row.period_key,
                period_label: row.period_label,
                remediated_total: 0,
                unremediated_total: 0
            };
            series.forEach((item) => {
                base[`remediated__${item.key}`] = 0;
                base[`unremediated__${item.key}`] = 0;
            });
            byPeriod.set(key, base);
        }

        const target = byPeriod.get(key);
        const isRemediated = String(row.status).toLowerCase().includes('remediated') && !String(row.status).toLowerCase().includes('unremediated');
        const totalKey = isRemediated ? 'remediated_total' : 'unremediated_total';
        target[totalKey] += row.total_count || 0;
        series.forEach((item) => {
            const dataKey = `${isRemediated ? 'remediated' : 'unremediated'}__${item.key}`;
            target[dataKey] += row[item.key] || 0;
        });
    });

    const orderedData = Array.from(byPeriod.values()).sort((a, b) => String(a.period_key).localeCompare(String(b.period_key)));

    let cumulativeRemediated = 0;
    let cumulativeUnremediated = 0;
    orderedData.forEach((row) => {
        cumulativeRemediated += row.remediated_total || 0;
        cumulativeUnremediated += row.unremediated_total || 0;
        row.cumulative_remediated_total = cumulativeRemediated;
        row.cumulative_unremediated_total = cumulativeUnremediated;
    });

    return {
        data: orderedData,
        series,
        planColorMap
    };
}

function aggregateDailyStatusChart(chart, targetStatus, selectedPlans, limit = null) {
    const normalizedStatus = targetStatus.toLowerCase();
    const series = (chart?.series || []).filter((item) => selectedPlans.has(item.plan));
    const matchingRows = (chart?.data || []).filter((row) => String(row.status).toLowerCase() === normalizedStatus);
    const rowsToUse = limit ? matchingRows.slice(-limit) : matchingRows;
    const planColorMap = buildPlanColorMap(series);

    const data = rowsToUse.map((row) => {
        const nextRow = {
            period_key: row.period_key,
            period_label: row.period_label,
            total_count: row.total_count || 0
        };
        series.forEach((item) => {
            nextRow[item.key] = row[item.key] || 0;
        });
        return nextRow;
    }).sort((a, b) => String(a.period_key).localeCompare(String(b.period_key)));

    let cumulativeTotal = 0;
    data.forEach((row) => {
        cumulativeTotal += row.total_count || 0;
        row.cumulative_total = cumulativeTotal;
    });

    return {
        data,
        series,
        planColorMap,
        statusLabel: targetStatus
    };
}

function RemediationPlanSelector({ plans, selectedPlans, onToggle, onSelectAll, onClearAll }) {
    return (
        <div className="supervisory-elevated supervisory-surface rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                    <h3 className="text-sm font-semibold text-gray-900">Graph Remediation Plans</h3>
                    <p className="text-xs text-gray-500">Choose which remediation plans are visible across all charts</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onSelectAll}
                        className="px-2.5 py-1 text-xs rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    >
                        All
                    </button>
                    <button
                        type="button"
                        onClick={onClearAll}
                        className="px-2.5 py-1 text-xs rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    >
                        None
                    </button>
                </div>
            </div>
            <div className="flex flex-wrap gap-2">
                {plans.map((plan) => {
                    const isActive = selectedPlans.has(plan);
                    return (
                        <button
                            key={plan}
                            type="button"
                            onClick={() => onToggle(plan)}
                            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                                isActive
                                    ? 'bg-slate-700 text-white border-slate-700'
                                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                            }`}
                        >
                            {plan}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function MonthlyChartCard({ title, subtitle, chart }) {
    return (
        <div className="supervisory-elevated supervisory-surface rounded-lg border border-gray-200 p-4">
            <div className="mb-3">
                <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
                <p className="text-xs text-gray-500">{subtitle}</p>
            </div>
            <div style={{ height: '420px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chart.data} margin={{ top: 20, right: 30, left: 10, bottom: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="period_label" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                        <Tooltip
                            formatter={(value, name) => [Number(value || 0).toLocaleString(), name]}
                            contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        {chart.series.map((item) => (
                            <Bar
                                key={`remediated-${item.key}`}
                                yAxisId="left"
                                dataKey={`remediated__${item.key}`}
                                name={`Remediated | ${item.label}`}
                                stackId="remediated"
                                fill={chart.planColorMap[item.plan]}
                                fillOpacity={0.45}
                            />
                        ))}
                        {chart.series.map((item) => (
                            <Bar
                                key={`unremediated-${item.key}`}
                                yAxisId="left"
                                dataKey={`unremediated__${item.key}`}
                                name={`Unremediated | ${item.label}`}
                                stackId="unremediated"
                                fill={chart.planColorMap[item.plan]}
                                fillOpacity={0.9}
                            />
                        ))}
                        <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="remediated_total"
                            name="Remediated Total"
                            stroke="#2563eb"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                        />
                        <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="unremediated_total"
                            name="Unremediated Total"
                            stroke="#dc2626"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                        />
                        <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="cumulative_remediated_total"
                            name="Cumulative Remediated"
                            stroke="#1d4ed8"
                            strokeWidth={2}
                            strokeDasharray="6 3"
                            dot={{ r: 2 }}
                        />
                        <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="cumulative_unremediated_total"
                            name="Cumulative Unremediated"
                            stroke="#991b1b"
                            strokeWidth={2}
                            strokeDasharray="6 3"
                            dot={{ r: 2 }}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

function DailyStatusChartCard({ title, subtitle, chart }) {
    return (
        <div className="supervisory-elevated supervisory-surface rounded-lg border border-gray-200 p-4">
            <div className="mb-3">
                <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
                <p className="text-xs text-gray-500">{subtitle}</p>
            </div>
            <div style={{ height: '320px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chart.data} margin={{ top: 20, right: 20, left: 10, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="period_label" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={55} />
                        <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                        <Tooltip
                            formatter={(value, name) => [Number(value || 0).toLocaleString(), name]}
                            contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
                            labelFormatter={(label) => `${chart.statusLabel} / ${label}`}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        {chart.series.map((item) => (
                            <Bar
                                key={item.key}
                                yAxisId="left"
                                dataKey={item.key}
                                name={item.label}
                                stackId={chart.statusLabel}
                                fill={chart.planColorMap[item.plan]}
                            />
                        ))}
                        <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="cumulative_total"
                            name={`Cumulative ${chart.statusLabel}`}
                            stroke={String(chart.statusLabel).toLowerCase().includes('un') ? '#991b1b' : '#1d4ed8'}
                            strokeWidth={2}
                            dot={{ r: 2 }}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

const TrendChartsSection = ({ monthlyChart, dailyChart }) => {
    const availablePlans = useMemo(
        () => [...new Set([...(monthlyChart?.series || []), ...(dailyChart?.series || [])].map((item) => item.plan))],
        [dailyChart, monthlyChart]
    );
    const [selectedPlanNames, setSelectedPlanNames] = useState(() => availablePlans);

    useEffect(() => {
        setSelectedPlanNames((prev) => {
            const next = prev.filter((plan) => availablePlans.includes(plan));
            return next.length > 0 ? next : availablePlans;
        });
    }, [availablePlans]);

    const selectedPlans = useMemo(() => new Set(selectedPlanNames), [selectedPlanNames]);

    const monthlyAggregated = useMemo(() => aggregateMonthlyChart(monthlyChart, selectedPlans), [monthlyChart, selectedPlans]);
    const dailyRemediated30 = useMemo(() => aggregateDailyStatusChart(dailyChart, 'Remediated', selectedPlans), [dailyChart, selectedPlans]);
    const dailyUnremediated30 = useMemo(() => aggregateDailyStatusChart(dailyChart, 'Unremediated', selectedPlans), [dailyChart, selectedPlans]);
    const dailyRemediated5 = useMemo(() => aggregateDailyStatusChart(dailyChart, 'Remediated', selectedPlans, 5), [dailyChart, selectedPlans]);
    const dailyUnremediated5 = useMemo(() => aggregateDailyStatusChart(dailyChart, 'Unremediated', selectedPlans, 5), [dailyChart, selectedPlans]);

    const handleTogglePlan = (plan) => {
        setSelectedPlanNames((prev) => (
            prev.includes(plan)
                ? prev.filter((item) => item !== plan)
                : [...prev, plan]
        ));
    };

    return (
        <div className="space-y-4">
            <RemediationPlanSelector
                plans={availablePlans}
                selectedPlans={selectedPlans}
                onToggle={handleTogglePlan}
                onSelectAll={() => setSelectedPlanNames(availablePlans)}
                onClearAll={() => setSelectedPlanNames([])}
            />
            <MonthlyChartCard
                title="Monthly Remediation Trend"
                subtitle="Stacked monthly plan breakdown with remediated and unremediated total lines"
                chart={monthlyAggregated}
            />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <DailyStatusChartCard
                    title="Daily Remediated Plans"
                    subtitle="Last 30 days"
                    chart={dailyRemediated30}
                />
                <DailyStatusChartCard
                    title="Daily Unremediated Plans"
                    subtitle="Last 30 days"
                    chart={dailyUnremediated30}
                />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <DailyStatusChartCard
                    title="Daily Remediated Plans"
                    subtitle="Last 5 days"
                    chart={dailyRemediated5}
                />
                <DailyStatusChartCard
                    title="Daily Unremediated Plans"
                    subtitle="Last 5 days"
                    chart={dailyUnremediated5}
                />
            </div>
        </div>
    );
};

export default TrendChartsSection;
