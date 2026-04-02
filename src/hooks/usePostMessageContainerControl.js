import { useEffect, useState, useCallback } from 'react';

/**
 * PostMessage-based container control for iframe/embedded scenarios
 * Completely safe for production and nginx environments
 */
export const usePostMessageContainerControl = () => {
    const [containerConfig, setContainerConfig] = useState({
        height: 600,
        width: '100%',
        minHeight: 300,
        maxHeight: 800,
        isEmbedded: false
    });

    // Handle incoming messages from parent window
    const handleMessage = useCallback((event) => {
        // Security: Only accept messages from same origin or trusted domains
        const trustedOrigins = [
            window.location.origin,
            // Add your FastAPI domain here if different
            // 'https://your-fastapi-domain.com'
        ];

        if (!trustedOrigins.includes(event.origin)) {
            console.warn('Untrusted message origin:', event.origin);
            return;
        }

        const { type, data } = event.data;

        if (type === 'CONTAINER_RESIZE') {
            const { height, width, minHeight, maxHeight } = data;
            
            setContainerConfig(prev => ({
                ...prev,
                height: height || prev.height,
                width: width || prev.width,
                minHeight: minHeight || prev.minHeight,
                maxHeight: maxHeight || prev.maxHeight,
                isEmbedded: true
            }));
        }
    }, []);

    // Send container info to parent window
    const sendContainerInfo = useCallback(() => {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'CONTAINER_INFO',
                data: {
                    height: containerConfig.height,
                    width: containerConfig.width,
                    isReady: true
                }
            }, '*');
        }
    }, [containerConfig]);

    useEffect(() => {
        // Listen for messages
        window.addEventListener('message', handleMessage);
        
        // Send initial info
        sendContainerInfo();

        // Check if we're in an iframe
        const isEmbedded = window.parent !== window;
        if (isEmbedded) {
            setContainerConfig(prev => ({ ...prev, isEmbedded: true }));
        }

        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [handleMessage, sendContainerInfo]);

    // Method to request resize from parent
    const requestResize = useCallback((newHeight) => {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'REQUEST_RESIZE',
                data: { height: newHeight }
            }, '*');
        }
    }, []);

    return {
        ...containerConfig,
        requestResize,
        sendContainerInfo
    };
};
