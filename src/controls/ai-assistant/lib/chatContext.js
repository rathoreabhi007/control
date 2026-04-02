import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'ai-assistant-chats';

// Generate unique ID
const generateId = () => `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Load/Save helpers
const loadFromStorage = () => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : { chats: [], currentChatId: null };
    } catch (e) {
        console.error('Error loading chats:', e);
        return { chats: [], currentChatId: null };
    }
};

const saveToStorage = (data) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Error saving chats:', e);
    }
};

// Context
const ChatContext = createContext(null);

export function ChatProvider({ children }) {
    const [chats, setChats] = useState([]);
    const [currentChatId, setCurrentChatId] = useState(null);
    const [currentMessages, setCurrentMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [streamingContent, setStreamingContent] = useState('');
    const [model, setModel] = useState('gpt-4o-mini');
    const [temperature, setTemperature] = useState(0.7);
    const [environment, setEnvironment] = useState('dev');
    const [queryLastResponse, setQueryLastResponse] = useState(false);

    // Load from storage on mount
    useEffect(() => {
        const data = loadFromStorage();
        setChats(data.chats);
        if (data.currentChatId && data.chats.find(c => c.id === data.currentChatId)) {
            setCurrentChatId(data.currentChatId);
            const chat = data.chats.find(c => c.id === data.currentChatId);
            setCurrentMessages(chat?.messages || []);
        }
    }, []);

    // Save to storage on change
    useEffect(() => {
        saveToStorage({ chats, currentChatId });
    }, [chats, currentChatId]);

    // Create new chat
    const createNewChat = useCallback(() => {
        const newChat = {
            id: generateId(),
            title: 'New Chat',
            createdAt: new Date().toISOString(),
            messages: []
        };
        setChats(prev => [newChat, ...prev]);
        setCurrentChatId(newChat.id);
        setCurrentMessages([]);
        return newChat.id;
    }, []);

    // Select chat
    const selectChat = useCallback((chatId) => {
        setCurrentChatId(chatId);
        const chat = chats.find(c => c.id === chatId);
        setCurrentMessages(chat?.messages || []);
    }, [chats]);

    // Delete chat
    const deleteChat = useCallback((chatId) => {
        setChats(prev => prev.filter(c => c.id !== chatId));
        if (currentChatId === chatId) {
            setCurrentChatId(null);
            setCurrentMessages([]);
        }
    }, [currentChatId]);

    // Update current chat messages
    const updateCurrentMessages = useCallback((updater) => {
        setCurrentMessages(prev => {
            const newMessages = typeof updater === 'function' ? updater(prev) : updater;
            // Also update in chats array
            setChats(chats => chats.map(chat => {
                if (chat.id === currentChatId) {
                    // Update title from first user message
                    const firstUserMsg = newMessages.find(m => m.role === 'user');
                    const title = firstUserMsg
                        ? firstUserMsg.content.slice(0, 40) + (firstUserMsg.content.length > 40 ? '...' : '')
                        : chat.title;
                    return { ...chat, messages: newMessages, title };
                }
                return chat;
            }));
            return newMessages;
        });
    }, [currentChatId]);

    // Clear current chat
    const clearCurrentChat = useCallback(() => {
        setCurrentMessages([]);
        setChats(prev => prev.map(chat => {
            if (chat.id === currentChatId) {
                return { ...chat, messages: [], title: 'New Chat' };
            }
            return chat;
        }));
    }, [currentChatId]);

    // Export chat
    const exportCurrentChat = useCallback(() => {
        const chatData = {
            messages: currentMessages,
            model,
            temperature,
            exportedAt: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `chat-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [currentMessages, model, temperature]);

    const value = {
        chats,
        currentChatId,
        currentMessages,
        isLoading,
        setIsLoading,
        streamingContent,
        setStreamingContent,
        model,
        setModel,
        temperature,
        setTemperature,
        environment,
        setEnvironment,
        queryLastResponse,
        setQueryLastResponse,
        createNewChat,
        selectChat,
        deleteChat,
        updateCurrentMessages,
        clearCurrentChat,
        exportCurrentChat
    };

    return (
        <ChatContext.Provider value={value}>
            {children}
        </ChatContext.Provider>
    );
}

export function useChat() {
    const context = useContext(ChatContext);
    if (!context) {
        throw new Error('useChat must be used within a ChatProvider');
    }
    return context;
}
