import React, { useEffect } from 'react';
import FileMonitoringDashboard from '../../controls/file-monitoring/page';

export default function OutputFileMonitoringInstance() {
    useEffect(() => {
        document.title = 'Output File Monitoring';
    }, []);

    return <FileMonitoringDashboard fileType="output" />;
}
