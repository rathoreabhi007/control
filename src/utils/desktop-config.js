// Desktop-specific configuration for the HSBC Generic Control Dashboard

export const DESKTOP_CONFIG = {
    // Minimum screen requirements
    MIN_SCREEN_WIDTH: 1024,
    MIN_SCREEN_HEIGHT: 768,

    // Layout dimensions
    SIDEBAR: {
        MIN_WIDTH: 64,
        MAX_WIDTH: 600,
        DEFAULT_WIDTH: 400,
        COLLAPSED_WIDTH: 64
    },

    BOTTOM_BAR: {
        MIN_HEIGHT: 300,
        MAX_HEIGHT_PERCENT: 0.8, // 80% of viewport height
        DEFAULT_HEIGHT_PERCENT: 0.5 // 50% of viewport height
    },

    HEADER: {
        HEIGHT: 80,
        LOGO_SIZE: 64,
        TITLE_SIZE: 'text-2xl'
    },

    // Data grid settings
    DATA_GRID: {
        DEFAULT_HEIGHT: 800,
        DEFAULT_PAGE_SIZE: 200,
        DEFAULT_COLUMN_WIDTH: 180,
        HEADER_HEIGHT: 50,
        ROW_HEIGHT: 40,
        FONT_SIZE: 14
    },

    // Workflow node settings
    WORKFLOW: {
        NODE_SIZE: 68,
        NODE_SPACING: 200,
        EDGE_THICKNESS: 2,
        MIN_ZOOM: 0.5,
        MAX_ZOOM: 2
    },

    // Form and input settings
    FORMS: {
        INPUT_HEIGHT: 40,
        BUTTON_HEIGHT: 44,
        FONT_SIZE: 14,
        PADDING: 16
    },

    // Spacing and padding
    SPACING: {
        SMALL: 8,
        MEDIUM: 16,
        LARGE: 24,
        XLARGE: 32
    },

    // Colors (HSBC brand)
    COLORS: {
        PRIMARY: '#db0011', // HSBC Red
        SECONDARY: '#1e293b', // Slate
        SUCCESS: '#22c55e',
        WARNING: '#facc15',
        ERROR: '#ef4444',
        INFO: '#3b82f6',
        BACKGROUND: '#f5f5f5',
        SURFACE: '#ffffff'
    }
};

// Desktop-specific utility functions
export const desktopUtils = {
    // Check if current screen meets desktop requirements
    isDesktopScreen: () => {
        if (typeof window === 'undefined') return true;
        return window.innerWidth >= DESKTOP_CONFIG.MIN_SCREEN_WIDTH &&
            window.innerHeight >= DESKTOP_CONFIG.MIN_SCREEN_HEIGHT;
    },

    // Get optimal dimensions based on screen size
    getOptimalDimensions: () => {
        if (typeof window === 'undefined') return DESKTOP_CONFIG;

        const { innerWidth, innerHeight } = window;
        const aspectRatio = innerWidth / innerHeight;

        return {
            ...DESKTOP_CONFIG,
            SIDEBAR: {
                ...DESKTOP_CONFIG.SIDEBAR,
                DEFAULT_WIDTH: Math.min(400, innerWidth * 0.25)
            },
            BOTTOM_BAR: {
                ...DESKTOP_CONFIG.BOTTOM_BAR,
                DEFAULT_HEIGHT: Math.min(innerHeight * 0.5, 600)
            }
        };
    },

    // Calculate responsive font sizes for desktop
    getFontSizes: () => {
        if (typeof window === 'undefined') return { base: 14, lg: 16, xl: 18, '2xl': 20 };

        const { innerWidth } = window;

        if (innerWidth >= 1920) {
            return { base: 16, lg: 18, xl: 20, '2xl': 24 };
        } else if (innerWidth >= 1440) {
            return { base: 15, lg: 17, xl: 19, '2xl': 22 };
        } else {
            return { base: 14, lg: 16, xl: 18, '2xl': 20 };
        }
    }
};

// Desktop-specific CSS classes
export const desktopClasses = {
    // Layout classes
    container: 'min-w-[1024px] min-h-[768px]',
    sidebar: 'min-w-[64px] max-w-[600px]',
    mainContent: 'flex-1 overflow-hidden',
    bottomBar: 'min-h-[300px]',

    // Typography classes
    title: 'text-2xl font-bold',
    subtitle: 'text-xl font-semibold',
    body: 'text-sm leading-relaxed',

    // Form classes
    input: 'h-10 px-4 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
    button: 'h-11 px-6 text-sm font-medium rounded-lg transition-all duration-200 hover:transform hover:scale-105',
    buttonPrimary: 'bg-red-600 hover:bg-red-700 text-white',
    buttonSecondary: 'bg-gray-600 hover:bg-gray-700 text-white',

    // Data grid classes
    table: 'ag-theme-alpine border border-gray-200 rounded-lg',
    tableHeader: 'bg-gray-50 border-b border-gray-200',
    tableRow: 'border-b border-gray-100 hover:bg-gray-50',

    // Workflow classes
    node: 'transition-all duration-200 hover:scale-105',
    edge: 'stroke-2',
    edgeLabel: 'text-xs font-medium bg-white px-2 py-1 rounded border'
};

export default DESKTOP_CONFIG;

