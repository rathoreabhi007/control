import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import CompletenessControl from '../../controls/completeness/page';
import { deriveConfigSlugFromInstanceId } from '../../utils/instance-id';

export default function CompletenessInstance() {
    const { id } = useParams();
    const [instanceId, setInstanceId] = useState('');
    const [timestamp, setTimestamp] = useState('');

    useEffect(() => {
        if (id) {
            setInstanceId(id);
            setTimestamp(new Date().toISOString());
            const configSlug = deriveConfigSlugFromInstanceId(id);
            document.title = configSlug
                ? `Completeness · ${configSlug}`
                : 'Completeness Control';
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
            <CompletenessControl instanceId={instanceId} />
        </div>
    );
} 