import React, { useMemo, useRef, useState } from 'react';
import ApiService from '../../services/api';

function toYmd(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function parseYmd(ymd) {
    // Parse as local date (avoid timezone shifting from Date.parse('YYYY-MM-DD'))
    const [y, m, d] = String(ymd || '').split('-').map((x) => Number(x));
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
}

function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

function dayLabelFromYmd(ymd) {
    const d = parseYmd(ymd);
    if (!d) return ymd;
    const day = d.getDay();
    if (day === 6) return `Sat ${ymd}`;
    if (day === 0) return `Sun ${ymd}`;
    return ymd;
}

function parseCsvLine(line) {
    const out = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];

        if (inQuotes) {
            if (ch === '"') {
                const next = line[i + 1];
                if (next === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                out.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
    }

    out.push(current);
    return out.map((v) => v.trim());
}

function parseCsv(text) {
    const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n').filter((l) => l.trim() !== '');
    if (lines.length === 0) return { headers: [], rows: [] };

    const headers = parseCsvLine(lines[0]).map((h) => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);
        const row = {};
        headers.forEach((h, idx) => {
            row[h] = values[idx] ?? '';
        });
        rows.push(row);
    }
    return { headers, rows };
}

function isTerminalStatus(status) {
    const s = String(status || '').toLowerCase();
    return ['completed', 'success', 'failed', 'error', 'stopped', 'killed', 'cancelled'].includes(s);
}

function isRunFailureStatus(status) {
    const s = String(status || '').toLowerCase();
    return s === 'failed' || s === 'error';
}

async function waitForRunCompletion(
    taskId,
    { maxMs = 60 * 60 * 1000, intervalMs = 2000, optionsShouldCancel = null } = {}
) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
        if (typeof optionsShouldCancel === 'function' && optionsShouldCancel()) {
            throw new Error('Batch run cancelled');
        }
        const statusResp = await ApiService.getControlRunStatus(taskId);
        if (isTerminalStatus(statusResp?.status)) return statusResp;
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error('Batch control run timed out waiting for completion');
}

/**
 * Batch Control Run Modal
 * Upload CSV with column `control_id` (values map to a control NAME in this UI).
 */
