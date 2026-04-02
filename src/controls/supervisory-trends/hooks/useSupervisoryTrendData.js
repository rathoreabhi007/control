import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiService } from '../../../services/api';
import { cacheGet, cacheSet } from '../../supervisory-dashboard/hooks/useLocalCache';
import { AVAILABLE_COLUMNS } from '../../supervisory-dashboard/utils/columnConfig';

const EMPTY_FILTERS = {
    regulation: [],
    asset_class: [],
    control_type: [],
    data_type: [],
    sub_control_type: [],
    remediation_status: []
};

const CK_FILTER_OPTIONS = 'supervisory_trends_v2_filter_options';
const CK_TRENDS = 'supervisory_trends_v2_data';
const LS_SELECTED_COLUMNS = 'supervisory_trends_selected_columns';

export const useSupervisoryTrendData = (currentUser) => {
    const cachedFilters = cacheGet(CK_FILTER_OPTIONS);
    const rawCachedTrends = cacheGet(CK_TRENDS);
    const cachedTrends = rawCachedTrends?.grouped_tables ? rawCachedTrends : null;

    const [filterOptions, setFilterOptions] = useState(
        cachedFilters?.filter_options ?? EMPTY_FILTERS
    );
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [savedFilters, setSavedFilters] = useState([]);
    const [selectedSavedFilterId, setSelectedSavedFilterId] = useState('');
    const [savedFilterName, setSavedFilterName] = useState('');
    const [isSavingFilter, setIsSavingFilter] = useState(false);
    const [selectedColumns, setSelectedColumns] = useState(() => {
        try {
            const stored = window.localStorage.getItem(LS_SELECTED_COLUMNS);
            if (stored) {
                const fields = JSON.parse(stored);
                if (Array.isArray(fields) && fields.length > 0) {
                    const cols = fields
                        .map((field) => AVAILABLE_COLUMNS.find((column) => column.field === field))
                        .filter(Boolean);
                    if (cols.length > 0) return cols;
                }
            }
        } catch {
            // ignore localStorage parse failures
        }
        return [AVAILABLE_COLUMNS[0], AVAILABLE_COLUMNS[1], AVAILABLE_COLUMNS[2]];
    });
    const [trendData, setTrendData] = useState(cachedTrends ?? null);
    const [totalRecords, setTotalRecords] = useState(cachedFilters?.total_records ?? cachedTrends?.total_records ?? 0);
    const [filteredRecords, setFilteredRecords] = useState(cachedTrends?.filtered_records ?? 0);
    const [isLoading, setIsLoading] = useState(!cachedTrends);
    const [error, setError] = useState(null);

    const initialLoadDone = useRef(false);

    const hasActiveFilters = useMemo(
        () => Object.values(filters).some((values) => Array.isArray(values) && values.length > 0),
        [filters]
    );

    const buildInitialFilters = useCallback((response) => {
        const nextFilters = { ...EMPTY_FILTERS };
        const configuredDefaults = response.default_initial_filters || {};
        const startupFilterKeys = ['regulation', 'asset_class', 'data_type'];

        startupFilterKeys.forEach((key) => {
            const availableOptions = response.filter_options?.[key] || [];
            const validConfiguredDefaults = (configuredDefaults[key] || []).filter((value) => availableOptions.includes(value));
            if (validConfiguredDefaults.length > 0) {
                nextFilters[key] = validConfiguredDefaults;
            } else if (availableOptions.length > 0) {
                nextFilters[key] = [availableOptions[0]];
            }
        });

        return nextFilters;
    }, []);

    const applyFilterOptions = useCallback((response) => {
        setFilterOptions(response.filter_options || EMPTY_FILTERS);
        setTotalRecords(response.total_records || 0);
        cacheSet(CK_FILTER_OPTIONS, response);
    }, []);

    const applyTrendResponse = useCallback((response) => {
        setTrendData(response);
        setFilteredRecords(response.filtered_records || 0);
        setTotalRecords(response.total_records || 0);
        cacheSet(CK_TRENDS, response);
    }, []);

    useEffect(() => {
        try {
            window.localStorage.setItem(
                LS_SELECTED_COLUMNS,
                JSON.stringify(selectedColumns.map((column) => column.field))
            );
        } catch {
            // ignore localStorage write failures
        }
    }, [selectedColumns]);

    const loadTrends = useCallback(async (nextFilters = filters, nextSelectedColumns = selectedColumns) => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await ApiService.getSupervisoryTrends(
                nextFilters,
                nextSelectedColumns.map((column) => column.field)
            );
            if (response.success) {
                applyTrendResponse(response);
            }
        } catch (err) {
            setError(err.message || 'Failed to load trend analytics');
        } finally {
            setIsLoading(false);
        }
    }, [applyTrendResponse, filters, selectedColumns]);

    useEffect(() => {
        if (!trendData?.group_by) return;
        const selectedFields = selectedColumns.map((column) => column.field);
        const responseFields = trendData.group_by;
        const matches = selectedFields.length === responseFields.length &&
            selectedFields.every((field, index) => field === responseFields[index]);
        if (!matches && initialLoadDone.current) {
            loadTrends(filters, selectedColumns);
        }
    }, [filters, loadTrends, selectedColumns, trendData]);

    const loadSavedFilters = useCallback(async () => {
        try {
            const response = await ApiService.getSupervisorySavedFilters();
            if (response.success) {
                setSavedFilters(response.filters || []);
            }
        } catch (err) {
            console.error('Failed to load saved filters', err);
        }
    }, []);

    const loadInitial = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await ApiService.getSupervisoryFilterOptions();
            applyFilterOptions(response);
            const nextFilters = buildInitialFilters(response);
            setFilters(nextFilters);
            const trendResponse = await ApiService.getSupervisoryTrends(
                nextFilters,
                selectedColumns.map((column) => column.field)
            );
            if (trendResponse.success) {
                applyTrendResponse(trendResponse);
            }
            initialLoadDone.current = true;
        } catch (err) {
            setError(err.message || 'Failed to load trend analytics');
        } finally {
            setIsLoading(false);
        }
    }, [applyFilterOptions, applyTrendResponse, buildInitialFilters, selectedColumns]);

    useEffect(() => {
        loadInitial();
        loadSavedFilters();
    }, [loadInitial, loadSavedFilters]);

    useEffect(() => {
        if (initialLoadDone.current) {
            loadTrends(filters);
        }
    }, [filters, selectedColumns, loadTrends]);

    const handleFilterChange = useCallback((filterKey, values) => {
        initialLoadDone.current = true;
        setFilters((prev) => ({ ...prev, [filterKey]: values }));
    }, []);

    const clearAllFilters = useCallback(() => {
        initialLoadDone.current = true;
        setFilters(EMPTY_FILTERS);
    }, []);

    const applySavedFilter = useCallback((saved) => {
        if (!saved) return;
        initialLoadDone.current = true;
        const nextFilters = { ...EMPTY_FILTERS, ...(saved.filters || {}) };
        setFilters(nextFilters);
        if (Array.isArray(saved.group_by) && saved.group_by.length > 0) {
            const nextSelectedColumns = saved.group_by
                .map((field) => AVAILABLE_COLUMNS.find((column) => column.field === field))
                .filter(Boolean);
            if (nextSelectedColumns.length > 0) {
                setSelectedColumns(nextSelectedColumns);
            }
        }
    }, []);

    const handleSavedFilterSelect = useCallback((event) => {
        const value = event.target.value;
        setSelectedSavedFilterId(value);
        const selected = savedFilters.find((item) => item.id === value);
        applySavedFilter(selected);
    }, [applySavedFilter, savedFilters]);

    const handleSaveCurrentFilter = useCallback(async () => {
        if (!savedFilterName.trim()) return;
        setIsSavingFilter(true);
        try {
            const response = await ApiService.saveSupervisoryFilter({
                name: savedFilterName.trim(),
                filters,
                group_by: selectedColumns.map((column) => column.field),
                created_by: currentUser?.id || currentUser?.username || 'anonymous',
                created_by_name: currentUser?.name || currentUser?.username || 'anonymous'
            });
            if (response.success) {
                setSavedFilters((prev) => [response.filter, ...prev]);
                setSavedFilterName('');
                setSelectedSavedFilterId(response.filter.id);
            }
        } catch (err) {
            console.error('Failed to save trend filter', err);
        } finally {
            setIsSavingFilter(false);
        }
    }, [currentUser, filters, savedFilterName, selectedColumns]);

    const forceRefresh = useCallback(async () => {
        await loadInitial();
    }, [loadInitial]);

    return {
        filterOptions,
        filters,
        savedFilters,
        selectedSavedFilterId,
        savedFilterName,
        setSavedFilterName,
        isSavingFilter,
        selectedColumns,
        setSelectedColumns,
        trendData,
        totalRecords,
        filteredRecords,
        isLoading,
        error,
        hasActiveFilters,
        forceRefresh,
        handleFilterChange,
        clearAllFilters,
        handleSavedFilterSelect,
        handleSaveCurrentFilter
    };
};
