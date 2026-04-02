import { useEffect, useState } from 'react';
import { ChatProvider } from './lib/chatContext';
import ChatHeader from './components/ChatHeader';
import ChatSidebar from './components/ChatSidebar';
import ChatArea from './components/ChatArea';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';

const DEFAULT_MODELS = [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
];

/**
 * AI Assistant Page - ZorifBot-style modular component architecture
 */
export default function AIAssistantPage() {
    const [availableModels, setAvailableModels] = useState(DEFAULT_MODELS);

    // Fetch available models from backend
    useEffect(() => {
        const fetchModels = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/ai/models`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.models?.length > 0) {
                        setAvailableModels(data.models);
                    }
                }
            } catch (e) {
                console.log('Using default models');
            }
        };
        fetchModels();
    }, []);

    return (
        <ChatProvider>
            <div style={{
                minHeight: '100vh',
                backgroundColor: '#f5f5f5',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {/* Header */}
                <ChatHeader availableModels={availableModels} />

                {/* Main Content */}
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                    {/* Sidebar */}
                    <ChatSidebar />

                    {/* Chat Area */}
                    <ChatArea />
                </div>
            </div>
        </ChatProvider>
    );
}
