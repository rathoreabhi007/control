import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import QualityControl from '../../controls/quality/page';

export default function QualityInstance() {
    const { id } = useParams();
    const [instanceId, setInstanceId] = useState('');
    const [timestamp, setTimestamp] = useState('');

    useEffect(() => {
        if (id) {
            setInstanceId(id);
            setTimestamp(new Date().toISOString());
            document.title = `Quality Control`;
        }
    }, [id]);

    if (!instanceId || !timestamp) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'white', color: 'black' }}>
                <div className="text-black text-lg">Initializing instance...</div>
            </div>
        );
    }

    return (
        <div>
            <QualityControl instanceId={instanceId} />
        </div>
    );
}

