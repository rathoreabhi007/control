/**
 * LocalStorage cache helpers for the supervisory dashboard.
 * Each cached entry stores { data, timestamp } as JSON.
 * Default TTL: 5 minutes (300 000 ms).
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const KEY_PREFIX = 'supervisory_cache_';

/**
 * Read a cached entry. Returns the parsed data if still within TTL, otherwise null.
 */
export function cacheGet(key, ttlMs = DEFAULT_TTL_MS) {
    try {
        const raw = window.localStorage.getItem(KEY_PREFIX + key);
        if (!raw) return null;

        const entry = JSON.parse(raw);
        if (!entry || !entry.timestamp) return null;

        const age = Date.now() - entry.timestamp;
        if (age > ttlMs) {
            window.localStorage.removeItem(KEY_PREFIX + key);
            return null;
        }

        return entry.data;
    } catch {
        return null;
    }
}

/**
 * Write data into localStorage with the current timestamp.
 */
export function cacheSet(key, data) {
    try {
        const entry = { data, timestamp: Date.now() };
        window.localStorage.setItem(KEY_PREFIX + key, JSON.stringify(entry));
    } catch (e) {
        // localStorage might be full — silently ignore
        console.warn('localStorage cache write failed:', e);
    }
}

/**
 * Remove a specific cache entry.
 */
export function cacheClear(key) {
    try {
        window.localStorage.removeItem(KEY_PREFIX + key);
    } catch {
        // ignore
    }
}

/**
 * Remove ALL supervisory cache entries.
 */
export function cacheClearAll() {
    try {
        const keys = [];
        for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i);
            if (k && k.startsWith(KEY_PREFIX)) keys.push(k);
        }
        keys.forEach(k => window.localStorage.removeItem(k));
    } catch {
        // ignore
    }
}
