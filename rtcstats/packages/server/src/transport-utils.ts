export function getFirstStatsTimestamp(statsValue: Record<string, unknown> | null | undefined): number | null {
  if (!statsValue) return null;
  for (const stat of Object.values(statsValue)) {
    if (stat && typeof stat === 'object' && (stat as { timestamp?: number }).timestamp != null) {
      return (stat as { timestamp: number }).timestamp;
    }
  }
  return null;
}
