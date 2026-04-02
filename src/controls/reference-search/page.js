import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import ApiService from '../../services/api';
import {
    FaSearch, FaSync, FaDownload, FaFilter,
    FaDatabase, FaTable, FaClipboardList, FaTimes, FaFolder,
} from 'react-icons/fa';
import HSBCLogo from '../../components/HSBCLogo';

ModuleRegistry.registerModules([AllCommunityModule]);

// Parse pasted Excel text into clean values array.
// Excel copies a column as newline-separated values (each line may have tabs if multi-col).
// We take only the first tab-delimited token per line.
function parseExcelPaste(text) {
    return text
        .split(/\r?\n/)
        .map(line => line.split('\t')[0].trim())
        .filter(v => v.length > 0);
}

/**
 * Reference File Search Page
 * Browse and search known reference files (CSV, ZIP) with configurable delimiters.
 * Supports single-term search and multi-value Excel paste search.
 */
const ReferenceSearchPage = () => {
    // File list
    const [files, setFiles] = useState([]);
    const [isLoadingFiles, setIsLoadingFiles] = useState(true);

    // Selected file
    const [selectedFileId, setSelectedFileId] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [columns, setColumns] = useState([]);

    // Results
    const [results, setResults] = useState([]);
    const [totalRows, setTotalRows] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [pageSize] = useState(50);

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedColumn, setSelectedColumn] = useState('');
    const [mode, setMode] = useState('browse'); // 'browse' | 'search' | 'search_multi'

    // Paste mode state
    const [pasteMode, setPasteMode] = useState(false);
    const [pasteText, setPasteText] = useState('');
    const [pastedValues, setPastedValues] = useState([]); // parsed values for display
    const [exactMatch, setExactMatch] = useState(true);

    // Active multi-values (stored so pagination can re-use them)
    const activeMultiValues = useRef([]);

    // Folder-type file state
    const [isFolderType, setIsFolderType] = useState(false);
    const [fileDate, setFileDate] = useState('');   // single date filter (YYYY-MM-DD)
    const [fileRegex, setFileRegex] = useState('');
    const [folderStats, setFolderStats] = useState(null); // { searched, available }
    // Store active folder filters at search time for export re-use
    const activeFolderFilters = useRef({});

    // UI state
    const [isLoading, setIsLoading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [error, setError] = useState(null);
    const [hasLoaded, setHasLoaded] = useState(false);

    // ── Load file list on mount ───────────────────────────────────────────
    useEffect(() => {
        const loadFiles = async () => {
            try {
                setIsLoadingFiles(true);
                const response = await ApiService.getReferenceFiles();
                if (response.success) {
                    setFiles(response.files || []);
                    if (response.files && response.files.length > 0) {
                        setSelectedFileId(response.files[0].id);
                    }
                }
            } catch (err) {
                setError(`Failed to load reference files: ${err.message}`);
            } finally {
                setIsLoadingFiles(false);
            }
        };
        loadFiles();
    }, []);

    // ── When file selection changes ───────────────────────────────────────
    useEffect(() => {
        if (!selectedFileId) return;

        const fileObj = files.find(f => f.id === selectedFileId) || null;
        const isFolder = fileObj?.is_folder_type || false;

        setSelectedFile(fileObj);
        setIsFolderType(isFolder);
        setSearchQuery('');
        setSelectedColumn('');
        setPasteText('');
        setPastedValues([]);
        activeMultiValues.current = [];
        activeFolderFilters.current = {};
        setResults([]);
        setHasLoaded(false);
        setError(null);
        setCurrentPage(1);
        setMode('browse');
        setFolderStats(null);
        // Reset folder filters on file change
        setFileDate('');
        setFileRegex('');

        const loadColumns = async () => {
            try {
                const response = await ApiService.getReferenceFileColumns(selectedFileId);
                if (response.success) setColumns(response.columns || []);
            } catch (err) {
                setError(`Failed to load columns: ${err.message}`);
            }
        };

        const loadInitialData = async () => {
            setIsLoading(true);
            try {
                const response = await ApiService.getReferenceFileData(selectedFileId, { page: 1, pageSize });
                if (response.success) {
                    setResults(response.results || []);
                    setTotalRows(response.pagination?.total_rows || 0);
                    setTotalPages(response.pagination?.total_pages || 0);
                    setCurrentPage(1);
                    setHasLoaded(true);
                } else {
                    setError(response.error || 'Failed to load data');
                }
            } catch (err) {
                setError(`Failed to load file data: ${err.message}`);
            } finally {
                setIsLoading(false);
            }
        };

        loadColumns();
        // Folder-type files require an explicit search — skip auto-load
        if (!isFolder) {
            loadInitialData();
        }
    }, [selectedFileId, files, pageSize]);

    // Parse paste text whenever it changes
    useEffect(() => {
        setPastedValues(parseExcelPaste(pasteText));
    }, [pasteText]);

    // ── Browse ────────────────────────────────────────────────────────────
    const handleBrowse = useCallback(async (page = 1) => {
        if (!selectedFileId) return;

        // Folder-type specs have no single path — use search with '.*' to load all rows.
        if (isFolderType) {
            const folderOpts = {
                dateFrom: fileDate || null,
                dateTo: fileDate || null,
                fileRegex: fileRegex.trim() || null,
            };
            activeFolderFilters.current = folderOpts;
            setIsLoading(true);
            setError(null);
            setMode('browse');
            try {
                const response = await ApiService.searchReferenceFile(
                    selectedFileId, '.*',
                    { column: null, page, pageSize, ...folderOpts }
                );
                if (response.success) {
                    const filesAvailable = response.files_available ?? 0;
                    if (filesAvailable === 0) {
                        setError('No files found matching the selected date or filename pattern.');
                        setResults([]);
                        setHasLoaded(false);
                    } else {
                        setResults(response.results || []);
                        setTotalRows(response.total_matches || 0);
                        setTotalPages(response.pagination?.total_pages || 0);
                        setCurrentPage(page);
                        setHasLoaded(true);
                        setFolderStats({
                            searched: response.files_searched || 0,
                            available: filesAvailable,
                        });
                    }
                } else {
                    setError(response.error || 'Failed to load data');
                }
            } catch (err) {
                setError(`Load failed: ${err.message}`);
            } finally {
                setIsLoading(false);
            }
            return;
        }

        setIsLoading(true);
        setError(null);
        setMode('browse');
        try {
            const response = await ApiService.getReferenceFileData(selectedFileId, { page, pageSize });
            if (response.success) {
                setResults(response.results || []);
                setTotalRows(response.pagination?.total_rows || 0);
                setTotalPages(response.pagination?.total_pages || 0);
                setCurrentPage(page);
                setHasLoaded(true);
            } else {
                setError(response.error || 'Failed to browse data');
            }
        } catch (err) {
            setError(`Browse failed: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [selectedFileId, pageSize, isFolderType, fileDate, fileRegex]);

    // ── Single-term search ────────────────────────────────────────────────
    const handleSearch = useCallback(async (page = 1) => {
        if (!selectedFileId) { setError('Please select a reference file'); return; }
        if (!searchQuery.trim()) { setError('Please enter a search query'); return; }

        // Capture folder filters at search time for pagination and export
        // Single date → pass as both from and to so backend filters to exactly that date
        const folderOpts = isFolderType
            ? { dateFrom: fileDate || null, dateTo: fileDate || null, fileRegex: fileRegex.trim() || null }
            : {};
        activeFolderFilters.current = folderOpts;

        setIsLoading(true);
        setError(null);
        setMode('search');
        try {
            const response = await ApiService.searchReferenceFile(
                selectedFileId,
                searchQuery.trim(),
                { column: selectedColumn || null, page, pageSize, ...folderOpts }
            );
            if (response.success) {
                if (isFolderType) {
                    const filesAvailable = response.files_available ?? 0;
                    if (filesAvailable === 0) {
                        setError('No files found matching the selected date or filename pattern.');
                        setResults([]);
                        setHasLoaded(false);
                    } else {
                        setResults(response.results || []);
                        setTotalRows(response.total_matches || 0);
                        setTotalPages(response.pagination?.total_pages || 0);
                        setCurrentPage(page);
                        setHasLoaded(true);
                        setFolderStats({
                            searched: response.files_searched || 0,
                            available: filesAvailable,
                        });
                    }
                } else {
                    setResults(response.results || []);
                    setTotalRows(response.total_matches || 0);
                    setTotalPages(response.pagination?.total_pages || 0);
                    setCurrentPage(page);
                    setHasLoaded(true);
                }
            } else {
                setError(response.error || 'Search failed');
                setResults([]);
            }
        } catch (err) {
            setError(`Search failed: ${err.message}`);
            setResults([]);
        } finally {
            setIsLoading(false);
        }
    }, [selectedFileId, searchQuery, selectedColumn, pageSize, isFolderType, fileDate, fileRegex]);

    // ── Multi-value (Excel paste) search ──────────────────────────────────
    const handleMultiSearch = useCallback(async (page = 1, valuesOverride = null) => {
        if (!selectedFileId) { setError('Please select a reference file'); return; }
        if (!selectedColumn) { setError('Please select a column for multi-value search'); return; }

        const values = valuesOverride ?? pastedValues;
        if (values.length === 0) { setError('Please paste at least one value'); return; }

        // Persist values for pagination
        if (valuesOverride === null) activeMultiValues.current = values;

        // Capture folder filters at search time (same as handleSearch)
        const folderOpts = isFolderType
            ? { dateFrom: fileDate || null, dateTo: fileDate || null, fileRegex: fileRegex.trim() || null }
            : {};
        if (valuesOverride === null) activeFolderFilters.current = folderOpts;

        setIsLoading(true);
        setError(null);
        setMode('search_multi');
        try {
            const response = await ApiService.searchReferenceFileMulti(
                selectedFileId,
                activeMultiValues.current,
                selectedColumn,
                { exactMatch, page, pageSize, ...activeFolderFilters.current }
            );
            if (response.success) {
                setResults(response.results || []);
                setTotalRows(response.total_matches || 0);
                setTotalPages(response.pagination?.total_pages || 0);
                setCurrentPage(page);
                setHasLoaded(true);
                if (isFolderType) {
                    const filesAvailable = response.files_available ?? 0;
                    if (filesAvailable === 0) {
                        setError('No files found matching the selected date or filename pattern.');
                    } else {
                        setFolderStats({
                            searched: response.files_searched || 0,
                            available: filesAvailable,
                        });
                    }
                }
            } else {
                setError(response.error || 'Multi-value search failed');
                setResults([]);
            }
        } catch (err) {
            setError(`Multi-value search failed: ${err.message}`);
            setResults([]);
        } finally {
            setIsLoading(false);
        }
    }, [selectedFileId, selectedColumn, pastedValues, exactMatch, pageSize, isFolderType, fileDate, fileRegex]);

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !pasteMode && searchQuery.trim()) handleSearch(1);
    };

    // ── Reset ─────────────────────────────────────────────────────────────
    const handleReset = () => {
        setSearchQuery('');
        setSelectedColumn('');
        setPasteText('');
        setPastedValues([]);
        activeMultiValues.current = [];
        activeFolderFilters.current = {};
        setFileDate('');
        setFileRegex('');
        setFolderStats(null);
        setError(null);
        setPasteMode(false);
        if (!isFolderType) handleBrowse(1);
        else { setResults([]); setHasLoaded(false); }
    };

    // Toggle paste mode
    const togglePasteMode = () => {
        setPasteMode(prev => !prev);
        setError(null);
    };

    // Remove a single chip from pasted values
    const removeChip = (idx) => {
        const next = pastedValues.filter((_, i) => i !== idx);
        setPastedValues(next);
        setPasteText(next.join('\n'));
    };

    // ── Pagination ────────────────────────────────────────────────────────
    const handlePrevPage = () => {
        const p = currentPage - 1;
        if (p < 1) return;
        if (mode === 'search_multi') handleMultiSearch(p, activeMultiValues.current);
        else if (mode === 'search') handleSearch(p);
        else handleBrowse(p);
    };

    const handleNextPage = () => {
        const p = currentPage + 1;
        if (p > totalPages) return;
        if (mode === 'search_multi') handleMultiSearch(p, activeMultiValues.current);
        else if (mode === 'search') handleSearch(p);
        else handleBrowse(p);
    };

    // ── Export ────────────────────────────────────────────────────────────
    // Fetch all filtered results (up to 5000) for export — not just the current page.
    const fetchAllForExport = async () => {
        const EXPORT_LIMIT = 5000;
        if (mode === 'search') {
            const resp = await ApiService.searchReferenceFile(
                selectedFileId,
                searchQuery.trim(),
                {
                    column: selectedColumn || null,
                    page: 1,
                    pageSize: EXPORT_LIMIT,
                    limit: EXPORT_LIMIT,
                    ...activeFolderFilters.current,
                }
            );
            return { data: resp.results || [], cols: resp.columns || columns };
        }
        if (mode === 'search_multi') {
            const resp = await ApiService.searchReferenceFileMulti(
                selectedFileId,
                activeMultiValues.current,
                selectedColumn,
                { exactMatch, page: 1, pageSize: EXPORT_LIMIT, limit: EXPORT_LIMIT }
            );
            return { data: resp.results || [], cols: resp.columns || columns };
        }
        // browse mode — folder-type uses search with '.*', single-file uses paginated browse
        if (isFolderType) {
            const resp = await ApiService.searchReferenceFile(
                selectedFileId, '.*',
                { column: null, page: 1, pageSize: EXPORT_LIMIT, limit: EXPORT_LIMIT, ...activeFolderFilters.current }
            );
            return { data: resp.results || [], cols: resp.columns || columns };
        }
        const resp = await ApiService.getReferenceFileData(
            selectedFileId,
            { page: 1, pageSize: EXPORT_LIMIT }
        );
        return { data: resp.results || [], cols: resp.columns || columns };
    };

    const handleExportCSV = async () => {
        if (!hasLoaded) return;
        setIsExporting(true);
        setError(null);
        try {
            const { data: allData, cols: exportCols } = await fetchAllForExport();
            if (allData.length === 0) return;
            const headers = exportCols.length > 0 ? exportCols : Object.keys(allData[0] || {});
            const rows = allData.map(row =>
                headers.map(col => {
                    const v = row[col];
                    if (v === null || v === undefined) return '';
                    const s = String(v);
                    return s.includes(',') || s.includes('"') || s.includes('\n')
                        ? `"${s.replace(/"/g, '""')}"` : s;
                })
            );
            const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `reference-search-${selectedFileId}-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (err) {
            setError(`Export failed: ${err.message}`);
        } finally {
            setIsExporting(false);
        }
    };

    // ── AG Grid ───────────────────────────────────────────────────────────
    const columnDefs = useMemo(() => {
        const cols = columns.length > 0 ? columns : Object.keys(results[0] || {});
        return cols.map(key => ({
            headerName: key,
            field: key,
            minWidth: 120,
            flex: 1,
            resizable: true,
            sortable: true,
            filter: true,
            valueFormatter: (params) =>
                params.value === null || params.value === undefined ? '' : String(params.value),
        }));
    }, [columns, results]);

    const defaultColDef = useMemo(() => ({
        sortable: true, filter: true, resizable: true, minWidth: 100,
    }), []);

    // ── Mode badge helper ─────────────────────────────────────────────────
    const modeBadge = {
        browse:       { label: 'Browse Mode',       cls: 'bg-green-100 text-green-700' },
        search:       { label: 'Search Mode',        cls: 'bg-blue-100 text-blue-700' },
        search_multi: { label: 'Multi-Value Mode',   cls: 'bg-purple-100 text-purple-700' },
    };

    // ── Loading screen ────────────────────────────────────────────────────
    if (isLoadingFiles) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading reference files...</p>
                </div>
            </div>
        );
    }

    const canMultiSearch = selectedFileId && selectedColumn && pastedValues.length > 0;
    const canSearch = selectedFileId && searchQuery.trim();

    return (
        <div className="min-h-screen supervisory-page-canvas relative flex flex-col">

            {/* Full-page loading overlay */}
            {isLoading && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-8 flex flex-col items-center shadow-xl">
                        <div className="animate-spin rounded-full h-16 w-16 border-4 border-red-500 border-t-transparent mb-4"></div>
                        <p className="text-gray-700 text-lg font-medium">
                            {mode === 'search_multi' ? 'Searching values...' : mode === 'search' ? 'Searching...' : 'Loading...'}
                        </p>
                        {mode === 'search_multi' && activeMultiValues.current.length > 0 && (
                            <p className="text-gray-500 text-sm mt-1">
                                {activeMultiValues.current.length} values in {selectedColumn}
                            </p>
                        )}
                        {selectedFile && mode !== 'search_multi' && (
                            <p className="text-gray-500 text-sm mt-1">{selectedFile.name}</p>
                        )}
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="supervisory-app-header bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between" style={{ height: '64px' }}>
                <div className="flex items-center justify-between h-full w-full">
                    <div className="flex items-center gap-4">
                        <HSBCLogo height={40} />
                        <div>
                            <h1 className="text-lg font-semibold text-gray-900">REFERENCE FILE SEARCH</h1>
                            <p className="text-xs supervisory-app-subtitle">Browse and search known reference files (CSV, ZIP)</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {hasLoaded && (
                            <span className={`text-xs px-2 py-1 rounded font-medium ${modeBadge[mode]?.cls}`}>
                                {modeBadge[mode]?.label}
                            </span>
                        )}
                        {hasLoaded && (
                            <button
                                onClick={handleExportCSV}
                                disabled={isExporting || results.length === 0}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-slate-700 text-white hover:bg-slate-800 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isExporting
                                    ? <><div className="animate-spin rounded-full h-3 w-3 border-b border-white"></div> Exporting...</>
                                    : <><FaDownload /> Export CSV (up to 5000)</>
                                }
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Filters Panel */}
            <div className="flex-1 p-4 overflow-y-auto">
                <div className="supervisory-surface supervisory-elevated rounded-lg border border-gray-200 p-4 mb-4">

                    {/* Panel header with paste mode toggle */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <FaFilter className="text-gray-500" />
                            <span className="font-medium text-gray-700">Reference File & Search Filters</span>
                        </div>
                        <button
                            onClick={togglePasteMode}
                            disabled={!selectedFileId}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border transition-colors ${
                                pasteMode
                                    ? 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700'
                                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                            <FaClipboardList />
                            {pasteMode ? 'Paste Mode ON' : 'Paste from Excel'}
                        </button>
                    </div>

                    {/* Row 1: file + column + search/paste input + buttons */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-3">

                        {/* File Selector */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Reference File</label>
                            <select
                                value={selectedFileId}
                                onChange={(e) => setSelectedFileId(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg supervisory-field"
                            >
                                <option value="">Select File</option>
                                {files.map(f => (
                                    <option key={f.id} value={f.id}>{f.name}</option>
                                ))}
                            </select>
                            {selectedFile?.description && (
                                <p className="text-xs text-gray-500 mt-1 truncate" title={selectedFile.description}>
                                    {selectedFile.description}
                                </p>
                            )}
                        </div>

                        {/* Column Selector */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Column {pasteMode ? <span className="text-red-500">*</span> : '(Optional)'}
                            </label>
                            <select
                                value={selectedColumn}
                                onChange={(e) => setSelectedColumn(e.target.value)}
                                className={`w-full px-3 py-2 border rounded-lg supervisory-field ${
                                    pasteMode && !selectedColumn
                                        ? 'border-red-300 bg-red-50'
                                        : 'border-gray-300'
                                }`}
                                disabled={!selectedFileId}
                            >
                                <option value="">{pasteMode ? 'Select Column...' : 'All Columns'}</option>
                                {columns.map(col => (
                                    <option key={col} value={col}>{col}</option>
                                ))}
                            </select>
                            {pasteMode && !selectedColumn && (
                                <p className="text-xs text-red-500 mt-1">Required for paste search</p>
                            )}
                        </div>

                        {/* Search Input (single mode) or Paste hint (paste mode) */}
                        <div className="lg:col-span-2">
                            {!pasteMode ? (
                                <>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Search Query</label>
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyPress={handleKeyPress}
                                        placeholder="Enter search term or regex..."
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg supervisory-field"
                                        disabled={!selectedFileId}
                                    />
                                    {selectedColumn && searchQuery && (
                                        <p className="text-xs text-blue-600 mt-1">
                                            Searching in column: <strong>{selectedColumn}</strong>
                                        </p>
                                    )}
                                </>
                            ) : (
                                <>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="block text-sm font-medium text-gray-700">
                                            Paste Values
                                            {pastedValues.length > 0 && (
                                                <span className="ml-2 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-semibold">
                                                    {pastedValues.length} values
                                                </span>
                                            )}
                                        </label>
                                        {/* Exact / Contains toggle */}
                                        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-600">
                                            <input
                                                type="checkbox"
                                                checked={exactMatch}
                                                onChange={(e) => setExactMatch(e.target.checked)}
                                                className="rounded"
                                            />
                                            Exact match
                                        </label>
                                    </div>
                                    <textarea
                                        value={pasteText}
                                        onChange={(e) => setPasteText(e.target.value)}
                                        placeholder={`Paste a column from Excel here...\n(one value per line)`}
                                        className="w-full px-3 py-2 border border-purple-300 rounded-lg supervisory-field text-sm resize-none"
                                        rows={3}
                                        disabled={!selectedFileId}
                                    />
                                </>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-end gap-2 flex-wrap">
                            {!pasteMode ? (
                                <>
                                    <button
                                        onClick={() => handleSearch(1)}
                                        disabled={isLoading || !canSearch}
                                        className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
                                    >
                                        <FaSearch />
                                        Search
                                    </button>
                                    <button
                                        onClick={() => handleBrowse(1)}
                                        disabled={isLoading || !selectedFileId}
                                        className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
                                    >
                                        <FaTable />
                                        {isFolderType ? 'Load' : 'Browse'}
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={() => handleMultiSearch(1)}
                                    disabled={isLoading || !canMultiSearch}
                                    className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
                                >
                                    <FaSearch />
                                    Search {pastedValues.length > 0 ? `(${pastedValues.length})` : ''}
                                </button>
                            )}
                            <button
                                onClick={handleReset}
                                disabled={isLoading || !selectedFileId}
                                className="flex items-center gap-1.5 px-3 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
                            >
                                <FaSync />
                                Reset
                            </button>
                        </div>
                    </div>

                    {/* Folder filter row — only for folder-type files */}
                    {isFolderType && (
                        <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 mb-3">
                            <div className="flex items-center gap-2 mb-2">
                                <FaFolder className="text-amber-600" />
                                <span className="text-xs font-medium text-amber-700">
                                    Folder-type file — filter by date or filename pattern before searching
                                </span>
                                {folderStats && (
                                    <span className="ml-auto text-xs text-amber-600">
                                        {folderStats.searched} / {folderStats.available} file{folderStats.available !== 1 ? 's' : ''} searched
                                    </span>
                                )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                        File Date
                                        <span className="ml-1 font-normal text-gray-400">(leave blank to search all files)</span>
                                    </label>
                                    <input
                                        type="date"
                                        value={fileDate}
                                        onChange={(e) => setFileDate(e.target.value)}
                                        className="w-full px-2 py-1.5 border border-gray-300 rounded supervisory-field text-sm"
                                        disabled={!selectedFileId}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                        Filename Regex
                                        <span className="ml-1 font-normal text-gray-400">(overrides default pattern)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={fileRegex}
                                        onChange={(e) => setFileRegex(e.target.value)}
                                        placeholder="e.g. positions_2025.*\.csv"
                                        className="w-full px-2 py-1.5 border border-gray-300 rounded supervisory-field text-sm"
                                        disabled={!selectedFileId}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Chips: parsed values preview (paste mode) */}
                    {pasteMode && pastedValues.length > 0 && (
                        <div className="border border-purple-200 bg-purple-50 rounded-lg p-3 mt-2">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-purple-700">
                                    {pastedValues.length} value{pastedValues.length !== 1 ? 's' : ''} parsed
                                    {exactMatch ? ' — exact match' : ' — contains match'}
                                </span>
                                <button
                                    onClick={() => { setPasteText(''); setPastedValues([]); }}
                                    className="text-xs text-purple-500 hover:text-purple-700"
                                >
                                    Clear all
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                                {pastedValues.slice(0, 100).map((val, idx) => (
                                    <span
                                        key={idx}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-purple-300 text-purple-800 rounded-full text-xs"
                                    >
                                        {val}
                                        <button
                                            onClick={() => removeChip(idx)}
                                            className="text-purple-400 hover:text-purple-700 ml-0.5"
                                        >
                                            <FaTimes size={9} />
                                        </button>
                                    </span>
                                ))}
                                {pastedValues.length > 100 && (
                                    <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">
                                        +{pastedValues.length - 100} more
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* File info bar */}
                    {selectedFile && (
                        <div className="flex items-center gap-3 text-xs text-gray-500 border-t border-gray-100 pt-3 mt-3">
                            <span className="flex items-center gap-1">
                                <FaDatabase />
                                Format: <strong className="uppercase">{selectedFile.format}</strong>
                            </span>
                            {totalRows > 0 && (
                                <span>Total rows: <strong>{totalRows.toLocaleString()}</strong></span>
                            )}
                            {columns.length > 0 && (
                                <span>Columns: <strong>{columns.length}</strong></span>
                            )}
                        </div>
                    )}
                </div>

                {/* Error */}
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                        {error}
                    </div>
                )}

                {/* Results Section */}
                {hasLoaded && !isLoading && (
                    <div className="supervisory-surface supervisory-elevated rounded-lg border border-gray-200">
                        {/* Results header */}
                        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-700">
                                    {mode === 'search' ? 'Search Results'
                                        : mode === 'search_multi' ? 'Multi-Value Results'
                                        : 'All Data'}
                                </span>
                                <span className="text-sm text-gray-500">
                                    ({totalRows.toLocaleString()} {totalRows === 1 ? 'row' : 'rows'})
                                </span>
                            </div>
                            <div className="text-sm text-gray-500 flex items-center gap-2 flex-wrap justify-end">
                                {selectedFile && <span>{selectedFile.name}</span>}
                                {mode === 'search' && searchQuery && (
                                    <span className="text-blue-600">
                                        &mdash; &ldquo;{searchQuery}&rdquo;
                                        {selectedColumn && ` in ${selectedColumn}`}
                                    </span>
                                )}
                                {mode === 'search_multi' && (
                                    <span className="text-purple-600">
                                        &mdash; {activeMultiValues.current.length} values in <strong>{selectedColumn}</strong>
                                        {exactMatch ? ' (exact)' : ' (contains)'}
                                    </span>
                                )}
                            </div>
                        </div>

                        {results.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                                <FaSearch className="text-4xl mb-3 text-gray-300" />
                                <p>{mode !== 'browse' ? 'No results found' : 'No data available'}</p>
                            </div>
                        ) : (
                            <>
                                <div
                                    className="ag-theme-alpine config-grid-theme"
                                    style={{ height: 'calc(100vh - 400px)', minHeight: '380px', width: '100%' }}
                                >
                                    <AgGridReact
                                        rowData={results}
                                        columnDefs={columnDefs}
                                        defaultColDef={defaultColDef}
                                        theme="legacy"
                                        animateRows={true}
                                        pagination={false}
                                        enableCellTextSelection={true}
                                        ensureDomOrder={true}
                                    />
                                </div>

                                {totalPages > 1 && (
                                    <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                                        <div className="text-sm text-gray-500">
                                            Page {currentPage} of {totalPages}
                                            <span className="ml-2 text-gray-400">
                                                (showing {results.length} of {totalRows.toLocaleString()} rows)
                                            </span>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handlePrevPage}
                                                disabled={currentPage === 1 || isLoading}
                                                className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                                            >
                                                Previous
                                            </button>
                                            <button
                                                onClick={handleNextPage}
                                                disabled={currentPage >= totalPages || isLoading}
                                                className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* Initial state — no file selected */}
                {!hasLoaded && !isLoading && !error && !selectedFileId && (
                    <div className="supervisory-surface supervisory-elevated rounded-lg border border-gray-200 p-12 text-center">
                        <FaDatabase className="text-6xl text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-700 mb-2">Select a Reference File</h3>
                        <p className="text-gray-500 max-w-md mx-auto">
                            Choose a reference file from the dropdown above to browse or search its data.
                        </p>
                    </div>
                )}

                {/* Folder-type: prompt user to browse or search */}
                {!hasLoaded && !isLoading && !error && selectedFileId && isFolderType && (
                    <div className="supervisory-surface supervisory-elevated rounded-lg border border-amber-200 bg-amber-50 p-12 text-center">
                        <FaFolder className="text-6xl text-amber-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-amber-800 mb-2">Folder-based Reference File</h3>
                        <p className="text-amber-700 max-w-md mx-auto">
                            This file spans multiple files in a folder. Optionally select a <strong>File Date</strong> or
                            enter a <strong>Filename Regex</strong> above, then click <strong>Browse</strong> to load all
                            rows or <strong>Search</strong> to filter by a query term.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ReferenceSearchPage;
