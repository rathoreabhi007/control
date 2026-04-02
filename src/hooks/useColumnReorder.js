import { useState, useCallback } from 'react';
import { useDataOutput } from '../contexts/DataOutputContext';

/**
 * Custom hook for column reordering functionality
 * Handles drag and drop operations for column reordering
 */
export const useColumnReorder = () => {
    const { actions, computed } = useDataOutput();
    const { visibleColumnsList } = computed;

    // Drag and drop state
    const [draggedColumn, setDraggedColumn] = useState(null);
    const [dragOverColumn, setDragOverColumn] = useState(null);
    const [isDragging, setIsDragging] = useState(false);

    // Start drag operation
    const handleDragStart = useCallback((column, event) => {
        // Don't prevent default for drag start
        event.stopPropagation();

        setDraggedColumn(column);
        setIsDragging(true);

        // Set drag image
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', column);
            event.dataTransfer.setData('application/json', JSON.stringify({ column }));
        }

        // Add dragging class to body
        document.body.classList.add('column-dragging');
    }, []);

    // Handle drag over
    const handleDragOver = useCallback((column, event) => {
        event.preventDefault();
        event.stopPropagation();

        if (draggedColumn && draggedColumn !== column) {
            setDragOverColumn(column);
            event.dataTransfer.dropEffect = 'move';
        }
    }, [draggedColumn]);

    // Handle drag enter
    const handleDragEnter = useCallback((column, event) => {
        event.preventDefault();
        event.stopPropagation();

        if (draggedColumn && draggedColumn !== column) {
            setDragOverColumn(column);
        }
    }, [draggedColumn]);

    // Handle drag leave
    const handleDragLeave = useCallback((event) => {
        event.preventDefault();
        event.stopPropagation();

        // Only clear if we're not dragging over a child element
        if (!event.currentTarget.contains(event.relatedTarget)) {
            setDragOverColumn(null);
        }
    }, []);

    // Handle drop
    const handleDrop = useCallback((targetColumn, event) => {
        event.preventDefault();
        event.stopPropagation();

        if (draggedColumn && draggedColumn !== targetColumn) {
            // Create new column order
            const newOrder = [...visibleColumnsList];
            const draggedIndex = newOrder.indexOf(draggedColumn);
            const targetIndex = newOrder.indexOf(targetColumn);

            // Remove dragged column from its current position
            newOrder.splice(draggedIndex, 1);

            // Insert dragged column at target position
            newOrder.splice(targetIndex, 0, draggedColumn);

            // Update column order
            actions.setColumnOrder(newOrder);
        }

        // Reset drag state
        setDraggedColumn(null);
        setDragOverColumn(null);
        setIsDragging(false);
        document.body.classList.remove('column-dragging');
    }, [draggedColumn, visibleColumnsList, actions]);

    // Handle drag end
    const handleDragEnd = useCallback((event) => {
        event.preventDefault();
        event.stopPropagation();

        // Reset drag state
        setDraggedColumn(null);
        setDragOverColumn(null);
        setIsDragging(false);
        document.body.classList.remove('column-dragging');
    }, []);

    // Reset column order to original
    const resetColumnOrder = useCallback(() => {
        actions.resetColumnOrder();
    }, [actions]);

    // Get drag classes for column header
    const getDragClasses = useCallback((column) => {
        const classes = ['column-header-draggable'];

        if (draggedColumn === column) {
            classes.push('column-header-dragging');
        }

        if (dragOverColumn === column) {
            classes.push('column-header-drag-over');
        }

        return classes.join(' ');
    }, [draggedColumn, dragOverColumn]);

    return {
        // State
        isDragging,
        draggedColumn,
        dragOverColumn,

        // Event handlers
        handleDragStart,
        handleDragOver,
        handleDragEnter,
        handleDragLeave,
        handleDrop,
        handleDragEnd,

        // Utilities
        getDragClasses,
        resetColumnOrder
    };
};
