import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
// Use the WorkflowTool with real backend API integration
import WorkflowTool from '../../controls/workflow/page';
import { useUser } from '../../contexts/UserContext';

export default function WorkflowInstance() {
    const { id } = useParams();
    const [instanceId, setInstanceId] = useState('');
    const [timestamp, setTimestamp] = useState('');
    const { hasAccess } = useUser();

    useEffect(() => {
        if (id) {
            setInstanceId(id);
            setTimestamp(new Date().toISOString());
            document.title = `Data Workflow Tool`;
        }
    }, [id]);

    if (!hasAccess('workflow')) {
        return (
            <div className="flex items-center justify-center min-h-screen p-8 bg-red-100 dark:bg-red-900 border-red-400 text-red-700 dark:text-red-200">
                <div className="text-center">
                    <h2 className="text-xl font-bold mb-2">Access Denied</h2>
                    <p>You do not have permission to view the Data Workflow Tool.</p>
                </div>
            </div>
        );
    }

    if (!instanceId || !timestamp) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'white', color: 'black' }}>
                <div className="text-black text-lg">Initializing Data Workflow Tool instance...</div>
            </div>
        );
    }

    return (
        <div>
            <WorkflowTool instanceId={instanceId} />
        </div>
    );
}
