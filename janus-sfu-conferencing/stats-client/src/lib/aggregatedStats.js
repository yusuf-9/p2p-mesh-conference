const METRICS = ['bitrate', 'rtt', 'packetLoss', 'jitter', 'mos'];

export const STREAM_BUCKETS = [
  { key: 'out_audio', direction: 'out', kind: 'Audio' },
  { key: 'in_audio', direction: 'in', kind: 'Audio' },
  { key: 'out_video', direction: 'out', kind: 'Video' },
  { key: 'in_video', direction: 'in', kind: 'Video' },
];

export function getBucketCount(aggregatedStats, bucketKey) {
  return aggregatedStats?.[bucketKey] ?? 0;
}

export function getBucketMetric(aggregatedStats, bucketKey, metric) {
  const prefix = `${metric}_${bucketKey}`;
  return {
    avg: aggregatedStats?.[prefix] ?? null,
    min: aggregatedStats?.[`${prefix}_min`] ?? null,
    max: aggregatedStats?.[`${prefix}_max`] ?? null,
  };
}

export function getBucketSummary(aggregatedStats, bucketKey) {
  const count = getBucketCount(aggregatedStats, bucketKey);
  const hasData = count > 0 && METRICS.some((m) => getBucketMetric(aggregatedStats, bucketKey, m).avg != null);

  return {
    key: bucketKey,
    count,
    hasData,
    bitrate: getBucketMetric(aggregatedStats, bucketKey, 'bitrate'),
    rtt: getBucketMetric(aggregatedStats, bucketKey, 'rtt'),
    packetLoss: getBucketMetric(aggregatedStats, bucketKey, 'packetLoss'),
    jitter: getBucketMetric(aggregatedStats, bucketKey, 'jitter'),
    mos: getBucketMetric(aggregatedStats, bucketKey, 'mos'),
  };
}

export function getContentBitrate(aggregatedStats, direction, kind) {
  const key = `${direction}_${kind}`;
  return aggregatedStats?.[`bitrate_${key}`] ?? null;
}
