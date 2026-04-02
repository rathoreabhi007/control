import { Plus, History, Trash2 } from 'lucide-react';
import { useChat } from '../lib/chatContext';

export default function ChatSidebar() {
    const { chats, currentChatId, createNewChat, selectChat, deleteChat } = useChat();

    const handleDelete = (chatId, e) => {
        e.stopPropagation();
        deleteChat(chatId);
    };

    return (
        <aside style={{
            width: '280px',
            backgroundColor: 'white',
            borderRight: '1px solid #e5e5e5',
            display: 'flex',
            flexDirection: 'column'
        }}>
            {/* New Chat Button */}
            <button
                onClick={createNewChat}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    margin: '16px',
                    padding: '12px 16px',
                    backgroundColor: '#db0011',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600',
                    transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#a00010'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#db0011'}
            >
                <Plus size={16} /> New Chat
            </button>

            {/* Chat History Header */}
            <div style={{
                padding: '12px 20px',
                color: '#666',
                fontSize: '12px',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                borderBottom: '1px solid #eee',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            }}>
                <History size={14} style={{ color: '#db0011' }} />
                Recent Chats
            </div>

            {/* Chat List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                {chats.length === 0 ? (
                    <div style={{
                        padding: '24px 16px',
                        textAlign: 'center',
                        color: '#999',
                        fontSize: '13px'
                    }}>
                        No conversations yet
                    </div>
                ) : (
                    chats.map(chat => (
                        <div
                            key={chat.id}
                            onClick={() => selectChat(chat.id)}
                            style={{
                                padding: '12px 14px',
                                borderRadius: '8px',
                                marginBottom: '4px',
                                cursor: 'pointer',
                                backgroundColor: currentChatId === chat.id ? '#fef2f2' : 'transparent',
                                border: currentChatId === chat.id ? '1px solid #fee2e2' : '1px solid transparent',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                transition: 'all 0.15s'
                            }}
                            onMouseOver={(e) => {
                                if (currentChatId !== chat.id) {
                                    e.currentTarget.style.backgroundColor = '#f9f9f9';
                                }
                            }}
                            onMouseOut={(e) => {
                                if (currentChatId !== chat.id) {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                }
                            }}
                        >
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    fontSize: '13px',
                                    fontWeight: '500',
                                    color: '#333',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                }}>
                                    {chat.title}
                                </div>
                                <div style={{
                                    fontSize: '11px',
                                    color: '#999',
                                    marginTop: '4px'
                                }}>
                                    {new Date(chat.createdAt).toLocaleDateString()}
                                </div>
                            </div>
                            <button
                                onClick={(e) => handleDelete(chat.id, e)}
                                style={{
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    color: '#ccc',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'color 0.2s'
                                }}
                                onMouseOver={(e) => e.currentTarget.style.color = '#db0011'}
                                onMouseOut={(e) => e.currentTarget.style.color = '#ccc'}
                                title="Delete chat"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))
                )}
            </div>
        </aside>
    );
}
