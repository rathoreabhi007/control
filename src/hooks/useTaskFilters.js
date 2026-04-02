import { useState, useCallback } from 'react';

export const useTaskFilters = () => {
    const [filters, setFilters] = useState({
        search: ''
    });

    // Update search term
    const setSearchTerm = useCallback((search) => {
        setFilters(prev => ({ ...prev, search }));
    }, []);

    // Clear all filters
    const clearFilters = useCallback(() => {
        setFilters({
            search: ''
        });
    }, []);

    return {
        filters,
        setSearchTerm,
        clearFilters
    };
};
