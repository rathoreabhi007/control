import { useEffect, useState, useCallback } from 'react';

/**
 * Safe container control hook that avoids ResizeObserver and DOM queries
 * Uses CSS custom properties and simple window resize events only
 */
export const useSafeContainerControl = (options = {}) => {
    const {
        minHeight = 300,
        maxHeight = 800,
        defaultHeight = 600,
        reservedSpace = 100
    } = options;

    const [containerHeight, setContainerHeight] = useState(defaultHeight);
    const [isInitialized, setIsInitialized] = useState(false);

    // Simple window resize handler (no DOM queries)
    const handleResize = useCallback(() => {
        const windowHeight = window.innerHeight;
        const calculatedHeight = Math.max(
            minHeight,
            Math.min(maxHeight, windowHeight - reservedSpace)
        );
        
        setContainerHeight(calculatedHeight);
    }, [minHeight, maxHeight, reservedSpace]);

    useEffect(() => {
        // Initial calculation
        handleResize();
        setIsInitialized(true);

        // Simple window resize listener (no observers)
        window.addEventListener('resize', handleResize);
        
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, [handleResize]);

    return {
        containerHeight,
        isInitialized,
        recalculate: handleResize
    };
};

/**
 * CSS-based container height control using CSS custom properties
 * This approach is completely safe for production environments
 */
export const useCSSContainerControl = (height = 600) => {
    useEffect(() => {
        // Set CSS custom property for container height
        document.documentElement.style.setProperty('--container-height', `${height}px`);
        
        return () => {
            // Cleanup: remove custom property
            document.documentElement.style.removeProperty('--container-height');
        };
    }, [height]);

    return { containerHeight: height };
};
