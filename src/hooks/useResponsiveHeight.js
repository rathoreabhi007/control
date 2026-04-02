import { useState, useEffect } from 'react';

/**
 * Custom hook for responsive height management
 * Calculates optimal heights based on viewport size and content
 */
export const useResponsiveHeight = (bottomBarHeight = 600) => {
    const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
    const [viewportWidth, setViewportWidth] = useState(window.innerWidth);

    useEffect(() => {
        const handleResize = () => {
            setViewportHeight(window.innerHeight);
            setViewportWidth(window.innerWidth);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Calculate optimal heights based on viewport
    const calculateHeights = () => {
        const isMobile = viewportWidth <= 768;
        const isTablet = viewportWidth <= 1024;

        // Reserve space for all UI elements
        const overviewHeight = isMobile ? 60 : 50;  // Data overview section
        const controlsHeight = isMobile ? 80 : 60;  // Data controls section
        const paginationHeight = isMobile ? 120 : 100;  // Pagination controls
        const gapSpace = isMobile ? 48 : 48;  // Total gap between sections (16px * 3)

        const totalReservedSpace = overviewHeight + controlsHeight + paginationHeight + gapSpace;

        // Calculate available height for grid
        const availableHeight = Math.max(300, viewportHeight - totalReservedSpace - 100); // -100 for container padding/margins

        return {
            containerHeight: viewportHeight,
            gridHeight: availableHeight,
            isMobile,
            isTablet
        };
    };

    return calculateHeights();
};
