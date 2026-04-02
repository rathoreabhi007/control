import { Trash2, Download } from 'lucide-react';
import HSBCLogo from '../../../components/HSBCLogo';
import { useChat } from '../lib/chatContext';

const DEFAULT_MODELS = [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
];

export default function ChatHeader({ availableModels = DEFAULT_MODELS }) {
    const {
        model, setModel,
        temperature, setTemperature,
        environment, setEnvironment,
        clearCurrentChat, exportCurrentChat
    } = useChat();

    return (
        <header style={{
            backgroundColor: 'white',
            borderBottom: '1px solid #e2e8f0',
            padding: '0 32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '80px',
            boxShadow: `
                0 4px 8px rgba(0,0,0,0.15),
                0 8px 16px rgba(0,0,0,0.1),
                0 2px 4px rgba(0,0,0,0.1),
                inset 0 2px 0 rgba(255,255,255,0.8),
                inset 0 -2px 0 rgba(0,0,0,0.1)
            `
        }}>
            {/* Left: Logo */}
            <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <HSBCLogo height={64} />
            </div>

            {/* Center: Title */}
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                <h1 style={{
                    margin: 0,
                    fontSize: '24px',
                    fontWeight: '700',
                    color: '#000',
                    textAlign: 'center'
                }}>
                    AI ASSISTANT
                </h1>
            </div>

            {/* Right: Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                {/* Model Dropdown */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ color: '#333', fontSize: '13px', fontWeight: '600' }}>Model:</label>
                    <select
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        style={{
                            backgroundColor: 'white',
                            color: '#333',
                            border: '1px solid #ddd',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            fontSize: '13px',
                            cursor: 'pointer',
                            outline: 'none',
                            minWidth: '140px'
                        }}
                    >
                        {availableModels.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                    </select>
                </div>

                {/* Temperature Dropdown */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ color: '#333', fontSize: '13px', fontWeight: '600' }}>Temp:</label>
                    <select
                        value={temperature}
                        onChange={(e) => setTemperature(parseFloat(e.target.value))}
                        style={{
                            backgroundColor: 'white',
                            color: '#333',
                            border: '1px solid #ddd',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            fontSize: '13px',
                            cursor: 'pointer',
                            outline: 'none',
                            minWidth: '70px'
                        }}
                    >
                        {[0, 0.3, 0.5, 0.7, 1.0, 1.5, 2.0].map(t => (
                            <option key={t} value={t}>{t.toFixed(1)}</option>
                        ))}
                    </select>
                </div>

                {/* Environment Dropdown */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ color: '#333', fontSize: '13px', fontWeight: '600' }}>Env:</label>
                    <select
                        value={environment}
                        onChange={(e) => setEnvironment(e.target.value)}
                        style={{
                            backgroundColor: environment === 'prod' ? '#fee2e2' : environment === 'poc' ? '#fef3c7' : 'white',
                            color: '#333',
                            border: '1px solid #ddd',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            fontSize: '13px',
                            cursor: 'pointer',
                            outline: 'none',
                            minWidth: '80px',
                            fontWeight: environment === 'prod' ? '600' : '400'
                        }}
                    >
                        <option value="dev">DEV</option>
                        <option value="poc">POC</option>
                        <option value="prod">PROD</option>
                    </select>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={exportCurrentChat}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            backgroundColor: 'white',
                            border: '1px solid #ddd',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            fontSize: '13px',
                            color: '#666',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        title="Export chat"
                    >
                        <Download size={14} />
                    </button>
                    <button
                        onClick={clearCurrentChat}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            backgroundColor: 'white',
                            border: '1px solid #ddd',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            fontSize: '13px',
                            color: '#666',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        title="Clear chat"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
        </header>
    );
}
