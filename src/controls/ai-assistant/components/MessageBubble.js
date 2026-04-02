import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Copy, Check, Bot, User } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';

export default function MessageBubble({ message }) {
    const [copied, setCopied] = useState(false);
    const isUser = message.role === 'user';

    const timeAgo = message.timestamp
        ? formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })
        : 'Just now';

    const copyMessage = async () => {
        try {
            await navigator.clipboard.writeText(message.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    return (
        <div style={{
            display: 'flex',
            gap: '16px',
            padding: '20px',
            marginBottom: '12px',
            backgroundColor: isUser ? 'white' : '#fff8f8',
            borderRadius: '12px',
            border: isUser ? '1px solid #eee' : '1px solid #fee2e2',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            position: 'relative'
        }}>
            {/* Avatar */}
            <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: isUser ? '#333' : '#db0011',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
            }}>
                {isUser
                    ? <User color="white" size={20} />
                    : <Bot color="white" size={22} />
                }
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px'
                }}>
                    <span style={{
                        fontSize: '13px',
                        fontWeight: '600',
                        color: isUser ? '#333' : '#db0011'
                    }}>
                        {isUser ? 'You' : 'AI Assistant'}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: '#999' }}>
                            {timeAgo}
                        </span>
                        <button
                            onClick={copyMessage}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                backgroundColor: 'transparent',
                                border: 'none',
                                color: copied ? '#22c55e' : '#999',
                                cursor: 'pointer',
                                padding: '4px',
                                borderRadius: '4px',
                                transition: 'color 0.2s'
                            }}
                            title="Copy message"
                        >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                    </div>
                </div>

                {/* Message Content */}
                <div style={{
                    color: '#333',
                    fontSize: '15px',
                    lineHeight: '1.7',
                    wordBreak: 'break-word'
                }}>
                    {isUser ? (
                        <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
                    ) : (
                        <MarkdownRenderer content={message.content} />
                    )}
                </div>
            </div>
        </div>
    );
}
