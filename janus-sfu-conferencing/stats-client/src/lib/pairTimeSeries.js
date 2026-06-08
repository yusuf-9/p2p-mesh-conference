import { formatBytes } from './transports';
import { formatMs, formatTimestamp } from './statsFormat';

export const CHART_TABS = [
  { id: 'latency', label: 'Latency', hasViewMode: false },
  { id: 'bytes', label: 'Bytes', hasViewMode: true },
  { id: 'packets', label: 'Packets', hasViewMode: true },
  { id: 'connectivity', label: 'Connectivity', hasViewMode: true },
];

export const STATE_COLORS = {
  succeeded: '#1565c0',
  used: '#1565c0',
  'in-progress': '#fdd835',
  waiting: '#bdbdbd',
  failed: '#c62828',
  frozen: '#78909c',
};

const SERIES_COLORS = [
  '#2e7d32',
  '#c62828',
  '#757575',
  '#1565c0',
  '#ef6c00',
  '#6a1b9a',
  '#00838f',
  '#558b2f',
];

const INSTANT_FIELDS = new Set(['availableOutgoingBitrate', 'currentRoundTripTime']);

const CUMULATIVE_FIELDS = new Set([
  'bytesSent',
  'bytesReceived',
  'bytesDiscardedOnSend',
  'packetsSent',
  'packetsReceived',
  'packetsDiscardedOnSend',
  'requestsSent',
  'responsesReceived',
  'consentRequestsSent',
  'requestsReceived',
  'responsesSent',
  'totalRoundTripTime',
  'responsesReceived',
]);

export const TAB_SERIES = {
  latency: [
    { key: 'currentRoundTripTime', label: 'Current RTT', cumulative: false, yAxis: 'left' },
    { key: 'averageRoundTripTime', label: 'Average RTT', cumulative: false, yAxis: 'left', derived: true },
    { key: 'responsesReceived', label: 'Measures', cumulative: false, yAxis: 'right' },
  ],
  bytes: [
    { key: 'bytesSent', label: 'Bytes sent', cumulative: true },
    { key: 'bytesReceived', label: 'Bytes received', cumulative: true },
    { key: 'bytesDiscardedOnSend', label: 'Bytes discarded', cumulative: true },
    { key: 'availableOutgoingBitrate', label: 'Available outgoing bitrate', cumulative: false },
  ],
  packets: [
    { key: 'packetsSent', label: 'Packets sent', cumulative: true },
    { key: 'packetsReceived', label: 'Packets received', cumulative: true },
    { key: 'packetsDiscardedOnSend', label: 'Packets discarded', cumulative: true },
  ],
  connectivity: [
    { key: 'requestsSent', label: 'Requests sent', cumulative: true },
    { key: 'responsesReceived', label: 'Responses received', cumulative: true },
    { key: 'consentRequestsSent', label: 'Consent requests sent', cumulative: true },
    { key: 'requestsReceived', label: 'Requests received', cumulative: true },
    { key: 'responsesSent', label: 'Responses sent', cumulative: true },
    { key: 'lastPacketSentAge', label: 'Last packet sent age', cumulative: false, derived: true },
    { key: 'lastPacketReceivedAge', label: 'Last packet received age', cumulative: false, derived: true },
  ],
};

export function getPairSeries(pairTimeSeries, pcId, transportId, pairId) {
  if (!pairTimeSeries) return null;
  const series = pairTimeSeries?.[pcId]?.[transportId]?.[pairId];
  if (!series || typeof series !== 'object') return null;
  return series;
}

export function hasPairChartData(series) {
  if (!series) return false;
  for (const group of ['latency', 'bytes', 'packets', 'connectivity', 'meta']) {
    const g = series[group];
    if (!g) continue;
    for (const arr of Object.values(g)) {
      if (arr?.length) return true;
    }
  }
  return false;
}

function seriesToMap(points = []) {
  const map = new Map();
  for (const [ts, value] of points) {
    if (value == null || Number.isNaN(value)) continue;
    map.set(ts, value);
  }
  return map;
}

function computeIntervalRates(points) {
  if (!points?.length) return [];
  const out = [];
  for (let i = 1; i < points.length; i++) {
    const [prevTs, prevVal] = points[i - 1];
    const [ts, val] = points[i];
    const dt = ts - prevTs;
    if (dt <= 0) continue;
    const rate = ((val - prevVal) / dt) * 1000;
    if (rate < 0) continue;
    out.push([ts, rate]);
  }
  return out;
}

function deriveAverageRtt(totalSeries, responsesSeries) {
  const totalMap = seriesToMap(totalSeries);
  const responsesMap = seriesToMap(responsesSeries);
  const timestamps = [...new Set([...totalMap.keys(), ...responsesMap.keys()])].sort(
    (a, b) => a - b
  );
  const out = [];
  for (const ts of timestamps) {
    const total = totalMap.get(ts);
    const count = responsesMap.get(ts);
    if (total == null || count == null || count <= 0) continue;
    out.push([ts, total / count]);
  }
  return out;
}

function derivePacketAge(sampleTs, packetTs) {
  if (packetTs == null || Number.isNaN(packetTs)) return null;
  const age = sampleTs - packetTs;
  return age >= 0 ? age : null;
}

