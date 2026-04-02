import React from 'react';
import { FaTimesCircle } from 'react-icons/fa';

/**
 * Failed Node Indicator Component
 * Displays a "Fail" indicator and "View Error" button for failed nodes
 * This is a separate component to avoid affecting existing functionality
 */
const FailedNodeIndicator = ({
    nodeId,
    nodeData,
    nodeOutputs
}) => {
    // Only render if node status is failed
    if (nodeData.status !== 'failed') {
        return null;
    }

    // Removed handleViewError function - failures handled silently

    return (
        <div className="mt-1 px-2 py-1 bg-red-100 border border-red-300 rounded text-[8px] text-red-700 font-medium">
            <div className="flex items-center justify-center gap-1">
                <FaTimesCircle className="w-2 h-2" />
                <span>Fail</span>
            </div>
            {/* Removed View Error button - failures handled silently */}
        </div>
    );
};

export default FailedNodeIndicator;

