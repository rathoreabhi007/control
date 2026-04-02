import React, { useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { FaExternalLinkAlt } from 'react-icons/fa';
import { ROW_SPAN_CONFIG, addRowSpanMetadata } from '../utils/agGridUtils';
import { DETAIL_FILTER_KEYS } from '../utils/columnConfig';

const SupervisoryGrid = ({
    aggregations,
    selectedColumns,
    activeAgeBuckets,
    activeBucketVisuals,
    showUnremediated,
    showTotal,
    isLoading,
    filters,
    selectedBucketSet
}) => {

    const rowDataWithSpans = useMemo(() => addRowSpanMetadata(aggregations), [aggregations]);

    const openDetailsWindow = useCallback((rowData, clickedField) => {
        if (!rowData) return;

        const detailFilters = {};
        Object.entries(filters).forEach(([key, values]) => {
            if (values && values.length > 0) {
                detailFilters[key] = [...values];
            }
        });

        selectedColumns.forEach(col => {
            const filterKey = DETAIL_FILTER_KEYS[col.field];
            if (!filterKey) return;
            const value = rowData[col.field];
            if (value === undefined || value === null || value === '') return;
            detailFilters[filterKey] = [String(value)];
        });

        if (Object.keys(detailFilters).length === 0) return;

        let bucket = null;
        let bucketScope = null;
        if (clickedField && typeof clickedField === 'string') {
            if (clickedField.startsWith('unremediated_')) {
                bucket = clickedField.replace('unremediated_', '');
                bucketScope = 'unremediated';
            } else if (clickedField.startsWith('total_')) {
                bucket = clickedField.replace('total_', '');
                bucketScope = 'total';
            }
            if (bucket && !activeAgeBuckets.includes(bucket)) {
                bucket = null;
            }
        }

        const params = new URLSearchParams();
        params.set('filters', JSON.stringify(detailFilters));
        params.set('title', selectedColumns.map(col => col.label).join(' / '));
        if (bucket) params.set('bucket', bucket);
        if (bucketScope) params.set('bucketScope', bucketScope);
        params.set('bucketSet', selectedBucketSet);
        window.open(`/supervisory-dashboard/details?${params.toString()}`, '_blank', 'noopener');
    }, [filters, selectedColumns, selectedBucketSet, activeAgeBuckets]);

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

    const detailCellRenderer = useCallback((params) => {
        const field = params.colDef?.field;
        const isMergedField = ROW_SPAN_CONFIG.some(cfg => cfg.field === field);
        const shouldDisplay = isMergedField
            ? (params.data?._mergeDisplay?.[field] ?? true)
            : true;

        if (isMergedField) {
            const borderStyle = getMergeBorderStyle(field, params.data);
            if (!shouldDisplay) {
                return <div style={borderStyle} />;
            }
            const displayValue = params.valueFormatted ?? params.value ?? '';
            const canOpenDetails = params.data?._mergeState?.[field]?.isMiddle ?? true;
            return (
                <div style={borderStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', height: '100%', padding: '0 8px', fontWeight: 500, position: 'relative' }}>
                        <span className="supervisory-cell-value">{displayValue}</span>
                        {canOpenDetails && params.data && (
                            <button
                                className="supervisory-cell-action"
                                onClick={(e) => { e.stopPropagation(); openDetailsWindow(params.data, field); }}
                                title="Open details"
                                type="button"
                            >
                                <FaExternalLinkAlt />
                            </button>
                        )}
                    </div>
                </div>
            );
        }

        if (!shouldDisplay) return <span />;
        const displayValue = params.valueFormatted ?? params.value ?? '';
        if (!params.data) return <span>{displayValue}</span>;

        return (
            <div className="supervisory-cell">
                <span className="supervisory-cell-value">{displayValue}</span>
                <button
                    className="supervisory-cell-action"
                    onClick={(e) => { e.stopPropagation(); openDetailsWindow(params.data, field); }}
                    title="Open details"
                    type="button"
                >
                    <FaExternalLinkAlt />
                </button>
            </div>
        );
    }, [openDetailsWindow, getMergeBorderStyle]);

    const columnDefs = useMemo(() => {
        const groupCols = selectedColumns.map(col => ({
            headerName: col.label,
            field: col.field,
            sortable: true,
            filter: true,
            pinned: 'left',
            width: 120,
            headerClass: 'supervisory-header-groupby',
            cellStyle: ROW_SPAN_CONFIG.some(cfg => cfg.field === col.field)
                ? undefined
                : { fontWeight: '500' },
            cellRenderer: detailCellRenderer
        }));

        const unremediatedCols = [
            {
                headerName: 'Unremediated (Pending)',
                headerClass: 'supervisory-header-unremediated-group',
                children: [
                    ...activeAgeBuckets.map(bucket => ({
                        headerName: activeBucketVisuals.labels[bucket],
                        field: `unremediated_${bucket}`,
                        headerClass: 'supervisory-header-unremediated',
                        sortable: true,
                        type: 'numericColumn',
                        minWidth: 68,
                        flex: 1,
                        cellStyle: params => {
                            const value = params.value || 0;
                            if (value === 0) return { backgroundColor: '#f9fafb', textAlign: 'right' };
                            const color = activeBucketVisuals.colors[bucket];
                            return {
                                backgroundColor: `${color}20`,
                                fontWeight: value > 100 ? 'bold' : 'normal',
                                textAlign: 'right'
                            };
                        },
                        valueFormatter: params => params.value ? params.value.toLocaleString() : '0',
                        cellRenderer: detailCellRenderer
                    })),
                    {
                        headerName: 'Total',
                        field: 'unremediated_total',
                        headerClass: 'supervisory-header-unremediated',
                        sortable: true,
                        type: 'numericColumn',
                        minWidth: 76,
                        flex: 1,
                        cellStyle: { fontWeight: 'bold', backgroundColor: '#fef2f2', textAlign: 'right' },
                        valueFormatter: params => params.value ? params.value.toLocaleString() : '0',
                        cellRenderer: detailCellRenderer
                    }
                ]
            }
        ];

        const totalCols = [
            {
                headerName: 'Total (All)',
                headerClass: 'supervisory-header-total-group',
                children: [
                    ...activeAgeBuckets.map(bucket => ({
                        headerName: activeBucketVisuals.labels[bucket],
                        field: `total_${bucket}`,
                        headerClass: 'supervisory-header-total',
                        sortable: true,
                        type: 'numericColumn',
                        minWidth: 68,
                        flex: 1,
                        cellStyle: params => {
                            const value = params.value || 0;
                            return {
                                backgroundColor: value > 0 ? '#f0f9ff' : '#f9fafb',
                                textAlign: 'right'
                            };
                        },
                        valueFormatter: params => params.value ? params.value.toLocaleString() : '0',
                        cellRenderer: detailCellRenderer
                    })),
                    {
                        headerName: 'Total',
                        field: 'total_total',
                        headerClass: 'supervisory-header-total',
                        sortable: true,
                        type: 'numericColumn',
                        minWidth: 76,
                        flex: 1,
                        cellStyle: { fontWeight: 'bold', backgroundColor: '#eff6ff', textAlign: 'right' },
                        valueFormatter: params => params.value ? params.value.toLocaleString() : '0',
                        cellRenderer: detailCellRenderer
                    }
                ]
            }
        ];

        return [
            ...groupCols,
            ...(showUnremediated ? unremediatedCols : []),
            ...(showTotal ? totalCols : [])
        ];
    }, [selectedColumns, detailCellRenderer, showUnremediated, showTotal, activeAgeBuckets, activeBucketVisuals]);

    const defaultColDef = useMemo(() => ({
        resizable: true,
        sortable: true
    }), []);

    return (
        <div className="supervisory-elevated bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="ag-theme-alpine" style={{ height: 'calc(100vh - 420px)', width: '100%' }}>
                <AgGridReact
                    rowData={rowDataWithSpans}
                    columnDefs={columnDefs}
                    defaultColDef={defaultColDef}
                    theme="legacy"
                    animateRows={true}
                    rowSelection="single"
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

export default SupervisoryGrid;
