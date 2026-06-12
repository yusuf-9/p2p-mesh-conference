import { formatBytes } from './transports';
import { formatMs, formatMos, formatPacketLoss, formatTimestamp } from './statsFormat';

export const QUALITY_COLORS = {
  Excellent: '#2e7d32',
  Average: '#fdd835',
  Poor: '#ef6c00',
};

export const CHART_TABS = [
  { id: 'latency', label: 'Latency', hasViewMode: false, videoOnly: false },
  { id: 'bytes', label: 'Bytes', hasViewMode: true, videoOnly: false },
  { id: 'packets', label: 'Packets', hasViewMode: true, videoOnly: false },
  { id: 'frames', label: 'Frames', hasViewMode: true, videoOnly: true },
  { id: 'quality', label: 'Quality', hasViewMode: false, videoOnly: false },
  { id: 'performance', label: 'Performance', hasViewMode: false, videoOnly: true },
];

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

const INSTANT_FIELDS = new Set(['availableOutgoingBitrate', 'framesPerSecond', 'frameWidth', 'frameHeight']);

const TAB_SPECS = {
  latency: [
    { key: 'jitter', label: 'Jitter', cumulative: false, yAxis: 'left' },
    { key: 'roundTripTime', label: 'Round trip time', cumulative: false, yAxis: 'left' },
    { key: 'averageRoundTripTime', label: 'Average RTT', cumulative: false, yAxis: 'left', derived: true },
    { key: 'roundTripTimeMeasurements', label: 'Measures', cumulative: false, yAxis: 'right' },
  ],
  bytes: {
    outbound: [
      { key: 'bytesSent', label: 'Bytes sent', cumulative: true },
      { key: 'headerBytesSent', label: 'Header bytes sent', cumulative: true },
      { key: 'bytesDiscardedOnSend', label: 'Bytes discarded', cumulative: true },
      { key: 'availableOutgoingBitrate', label: 'Available outgoing bitrate', cumulative: false },
    ],
    inbound: [
      { key: 'bytesReceived', label: 'Bytes received', cumulative: true },
      { key: 'headerBytesReceived', label: 'Header bytes received', cumulative: true },
    ],
  },
  packets: {
    outbound: [
      { key: 'packetsSent', label: 'Packets sent', cumulative: true },
      { key: 'packetsDiscardedOnSend', label: 'Packets discarded', cumulative: true },
    ],
    inbound: [
      { key: 'packetsReceived', label: 'Packets received', cumulative: true },
      { key: 'packetsLost', label: 'Packets lost', cumulative: true },
    ],
  },
  frames: {
    outbound: [
      { key: 'framesPerSecond', label: 'Framerate', cumulative: false },
      { key: 'framesSent', label: 'Frames sent', cumulative: true },
      { key: 'frameWidth', label: 'Frame width', cumulative: false },
      { key: 'frameHeight', label: 'Frame height', cumulative: false },
    ],
    inbound: [
      { key: 'framesPerSecond', label: 'Framerate', cumulative: false },
      { key: 'framesReceived', label: 'Frames received', cumulative: true },
      { key: 'framesDecoded', label: 'Frames decoded', cumulative: true },
      { key: 'framesDropped', label: 'Frames dropped', cumulative: true },
      { key: 'frameWidth', label: 'Frame width', cumulative: false },
      { key: 'frameHeight', label: 'Frame height', cumulative: false },
    ],
  },
  quality: [
    { key: 'mos', label: 'MOS', cumulative: false },
    { key: 'packetLoss', label: 'Packet loss', cumulative: false },
    { key: 'fractionLost', label: 'Fraction lost', cumulative: false },
    { key: 'jitterBufferDelay', label: 'Jitter buffer delay', cumulative: false },
  ],
  performance: {
    outbound: [
      { key: 'totalEncodeTime', label: 'Total encode time', cumulative: true },
      { key: 'qpSum', label: 'QP sum', cumulative: true },
      { key: 'powerEfficientEncoder', label: 'Power efficient encoder', cumulative: false },
    ],
    inbound: [
      { key: 'totalDecodeTime', label: 'Total decode time', cumulative: true },
      { key: 'jitterBufferDelay', label: 'Jitter buffer delay', cumulative: false },
      { key: 'jitterBufferEmittedCount', label: 'Jitter buffer emitted', cumulative: true },
    ],
  },
};

export function getStreamSeries(streamTimeSeries, streamId) {
  if (!streamTimeSeries) return null;
  const series = streamTimeSeries[streamId];
  if (!series || typeof series !== 'object') return null;
  return series;
}

export function hasStreamChartData(series) {
  if (!series) return false;
  for (const group of ['latency', 'bytes', 'packets', 'frames', 'quality', 'performance', 'meta']) {
    const g = series[group];
    if (!g) continue;
    for (const arr of Object.values(g)) {
      if (arr?.length) return true;
    }
  }
  return false;
}

