import { useEffect, useState, useCallback } from 'react';

/**
 * URL-based container control - completely safe for production
 * Uses URL parameters to control container dimensions
 */
export const useURLContainerControl = () => {
    const [containerConfig, setContainerConfig] = useState({
        height: 600,
        width: '100%',
        minHeight: 300,
        maxHeight: 800
    });

    // Parse URL parameters for container control
    const parseURLParams = useCallback(() => {
        const urlParams = new URLSearchParams(window.location.search);
        
        const height = parseInt(urlParams.get('height')) || 600;
        const width = urlParams.get('width') || '100%';
        const minHeight = parseInt(urlParams.get('minHeight')) || 300;
        const maxHeight = parseInt(urlParams.get('maxHeight')) || 800;

        return {
            height: Math.max(minHeight, Math.min(maxHeight, height)),
            width,
            minHeight,
            maxHeight
        };
    }, []);

    // Update container config from URL
    const updateFromURL = useCallback(() => {
        const config = parseURLParams();
        setContainerConfig(config);
    }, [parseURLParams]);

    useEffect(() => {
        // Initial load
        updateFromURL();

        // Listen for URL changes (for SPA navigation)
        const handlePopState = () => {
            updateFromURL();
        };

        window.addEventListener('popstate', handlePopState);
        
        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, [updateFromURL]);

    // Method to update URL parameters (for external control)
    const updateContainerConfig = useCallback((newConfig) => {
        const url = new URL(window.location);
        
        if (newConfig.height) url.searchParams.set('height', newConfig.height);
        if (newConfig.width) url.searchParams.set('width', newConfig.width);
        if (newConfig.minHeight) url.searchParams.set('minHeight', newConfig.minHeight);
        if (newConfig.maxHeight) url.searchParams.set('maxHeight', newConfig.maxHeight);

        window.history.replaceState({}, '', url);
        updateFromURL();
    }, [updateFromURL]);

    return {
        ...containerConfig,
        updateContainerConfig,
        refresh: updateFromURL
    };
};
