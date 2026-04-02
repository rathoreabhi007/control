/**
 * Formats a date string into a localized string.
 * @param {string} dateStr - The date string to format.
 * @returns {string} - Formatted date string or 'N/A'.
 */
export const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

/**
 * Formats the duration between two dates.
 * @param {string} startTime - The start time string.
 * @param {string} endTime - The end time string.
 * @returns {string} - Formatted duration string or 'N/A'.
 */
export const formatDuration = (startTime, endTime) => {
    if (!startTime) return 'N/A';
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const duration = Math.floor((end - start) / 1000);

    if (duration < 60) return `${duration}s`;
    if (duration < 3600) return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
};
