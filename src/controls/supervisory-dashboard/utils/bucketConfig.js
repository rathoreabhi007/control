export const BUCKET_SET_CONFIG = {
    CFTC: {
        buckets: ['0-3', '3-7', '7-14', '14-30', '30-60'],
        labels: {
            '0-3': '0-3d',
            '3-7': '3-7d',
            '7-14': '7-14d',
            '14-30': '14-30d',
            '30-60': '30-60d'
        },
        colors: {
            '0-3': '#65A30D',
            '3-7': '#CA8A04',
            '7-14': '#EA580C',
            '14-30': '#DC2626',
            '30-60': '#991B1B'
        },
        chartColors: {
            '0-3': '#7FB43A',
            '3-7': '#D39A2A',
            '7-14': '#EE7B38',
            '14-30': '#E05555',
            '30-60': '#B23A3A'
        }
    },
    EMIR: {
        buckets: ['0-2', '3-10', '11-30', '31-50'],
        labels: {
            '0-2': '0-2d',
            '3-10': '3-10d',
            '11-30': '11-30d',
            '31-50': '31-50d'
        },
        colors: {
            '0-2': '#65A30D',
            '3-10': '#CA8A04',
            '11-30': '#EA580C',
            '31-50': '#DC2626'
        },
        chartColors: {
            '0-2': '#7FB43A',
            '3-10': '#D39A2A',
            '11-30': '#EE7B38',
            '31-50': '#E05555'
        }
    }
};

export const DEFAULT_BUCKET_SET_OPTIONS = ['CFTC', 'EMIR'];
export const DEFAULT_AGE_BUCKETS = BUCKET_SET_CONFIG.CFTC.buckets;

export const buildBucketSummary = (buckets) => {
    const summary = { total: 0 };
    buckets.forEach(bucket => {
        summary[bucket] = 0;
    });
    return summary;
};
