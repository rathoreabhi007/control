import React, { useCallback, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ROW_SPAN_CONFIG, addRowSpanMetadata } from '../../supervisory-dashboard/utils/agGridUtils';

function formatStatusHeader(value) {
    const normalized = String(value || '').toLowerCase();
    if (normalized === 'unremediated') return 'UnRem';
    if (normalized === 'remediated') return 'Rem';
    return value;
}

const TrendPivotGrid = ({ title, subtitle, table, isLoading }) => {
    const rowDataWithSpans = useMemo(() => addRowSpanMetadata(table?.rows || []), [table]);

    const getMergeBorderStyle = useCallback((field, data) => {
        const state = data?._mergeState?.[field];
        const c = '#64748b';
        const t = '3px';
        const base = {
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: '#f8fafc',
            borderLeft: `${t} solid ${c}`,
            borderRight: `${t} solid ${c}`,
            borderTop: 'none',
            borderBottom: 'none'
        };
        if (!state || state.length <= 1) {
            base.borderTop = `${t} solid ${c}`;
            base.borderBottom = `${t} solid ${c}`;
        } else {
            if (state.isStart) base.borderTop = `${t} solid ${c}`;
            if (state.isEnd) base.borderBottom = `${t} solid ${c}`;
        }
        return base;
    }, []);

    const mergedCellRenderer = useCallback((params) => {
        const field = params.colDef?.field;
        const isMergedField = ROW_SPAN_CONFIG.some((cfg) => cfg.field === field);
        const shouldDisplay = isMergedField
            ? (params.data?._mergeDisplay?.[field] ?? true)
            : true;

        if (isMergedField) {
            const borderStyle = getMergeBorderStyle(field, params.data);
            if (!shouldDisplay) {
                return <div style={borderStyle} />;
            }
            const displayValue = params.valueFormatted ?? params.value ?? '';
            return (
                <div style={borderStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', height: '100%', padding: '0 8px', fontWeight: 500 }}>
                        <span className="supervisory-cell-value">{displayValue}</span>
                    </div>
                </div>
            );
        }

        return <span>{params.valueFormatted ?? params.value ?? ''}</span>;
    }, [getMergeBorderStyle]);

    const columnDefs = useMemo(() => {
        const groupColumns = (table?.group_columns || []).map((column) => ({
            headerName: column.headerName,
            field: column.field,
            pinned: 'left',
            width: 150,
            minWidth: 90,
            sortable: true,
            filter: true,
            headerClass: 'supervisory-header-groupby',
            cellStyle: ROW_SPAN_CONFIG.some((cfg) => cfg.field === column.field)
                ? undefined
                : { fontWeight: 500 },
            cellRenderer: mergedCellRenderer
        }));

        const periodColumns = (table?.period_columns || []).map((periodColumn) => ({
            headerName: periodColumn.period_label,
            headerClass: 'supervisory-header-total-group',
            marryChildren: true,
            children: (periodColumn.children || []).map((child) => ({
                headerName: formatStatusHeader(child.headerName),
                field: child.field,
                type: 'numericColumn',
                width: 104,
                minWidth: 40,
                sortable: true,
                headerClass: 'supervisory-header-total',
                valueFormatter: (params) => (params.value || 0).toLocaleString(),
                cellStyle: (params) => ({
                    textAlign: 'right',
                    backgroundColor: (params.value || 0) > 0 ? '#f8fafc' : '#fdfdfd',
                    color: (params.value || 0) > 0 ? '#0f172a' : '#94a3b8'
                })
            }))
        }));

        return [
            ...groupColumns,
            ...periodColumns,
            {
                headerName: 'Row Total',
                field: 'row_total',
                pinned: 'right',
                width: 110,
                minWidth: 60,
                sortable: true,
                type: 'numericColumn',
                headerClass: 'supervisory-header-total',
                valueFormatter: (params) => (params.value || 0).toLocaleString(),
                cellStyle: { textAlign: 'right', fontWeight: 'bold', backgroundColor: '#eff6ff' }
            }
        ];
    }, [mergedCellRenderer, table]);

    const defaultColDef = useMemo(() => ({
        resizable: true
    }), []);

    return (
        <div className="supervisory-elevated supervisory-surface rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-white">
                <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
                <p className="text-xs text-gray-500">{subtitle}</p>
            </div>
            <div className="ag-theme-alpine" style={{ height: '420px', width: '100%' }}>
                <AgGridReact
                    rowData={rowDataWithSpans}
                    columnDefs={columnDefs}
                    defaultColDef={defaultColDef}
                    theme="legacy"
                    animateRows={true}
                    suppressCellFocus={true}
                    overlayLoadingTemplate={'<span class="ag-overlay-loading-center">Loading...</span>'}
                    overlayNoRowsTemplate={'<span class="ag-overlay-no-rows-center">No data to display</span>'}
                    loading={isLoading}
                    suppressRowTransform={true}
                    suppressRowVirtualisation={true}
                    suppressColumnVirtualisation={true}
                />
            </div>
        </div>
    );
};

export default TrendPivotGrid;
