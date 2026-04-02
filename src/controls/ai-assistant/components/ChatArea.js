import { useRef, useEffect, useCallback } from 'react';
import { Bot, Loader2 } from 'lucide-react';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import { useChat } from '../lib/chatContext';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';

export default function ChatArea() {
    const {
        currentMessages,
        currentChatId,
        isLoading,
        setIsLoading,
        streamingContent,
        setStreamingContent,
        model,
        temperature,
        environment,
        queryLastResponse,
        updateCurrentMessages,
        createNewChat
    } = useChat();

    const messagesEndRef = useRef(null);
    const abortControllerRef = useRef(null);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [currentMessages, streamingContent]);

    // Send message handler
    const handleSendMessage = useCallback(async (content) => {
        if (!content.trim() || isLoading) return;

        let chatId = currentChatId;
        if (!chatId) {
            chatId = createNewChat();
        }

        const userMessage = {
            id: `msg-${Date.now()}-user`,
            role: 'user',
            content: content.trim(),
            timestamp: new Date().toISOString()
        };

        updateCurrentMessages(prev => [...prev, userMessage]);
        setIsLoading(true);
        setStreamingContent('');

        try {
            abortControllerRef.current = new AbortController();

            const allMessages = [...currentMessages, userMessage];

            const response = await fetch(`${API_BASE_URL}/api/ai/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    temperature,
                    messages: allMessages.map(m => ({ role: m.role, content: m.content })),
                    environment,
                    query_last_response: queryLastResponse
                }),
                signal: abortControllerRef.current.signal
            });

            if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');

                // Keep the last incomplete line in the buffer
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.content) {
                                fullContent += data.content;
                                setStreamingContent(fullContent);
                            }
                            if (data.error) throw new Error(data.error);
                            if (data.done) break;
                        } catch (parseError) {
                            if (parseError.message && !parseError.message.includes('Unexpected')) {
                                throw parseError;
                            }
                        }
                    }
                }
            }

            // Process any remaining data in the buffer
            if (buffer.startsWith('data: ')) {
                try {
                    const data = JSON.parse(buffer.slice(6));
                    if (data.content) {
                        fullContent += data.content;
                        setStreamingContent(fullContent);
                    }
                } catch (parseError) {
                    // Ignore parse errors for final incomplete chunk
                }
            }

            const assistantMessage = {
                id: `msg-${Date.now()}-ai`,
                role: 'assistant',
                content: fullContent,
                timestamp: new Date().toISOString()
            };

            updateCurrentMessages(prev => [...prev, assistantMessage]);
            setStreamingContent('');

        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Chat error:', error);
                const errorMessage = {
                    id: `msg-${Date.now()}-error`,
                    role: 'assistant',
                    content: `Error: ${error.message}. Please check that the backend is running and configured correctly.`,
                    timestamp: new Date().toISOString()
                };
                updateCurrentMessages(prev => [...prev, errorMessage]);
            }
        } finally {
            setIsLoading(false);
            setStreamingContent('');
            abortControllerRef.current = null;
        }
    }, [currentChatId, currentMessages, isLoading, model, temperature, environment, queryLastResponse, createNewChat, updateCurrentMessages, setIsLoading, setStreamingContent]);

    const stopGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    };

    return (
        <main style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#fafafa'
        }}>
            {/* Messages Area */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {currentMessages.length === 0 && !streamingContent ? (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        padding: '40px'
                    }}>
                        <div style={{
                            width: '80px',
                            height: '80px',
                            borderRadius: '50%',
                            backgroundColor: '#db0011',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: '24px',
                            boxShadow: '0 4px 12px rgba(219, 0, 17, 0.3)'
                        }}>
                            <Bot size={40} color="white" />
                        </div>
                        <h2 style={{ margin: 0, fontSize: '28px', color: '#333', fontWeight: '600' }}>
                            How can I help you today?
                        </h2>
                        <p style={{ marginTop: '12px', fontSize: '15px', color: '#666' }}>
                            Start a conversation or select from history
                        </p>
                    </div>
                ) : (
                    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
                        {currentMessages.map((msg) => (
                            <MessageBubble key={msg.id} message={msg} />
                        ))}

                        {/* Streaming Response */}
                        {streamingContent && (
                            <div style={{
                                display: 'flex',
                                gap: '16px',
                                padding: '20px',
                                marginBottom: '12px',
                                backgroundColor: '#fff8f8',
                                borderRadius: '12px',
                                border: '1px solid #fee2e2'
                            }}>
                                <div style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '50%',
                                    backgroundColor: '#db0011',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                }}>
                                    <Bot color="white" size={22} />
                                </div>
                                <div style={{
                                    flex: 1,
                                    color: '#333',
                                    fontSize: '15px',
                                    lineHeight: '1.7',
                                    whiteSpace: 'pre-wrap'
                                }}>
                                    {streamingContent}
                                    <span style={{
                                        display: 'inline-block',
                                        width: '6px',
                                        height: '18px',
                                        backgroundColor: '#db0011',
                                        marginLeft: '2px',
                                        animation: 'blink 1s infinite'
                                    }} />
                                </div>
                            </div>
                        )}

                        {/* Loading indicator */}
                        {isLoading && !streamingContent && (
                            <div style={{
                                display: 'flex',
                                gap: '16px',
                                padding: '20px',
                                marginBottom: '12px',
                                backgroundColor: '#fff8f8',
                                borderRadius: '12px',
                                border: '1px solid #fee2e2'
                            }}>
                                <div style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '50%',
                                    backgroundColor: '#db0011',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                }}>
                                    <Bot color="white" size={22} />
                                </div>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    color: '#666',
                                    paddingTop: '8px'
                                }}>
                                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} color="#db0011" />
                                    Thinking...
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* Input Area */}
            <MessageInput
                onSendMessage={handleSendMessage}
                isLoading={isLoading}
                onStop={stopGeneration}
            />

            {/* CSS Animations */}
            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes blink {
                    0%, 50% { opacity: 1; }
                    51%, 100% { opacity: 0; }
                }
            `}</style>
        </main>
    );
}
