import React, { createContext, useContext, useState, useCallback } from 'react';

const ColumnResizeContext = createContext();

export const useColumnResize = () => {
    const context = useContext(ColumnResizeContext);
    if (!context) {
        throw new Error('useColumnResize must be used within a ColumnResizeProvider');
    }
    return context;
};

export const ColumnResizeProvider = ({ children }) => {
    const [customColumnWidths, setCustomColumnWidths] = useState({});

    const updateColumnWidth = useCallback((column, width) => {
        setCustomColumnWidths(prev => ({
            ...prev,
            [column]: width
        }));
    }, []);

    const resetColumnWidths = useCallback(() => {
        setCustomColumnWidths({});
    }, []);

    const value = {
        customColumnWidths,
        updateColumnWidth,
        resetColumnWidths
    };

    return (
        <ColumnResizeContext.Provider value={value}>
            {children}
        </ColumnResizeContext.Provider>
    );
};

