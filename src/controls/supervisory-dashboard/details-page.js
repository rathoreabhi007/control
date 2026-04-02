import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiService } from '../../services/api';
import { DataOutputProvider } from '../../contexts/DataOutputContext';
import { ColumnResizeProvider } from '../../contexts/ColumnResizeContext';
import DataOutputContent from '../../components/DataOutput/DataOutputContent';
import ErrorBoundary from '../../components/common/ErrorBoundary';

const DEFAULT_PAGE_SIZE = 50;

const SupervisoryDetailsPage = () => {
    const [searchParams] = useSearchParams();
    const [detailsData, setDetailsData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchColumn, setSearchColumn] = useState('');

    const filters = useMemo(() => {
        const raw = searchParams.get('filters');
        if (!raw) return {};
        try {
            return JSON.parse(raw);
        } catch (parseError) {
            return {};
        }
    }, [searchParams]);

    const title = searchParams.get('title') || 'Filtered Details';
    const bucket = searchParams.get('bucket');
    const bucketScope = searchParams.get('bucketScope');
    const bucketSet = searchParams.get('bucketSet') || 'CFTC';

    const loadDetails = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await ApiService.getSupervisoryDetails(
                filters,
                currentPage,
                pageSize,
                null,
                'desc',
                bucket,
                bucketScope,
                bucketSet,
                null,
                searchTerm,
                searchColumn
            );
            if (response.success) {
                setDetailsData(response);
            } else {
                setError(response.error || 'Failed to load details');
            }
        } catch (err) {
            setError(err.message || 'Failed to load details');
        } finally {
            setIsLoading(false);
        }
    }, [filters, currentPage, pageSize, bucket, bucketScope, bucketSet, searchTerm, searchColumn]);

    useEffect(() => {
        loadDetails();
    }, [loadDetails]);

    const initialData = useMemo(() => {
        if (!detailsData?.success) {
            return {
                headers: [],
                table: [],
                totalRows: 0,
                displayedRows: 0,
                columns: 0,
                source: 'csv_api'
            };
        }

        return {
            headers: detailsData.columns || [],
            table: detailsData.data || [],
            totalRows: detailsData.pagination?.total_rows || 0,
            displayedRows: detailsData.data?.length || 0,
            columns: detailsData.columns?.length || 0,
            source: 'csv_api'
        };
    }, [detailsData]);

    const csvData = useMemo(() => {
        if (!detailsData?.success) return null;
        return {
            data: detailsData.data || [],
            columns: detailsData.columns || [],
            pagination: detailsData.pagination || {}
        };
    }, [detailsData]);

    const handlePageChange = useCallback((page) => {
        setCurrentPage(page);
    }, []);

    const handlePageSizeChange = useCallback((size) => {
        setPageSize(size);
        setCurrentPage(1);
    }, []);

    const handleSearch = useCallback((term, column) => {
        setSearchTerm(term);
        setSearchColumn(column);
        setCurrentPage(1); // Reset to first page on search
    }, []);

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col">
            <div className="bg-white border-b border-gray-200 px-6 py-3">
                <h1 className="text-lg font-semibold text-gray-900">Supervisory Details</h1>
                <div className="flex items-center gap-3 mt-1">
                    <p className="text-xs text-gray-500">{title}</p>
                    {bucketScope && (
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${bucketScope === 'unremediated'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-blue-100 text-blue-700'
                            }`}>
                            {bucketScope === 'unremediated' ? 'Unremediated Only' : 'All Records'}
                        </span>
                    )}
                    {bucket && (
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                            Age: {bucket}d
                        </span>
                    )}
                    {bucketSet && (
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
                            {bucketSet}
                        </span>
                    )}
                </div>
            </div>

            <div className="flex-1 p-4">
                {error && (
                    <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">{error}</div>
                )}
                {isLoading && (
                    <div className="mb-3 p-2 bg-gray-50 border border-gray-200 rounded text-gray-600 text-xs">Loading details...</div>
                )}

                <ErrorBoundary>
                    <DataOutputProvider
                        initialData={initialData}
                        csvData={csvData}
                        onPageChange={handlePageChange}
                        onPageSizeChange={handlePageSizeChange}
                        currentPage={currentPage}
                        pageSize={pageSize}
                        onSearch={handleSearch}
                    >
                        <ColumnResizeProvider>
                            <div style={{ height: 'calc(100vh - 140px)' }}>
                                <DataOutputContent height="calc(100vh - 140px)" />
                            </div>
                        </ColumnResizeProvider>
                    </DataOutputProvider>
                </ErrorBoundary>
            </div>
        </div>
    );
};

export default SupervisoryDetailsPage;
