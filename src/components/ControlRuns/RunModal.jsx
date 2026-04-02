import React, { useState } from 'react';
import { useUser } from '../../contexts/UserContext';

/**
 * Run Modal Component - Modal for configuring and starting a control run
 */
const RunModal = ({ control, onRun, onClose }) => {
    const { currentUser } = useUser();
    const isAdmin = currentUser?.permission?.includes('*') || false;

    const [runEnv, setRunEnv] = useState('DEV');
    const [expectedRunDate, setExpectedRunDate] = useState(
        new Date().toISOString().split('T')[0]
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);

    // PROD is only visible to admin users
    const environments = isAdmin ? ['DEV', 'UAT', 'PROD'] : ['DEV', 'UAT'];

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            await onRun({
                control_id: control.control_id,
                task_name: control.name,
                run_env: runEnv,
                expected_run_date: expectedRunDate
            });
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to start run');
        } finally {
            setIsSubmitting(false);
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
                maxWidth: '500px',
                padding: '24px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
            }}>
                <h2 style={{
                    margin: '0 0 8px 0',
                    color: '#db0011',
                    fontSize: '20px',
                    fontWeight: '600'
                }}>
                    Run Control
                </h2>
                <p style={{
                    margin: '0 0 24px 0',
                    color: '#666',
                    fontSize: '14px'
                }}>
                    {control.name}
                </p>

                <form onSubmit={handleSubmit}>
                    {/* Environment */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: '8px',
                            color: '#333',
                            fontSize: '14px',
                            fontWeight: '600'
                        }}>
                            Environment
                        </label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {environments.map(env => (
                                <button
                                    key={env}
                                    type="button"
                                    onClick={() => setRunEnv(env)}
                                    style={{
                                        flex: 1,
                                        padding: '10px',
                                        backgroundColor: runEnv === env ? '#db0011' : 'white',
                                        color: runEnv === env ? 'white' : '#666',
                                        border: runEnv === env ? '2px solid #db0011' : '1px solid #ddd',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        fontWeight: runEnv === env ? '600' : '400',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {env}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Expected Run Date */}
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: '8px',
                            color: '#333',
                            fontSize: '14px',
                            fontWeight: '600'
                        }}>
                            Expected Run Date
                        </label>
                        <input
                            type="date"
                            value={expectedRunDate}
                            onChange={(e) => setExpectedRunDate(e.target.value)}
                            required
                            style={{
                                width: '100%',
                                padding: '10px',
                                backgroundColor: 'white',
                                color: '#333',
                                border: '1px solid #ddd',
                                borderRadius: '6px',
                                fontSize: '14px',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div style={{
                            padding: '12px',
                            backgroundColor: '#fee',
                            color: '#db0011',
                            border: '1px solid #db0011',
                            borderRadius: '6px',
                            marginBottom: '20px',
                            fontSize: '14px'
                        }}>
                            {error}
                        </div>
                    )}

                    {/* Actions */}
                    <div style={{
                        display: 'flex',
                        gap: '12px',
                        justifyContent: 'flex-end'
                    }}>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            style={{
                                padding: '10px 20px',
                                backgroundColor: 'white',
                                color: '#666',
                                border: '1px solid #ddd',
                                borderRadius: '6px',
                                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                fontSize: '14px'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            style={{
                                padding: '10px 20px',
                                backgroundColor: isSubmitting ? '#999' : '#db0011',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                fontSize: '14px',
                                fontWeight: '600',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            {isSubmitting ? '⏳' : '▶'} {isSubmitting ? 'Starting...' : 'Start Run'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default RunModal;

