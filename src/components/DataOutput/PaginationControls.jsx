import React, { memo, useCallback } from 'react';
import { useDataOutput } from '../../contexts/DataOutputContext';

/**
 * Pagination Controls Component
 * Handles pagination with optimized performance and user-friendly interface
 */
const PaginationControls = memo(() => {
    const { state, computed, actions, onPageChange, onPageSizeChange } = useDataOutput();

    const { pagination } = state;
    const { totalRows, totalPages, startIndex, endIndex, isSearchResults, searchQuery } = computed;

    // Page size options
    const pageSizeOptions = [50, 100, 250, 500, 1000];

    // Handle page navigation
    const goToPage = useCallback((page) => {
        if (page >= 1 && page <= totalPages) {
            actions.setCurrentPage(page);
            if (onPageChange) {
                onPageChange(page);
            }
        }
    }, [totalPages, actions, onPageChange]);

    // Handle page size change
    const handlePageSizeChange = useCallback((newSize) => {
        actions.setPageSize(newSize);
        actions.setCustomPageSize(newSize.toString());
        actions.toggleCustomInput(false);
        if (onPageSizeChange) {
            onPageSizeChange(newSize);
        }
    }, [actions, onPageSizeChange]);

    // Handle custom page size submit
    const handleCustomPageSizeSubmit = useCallback(() => {
        const size = parseInt(pagination.customPageSize);
        if (size && size > 0 && size <= totalRows) {
            actions.setPageSize(size);
            actions.toggleCustomInput(false);
            if (onPageSizeChange) {
                onPageSizeChange(size);
            }
        }
    }, [pagination.customPageSize, totalRows, actions, onPageSizeChange]);

    // Generate page numbers for pagination
    const getPageNumbers = useCallback(() => {
        const pages = [];
        const maxVisiblePages = 7;

        if (totalPages <= maxVisiblePages) {
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i);
            }
        } else {
            if (pagination.currentPage <= 4) {
                for (let i = 1; i <= 5; i++) pages.push(i);
                pages.push('...');
                pages.push(totalPages);
            } else if (pagination.currentPage >= totalPages - 3) {
                pages.push(1);
                pages.push('...');
                for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
            } else {
                pages.push(1);
                pages.push('...');
                for (let i = pagination.currentPage - 1; i <= pagination.currentPage + 1; i++) pages.push(i);
                pages.push('...');
                pages.push(totalPages);
            }
        }
        return pages;
    }, [totalPages, pagination.currentPage]);

    return (
        <div className="pagination-controls">
            <div className="pagination-content">
                {/* Left side - Row info and page size controls */}
                <div className="pagination-left">
                    <span className="pagination-info">
                        {isSearchResults ? (
                            <>Showing {totalRows} search results for "{searchQuery}"</>
                        ) : (
                            <>Showing {startIndex + 1} to {endIndex} of {totalRows} entries</>
                        )}
                    </span>

                    {!isSearchResults && (
                        <div className="page-size-controls">
                            <span className="page-size-label">Show:</span>

                            {/* Quick page size buttons */}
                            {pageSizeOptions.map(size => (
                                <button
                                    key={size}
                                    onClick={() => handlePageSizeChange(size)}
                                    className={`page-size-button ${pagination.pageSize === size ? 'page-size-button-active' : ''}`}
                                >
                                    {size}
                                </button>
                            ))}

                            {/* Custom page size input */}
                            {!pagination.showCustomInput ? (
                                <button
                                    onClick={() => actions.toggleCustomInput(true)}
                                    className="page-size-button page-size-button-custom"
                                >
                                    Custom
                                </button>
                            ) : (
                                <div className="custom-page-size-input">
                                    <input
                                        type="number"
                                        value={pagination.customPageSize}
                                        onChange={(e) => actions.setCustomPageSize(e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && handleCustomPageSizeSubmit()}
                                        className="custom-page-size-field"
                                        min="1"
                                        max={totalRows}
                                        placeholder="Any #"
                                    />
                                    <button
                                        onClick={handleCustomPageSizeSubmit}
                                        className="custom-page-size-submit"
                                    >
                                        Set
                                    </button>
                                    <button
                                        onClick={() => actions.toggleCustomInput(false)}
                                        className="custom-page-size-cancel"
                                    >
                                        ✕
                                    </button>
                                </div>
                            )}

                            <span className="page-size-label">rows</span>
                        </div>
                    )}
                </div>

                {/* Right side - Page navigation */}
                {!isSearchResults && (
                    <div className="pagination-right">
                        <button
                            onClick={() => goToPage(pagination.currentPage - 1)}
                            disabled={pagination.currentPage === 1}
                            className={`pagination-button ${pagination.currentPage === 1 ? 'pagination-button-disabled' : ''}`}
                        >
                            Previous
                        </button>

                        {getPageNumbers().map((page, index) => (
                            <React.Fragment key={index}>
                                {page === '...' ? (
                                    <span className="pagination-ellipsis">...</span>
                                ) : (
                                    <button
                                        onClick={() => goToPage(page)}
                                        className={`pagination-button ${pagination.currentPage === page ? 'pagination-button-active' : ''}`}
                                    >
                                        {page}
                                    </button>
                                )}
                            </React.Fragment>
                        ))}

                        <button
                            onClick={() => goToPage(pagination.currentPage + 1)}
                            disabled={pagination.currentPage === totalPages}
                            className={`pagination-button ${pagination.currentPage === totalPages ? 'pagination-button-disabled' : ''}`}
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>

            {/* Status info */}
            <div className="pagination-status">
                {isSearchResults ? (
                    <>
                        <span>Search Results Mode</span>
                        <span>Query: "{searchQuery}"</span>
                        <span>Total: {totalRows} matches</span>
                    </>
                ) : (
                    <>
                        <span>Page {pagination.currentPage} of {totalPages}</span>
                        <span>Showing {pagination.pageSize} rows per page</span>
                        <span>Total: {totalRows} rows</span>
                    </>
                )}
            </div>
        </div>
    );
});

PaginationControls.displayName = 'PaginationControls';

export default PaginationControls;

