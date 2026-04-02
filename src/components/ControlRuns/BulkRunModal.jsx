import React, { useMemo, useState } from 'react';
import ApiService from '../../services/api';

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

async function waitForRunCompletion(taskId, { maxMs = 60 * 60 * 1000, intervalMs = 2000 } = {}) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
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
    const [expectedRunDate, setExpectedRunDate] = useState(new Date().toISOString().split('T')[0]);
    const [isRunning, setIsRunning] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [results, setResults] = useState([]);
    const [error, setError] = useState('');

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

        if (!file) return;
        setFileName(file.name);

        const text = await file.text();
        setCsvText(text);
    };

    const handleStartBulk = async () => {
        setError('');
        setResults([]);

        if (!validation.ok) {
            setError(validation.message || 'CSV validation failed');
            return;
        }

        setIsRunning(true);
        setProgress({ current: 0, total: validation.validNames.length });

        try {
            for (let i = 0; i < validation.validNames.length; i++) {
                const name = validation.validNames[i];
                setProgress({ current: i + 1, total: validation.validNames.length });

                const control = controls.find((c) => c.name === name);
                const params = {
                    control_id: control?.control_id || 'generic_controller',
                    task_name: name,
                    run_env: runEnv,
                    expected_run_date: expectedRunDate
                };

                const startResp = await onStartRun(params);
                const taskId = startResp?.task_id;

                if (!taskId) {
                    setResults((prev) => [
                        ...prev,
                        { name, status: 'failed', message: 'No task_id returned' }
                    ]);
                    continue;
                }

                if (startResp?.simulated) {
                    // Simulated runs complete in ~5 seconds in our local fallback.
                    await new Promise((r) => setTimeout(r, 5500));
                    setResults((prev) => [...prev, { name, status: 'completed', task_id: taskId, simulated: true }]);
                    continue;
                }

                const finalStatus = await waitForRunCompletion(taskId);
                setResults((prev) => [
                    ...prev,
                    {
                        name,
                        status: finalStatus?.status || 'unknown',
                        task_id: taskId
                    }
                ]);
            }
        } catch (e) {
            setError(e?.message || 'Bulk run failed');
        } finally {
            setIsRunning(false);
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
                                    key={`${r.task_id || ''}-${r.name}-${r.status}`}
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
                                            {r.name}
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#666' }}>
                                            {r.task_id ? `Task: ${r.task_id}` : r.message || ''}
                                        </div>
                                    </div>
                                    <div style={{
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        color: String(r.status).toLowerCase() === 'failed' || String(r.status).toLowerCase() === 'error' ? '#db0011' : '#0f766e'
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

