import { useState, useRef, useEffect } from 'react';
import { Send, Code, Square } from 'lucide-react';
import { useChat } from '../lib/chatContext';

export default function MessageInput({ onSendMessage, isLoading, disabled = false, onStop }) {
    const [message, setMessage] = useState('');
    const textareaRef = useRef(null);
    const { queryLastResponse, setQueryLastResponse } = useChat();

    const handleSend = () => {
        if (!message.trim() || isLoading || disabled) return;
        onSendMessage(message.trim());
        setMessage('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const insertCodeBlock = () => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const codeBlock = '```\n\n```';
        const newValue = message.slice(0, start) + codeBlock + message.slice(end);
        setMessage(newValue);

        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + 4, start + 4);
        }, 0);
    };

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
        }
    }, [message]);

    return (
        <div style={{
            padding: '20px 24px',
            backgroundColor: 'white',
            borderTop: '1px solid #eee'
        }}>
            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                {/* Input container */}
                <div style={{
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'flex-end',
                    backgroundColor: '#f9f9f9',
                    borderRadius: '12px',
                    border: '1px solid #ddd',
                    padding: '12px 16px'
                }}>
                    <textarea
                        ref={textareaRef}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={disabled ? "Backend not available..." : "Type your message here..."}
                        disabled={isLoading || disabled}
                        style={{
                            flex: 1,
                            backgroundColor: 'transparent',
                            color: '#333',
                            border: 'none',
                            fontSize: '15px',
                            resize: 'none',
                            minHeight: '24px',
                            maxHeight: '150px',
                            outline: 'none',
                            fontFamily: 'inherit',
                            lineHeight: '1.5'
                        }}
                        rows={1}
                    />

                    {isLoading ? (
                        <button
                            onClick={onStop}
                            style={{
                                width: '40px',
                                height: '40px',
                                backgroundColor: '#666',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                            }}
                            title="Stop generation"
                        >
                            <Square size={16} fill="white" />
                        </button>
                    ) : (
                        <button
                            onClick={handleSend}
                            disabled={!message.trim() || disabled}
                            style={{
                                width: '40px',
                                height: '40px',
                                backgroundColor: message.trim() && !disabled ? '#db0011' : '#ccc',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: message.trim() && !disabled ? 'pointer' : 'not-allowed',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                transition: 'background-color 0.2s'
                            }}
                            title="Send message"
                        >
                            <Send size={16} />
                        </button>
                    )}
                </div>

                {/* Footer with quick actions and hints */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '10px',
                    padding: '0 4px'
                }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <button
                            onClick={insertCodeBlock}
                            disabled={disabled || isLoading}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                backgroundColor: 'transparent',
                                border: '1px solid #ddd',
                                borderRadius: '6px',
                                padding: '6px 10px',
                                fontSize: '12px',
                                color: '#666',
                                cursor: disabled ? 'not-allowed' : 'pointer'
                            }}
                        >
                            <Code size={12} /> Code
                        </button>

                        {/* Query Last Response Toggle */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <label
                                style={{
                                    fontSize: '12px',
                                    color: '#666',
                                    cursor: 'pointer',
                                    userSelect: 'none'
                                }}
                                onClick={() => setQueryLastResponse(!queryLastResponse)}
                            >
                                Query Last:
                            </label>
                            <button
                                onClick={() => setQueryLastResponse(!queryLastResponse)}
                                style={{
                                    backgroundColor: queryLastResponse ? '#db0011' : '#e5e7eb',
                                    color: queryLastResponse ? 'white' : '#666',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '4px 10px',
                                    fontSize: '11px',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                                title={queryLastResponse ? 'Query last response enabled - only the last AI response will be sent as context' : 'Query last response disabled - full conversation history will be sent'}
                            >
                                {queryLastResponse ? 'ON' : 'OFF'}
                            </button>
                        </div>
                    </div>

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12px',
                        color: '#999'
                    }}>
                        <span>Press</span>
                        <kbd style={{
                            padding: '2px 6px',
                            backgroundColor: '#f5f5f5',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            fontSize: '11px'
                        }}>
                            Shift + Enter
                        </kbd>
                        <span>for new line</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
