import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ApiService } from '../../../services/api';
import { BUCKET_SET_CONFIG, DEFAULT_BUCKET_SET_OPTIONS, DEFAULT_AGE_BUCKETS, buildBucketSummary } from '../utils/bucketConfig';
import { AVAILABLE_COLUMNS } from '../utils/columnConfig';
import { cacheGet, cacheSet } from './useLocalCache';

// Cache keys
const CK_FILTER_OPTIONS = 'filterOptions';
const CK_AGGREGATIONS = 'aggregations';
const LS_SELECTED_COLUMNS = 'supervisory_selected_columns';

export const useSupervisoryData = (currentUser) => {
    // State
    const [filterOptions, setFilterOptions] = useState(() =>
        cacheGet(CK_FILTER_OPTIONS)?.filter_options ?? {
            regulation: [], asset_class: [], control_type: [],
            data_type: [], sub_control_type: [], remediation_status: []
        }
    );

    const [savedFilters, setSavedFilters] = useState([]);
    const [selectedSavedFilterId, setSelectedSavedFilterId] = useState('');
    const [savedFilterName, setSavedFilterName] = useState('');
    const [isSavingFilter, setIsSavingFilter] = useState(false);
    const [selectedBucketSet, setSelectedBucketSet] = useState(() =>
        cacheGet(CK_FILTER_OPTIONS)?.default_bucket_set ?? 'CFTC'
    );
    const [availableBucketSets, setAvailableBucketSets] = useState(() =>
        cacheGet(CK_FILTER_OPTIONS)?.bucket_sets ?? DEFAULT_BUCKET_SET_OPTIONS
    );
    const [activeAgeBuckets, setActiveAgeBuckets] = useState(() => {
        const cached = cacheGet(CK_FILTER_OPTIONS);
        if (cached) {
            const bs = cached.default_bucket_set || 'CFTC';
            return cached.age_buckets_by_set?.[bs] || cached.age_buckets || DEFAULT_AGE_BUCKETS;
        }
        return DEFAULT_AGE_BUCKETS;
    });
    const [selectedColumns, setSelectedColumns] = useState(() => {
        try {
            const stored = window.localStorage.getItem(LS_SELECTED_COLUMNS);
            if (stored) {
                const fields = JSON.parse(stored);
                if (Array.isArray(fields) && fields.length > 0) {
                    const cols = fields
                        .map(f => AVAILABLE_COLUMNS.find(c => c.field === f))
                        .filter(Boolean);
                    if (cols.length > 0) return cols;
                }
            }
        } catch { /* ignore */ }
        return [
            AVAILABLE_COLUMNS[0], AVAILABLE_COLUMNS[1], AVAILABLE_COLUMNS[2],
            AVAILABLE_COLUMNS[6], AVAILABLE_COLUMNS[7], AVAILABLE_COLUMNS[8]
        ];
    });

    const [filters, setFilters] = useState({
        regulation: [], asset_class: [], control_type: [],
        data_type: [], sub_control_type: [], remediation_status: []
    });

    // Try to seed aggregation state from cache
    const cachedAgg = cacheGet(CK_AGGREGATIONS);
    const [aggregations, setAggregations] = useState(cachedAgg?.aggregations ?? []);
    const [summary, setSummary] = useState(cachedAgg?.summary ?? {
        total_count: 0, unremediated_count: 0,
        total: buildBucketSummary(DEFAULT_AGE_BUCKETS),
        unremediated: buildBucketSummary(DEFAULT_AGE_BUCKETS)
    });
    const [totalRecords, setTotalRecords] = useState(cachedAgg?.total_records ?? 0);
    const [filteredRecords, setFilteredRecords] = useState(cachedAgg?.filtered_records ?? 0);

    // Loading starts as false if we have cached data, true otherwise
    const hasCachedAggregations = useRef(!!cachedAgg);
    const [isLoading, setIsLoading] = useState(!hasCachedAggregations.current);
    const [isInitialFiltersReady, setIsInitialFiltersReady] = useState(false);
    const [error, setError] = useState(null);

    // Track whether initial load has run
    const initialLoadDone = useRef(false);

    // Derived State
    const groupBy = useMemo(() => selectedColumns.map(c => c.field), [selectedColumns]);

    // Persist selectedColumns to localStorage on every change
    useEffect(() => {
        try {
            const fields = selectedColumns.map(c => c.field);
            window.localStorage.setItem(LS_SELECTED_COLUMNS, JSON.stringify(fields));
        } catch { /* ignore */ }
    }, [selectedColumns]);
    const emptyFilters = useMemo(() => ({
        regulation: [], asset_class: [], control_type: [],
        data_type: [], sub_control_type: [], remediation_status: []
    }), []);

    const hasActiveFilters = useMemo(() => {
        return Object.values(filters).some(arr => arr.length > 0);
    }, [filters]);

    // ─── Helper: apply filter options response to state ──────────

    const applyFilterOptionsResponse = useCallback((response) => {
        setFilterOptions(response.filter_options);
        setTotalRecords(response.total_records);
        const bucketSets = Array.isArray(response.bucket_sets) && response.bucket_sets.length > 0
            ? response.bucket_sets
            : DEFAULT_BUCKET_SET_OPTIONS;
        setAvailableBucketSets(bucketSets);

        const defaultBucketSet = bucketSets.includes(response.default_bucket_set)
            ? response.default_bucket_set
            : bucketSets[0];

        console.log(`[useSupervisoryData] Setting initial bucket set to: ${defaultBucketSet}`);
        setSelectedBucketSet(defaultBucketSet);
        setActiveAgeBuckets(
            response.age_buckets_by_set?.[defaultBucketSet] ||
            response.age_buckets ||
            BUCKET_SET_CONFIG[defaultBucketSet]?.buckets ||
            DEFAULT_AGE_BUCKETS
        );

        const startupFilterKeys = ['regulation', 'asset_class', 'data_type'];
        const configuredDefaults = response.default_initial_filters || {};
        const initialFilters = { ...emptyFilters };

        startupFilterKeys.forEach((key) => {
            const availableOptions = response.filter_options?.[key] || [];
            const validConfiguredDefaults = (configuredDefaults[key] || []).filter(v => availableOptions.includes(v));
            if (validConfiguredDefaults.length > 0) {
                initialFilters[key] = validConfiguredDefaults;
                return;
            }
            if (availableOptions.length > 0) {
                initialFilters[key] = [availableOptions[0]];
            }

        });
        // Sanitize to ensure no nulls/undefineds
        Object.keys(initialFilters).forEach(key => {
            if (!Array.isArray(initialFilters[key])) {
                initialFilters[key] = [];
            }
        });
        setFilters(initialFilters);
    }, [emptyFilters]);

    // ─── Helper: apply aggregation response to state ─────────────

    const applyAggregationResponse = useCallback((response) => {
        const activeBucketSet = response.bucket_set;

        if (activeBucketSet) {
            setSelectedBucketSet(prev => {
                if (prev !== activeBucketSet) {
                    console.log(`[useSupervisoryData] Syncing bucket set from response: ${prev} -> ${activeBucketSet}`);
                    return activeBucketSet;
                }
                return prev;
            });

            setActiveAgeBuckets(
                response.age_buckets ||
                BUCKET_SET_CONFIG[activeBucketSet]?.buckets ||
                DEFAULT_AGE_BUCKETS
            );
        } else {
            // Fallback if backend doesn't provide it (shouldn't happen with our fix)
            setActiveAgeBuckets(
                response.age_buckets ||
                DEFAULT_AGE_BUCKETS
            );
        }

        setAggregations(response.aggregations || []);
        setSummary(response.summary);
        setFilteredRecords(response.filtered_records);
        setTotalRecords(response.total_records);
    }, []); // Stable: no dependencies on external state variables

    // ─── Separate filter options load (fallback & refresh) ───────

    const loadFilterOptions = useCallback(async () => {
        try {
            const response = await ApiService.getSupervisoryFilterOptions();
            if (response.success) {
                cacheSet(CK_FILTER_OPTIONS, response);
                applyFilterOptionsResponse(response);
            }
        } catch (err) {
            setError('Failed to load filter options');
        } finally {
            setIsInitialFiltersReady(true);
        }
    }, [applyFilterOptionsResponse]);

    // ─── Aggregation load (for filter/groupBy changes) ───────────

    const loadAggregations = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await ApiService.getSupervisoryAggregations(filters, groupBy, selectedBucketSet);
            if (response.success) {
                cacheSet(CK_AGGREGATIONS, response);
                applyAggregationResponse(response);
            }
        } catch (err) {
            setError(err.message || 'Failed to load aggregations');
        } finally {
            setIsLoading(false);
        }
    }, [filters, groupBy, selectedBucketSet, applyAggregationResponse]);

    // ─── Combined initial load (single round-trip) ───────────────

    const loadInitial = useCallback(async () => {
        try {
            const response = await ApiService.getSupervisoryInitialLoad();
            if (response.success) {
                // Cache filter options portion
                cacheSet(CK_FILTER_OPTIONS, response);

                applyFilterOptionsResponse(response);

                // Apply default aggregations (already included in response)
                if (response.default_aggregations?.success) {
                    cacheSet(CK_AGGREGATIONS, response.default_aggregations);
                    applyAggregationResponse(response.default_aggregations);
                }

                initialLoadDone.current = true;
            }
        } catch (err) {
            setError('Failed to load initial data');
            // Fallback: try separate endpoints
            try {
                await loadFilterOptions();
            } catch {
                // already handled
            }
        } finally {
            setIsInitialFiltersReady(true);
            setIsLoading(false);
        }
    }, [applyFilterOptionsResponse, applyAggregationResponse, loadFilterOptions]);

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

    // ─── Force Refresh (bypass cache, re-fetch everything) ───────

    const forceRefresh = useCallback(() => {
        loadFilterOptions();
        loadAggregations();
    }, [loadFilterOptions, loadAggregations]);

    // ─── Effects ─────────────────────────────────────────────────

    // On mount: use combined initial-load endpoint (1 round-trip)
    useEffect(() => {
        console.log('[useSupervisoryData] Initial load mount');
        loadInitial();
        loadSavedFilters();
    }, [loadInitial, loadSavedFilters]);

    // When filters or groupBy change AFTER initial load → re-fetch aggregations
    useEffect(() => {
        if (isInitialFiltersReady && groupBy.length > 0 && initialLoadDone.current) {
            loadAggregations();
        }
    }, [groupBy.length, isInitialFiltersReady, loadAggregations]);

    // ─── Handlers ────────────────────────────────────────────────

    const handleFilterChange = (filterKey, values) => {
        initialLoadDone.current = true; // ensure subsequent changes trigger loadAggregations
        setFilters(prev => ({ ...prev, [filterKey]: values }));
    };

    const clearAllFilters = () => {
        initialLoadDone.current = true;
        setFilters(emptyFilters);
    };

    const applySavedFilter = useCallback((saved) => {
        if (!saved) return;
        initialLoadDone.current = true;
        const nextFilters = { ...emptyFilters, ...(saved.filters || {}) };

        // Sanitize to ensure no nulls/undefineds overwrote the defaults
        Object.keys(nextFilters).forEach(key => {
            if (!Array.isArray(nextFilters[key])) {
                nextFilters[key] = [];
            }
        });
        setFilters(nextFilters);

        if (Array.isArray(saved.group_by) && saved.group_by.length > 0) {
            const nextSelected = saved.group_by
                .map(field => AVAILABLE_COLUMNS.find(col => col.field === field))
                .filter(Boolean);
            if (nextSelected.length > 0) {
                setSelectedColumns(nextSelected);
            }
        }
    }, [emptyFilters]);

    const handleSavedFilterSelect = (e) => {
        const value = e.target.value;
        setSelectedSavedFilterId(value);
        const selected = savedFilters.find(f => f.id === value);
        applySavedFilter(selected);
    };

    const handleSaveCurrentFilter = async () => {
        if (!savedFilterName.trim()) return;
        setIsSavingFilter(true);
        try {
            const payload = {
                name: savedFilterName.trim(),
                filters: filters,
                group_by: selectedColumns.map(col => col.field),
                created_by: currentUser?.id || currentUser?.username || 'anonymous',
                created_by_name: currentUser?.name || currentUser?.username || 'anonymous'
            };
            const response = await ApiService.saveSupervisoryFilter(payload);
            if (response.success) {
                setSavedFilters(prev => [response.filter, ...prev]);
                setSavedFilterName('');
                setSelectedSavedFilterId(response.filter.id);
            }
        } catch (err) {
            console.error('Failed to save filter', err);
        } finally {
            setIsSavingFilter(false);
        }
    };

    return {
        // State
        filterOptions,
        savedFilters,
        selectedSavedFilterId,
        savedFilterName,
        setSavedFilterName,
        isSavingFilter,
        selectedBucketSet,
        setSelectedBucketSet,
        availableBucketSets,
        activeAgeBuckets,
        selectedColumns,
        setSelectedColumns,
        filters,
        aggregations,
        summary,
        totalRecords,
        filteredRecords,
        isLoading,
        error,
        hasActiveFilters,

        // Actions
        loadAggregations,
        forceRefresh,
        handleFilterChange,
        clearAllFilters,
        handleSavedFilterSelect,
        handleSaveCurrentFilter
    };
};
