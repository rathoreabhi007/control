import React, { useState, useEffect, useRef, useMemo } from 'react';
import { FaCheck } from 'react-icons/fa';

const MultiSelectFilter = ({ label, options, selected = [], onChange, placeholder }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef(null);

    const filteredOptions = useMemo(() => {
        if (!search) return options;
        return options.filter(opt =>
            opt.toLowerCase().includes(search.toLowerCase())
        );
    }, [options, search]);

    const selectedLabel = useMemo(() => {
        if (selected.length === 0) return placeholder;
        if (selected.length <= 2) return selected.join(', ');
        return `${selected.slice(0, 2).join(', ')} +${selected.length - 2}`;
    }, [selected, placeholder]);

    useEffect(() => {
        const handleOutsideClick = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, []);

    const toggleOption = (option) => {
        if (selected.includes(option)) {
            onChange(selected.filter(s => s !== option));
        } else {
            onChange([...selected, option]);
        }
    };

    const selectAll = () => onChange([...options]);
    const clearAll = () => onChange([]);

    return (
        <div className="mb-3 supervisory-filter" ref={containerRef}>
            <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-700 supervisory-filter-label">{label}</label>
            </div>
            <div className="relative">
                <div
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded bg-white cursor-pointer flex items-center justify-between text-xs supervisory-filter-trigger"
                >
                    <span className={selected.length === 0 ? 'text-gray-400 supervisory-filter-value-empty' : 'text-gray-700 truncate pr-2 supervisory-filter-value'}>
                        {selectedLabel}
                    </span>
                    <span className="flex items-center gap-1.5">
                        {selected.length > 0 && (
                            <span className="supervisory-filter-trigger-badge">{selected.length}</span>
                        )}
                        <svg className={`w-3 h-3 transition-transform supervisory-filter-caret ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </span>
                </div>

                {isOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-48 overflow-hidden supervisory-filter-menu">
                        <div className="p-1.5 border-b supervisory-filter-search-wrap">
                            <input
                                type="text"
                                placeholder="Search..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full px-2 py-1 text-xs border border-gray-200 rounded supervisory-filter-search"
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                        <div className="flex items-center justify-between gap-2 px-2 py-1 border-b bg-gray-50 supervisory-filter-actions">
                            <div className="text-[11px] supervisory-filter-meta">{filteredOptions.length} results</div>
                            <div className="flex items-center gap-2">
                                <button onClick={(e) => { e.stopPropagation(); selectAll(); }} className="text-xs text-blue-600 hover:underline supervisory-filter-action">All</button>
                                <button onClick={(e) => { e.stopPropagation(); clearAll(); }} className="text-xs text-red-600 hover:underline supervisory-filter-action">Clear</button>
                            </div>
                        </div>
                        <div className="max-h-32 overflow-y-auto supervisory-filter-options">
                            {filteredOptions.length === 0 && (
                                <div className="px-2 py-3 text-xs supervisory-filter-empty">No matches found</div>
                            )}
                            {filteredOptions.map(option => {
                                const isSelected = selected.includes(option);
                                return (
                                    <div
                                        key={option}
                                        onClick={(e) => { e.stopPropagation(); toggleOption(option); }}
                                        className={`px-2 py-1.5 hover:bg-gray-100 cursor-pointer flex items-center gap-2 text-xs supervisory-filter-option ${isSelected ? 'supervisory-filter-option-selected' : ''}`}
                                    >
                                        <div className={`w-3 h-3 border rounded flex items-center justify-center ${isSelected ? 'bg-blue-500 border-blue-500 supervisory-filter-checkbox-selected' : 'border-gray-300 supervisory-filter-checkbox'
                                            }`}>
                                            {isSelected && <FaCheck className="text-white" style={{ fontSize: '8px' }} />}
                                        </div>
                                        <span className="supervisory-filter-option-text">{option}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MultiSelectFilter;
