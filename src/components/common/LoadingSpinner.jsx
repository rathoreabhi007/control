import React from 'react';

/**
 * Loading Spinner Component
 * Reusable loading indicator with customizable size and color
 */
const LoadingSpinner = ({
    size = 'md',
    color = 'white',
    className = '',
    text = '',
    showText = false
}) => {
    const sizeClasses = {
        xs: 'h-3 w-3',
        sm: 'h-4 w-4',
        md: 'h-6 w-6',
        lg: 'h-8 w-8',
        xl: 'h-12 w-12'
    };

    const colorClasses = {
        white: 'border-white',
        blue: 'border-blue-500',
        green: 'border-green-500',
        red: 'border-red-500',
        yellow: 'border-yellow-500',
        gray: 'border-gray-500'
    };

    return (
        <div className={`flex items-center justify-center ${className}`}>
            <div className="flex items-center gap-2">
                <div
                    className={`animate-spin rounded-full border-2 border-t-transparent ${sizeClasses[size]} ${colorClasses[color]}`}
                />
                {showText && text && (
                    <span className="text-sm text-gray-600">{text}</span>
                )}
            </div>
        </div>
    );
};

export default LoadingSpinner;

