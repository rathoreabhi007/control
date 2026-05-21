const INSTANCE_SUFFIX_PATTERN = /(\d{13}-[a-z0-9]+)$/;

/**
 * Extract a URL-safe slug from inputConfigFilePattern (basename without extension).
 * e.g. "CFTCP45/Trade-state-comp/CFTC_Trade-State-Comp_FX.xlsx" -> "CFTC_Trade-State-Comp_FX"
 */
export function extractConfigSlug(inputConfigFilePattern) {
    if (!inputConfigFilePattern || typeof inputConfigFilePattern !== 'string') {
        return null;
    }
    const trimmed = inputConfigFilePattern.trim();
    if (!trimmed) return null;

    const basename = trimmed.split('/').pop().split('\\').pop();
    const withoutExt = basename.replace(/\.[^/.]+$/, '');
    if (!withoutExt) return null;

    const slug = withoutExt.replace(/[^a-zA-Z0-9_-]/g, '_');
    return slug || null;
}

/** Unique suffix: timestamp-random (same format as homepage openNewInstance). */
export function generateInstanceSuffix() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Parse the unique suffix from an instance id.
 * Supports "completeness-1779...-abc" and "CFTC_Trade-State-Comp_FX-1779...-abc".
 */
export function parseInstanceSuffix(instanceId, legacyPrefix = 'completeness') {
    if (!instanceId) return null;

    const legacy = `${legacyPrefix}-`;
    if (instanceId.startsWith(legacy)) {
        const suffix = instanceId.slice(legacy.length);
        return INSTANCE_SUFFIX_PATTERN.test(suffix) ? suffix : instanceId.slice(legacy.length);
    }

    const match = instanceId.match(/^(.+)-(\d{13}-[a-z0-9]+)$/);
    if (match) return match[2];

    const tail = instanceId.match(INSTANCE_SUFFIX_PATTERN);
    return tail ? tail[1] : null;
}

export function buildConfigBasedInstanceId(configSlug, suffix) {
    return `${configSlug}-${suffix}`;
}

export function generateCompletenessInstanceId(configSlug = null) {
    const suffix = generateInstanceSuffix();
    if (configSlug) {
        return buildConfigBasedInstanceId(configSlug, suffix);
    }
    return `completeness-${suffix}`;
}

const LEGACY_INSTANCE_PREFIXES = ['completeness', 'quality'];

export function isLegacyInstanceId(instanceId) {
    if (!instanceId) return false;
    return LEGACY_INSTANCE_PREFIXES.some((prefix) => instanceId.startsWith(`${prefix}-`));
}

export function detectLegacyPrefix(instanceId) {
    if (!instanceId) return 'completeness';
    if (instanceId.startsWith('quality-')) return 'quality';
    if (instanceId.startsWith('completeness-')) return 'completeness';
    return 'completeness';
}

/** Config slug embedded in instance id (not legacy workbench prefix). */
export function deriveConfigSlugFromInstanceId(instanceId) {
    if (!instanceId || isLegacyInstanceId(instanceId)) return null;
    const match = instanceId.match(/^(.+)-(\d{13}-[a-z0-9]+)$/);
    return match ? match[1] : null;
}

