export function getFirstStatsTimestamp(statsValue) {
    if (!statsValue) return null;
    for (const stat of Object.values(statsValue)) {
        if (stat && typeof stat === 'object' && stat.timestamp != null) return stat.timestamp;
    }
    return null;
}
