import type { RtcStatsTimeSeries, TimeSeriesPoint, TraceEvent } from './types.js';

interface InternalsConnection {
  stats: Record<string, { statsType?: string; values: string }>;
}

/**
 * Creates a time series from webrtc-internals.
 * Returns an object with stats by id and an object of property => [[ts, value], ...].
 */
export function createInternalsTimeSeries(connection: InternalsConnection): RtcStatsTimeSeries | undefined {
  const series: RtcStatsTimeSeries = {};

  for (const reportname in connection.stats) {
    let statsId: string;
    let statsProperty: string;
    if (reportname.indexOf('[') !== -1) {
      const t = reportname.split('[');
      statsProperty = '[' + t.pop();
      statsId = t.join('');
      statsId = statsId.substring(0, statsId.length - 1);
    } else {
      const t = reportname.split('-');
      statsProperty = t.pop()!;
      statsId = t.join('-');
    }
    if (statsProperty === 'type') continue;
    const stats = connection.stats[reportname];

    if (!Object.prototype.hasOwnProperty.call(series, statsId)) {
      series[statsId] = {
        type: stats.statsType,
      };
    }
    if (!connection.stats[`${statsId}-timestamp`]) {
      console.error('webrtc-internals dump missing timestamps for stats added in M117.');
      return undefined;
    }
    const timestamps = JSON.parse(connection.stats[`${statsId}-timestamp`].values) as number[];
    const values = JSON.parse(stats.values) as unknown[];
    const offset = timestamps.length - values.length;
    series[statsId][statsProperty] = values.map((currentValue, index) => {
      return [timestamps[index + offset]!, currentValue as number | null];
    });
  }

  return series;
}

/**
 * Creates a time series from rtcstats.
 * Returns an object with stats by id and an object of property => [[ts, value], ...].
 */
export function createRtcStatsTimeSeries(trace: TraceEvent[]): RtcStatsTimeSeries {
  const series: RtcStatsTimeSeries = {};

  for (const traceEvent of trace) {
    if (traceEvent.type !== 'getStats') {
      continue;
    }
    const stats = traceEvent.value as Record<string, Record<string, unknown>>;
    for (const id in stats) {
      const report = stats[id]!;
      if (!series[id]) {
        series[id] = {};
        series[id].type = String(stats[id]!.type);
      }
      for (const statsProperty in report) {
        if (['timestamp', 'type', 'id'].includes(statsProperty)) continue;
        const timeSeries = series[id]!;
        if (!timeSeries[statsProperty] || !Array.isArray(timeSeries[statsProperty])) {
          timeSeries[statsProperty] = [];
        }
        (timeSeries[statsProperty] as TimeSeriesPoint[]).push([
          report.timestamp as number,
          report[statsProperty] as number | null,
        ]);
      }
    }
  }

  return series;
}

/** Inserts null values for gaps in time series (useful for charting). */
export function insertNullForGapsIntoTimeSeries(
  timeSeries: TimeSeriesPoint[],
  gapSizeMs = 5000,
): TimeSeriesPoint[] {
  if (!timeSeries.length) return [];
  const newSeries: TimeSeriesPoint[] = [timeSeries[0]!];
  for (let i = 1; i < timeSeries.length; i++) {
    const delta = timeSeries[i]![0] - timeSeries[i - 1]![0];
    if (delta > gapSizeMs) {
      newSeries.push([timeSeries[i]![0], null]);
    }
    newSeries.push(timeSeries[i]!);
  }
  return newSeries;
}
