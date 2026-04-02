import React, { useEffect } from 'react';

/**
 * Component to fix overflow issues caused by FastAPI template
 * This component overrides the body overflow:hidden from the FastAPI blueprint
 */
const OverflowFix = ({ children }) => {
    useEffect(() => {
        // Store original styles
        const originalOverflow = document.body.style.overflow;
        const originalOverflowX = document.body.style.overflowX;
        const originalOverflowY = document.body.style.overflowY;
        
        // Override with auto to allow scrolling
        document.body.style.overflow = 'auto';
        document.body.style.overflowX = 'auto';
        document.body.style.overflowY = 'auto';
        
        // Also ensure the root div can handle overflow
        const rootDiv = document.getElementById('root');
        if (rootDiv) {
            rootDiv.style.overflow = 'auto';
            rootDiv.style.height = '100vh';
        }
        
        // Cleanup function to restore original styles
        return () => {
            document.body.style.overflow = originalOverflow;
            document.body.style.overflowX = originalOverflowX;
            document.body.style.overflowY = originalOverflowY;
        };
    }, []);

    return <>{children}</>;
};

export default OverflowFix;