export function getChartTabs(stream) {
  const isVideo = stream?.kind === 'video';
  return CHART_TABS.filter((tab) => !tab.videoOnly || isVideo);
}

function toMs(iso) {
  if (!iso) return null;
  return new Date(iso).getTime();
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

function deriveAverageRtt(totalSeries, measurementsSeries) {
  const totalMap = seriesToMap(totalSeries);
  const countMap = seriesToMap(measurementsSeries);
  const timestamps = [...new Set([...totalMap.keys(), ...countMap.keys()])].sort(
    (a, b) => a - b
  );
  const out = [];
  for (const ts of timestamps) {
    const total = totalMap.get(ts);
    const count = countMap.get(ts);
    if (total == null || count == null || count <= 0) continue;
    out.push([ts, total / count]);
  }
  return out;
}

function buildDerivedSeries(raw) {
  const derived = {};
  if (raw.latency?.totalRoundTripTime && raw.latency?.roundTripTimeMeasurements) {
    derived.averageRoundTripTime = deriveAverageRtt(
      raw.latency.totalRoundTripTime,
      raw.latency.roundTripTimeMeasurements
    );
  }
  return derived;
}

function getTabSeriesConfig(tabId, direction) {
  const specs = TAB_SPECS[tabId];
  if (!specs) return [];
  if (Array.isArray(specs)) return specs;
  return specs[direction] ?? [];
}

function flattenGroup(group, derived = {}) {
  const flat = { ...derived };
  if (!group) return flat;
  for (const [key, points] of Object.entries(group)) {
    flat[key] = points;
  }
  return flat;
}

function getSeriesForTab(raw, tabId, direction, derived) {
  switch (tabId) {
    case 'latency':
      return { ...derived, ...flattenGroup(raw.latency) };
    case 'bytes':
      return flattenGroup(raw.bytes);
    case 'packets':
      return flattenGroup(raw.packets);
    case 'frames':
      return flattenGroup(raw.frames);
    case 'quality':
      return flattenGroup(raw.quality);
    case 'performance':
      return flattenGroup(raw.performance);
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

function isNumericSeries(points) {
  if (!points?.length) return false;
  return points.every(([, value]) => typeof value === 'number' && !Number.isNaN(value));
}

export function buildChartRows(rawSeries, tabId, direction, { mode = 'totals' } = {}) {
  if (!rawSeries) return { rows: [], series: [] };

  const derived = buildDerivedSeries(rawSeries);
  const seriesByKey = getSeriesForTab(rawSeries, tabId, direction, derived);
  const tabConfig = getTabSeriesConfig(tabId, direction);

  const activeSeries = tabConfig
    .map((spec, index) => {
      const rawPoints = seriesByKey[spec.key];
      if (!rawPoints?.length || !isNumericSeries(rawPoints)) return null;
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

export function buildQualitySegments(qualitySeries, streamStartMs, streamEndMs) {
  if (!qualitySeries?.length) return [];

  const startMs = streamStartMs ?? qualitySeries[0][0];
  const endMs = streamEndMs ?? qualitySeries[qualitySeries.length - 1][0];
  const span = endMs - startMs;
  if (span <= 0) return [];

  const segments = [];
  for (let i = 0; i < qualitySeries.length; i++) {
    const [ts, bucket] = qualitySeries[i];
    const nextTs = qualitySeries[i + 1]?.[0] ?? endMs;
    const left = ((ts - startMs) / span) * 100;
    const width = ((nextTs - ts) / span) * 100;
    if (width <= 0) continue;
    segments.push({
      title: String(bucket),
      leftPercent: Math.max(0, left),
      widthPercent: Math.min(100 - left, width),
      color: QUALITY_COLORS[bucket] ?? '#bdbdbd',
    });
  }
  return segments;
}

export function getStreamWindowMs(stream) {
  return {
    startMs: toMs(stream?.start),
    endMs: toMs(stream?.end),
  };
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
  if (tabId === 'packets' || tabId === 'frames') {
    if (mode === 'averages') return `${value.toFixed(1)}/s`;
    if (tabId === 'frames' && value < 120) return String(Math.round(value));
    return String(Math.round(value));
  }
  if (tabId === 'quality') {
    if (value > 100) return formatMs(value, 0);
    if (value <= 5.5) return formatMos(value);
    return formatPacketLoss(value);
  }
  if (tabId === 'performance') {
    if (value <= 1) return value.toFixed(2);
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
  if (spec.key === 'powerEfficientEncoder' || spec.key === 'powerEfficientDecoder') {
    return value ? 'Yes' : 'No';
  }
  if (spec.key === 'mos') return formatMos(value);
  if (spec.key === 'packetLoss' || spec.key === 'fractionLost') return formatPacketLoss(value);
  if (spec.key === 'framesPerSecond') return `${value.toFixed(1)} fps`;
  if (spec.key === 'frameWidth' || spec.key === 'frameHeight') return `${Math.round(value)} px`;
  return formatYAxisValue(value, tabId, mode);
}
