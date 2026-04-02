import React, { useState } from 'react';
import DraggableChip from './DraggableChip';

const ColumnDropZone = ({ selectedColumns, availableColumns, onColumnsChange }) => {
    const [dragOver, setDragOver] = useState(false);

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOver(true);
    };

    const handleDragLeave = () => setDragOver(false);

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const columnId = e.dataTransfer.getData('columnId');
        if (columnId && !selectedColumns.find(c => c.id === columnId)) {
            const column = availableColumns.find(c => c.id === columnId);
            if (column) {
                onColumnsChange([...selectedColumns, column]);
            }
        }
    };

    const removeColumn = (columnId) => {
        onColumnsChange(selectedColumns.filter(c => c.id !== columnId));
    };

    const unusedColumns = availableColumns.filter(c => !selectedColumns.find(s => s.id === c.id));

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 mb-4">
            <div className="flex items-start gap-4">
                {/* Drop zone for selected columns */}
                <div className="flex-1">
                    <div className="text-xs font-medium text-gray-600 mb-2">Group By (drag to reorder)</div>
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`min-h-[36px] p-2 border-2 border-dashed rounded flex flex-wrap gap-2 transition-colors ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50'
                            }`}
                    >
                        {selectedColumns.length === 0 ? (
                            <span className="text-xs text-gray-400">Drop columns here to group data...</span>
                        ) : (
                            selectedColumns.map(col => (
                                <DraggableChip key={col.id} column={col} onRemove={removeColumn} />
                            ))
                        )}
                    </div>
                </div>

                {/* Available columns */}
                <div className="w-64">
                    <div className="text-xs font-medium text-gray-600 mb-2">Available Columns</div>
                    <div className="flex flex-wrap gap-2">
                        {unusedColumns.map(col => (
                            <DraggableChip key={col.id} column={col} />
                        ))}
                        {unusedColumns.length === 0 && (
                            <span className="text-xs text-gray-400">All columns in use</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ColumnDropZone;