const BulkRunModal = ({ controls, onStartRun, onClose }) => {
    const [fileName, setFileName] = useState('');
    const [csvText, setCsvText] = useState('');
    const [runEnv, setRunEnv] = useState('DEV');
    const todayYmd = useMemo(() => toYmd(new Date()), []);
    const [dateMode, setDateMode] = useState('single'); // 'single' | 'range'
    const [expectedRunDate, setExpectedRunDate] = useState(todayYmd);
    const [rangeStart, setRangeStart] = useState(todayYmd);
    const [rangeEnd, setRangeEnd] = useState(todayYmd);
    const [selectedWeekendDates, setSelectedWeekendDates] = useState(() => new Set());
    const [isRunning, setIsRunning] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [results, setResults] = useState([]);
    const [error, setError] = useState('');
    const cancelRef = useRef(false);
    const [currentTaskId, setCurrentTaskId] = useState(null);
    const [currentControlName, setCurrentControlName] = useState('');

    const parsed = useMemo(() => parseCsv(csvText), [csvText]);

    const controlNameSet = useMemo(() => new Set((controls || []).map((c) => c.name)), [controls]);

    const ids = useMemo(() => {
        const keyCandidates = ['control_id', 'task_name', 'name'];
        const headerKey = keyCandidates.find((k) => parsed.headers.includes(k));
        if (!headerKey) return { headerKey: null, values: [] };

        const values = parsed.rows
            .map((row) => String(row[headerKey] || '').trim())
            .filter(Boolean);

        return { headerKey, values };
    }, [parsed.headers, parsed.rows]);

    const validation = useMemo(() => {
        if (!ids.headerKey) {
            return {
                ok: false,
                message: 'CSV must include a column named "control_id" (or "task_name" / "name").',
                validNames: [],
                invalidNames: []
            };
        }

        const deduped = Array.from(new Set(ids.values));
        const validNames = deduped.filter((v) => controlNameSet.has(v));
        const invalidNames = deduped.filter((v) => !controlNameSet.has(v));

        return {
            ok: invalidNames.length === 0 && validNames.length > 0,
            message: invalidNames.length
                ? `Unknown controls: ${invalidNames.slice(0, 5).join(', ')}${invalidNames.length > 5 ? '…' : ''}`
                : '',
            validNames,
            invalidNames
        };
    }, [controlNameSet, ids.headerKey, ids.values]);

    const handleFilePick = async (file) => {
        setError('');
        setResults([]);
        setProgress({ current: 0, total: 0 });
        cancelRef.current = false;
        setCurrentTaskId(null);
        setCurrentControlName('');

        if (!file) return;
        setFileName(file.name);

        const text = await file.text();
        setCsvText(text);
    };

    const datePlan = useMemo(() => {
        if (dateMode === 'single') {
            const d = expectedRunDate;
            const dateObj = parseYmd(d);
            if (!dateObj) return { selectedDates: [], weekendCandidates: [] };
            const day = dateObj.getDay();
            const isWeekend = day === 0 || day === 6;
            return {
                selectedDates: [d],
                weekendCandidates: isWeekend ? [d] : []
            };
        }

        const startObj = parseYmd(rangeStart);
        const endObj = parseYmd(rangeEnd);
        if (!startObj || !endObj) return { selectedDates: [], weekendCandidates: [] };

        const from = startObj <= endObj ? startObj : endObj;
        const to = startObj <= endObj ? endObj : startObj;

        const weekdayDates = [];
        const weekendCandidates = [];

        for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
            const ymd = toYmd(d);
            const day = d.getDay();
            const isWeekend = day === 0 || day === 6;
            if (isWeekend) {
                weekendCandidates.push(ymd);
            } else {
                weekdayDates.push(ymd);
            }
        }

        const weekendIncluded = weekendCandidates.filter((d) => selectedWeekendDates.has(d));
        return {
            selectedDates: [...weekdayDates, ...weekendIncluded].sort(),
            weekendCandidates
        };
    }, [dateMode, expectedRunDate, rangeStart, rangeEnd, selectedWeekendDates]);

    const handleStopBatch = async () => {
        cancelRef.current = true;

        // Try to stop currently running backend task if we have one.
        if (currentTaskId && !String(currentTaskId).startsWith('local-')) {
            try {
                await ApiService.stopControlRun(currentTaskId, false);
                setResults((prev) => [
                    ...prev,
                    { name: currentControlName || 'Current run', status: 'stopped', task_id: currentTaskId, message: 'Stopped by user' }
                ]);
            } catch (e) {
                setResults((prev) => [
                    ...prev,
                    { name: currentControlName || 'Current run', status: 'stop_failed', task_id: currentTaskId, message: e?.message || 'Failed to stop current run' }
                ]);
            }
        }
    };

    const handleStartBulk = async () => {
        setError('');
        setResults([]);
        cancelRef.current = false;
        setCurrentTaskId(null);
        setCurrentControlName('');

        if (!validation.ok) {
            setError(validation.message || 'CSV validation failed');
            return;
        }

        if (datePlan.selectedDates.length === 0) {
            setError('Please select a valid run date (or date range).');
            return;
        }

        setIsRunning(true);
        setProgress({ current: 0, total: validation.validNames.length * datePlan.selectedDates.length });

        try {
            let completedSteps = 0;
            const controlsFailedEarlier = new Set();
            for (const runDate of datePlan.selectedDates) {
                if (cancelRef.current) {
                    setResults((prev) => [...prev, { name: 'Batch', status: 'cancelled', message: 'Cancelled by user' }]);
                    break;
                }

                for (let i = 0; i < validation.validNames.length; i++) {
                    if (cancelRef.current) {
                        setResults((prev) => [...prev, { name: 'Batch', status: 'cancelled', message: 'Cancelled by user' }]);
                        break;
                    }

                    const name = validation.validNames[i];

                    if (controlsFailedEarlier.has(name)) {
                        completedSteps += 1;
                        setProgress({ current: completedSteps, total: validation.validNames.length * datePlan.selectedDates.length });
                        setCurrentControlName(name);
                        setResults((prev) => [
                            ...prev,
                            {
                                name,
                                run_date: runDate,
                                status: 'skipped',
                                message: 'Skipped: this control failed on an earlier date in this batch'
                            }
                        ]);
                        continue;
                    }

                    completedSteps += 1;
                    setProgress({ current: completedSteps, total: validation.validNames.length * datePlan.selectedDates.length });
                    setCurrentControlName(name);

                    const control = controls.find((c) => c.name === name);
                    const params = {
                        control_id: control?.control_id || 'generic_controller',
                        task_name: name,
                        run_env: runEnv,
                        expected_run_date: runDate
                    };

                    const startResp = await onStartRun(params);
                    const taskId = startResp?.task_id;
                    setCurrentTaskId(taskId || null);

                    if (!taskId) {
                        controlsFailedEarlier.add(name);
                        setResults((prev) => [
                            ...prev,
                            { name, run_date: runDate, status: 'failed', message: 'No task_id returned' }
                        ]);
                        continue;
                    }

                    if (startResp?.simulated) {
                        await new Promise((r) => setTimeout(r, 5500));
                        if (cancelRef.current) {
                            setResults((prev) => [...prev, { name, run_date: runDate, status: 'cancelled', task_id: taskId, simulated: true }]);
                            break;
                        }
                        setResults((prev) => [...prev, { name, run_date: runDate, status: 'completed', task_id: taskId, simulated: true }]);
                        continue;
                    }

                    const finalStatus = await waitForRunCompletion(taskId, {
                        optionsShouldCancel: () => cancelRef.current
                    });
                    const terminal = finalStatus?.status || 'unknown';
                    if (isRunFailureStatus(terminal)) {
                        controlsFailedEarlier.add(name);
                    }
                    setResults((prev) => [
                        ...prev,
                        {
                            name,
                            run_date: runDate,
                            status: terminal,
                            task_id: taskId
                        }
                    ]);
                }
            }
        } catch (e) {
            // If cancelled, don't show as a hard error
            if (String(e?.message || '').toLowerCase().includes('cancel')) {
                setResults((prev) => [...prev, { name: 'Batch', status: 'cancelled', message: 'Cancelled by user' }]);
            } else {
                setError(e?.message || 'Batch run failed');
            }
        } finally {
            setIsRunning(false);
            setCurrentTaskId(null);
            setCurrentControlName('');
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
        }}>
            <div style={{
                backgroundColor: 'white',
                border: '2px solid #db0011',
                borderRadius: '8px',
                width: '100%',
                maxWidth: '760px',
                padding: '24px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div>
                        <h2 style={{ margin: 0, color: '#db0011', fontSize: '20px', fontWeight: 700 }}>Batch Control Run</h2>
                        <div style={{ marginTop: '6px', color: '#666', fontSize: '13px' }}>
                            Upload a CSV with a <code>control_id</code> column (values should match control names).
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isRunning}
                        style={{
                            backgroundColor: 'white',
                            color: '#666',
                            border: '1px solid #ddd',
                            padding: '8px 14px',
                            borderRadius: '6px',
                            cursor: isRunning ? 'not-allowed' : 'pointer'
                        }}
                    >
                        Close
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '18px' }}>
                    <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#333', marginBottom: '8px' }}>CSV file</div>
                        <input
                            type="file"
                            accept=".csv,text/csv"
                            disabled={isRunning}
                            onChange={(e) => handleFilePick(e.target.files?.[0])}
                        />
                        <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                            {fileName ? `Selected: ${fileName}` : 'No file selected'}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#333', marginBottom: '8px' }}>Run options</div>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                            {['DEV', 'UAT', 'PROD'].map((env) => (
                                <button
                                    key={env}
                                    type="button"
                                    disabled={isRunning}
                                    onClick={() => setRunEnv(env)}
                                    style={{
                                        flex: 1,
                                        padding: '8px 10px',
                                        backgroundColor: runEnv === env ? '#db0011' : 'white',
                                        color: runEnv === env ? 'white' : '#666',
                                        border: runEnv === env ? '2px solid #db0011' : '1px solid #ddd',
                                        borderRadius: '6px',
                                        cursor: isRunning ? 'not-allowed' : 'pointer',
                                        fontSize: '13px',
                                        fontWeight: runEnv === env ? 700 : 500
                                    }}
                                >
                                    {env}
                                </button>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                            {[
                                { id: 'single', label: 'Single date' },
                                { id: 'range', label: 'Date range' }
                            ].map((m) => (
                                <button
                                    key={m.id}
                                    type="button"
                                    disabled={isRunning}
                                    onClick={() => setDateMode(m.id)}
                                    style={{
                                        flex: 1,
                                        padding: '8px 10px',
                                        backgroundColor: dateMode === m.id ? '#db0011' : 'white',
                                        color: dateMode === m.id ? 'white' : '#666',
                                        border: dateMode === m.id ? '2px solid #db0011' : '1px solid #ddd',
                                        borderRadius: '6px',
                                        cursor: isRunning ? 'not-allowed' : 'pointer',
                                        fontSize: '13px',
                                        fontWeight: dateMode === m.id ? 700 : 500
                                    }}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>

                        {dateMode === 'single' ? (
                            <input
                                type="date"
                                value={expectedRunDate}
                                disabled={isRunning}
                                onChange={(e) => setExpectedRunDate(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    border: '1px solid #ddd',
                                    borderRadius: '6px'
                                }}
                            />
                        ) : (
                            <>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                    <div>
                                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px' }}>Start date</div>
                                        <input
                                            type="date"
                                            value={rangeStart}
                                            disabled={isRunning}
                                            onChange={(e) => {
                                                setRangeStart(e.target.value);
                                                setSelectedWeekendDates(new Set());
                                            }}
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                border: '1px solid #ddd',
                                                borderRadius: '6px'
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px' }}>End date</div>
                                        <input
                                            type="date"
                                            value={rangeEnd}
                                            disabled={isRunning}
                                            onChange={(e) => {
                                                setRangeEnd(e.target.value);
                                                setSelectedWeekendDates(new Set());
                                            }}
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                border: '1px solid #ddd',
                                                borderRadius: '6px'
                                            }}
                                        />
                                    </div>
                                </div>

                                <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
                                    Runs default to <strong>Mon–Fri</strong>. Weekend dates (Sat/Sun) are skipped unless you explicitly select them below.
                                </div>

                                {datePlan.weekendCandidates.length > 0 && (
                                    <div style={{
                                        marginTop: '10px',
                                        padding: '10px',
                                        border: '1px solid #eee',
                                        borderRadius: '6px',
                                        maxHeight: '120px',
                                        overflow: 'auto'
                                    }}>
                                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#333', marginBottom: '8px' }}>
                                            Weekend dates (Sat/Sun only)
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                            {datePlan.weekendCandidates.map((d) => (
                                                <label key={d} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#333' }}>
                                                    <input
                                                        type="checkbox"
                                                        disabled={isRunning}
                                                        checked={selectedWeekendDates.has(d)}
                                                        onChange={(e) => {
                                                            setSelectedWeekendDates((prev) => {
                                                                const next = new Set(prev);
                                                                if (e.target.checked) next.add(d);
                                                                else next.delete(d);
                                                                return next;
                                                            });
                                                        }}
                                                    />
                                                    {dayLabelFromYmd(d)}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                <div style={{ marginTop: '14px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#333', marginBottom: '6px' }}>Preview</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                        {ids.headerKey
                            ? `Using column: ${ids.headerKey}. Parsed ${new Set(ids.values).size} unique control(s).`
                            : 'Waiting for CSV with a "control_id" column.'}
                    </div>
                    {validation.message && (
                        <div style={{
                            marginTop: '10px',
                            padding: '10px 12px',
                            backgroundColor: '#fff5f5',
                            border: '1px solid #db0011',
                            borderRadius: '6px',
                            color: '#db0011',
                            fontSize: '12px'
                        }}>
                            {validation.message}
                        </div>
                    )}
                </div>

                {error && (
                    <div style={{
                        marginTop: '14px',
                        padding: '10px 12px',
                        backgroundColor: '#fff5f5',
                        border: '1px solid #db0011',
                        borderRadius: '6px',
                        color: '#db0011',
                        fontSize: '12px'
                    }}>
                        {error}
                    </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '18px' }}>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                        {isRunning ? `Running ${progress.current} / ${progress.total}…` : ''}
                    </div>
                    {isRunning && (
                        <button
                            type="button"
                            onClick={handleStopBatch}
                            style={{
                                padding: '10px 16px',
                                backgroundColor: '#666',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: 700
                            }}
                        >
                            Stop Batch
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleStartBulk}
                        disabled={isRunning || !csvText}
                        style={{
                            padding: '10px 16px',
                            backgroundColor: isRunning || !csvText ? '#999' : '#db0011',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: isRunning || !csvText ? 'not-allowed' : 'pointer',
                            fontSize: '13px',
                            fontWeight: 700
                        }}
                    >
                        {isRunning ? 'Running…' : 'Start Batch Run'}
                    </button>
                </div>

                {results.length > 0 && (
                    <div style={{ marginTop: '18px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#333', marginBottom: '8px' }}>
                            Results
                        </div>
                        <div style={{
                            border: '1px solid #eee',
                            borderRadius: '6px',
                            maxHeight: '220px',
                            overflow: 'auto'
                        }}>
                            {results.map((r) => (
                                <div
                                    key={`${r.task_id || ''}-${r.name}-${r.run_date || ''}-${r.status}`}
                                    style={{
                                        padding: '10px 12px',
                                        borderBottom: '1px solid #f2f2f2',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '10px'
                                    }}
                                >
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {r.name}{r.run_date ? ` • ${r.run_date}` : ''}
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#666' }}>
                                            {r.task_id ? `Task: ${r.task_id}` : r.message || ''}
                                        </div>
                                    </div>
                                    <div style={{
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        color: (() => {
                                            const s = String(r.status).toLowerCase();
                                            if (s === 'failed' || s === 'error') return '#db0011';
                                            if (s === 'skipped') return '#92400e';
                                            return '#0f766e';
                                        })()
                                    }}>
                                        {r.status}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BulkRunModal;

