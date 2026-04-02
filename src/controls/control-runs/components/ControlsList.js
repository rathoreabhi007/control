import React from 'react';
import ControlCard from '../../../components/ControlRuns/ControlCard';

const ControlsList = ({
    searchTerm,
    onSearchChange,
    filteredControls,
    handleRunClick,
    handleViewLogs,
    allRuns,
    onBulkRunClick
}) => {
    let regexError = '';
    if (searchTerm.trim()) {
        try {
            new RegExp(searchTerm, 'i');
        } catch (err) {
            regexError = err.message || 'Invalid regex pattern';
        }
    }

    return (
        <>
            {/* Batch Control Run */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
                <button
                    type="button"
                    onClick={onBulkRunClick}
                    style={{
                        padding: '8px 12px',
                        backgroundColor: '#db0011',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 700
                    }}
                >
                    Batch Control Run
                </button>
            </div>

            {/* Search Bar */}
            <input
                type="text"
                placeholder="Search controls with regex..."
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                style={{
                    width: '100%',
                    padding: '10px 16px',
                    backgroundColor: 'white',
                    color: '#333',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    boxSizing: 'border-box',
                    marginBottom: '16px'
                }}
                onFocus={(e) => e.target.style.borderColor = '#db0011'}
                onBlur={(e) => e.target.style.borderColor = '#ddd'}
            />
            <div style={{
                color: '#666',
                fontSize: '12px',
                marginBottom: '12px'
            }}>
                Regex hint: use <code>.*</code> for any text, <code>^</code> for starts with, and <code>$</code> for ends with.
                Example: <code>^Data.*Process$</code>
            </div>
            {regexError && (
                <div style={{
                    marginBottom: '12px',
                    padding: '8px 10px',
                    backgroundColor: '#fff5f5',
                    border: '1px solid #db0011',
                    borderRadius: '4px',
                    color: '#db0011',
                    fontSize: '12px'
                }}>
                    Invalid regex: {regexError}
                </div>
            )}

            {/* Controls List */}
            <div style={{
                backgroundColor: 'white',
                border: '1px solid #ddd',
                borderRadius: '4px',
                padding: '16px',
                maxHeight: 'calc(100vh - 280px)',
                overflowY: 'auto'
            }}>
                <h2 style={{
                    margin: '0 0 12px 0',
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#333'
                }}>
                    Controls ({filteredControls.length})
                </h2>
                {filteredControls.length === 0 ? (
                    <div style={{
                        padding: '40px',
                        textAlign: 'center',
                        color: '#999'
                    }}>
                        No controls found matching "{searchTerm}"
                    </div>
                ) : (
                    filteredControls.map(control => (
                        <ControlCard
                            key={control.control_id + control.name}
                            control={control}
                            onRunClick={handleRunClick}
                            onViewLogs={handleViewLogs}
                            allRuns={allRuns}
                        />
                    ))
                )}
            </div>
        </>
    );
};

export default ControlsList;
