import { useState, useEffect, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import ApiService from '../../services/api';
import { useUser } from '../../contexts/UserContext';
import { FaDownload, FaFilter, FaSync, FaCheckCircle, FaTimesCircle, FaTimes, FaExpand, FaUser, FaRobot } from 'react-icons/fa';
import MarkdownRenderer from '../ai-assistant/components/MarkdownRenderer';
import HSBCLogo from '../../components/HSBCLogo';

/**
 * Judgment Analytics Page - View and analyze AI response judgments
 */
const JudgmentAnalyticsPage = () => {
    const { hasAccess } = useUser();
    const [judgments, setJudgments] = useState([]);
    const [statistics, setStatistics] = useState(null);
    const [criteriaTemplates, setCriteriaTemplates] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Modal state
    const [selectedJudgment, setSelectedJudgment] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const openConversationModal = useCallback((judgment) => {
        setSelectedJudgment(judgment);
        setIsModalOpen(true);
    }, []);

    const closeModal = useCallback(() => {
        setIsModalOpen(false);
        setSelectedJudgment(null);
    }, []);

    // Filters
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedCriteria, setSelectedCriteria] = useState('');
    const [minScore, setMinScore] = useState(0);
    const [maxScore, setMaxScore] = useState(100);

    const loadData = useCallback(async () => {
        try {
            const [judgementsResponse, statsResponse] = await Promise.all([
                ApiService.getJudgments({
                    start_date: startDate || undefined,
                    end_date: endDate || undefined,
                    criteria: selectedCriteria || undefined,
                    min_score: minScore || undefined,
                    max_score: maxScore !== 100 ? maxScore : undefined,
                    limit: 200
                }),
                ApiService.getJudgmentStatistics(startDate || undefined, endDate || undefined)
            ]);

            setJudgments(judgementsResponse.judgments || []);
            setStatistics(statsResponse);
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [startDate, endDate, selectedCriteria, minScore, maxScore]);

    const loadCriteriaTemplates = useCallback(async () => {
        try {
            const response = await ApiService.getCriteriaTemplates();
            setCriteriaTemplates(response.templates || {});
        } catch (err) {
            // Silently fail - templates are optional
        }
    }, []);

    // Load initial data
    useEffect(() => {
        loadData();
        loadCriteriaTemplates();

        // Poll for updates every 30 seconds
        const interval = setInterval(loadData, 30000);
        return () => clearInterval(interval);
    }, [loadData, loadCriteriaTemplates]);

    const handleApplyFilters = () => {
        setIsLoading(true);
        loadData();
    };

    const handleResetFilters = () => {
        setStartDate('');
        setEndDate('');
        setSelectedCriteria('');
        setMinScore(0);
        setMaxScore(100);
        setTimeout(() => {
            setIsLoading(true);
            loadData();
        }, 100);
    };

    const handleExportCSV = () => {
        const headers = ['Date', 'Criteria', 'Score', 'Passed', 'User Message', 'AI Response', 'Reasoning'];
        const rows = judgments.map(j => [
            new Date(j.timestamp).toLocaleString(),
            j.criteria_template,
            j.judgment?.score || 'N/A',
            j.judgment?.passed ? 'Yes' : 'No',
            `"${(j.user_message || '').replace(/"/g, '""')}"`,
            `"${(j.ai_response || '').replace(/"/g, '""')}"`,
            `"${(j.judgment?.reasoning || '').replace(/"/g, '""')}"`
        ]);

        const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `judgment-analytics-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    // AG Grid column definitions
    const columnDefs = useMemo(() => [
        {
            headerName: 'Date',
            field: 'timestamp',
            width: 180,
            valueFormatter: (params) => {
                if (!params.value) return '';
                return new Date(params.value).toLocaleString();
            },
            sort: 'desc'
        },
        {
            headerName: 'Criteria',
            field: 'criteria_template',
            width: 150,
            valueFormatter: (params) => {
                const template = criteriaTemplates[params.value];
                return template?.name || params.value || 'N/A';
            }
        },
        {
            headerName: 'Score',
            field: 'judgment.score',
            width: 100,
            cellStyle: (params) => {
                const score = params.value;
                if (score >= 80) return { backgroundColor: '#d4edda', color: '#155724', fontWeight: 'bold' };
                if (score >= 60) return { backgroundColor: '#fff3cd', color: '#856404', fontWeight: 'bold' };
                return { backgroundColor: '#f8d7da', color: '#721c24', fontWeight: 'bold' };
            }
        },
        {
            headerName: 'Status',
            field: 'judgment.passed',
            width: 100,
            cellRenderer: (params) => {
                const passed = params.value;
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', height: '100%' }}>
                        {passed ? (
                            <>
                                <FaCheckCircle color="#28a745" />
                                <span style={{ color: '#28a745', fontWeight: '500' }}>Pass</span>
                            </>
                        ) : (
                            <>
                                <FaTimesCircle color="#dc3545" />
                                <span style={{ color: '#dc3545', fontWeight: '500' }}>Fail</span>
                            </>
                        )}
                    </div>
                );
            }
        },
        {
            headerName: 'User Message',
            field: 'user_message',
            flex: 1,
            minWidth: 200,
            cellStyle: { whiteSpace: 'normal', lineHeight: '1.4' },
            autoHeight: true,
            cellRenderer: (params) => {
                const msg = params.value || '';
                const truncated = msg.length > 80 ? msg.substring(0, 80) + '...' : msg;
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '4px 0' }}>
                        <span>{truncated}</span>
                        {msg && (
                            <button
                                onClick={() => openConversationModal(params.data)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '2px 8px',
                                    fontSize: '11px',
                                    color: '#db0011',
                                    backgroundColor: 'transparent',
                                    border: '1px solid #db0011',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    width: 'fit-content'
                                }}
                            >
                                <FaExpand size={10} />
                                View Full
                            </button>
                        )}
                    </div>
                );
            }
        },
        {
            headerName: 'AI Response',
            field: 'ai_response',
            flex: 1,
            minWidth: 200,
            cellStyle: { whiteSpace: 'normal', lineHeight: '1.4' },
            autoHeight: true,
            cellRenderer: (params) => {
                const msg = params.value || '';
                const truncated = msg.length > 80 ? msg.substring(0, 80) + '...' : msg;
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '4px 0' }}>
                        <span>{truncated}</span>
                        {msg && (
                            <button
                                onClick={() => openConversationModal(params.data)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '2px 8px',
                                    fontSize: '11px',
                                    color: '#db0011',
                                    backgroundColor: 'transparent',
                                    border: '1px solid #db0011',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    width: 'fit-content'
                                }}
                            >
                                <FaExpand size={10} />
                                View Full
                            </button>
                        )}
                    </div>
                );
            }
        },
        {
            headerName: 'Reasoning',
            field: 'judgment.reasoning',
            flex: 1,
            minWidth: 200,
            cellStyle: { whiteSpace: 'normal', lineHeight: '1.4' },
            autoHeight: true
        },
        {
            headerName: 'Model',
            field: 'model_used',
            width: 130
        }
    ], [criteriaTemplates, openConversationModal]);

    const defaultColDef = useMemo(() => ({
        sortable: true,
        filter: true,
        resizable: true
    }), []);

    // Check access
    if (!hasAccess('judgment-analytics')) {
        return (
            <div style={{ padding: '40px', textAlign: 'center' }}>
                <h2 style={{ color: '#dc3545' }}>Access Denied</h2>
                <p>You do not have permission to view judgment analytics.</p>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5', padding: '20px' }}>
            {/* Header */}
            <div className="border-b border-slate-200 px-8 py-4"
                style={{
                    backgroundColor: 'white',
                    height: '80px',
                    marginBottom: '20px',
                    boxShadow: `
                        0 4px 8px rgba(0,0,0,0.15),
                        0 8px 16px rgba(0,0,0,0.1),
                        0 2px 4px rgba(0,0,0,0.1),
                        inset 0 2px 0 rgba(255,255,255,0.8),
                        inset 0 -2px 0 rgba(0,0,0,0.1)
                    `
                }}>
                <div className="flex items-center justify-between h-full">
                    <div className="flex items-center flex-shrink-0">
                        <HSBCLogo height={64} className="mr-4" />
                    </div>
                    <div className="flex-1 flex justify-center">
                        <h1 className="text-2xl font-bold text-black text-center">
                            JUDGMENT ANALYTICS
                        </h1>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-2">
                        <button
                            onClick={loadData}
                            disabled={isLoading}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5
                                ${isLoading ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 text-white'}`}
                        >
                            <FaSync className={isLoading ? 'animate-spin' : ''} />
                            Refresh
                        </button>
                        <button
                            onClick={handleExportCSV}
                            disabled={judgments.length === 0}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5
                                ${judgments.length === 0 ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                        >
                            <FaDownload />
                            Export CSV
                        </button>
                    </div>
                </div>
            </div>

            {/* Statistics Cards */}
            {statistics && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '20px',
                    marginBottom: '20px'
                }}>
                    <StatCard
                        title="Total Judgments"
                        value={statistics.total_count}
                        color="#007bff"
                    />
                    <StatCard
                        title="Average Score"
                        value={statistics.average_score}
                        color="#28a745"
                        suffix="/100"
                    />
                    <StatCard
                        title="Pass Rate"
                        value={statistics.pass_rate}
                        color="#17a2b8"
                        suffix="%"
                    />
                    <StatCard
                        title="Top Criteria"
                        value={statistics.most_used_criteria || 'N/A'}
                        color="#6f42c1"
                        isText
                    />
                </div>
            )}

            {/* Filters */}
            <div style={{
                backgroundColor: 'white',
                padding: '20px',
                borderRadius: '8px',
                marginBottom: '20px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px' }}>
                    <FaFilter color="#db0011" />
                    <h3 style={{ margin: 0, fontSize: '16px', color: '#333' }}>Filters</h3>
                </div>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '15px',
                    marginBottom: '15px'
                }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#555' }}>
                            Start Date
                        </label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #ddd',
                                borderRadius: '4px'
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#555' }}>
                            End Date
                        </label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #ddd',
                                borderRadius: '4px'
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#555' }}>
                            Criteria
                        </label>
                        <select
                            value={selectedCriteria}
                            onChange={(e) => setSelectedCriteria(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #ddd',
                                borderRadius: '4px'
                            }}
                        >
                            <option value="">All Criteria</option>
                            {Object.entries(criteriaTemplates).map(([key, template]) => (
                                <option key={key} value={key}>{template.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#555' }}>
                            Score Range: {minScore} - {maxScore}
                        </label>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={minScore}
                                onChange={(e) => setMinScore(Number(e.target.value))}
                                style={{ flex: 1 }}
                            />
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={maxScore}
                                onChange={(e) => setMaxScore(Number(e.target.value))}
                                style={{ flex: 1 }}
                            />
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        onClick={handleApplyFilters}
                        style={{
                            padding: '8px 20px',
                            backgroundColor: '#db0011',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: '500'
                        }}
                    >
                        Apply Filters
                    </button>
                    <button
                        onClick={handleResetFilters}
                        style={{
                            padding: '8px 20px',
                            backgroundColor: '#6c757d',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: '500'
                        }}
                    >
                        Reset
                    </button>
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div style={{
                    backgroundColor: '#f8d7da',
                    color: '#721c24',
                    padding: '15px',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    border: '1px solid #f5c6cb'
                }}>
                    Error: {error}
                </div>
            )}

            {/* Judgments Table */}
            <div style={{
                backgroundColor: 'white',
                padding: '20px',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
                <h3 style={{ marginTop: 0, marginBottom: '15px', fontSize: '18px', color: '#333' }}>
                    Judgments ({judgments.length})
                </h3>
                <div className="ag-theme-alpine" style={{ height: '600px', width: '100%' }}>
                    <AgGridReact
                        rowData={judgments}
                        columnDefs={columnDefs}
                        defaultColDef={defaultColDef}
                        pagination={true}
                        paginationPageSize={20}
                        rowHeight={60}
                        domLayout="normal"
                    />
                </div>
            </div>

            {/* CSS for animations */}
            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>

            {/* Conversation Modal */}
            {isModalOpen && (
                <ConversationModal
                    judgment={selectedJudgment}
                    criteriaTemplates={criteriaTemplates}
                    onClose={closeModal}
                />
            )}
        </div>
    );
};

// Conversation Modal Component
const ConversationModal = ({ judgment, criteriaTemplates, onClose }) => {
    if (!judgment) return null;

    const criteriaName = criteriaTemplates[judgment.criteria_template]?.name || judgment.criteria_template || 'N/A';
    const score = judgment.judgment?.score;
    const passed = judgment.judgment?.passed;
    const reasoning = judgment.judgment?.reasoning;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: '20px'
            }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div
                style={{
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    width: '100%',
                    maxWidth: '900px',
                    maxHeight: '90vh',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '20px',
                    borderBottom: '1px solid #eee',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    backgroundColor: '#fafafa'
                }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '20px', color: '#333' }}>
                            Conversation Details
                        </h2>
                        <div style={{ display: 'flex', gap: '16px', marginTop: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '13px', color: '#666' }}>
                                {new Date(judgment.timestamp).toLocaleString()}
                            </span>
                            <span style={{ fontSize: '13px', color: '#666' }}>
                                Criteria: <strong>{criteriaName}</strong>
                            </span>
                            {judgment.model_used && (
                                <span style={{ fontSize: '13px', color: '#666' }}>
                                    Model: <strong>{judgment.model_used}</strong>
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            backgroundColor: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '8px',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <FaTimes size={20} color="#666" />
                    </button>
                </div>

                {/* Score Badge */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid #eee',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px'
                }}>
                    <div style={{
                        padding: '8px 16px',
                        borderRadius: '20px',
                        backgroundColor: score >= 80 ? '#d4edda' : score >= 60 ? '#fff3cd' : '#f8d7da',
                        color: score >= 80 ? '#155724' : score >= 60 ? '#856404' : '#721c24',
                        fontWeight: 'bold',
                        fontSize: '16px'
                    }}>
                        Score: {score}/100
                    </div>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 16px',
                        borderRadius: '20px',
                        backgroundColor: passed ? '#d4edda' : '#f8d7da',
                        color: passed ? '#155724' : '#721c24',
                        fontWeight: '500'
                    }}>
                        {passed ? <FaCheckCircle /> : <FaTimesCircle />}
                        {passed ? 'Passed' : 'Failed'}
                    </div>
                </div>

                {/* Messages Content */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '20px'
                }}>
                    {/* User Message */}
                    <div style={{
                        display: 'flex',
                        gap: '16px',
                        padding: '20px',
                        marginBottom: '16px',
                        backgroundColor: 'white',
                        borderRadius: '12px',
                        border: '1px solid #eee',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}>
                        <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            backgroundColor: '#333',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                        }}>
                            <FaUser color="white" size={18} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                                fontSize: '13px',
                                fontWeight: '600',
                                color: '#333',
                                marginBottom: '8px'
                            }}>
                                User Message
                            </div>
                            <div style={{
                                color: '#333',
                                fontSize: '15px',
                                lineHeight: '1.7',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word'
                            }}>
                                {judgment.user_message || 'No message'}
                            </div>
                        </div>
                    </div>

                    {/* AI Response */}
                    <div style={{
                        display: 'flex',
                        gap: '16px',
                        padding: '20px',
                        marginBottom: '16px',
                        backgroundColor: '#fff8f8',
                        borderRadius: '12px',
                        border: '1px solid #fee2e2',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}>
                        <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            backgroundColor: '#db0011',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                        }}>
                            <FaRobot color="white" size={18} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                                fontSize: '13px',
                                fontWeight: '600',
                                color: '#db0011',
                                marginBottom: '8px'
                            }}>
                                AI Response
                            </div>
                            <div style={{
                                color: '#333',
                                fontSize: '15px',
                                lineHeight: '1.7',
                                wordBreak: 'break-word'
                            }}>
                                <MarkdownRenderer content={judgment.ai_response || 'No response'} />
                            </div>
                        </div>
                    </div>

                    {/* Reasoning */}
                    {reasoning && (
                        <div style={{
                            padding: '20px',
                            backgroundColor: '#f8f9fa',
                            borderRadius: '12px',
                            border: '1px solid #e9ecef'
                        }}>
                            <div style={{
                                fontSize: '13px',
                                fontWeight: '600',
                                color: '#495057',
                                marginBottom: '8px'
                            }}>
                                Judgment Reasoning
                            </div>
                            <div style={{
                                color: '#495057',
                                fontSize: '14px',
                                lineHeight: '1.6',
                                whiteSpace: 'pre-wrap'
                            }}>
                                {reasoning}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// Statistics Card Component
const StatCard = ({ title, value, color, suffix = '', isText = false }) => (
    <div style={{
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        borderLeft: `4px solid ${color}`
    }}>
        <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>{title}</div>
        <div style={{
            fontSize: isText ? '18px' : '32px',
            fontWeight: 'bold',
            color: color
        }}>
            {isText ? value : `${value}${suffix}`}
        </div>
    </div>
);

export default JudgmentAnalyticsPage;
