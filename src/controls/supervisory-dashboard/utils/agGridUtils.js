export const ROW_SPAN_CONFIG = [
    { field: 'Regulation' },
    { field: 'AssetClass', prerequisites: ['Regulation'] }
];

export const hasPrereqMismatch = (rows, currentIndex, startIndex, prerequisites) => {
    for (let i = 0; i < prerequisites.length; i++) {
        const prereq = prerequisites[i];
        if (rows[currentIndex]?.[prereq] !== rows[startIndex]?.[prereq]) {
            return true;
        }
    }
    return false;
};

export const computeRowSpanMeta = (rows, configs) => {
    const meta = rows.map(() => ({}));

    configs.forEach(({ field, prerequisites = [] }) => {
        let start = 0;
        while (start < rows.length) {
            const baseValue = rows[start]?.[field];
            let length = 1;

            for (let next = start + 1; next < rows.length; next++) {
                const nextRow = rows[next];
                if (nextRow?.[field] !== baseValue) {
                    break;
                }

                const prereqMismatch = hasPrereqMismatch(rows, next, start, prerequisites);
                if (prereqMismatch) {
                    break;
                }

                length++;
            }

            if (length > 1) {
                meta[start][field] = length;
            }

            start += length;
        }
    });

    return meta;
};

export const addRowSpanMetadata = (rows) => {
    const meta = computeRowSpanMeta(rows, ROW_SPAN_CONFIG);
    const mergeDisplay = rows.map(() => ({}));
    const mergeState = rows.map(() => ({}));

    ROW_SPAN_CONFIG.forEach(({ field, prerequisites = [] }) => {
        let start = 0;
        while (start < rows.length) {
            const baseValue = rows[start]?.[field];
            let length = 1;

            for (let next = start + 1; next < rows.length; next++) {
                const nextRow = rows[next];
                if (nextRow?.[field] !== baseValue) {
                    break;
                }

                const prereqMismatch = hasPrereqMismatch(rows, next, start, prerequisites);
                if (prereqMismatch) {
                    break;
                }

                length++;
            }

            const centerIndex = start + Math.floor((length - 1) / 2);
            for (let idx = start; idx < start + length; idx++) {
                mergeDisplay[idx][field] = idx === centerIndex;
                mergeState[idx][field] = {
                    isStart: idx === start,
                    isEnd: idx === (start + length - 1),
                    isMiddle: idx === centerIndex,
                    length
                };
            }

            start += length;
        }
    });

    return rows.map((row, index) => ({
        ...row,
        _rowSpanMeta: meta[index],
        _mergeDisplay: mergeDisplay[index],
        _mergeState: mergeState[index]
    }));
};
