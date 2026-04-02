import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import AIAssistantPage from '../../controls/ai-assistant/page';

import { useUser } from '../../contexts/UserContext';

export default function AIAssistantInstance() {
    const { id } = useParams();
    const [instanceId, setInstanceId] = useState('');
    const { hasAccess } = useUser();

    useEffect(() => {
        // Set instance ID from URL params or generate a default
        setInstanceId(id || 'default');
        document.title = 'AI Assistant';
    }, [id]);

    if (!hasAccess('ai-assistant')) {
        return (
            <div className="flex items-center justify-center p-8 bg-red-100 dark:bg-red-900 border border-red-400 text-red-700 dark:text-red-200 rounded">
                Access Denied: You do not have permission to view this page.
            </div>
        );
    }

    return (
        <div>
            <AIAssistantPage instanceId={instanceId} />
        </div>
    );
}
