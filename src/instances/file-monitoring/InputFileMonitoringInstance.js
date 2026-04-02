import React, { useEffect } from 'react';
import FileMonitoringDashboard from '../../controls/file-monitoring/page';

export default function InputFileMonitoringInstance() {
    useEffect(() => {
        document.title = 'Input File Monitoring';
    }, []);

    return <FileMonitoringDashboard fileType="input" />;
}