function buildDerivedSeries(raw) {
  const derived = {};

  if (raw.latency?.totalRoundTripTime && raw.latency?.responsesReceived) {
    derived.averageRoundTripTime = deriveAverageRtt(
      raw.latency.totalRoundTripTime,
      raw.latency.responsesReceived
    );
  }

  const sentTs = raw.connectivity?.lastPacketSentTimestamp ?? [];
  const recvTs = raw.connectivity?.lastPacketReceivedTimestamp ?? [];
  if (sentTs.length || recvTs.length) {
    const sentMap = seriesToMap(sentTs);
    const recvMap = seriesToMap(recvTs);
    const timestamps = [...new Set([...sentMap.keys(), ...recvMap.keys()])].sort(
      (a, b) => a - b
    );
    derived.lastPacketSentAge = [];
    derived.lastPacketReceivedAge = [];
    for (const ts of timestamps) {
      const sentAge = derivePacketAge(ts, sentMap.get(ts));
      const recvAge = derivePacketAge(ts, recvMap.get(ts));
      if (sentAge != null) derived.lastPacketSentAge.push([ts, sentAge]);
      if (recvAge != null) derived.lastPacketReceivedAge.push([ts, recvAge]);
    }
  }

  return derived;
}

function flattenGroup(group, derived = {}) {
  const flat = { ...derived };
  if (!group) return flat;
  for (const [key, points] of Object.entries(group)) {
    flat[key] = points;
  }
  return flat;
}

function getSeriesForTab(raw, tabId, derived) {
  switch (tabId) {
    case 'latency':
      return { ...derived, ...flattenGroup(raw.latency) };
    case 'bytes':
      return flattenGroup(raw.bytes);
    case 'packets':
      return flattenGroup(raw.packets);
    case 'connectivity':
      return { ...derived, ...flattenGroup(raw.connectivity) };
    default:
      return {};
  }
}

function collectTimestamps(seriesByKey, tabConfig) {
  const tsSet = new Set();
  for (const spec of tabConfig) {
    const points = seriesByKey[spec.key];
    if (!points?.length) continue;
    for (const [ts] of points) tsSet.add(ts);
  }
  return [...tsSet].sort((a, b) => a - b);
}

function valueAt(points, ts) {
  if (!points?.length) return null;
  let last = null;
  for (const [pointTs, value] of points) {
    if (pointTs > ts) break;
    last = value;
  }
  return last;
}

function transformSeriesForMode(points, spec, mode) {
  if (!points?.length) return [];
  if (mode === 'totals' || !spec.cumulative || INSTANT_FIELDS.has(spec.key)) {
    return points;
  }
  return computeIntervalRates(points);
}

export function buildChartRows(rawSeries, tabId, { mode = 'totals' } = {}) {
  if (!rawSeries) return { rows: [], series: [] };

  const derived = buildDerivedSeries(rawSeries);
  const seriesByKey = getSeriesForTab(rawSeries, tabId, derived);
  const tabConfig = TAB_SERIES[tabId] ?? [];

  const activeSeries = tabConfig
    .map((spec, index) => {
      const rawPoints = seriesByKey[spec.key];
      if (!rawPoints?.length) return null;
      const points = transformSeriesForMode(rawPoints, spec, mode);
      if (!points.length) return null;
      return {
        ...spec,
        points,
        color: SERIES_COLORS[index % SERIES_COLORS.length],
      };
    })
    .filter(Boolean);

  if (!activeSeries.length) return { rows: [], series: [] };

  const timestamps = collectTimestamps(
    Object.fromEntries(activeSeries.map((s) => [s.key, s.points])),
    activeSeries
  );

  const rows = timestamps.map((ts) => {
    const row = {
      t: ts,
      tLabel: formatTimestamp(ts),
    };
    for (const spec of activeSeries) {
      row[spec.key] = valueAt(spec.points, ts);
    }
    return row;
  });

  return { rows, series: activeSeries };
}

export function buildStateSegments(stateSeries, sessionStartMs, sessionEndMs) {
  if (!stateSeries?.length) return [];

  const startMs = sessionStartMs ?? stateSeries[0][0];
  const endMs = sessionEndMs ?? stateSeries[stateSeries.length - 1][0];
  const span = endMs - startMs;
  if (span <= 0) return [];

  const segments = [];
  for (let i = 0; i < stateSeries.length; i++) {
    const [ts, state] = stateSeries[i];
    const nextTs = stateSeries[i + 1]?.[0] ?? endMs;
    const left = ((ts - startMs) / span) * 100;
    const width = ((nextTs - ts) / span) * 100;
    if (width <= 0) continue;
    segments.push({
      state: String(state ?? 'unknown').toLowerCase(),
      leftPercent: Math.max(0, left),
      widthPercent: Math.min(100 - left, width),
      color: STATE_COLORS[String(state ?? '').toLowerCase()] ?? '#bdbdbd',
    });
  }
  return segments;
}

export function formatYAxisValue(value, tabId, mode) {
  if (value == null || Number.isNaN(value)) return '';
  if (tabId === 'latency') {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
    return formatMs(value, value < 10 ? 1 : 0);
  }
  if (tabId === 'bytes') {
    if (mode === 'averages') {
      const kbps = (value * 8) / 1000;
      if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mb/s`;
      return `${kbps.toFixed(0)} Kb/s`;
    }
    return formatBytes(value) ?? String(Math.round(value));
  }
  if (tabId === 'packets') {
    if (mode === 'averages') return `${value.toFixed(1)}/s`;
    return String(Math.round(value));
  }
  if (tabId === 'connectivity') {
    return String(Math.round(value));
  }
  return String(value);
}

export function formatTooltipValue(value, spec, tabId, mode) {
  if (value == null || Number.isNaN(value)) return '—';
  if (spec.key === 'availableOutgoingBitrate') {
    const kbps = value / 1000;
    if (kbps >= 1000) return `${(kbps / 1000).toFixed(2)} Mb/s`;
    return `${kbps.toFixed(1)} Kb/s`;
  }
  if (spec.key.includes('Age')) return formatMs(value, 0);
  return formatYAxisValue(value, tabId, mode);
}

export function isCumulativeField(key) {
  return CUMULATIVE_FIELDS.has(key) && !INSTANT_FIELDS.has(key);
}
