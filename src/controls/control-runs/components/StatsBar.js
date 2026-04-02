import React from 'react';

const StatsBar = ({ controlsCount, statusCounts }) => {
    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '12px'
        }}>
            <div style={statBoxStyle}>
                <div style={{ ...statValueStyle, color: '#db0011' }}>
                    {controlsCount}
                </div>
                <div style={statLabelStyle}>
                    Total Controls
                </div>
            </div>
            <div style={statBoxStyle}>
                <div style={{ ...statValueStyle, color: '#3498db' }}>
                    {statusCounts.running}
                </div>
                <div style={statLabelStyle}>
                    Running
                </div>
            </div>
            <div style={statBoxStyle}>
                <div style={{ ...statValueStyle, color: '#2ecc71' }}>
                    {statusCounts.success}
                </div>
                <div style={statLabelStyle}>
                    Successful
                </div>
            </div>
            <div style={statBoxStyle}>
                <div style={{ ...statValueStyle, color: '#db0011' }}>
                    {statusCounts.failed}
                </div>
                <div style={statLabelStyle}>
                    Failed
                </div>
            </div>
            <div style={statBoxStyle}>
                <div style={{ ...statValueStyle, color: '#666' }}>
                    {statusCounts.all}
                </div>
                <div style={statLabelStyle}>
                    Total Runs
                </div>
            </div>
        </div>
    );
};

const statBoxStyle = {
    backgroundColor: 'white',
    border: '1px solid #ddd',
    borderRadius: '4px',
    padding: '12px',
    textAlign: 'center',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
};

const statValueStyle = {
    fontSize: '24px',
    fontWeight: '700'
};

const statLabelStyle = {
    fontSize: '11px',
    color: '#666',
    marginTop: '2px'
};

export default StatsBar;
