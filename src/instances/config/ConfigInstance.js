import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import GenReconAnalysis from '../../controls/config/page';

export default function ConfigInstance() {
    const { id } = useParams();
    const [instanceId, setInstanceId] = useState('');
    const [timestamp, setTimestamp] = useState('');

    useEffect(() => {
        if (id) {
            setInstanceId(id);
            setTimestamp(new Date().toISOString());
            document.title = `GenRecon Analysis`;
        }
    }, [id]);

    if (!instanceId || !timestamp) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'white', color: 'black' }}>
                <div className="text-black text-lg">Initializing GenRecon Analysis instance...</div>
            </div>
        );
    }

    return (
        <div>
            <GenReconAnalysis instanceId={instanceId} />
        </div>
    );
} 