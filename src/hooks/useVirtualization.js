import { useState, useCallback, useMemo } from 'react';

/**
 * Custom hook for implementing virtual scrolling
 * Only renders visible rows to improve performance with large datasets
 */
export const useVirtualization = (totalRows, rowHeight, bufferSize = 50) => {
    const [scrollTop, setScrollTop] = useState(0);

    // Calculate visible range
    const visibleRange = useMemo(() => {
        const start = Math.floor(scrollTop / rowHeight);
        const visibleCount = Math.ceil(window.innerHeight / rowHeight);
        const end = Math.min(start + visibleCount + bufferSize, totalRows);

        return {
            start: Math.max(0, start - bufferSize),
            end: end
        };
    }, [scrollTop, rowHeight, totalRows, bufferSize]);

    // Calculate total height
    const totalHeight = useMemo(() => {
        return totalRows * rowHeight;
    }, [totalRows, rowHeight]);

    // Handle scroll events
    const handleScroll = useCallback((event) => {
        setScrollTop(event.target.scrollTop);

        // Synchronize header scroll with body scroll (header follows body)
        const headerRow = event.target.parentElement?.querySelector('.grid-header-row');
        if (headerRow) {
            headerRow.style.transform = `translateX(-${event.target.scrollLeft}px)`;
        }
    }, []);

    // Get row style for positioning
    const getRowStyle = useCallback((rowIndex) => {
        return {
            position: 'absolute',
            top: `${rowIndex * rowHeight}px`,
            height: `${rowHeight}px`,
            width: '100%'
        };
    }, [rowHeight]);

    return {
        visibleRange,
        totalHeight,
        handleScroll,
        getRowStyle,
        scrollTop
    };
};
