import React from 'react';
import { FaGripVertical, FaTimes } from 'react-icons/fa';

const DraggableChip = ({ column, onRemove, isDragging }) => (
    <div
        draggable
        onDragStart={(e) => {
            e.dataTransfer.setData('columnId', column.id);
            e.dataTransfer.effectAllowed = 'move';
        }}
        className={`inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs cursor-move transition-opacity ${isDragging ? 'opacity-50' : ''
            }`}
    >
        <FaGripVertical className="text-blue-400" style={{ fontSize: '10px' }} />
        <span>{column.label}</span>
        {onRemove && (
            <FaTimes
                className="cursor-pointer hover:text-blue-900 ml-1"
                style={{ fontSize: '10px' }}
                onClick={(e) => { e.stopPropagation(); onRemove(column.id); }}
            />
        )}
    </div>
);

export default DraggableChip;
