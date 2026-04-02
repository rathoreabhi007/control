import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ControlStatusDashboard from '../../controls/control-status/page';

export default function ControlStatusInstance() {
    const { id } = useParams();
    const [instanceId, setInstanceId] = useState('');
    const [timestamp, setTimestamp] = useState('');

    useEffect(() => {
        // Generate a default ID if not provided
        const defaultId = id || `control-status-${Date.now()}`;
        setInstanceId(defaultId);
        setTimestamp(new Date().toISOString());
        document.title = `Control Status Dashboard`;
    }, [id]);

    if (!instanceId || !timestamp) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'white', color: 'black' }}>
                <div className="text-black text-lg">Initializing Control Status Dashboard...</div>
            </div>
        );
    }

    return (
        <div>
            <ControlStatusDashboard instanceId={instanceId} />
        </div>
    );
}

