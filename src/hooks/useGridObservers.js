import { useEffect, useRef } from 'react';

/**
 * Custom hook for managing grid observers
 * Handles resize and mutation observers with proper cleanup
 */
export const useGridObservers = (containerRef, actions) => {
    const observersRef = useRef([]);
    const lastHeightRef = useRef(null);
    const frameRef = useRef(null);

    useEffect(() => {
        if (!containerRef.current) return;

        const observers = [];

        // ResizeObserver for container size changes
        if (window.ResizeObserver) {
            const resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    const { width, height } = entry.contentRect;

                    // Batch updates outside observer callback and skip no-op updates.
                    // This avoids ResizeObserver feedback loops in React render cycles.
                    const nextHeight = Math.round(height);
                    if (nextHeight > 0 && lastHeightRef.current !== nextHeight) {
                        lastHeightRef.current = nextHeight;
                        if (frameRef.current) {
                            cancelAnimationFrame(frameRef.current);
                        }
                        frameRef.current = requestAnimationFrame(() => {
                            actions.setTableHeight(nextHeight);
                        });
                    }

                    // Trigger column resize if needed
                    if (width > 0) {
                        // Debounce resize handling
                        clearTimeout(resizeObserver.timeout);
                        resizeObserver.timeout = setTimeout(() => {
                            // Handle column resizing logic here
                            // This will be implemented in the grid component
                        }, 100);
                    }
                }
            });

            resizeObserver.observe(containerRef.current);
            observers.push(resizeObserver);
        }

        // MutationObserver for parent container changes
        if (containerRef.current.parentElement) {
            const mutationObserver = new MutationObserver((mutations) => {
                let shouldResize = false;

                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' &&
                        (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
                        shouldResize = true;
                    }
                });

                if (shouldResize) {
                    // Debounce mutation handling
                    clearTimeout(mutationObserver.timeout);
                    mutationObserver.timeout = setTimeout(() => {
                        // Handle resize logic here
                    }, 200);
                }
            });

            mutationObserver.observe(containerRef.current.parentElement, {
                attributes: true,
                attributeFilter: ['style', 'class'],
                childList: false,
                subtree: false
            });

            observers.push(mutationObserver);
        }

        // Store observers for cleanup
        observersRef.current = observers;

        // Cleanup function
        return () => {
            if (frameRef.current) {
                cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
            observers.forEach(observer => {
                if (observer.disconnect) {
                    observer.disconnect();
                }
                if (observer.timeout) {
                    clearTimeout(observer.timeout);
                }
            });
            observersRef.current = [];
        };
    }, [containerRef, actions]);

    return observersRef.current;
};