/** Full temp file path: base prefix + instance id as subfolder. */
export function buildTempFilePath(basePrefix, instanceId) {
    if (!basePrefix) return '';
    if (!instanceId) return basePrefix;
    const subfolder = instanceId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${basePrefix}${subfolder}`;
}

/** Display label for the fixed temp subfolder (matches recent-instance label). */
export function getTempFileSubfolderDisplay(instanceId) {
    return getInstanceDisplayLabel({ instanceId });
}

export function getConfigSlugForInstance(instanceId, paramsKeyPrefix = 'validatedParams_') {
    const fromId = deriveConfigSlugFromInstanceId(instanceId);
    if (fromId) return fromId;

    try {
        const raw = localStorage.getItem(`${paramsKeyPrefix}${instanceId}`);
        if (!raw) return null;
        const params = JSON.parse(raw);
        return extractConfigSlug(params?.inputConfigFilePattern);
    } catch {
        return null;
    }
}

const STORAGE_PREFIXES = [
    'validatedParams_',
    'nodeOutputs_',
    'nodes_',
    'processIds_',
    'uiState_',
];

export function migrateInstanceStorage(oldInstanceId, newInstanceId) {
    if (!oldInstanceId || !newInstanceId || oldInstanceId === newInstanceId) return;

    STORAGE_PREFIXES.forEach((prefix) => {
        const oldKey = `${prefix}${oldInstanceId}`;
        const newKey = `${prefix}${newInstanceId}`;
        const value = localStorage.getItem(oldKey);
        if (value !== null) {
            localStorage.setItem(newKey, value);
            localStorage.removeItem(oldKey);
        }
    });
}

export function upsertRecentInstance(recentInstancesKey, instanceId, configSlug = null) {
    const slug = configSlug || getConfigSlugForInstance(instanceId);
    const now = new Date().toISOString();
    const entry = {
        instanceId,
        ...(slug ? { configSlug: slug } : {}),
        lastVisitedAt: now,
    };

    try {
        const raw = localStorage.getItem(recentInstancesKey);
        const parsed = raw ? JSON.parse(raw) : [];
        const next = [
            entry,
            ...(Array.isArray(parsed) ? parsed : []),
        ]
            .filter((x) => x && x.instanceId)
            .filter((x, idx, arr) => arr.findIndex((y) => y.instanceId === x.instanceId) === idx)
            .slice(0, 5);
        localStorage.setItem(recentInstancesKey, JSON.stringify(next));
        return next;
    } catch {
        return [entry];
    }
}

export function replaceRecentInstance(recentInstancesKey, oldInstanceId, newInstanceId, configSlug) {
    try {
        const raw = localStorage.getItem(recentInstancesKey);
        const parsed = raw ? JSON.parse(raw) : [];
        const now = new Date().toISOString();
        const filtered = (Array.isArray(parsed) ? parsed : []).filter(
            (x) => x?.instanceId && x.instanceId !== oldInstanceId && x.instanceId !== newInstanceId
        );
        const entry = {
            instanceId: newInstanceId,
            configSlug,
            lastVisitedAt: now,
        };
        const next = [entry, ...filtered].slice(0, 5);
        localStorage.setItem(recentInstancesKey, JSON.stringify(next));
        return next;
    } catch {
        return upsertRecentInstance(recentInstancesKey, newInstanceId, configSlug);
    }
}

export function getInstanceDisplayLabel(item) {
    const id = typeof item === 'string' ? item : item?.instanceId;
    const slug = typeof item === 'object' ? item?.configSlug : null;
    if (!id) return '';

    const resolvedSlug = slug || deriveConfigSlugFromInstanceId(id) || getConfigSlugForInstance(id);
    if (resolvedSlug) {
        const suffix = parseInstanceSuffix(id, detectLegacyPrefix(id));
        return suffix ? `${resolvedSlug} · ${suffix}` : `${resolvedSlug} · ${id}`;
    }
    return id;
}

export function resolveRenamedInstanceId(currentInstanceId, inputConfigFilePattern, legacyPrefix = 'completeness') {
    const configSlug = extractConfigSlug(inputConfigFilePattern);
    if (!configSlug || !currentInstanceId) return null;
    if (currentInstanceId.startsWith(`${configSlug}-`)) return null;

    const suffix =
        parseInstanceSuffix(currentInstanceId, legacyPrefix) || generateInstanceSuffix();
    const newInstanceId = buildConfigBasedInstanceId(configSlug, suffix);
    if (newInstanceId === currentInstanceId) return null;

    return { configSlug, newInstanceId, suffix };
}
