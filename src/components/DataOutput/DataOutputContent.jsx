import React, { memo } from 'react';
import { useExport } from '../../hooks/useExport';
import DataControls from './DataControls';
import OptimizedDataGrid from './OptimizedDataGrid';
import PaginationControls from './PaginationControls';

/**
 * Data Output Content Component
 * Wrapper component for data output functionality
 */
const DataOutputContent = memo(({ height }) => {
    // Get export functionality (now inside DataOutputProvider context)
    // Note: These are used by DataControls component
    useExport();



    return (
        <div
            className="data-output-container"
            style={{ height: height }}
        >
            {/* Controls Section */}
            <DataControls />

            {/* Main Data Grid */}
            <div className="data-grid-wrapper">
                <OptimizedDataGrid />
            </div>

            {/* Pagination Controls */}
            <PaginationControls />
        </div>
    );
});

DataOutputContent.displayName = 'DataOutputContent';

export default DataOutputContent;
