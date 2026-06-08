function toMs(iso) {
  if (!iso) return null;
  return new Date(iso).getTime();
}

export function listStreams(streams = {}) {
  return Object.entries(streams).map(([id, stream]) => ({ id, ...stream }));
}

export function getStreamDurationMs(stream) {
  const start = toMs(stream.start);
  const end = toMs(stream.end);
  if (start == null || end == null) return null;
  return Math.max(0, end - start);
}

export function getStreamBitrateKbps(stream) {
  if (stream.avgBytesPerSecond == null) return null;
  return (stream.avgBytesPerSecond * 8) / 1000;
}

export function getStreamTimelinePosition(stream, session) {
  const { start: sessionStart, end: sessionEnd, duration } = session;
  const streamStart = toMs(stream.start);
  const streamEnd = toMs(stream.end);

  if (sessionStart == null || sessionEnd == null || duration == null || duration <= 0) {
    return { leftPercent: 0, widthPercent: 100 };
  }
  if (streamStart == null || streamEnd == null) {
    return { leftPercent: 0, widthPercent: 0 };
  }

  const leftPercent = ((streamStart - sessionStart) / duration) * 100;
  const widthPercent = ((streamEnd - streamStart) / duration) * 100;

  return {
    leftPercent: Math.min(100, Math.max(0, leftPercent)),
    widthPercent: Math.min(100 - leftPercent, Math.max(0, widthPercent)),
  };
}

export function getQualitySegments(stream) {
  const start = toMs(stream.start);
  const end = toMs(stream.end);
  const duration = end - start;

  if (duration <= 0) {
    return [{ type: 'good', leftPercent: 0, widthPercent: 100 }];
  }

  const periods = [...(stream.periods ?? [])].sort(
    (a, b) => a.startTimestamp - b.startTimestamp
  );

  if (!periods.length) {
    return [{ type: 'good', leftPercent: 0, widthPercent: 100 }];
  }

  const segments = [];
  let cursor = start;

  for (const period of periods) {
    const pStart = period.startTimestamp;
    const pEnd = period.endTimestamp;

    if (pStart > cursor) {
      segments.push({
        type: 'good',
        leftPercent: ((cursor - start) / duration) * 100,
        widthPercent: ((pStart - cursor) / duration) * 100,
      });
    }

    segments.push({
      type: 'poor',
      leftPercent: ((pStart - start) / duration) * 100,
      widthPercent: ((pEnd - pStart) / duration) * 100,
    });
    cursor = pEnd;
  }

  if (cursor < end) {
    segments.push({
      type: 'good',
      leftPercent: ((cursor - start) / duration) * 100,
      widthPercent: ((end - cursor) / duration) * 100,
    });
  }

  return segments.filter((s) => s.widthPercent > 0);
}

export function getMosBreakdown(stream) {
  const totalMs = getStreamDurationMs(stream);
  if (totalMs == null || totalMs <= 0) return [];

  let poorMs = 0;
  for (const period of stream.periods ?? []) {
    poorMs += Math.max(0, period.endTimestamp - period.startTimestamp);
  }
  poorMs = Math.min(poorMs, totalMs);
  const goodMs = Math.max(0, totalMs - poorMs);

  const breakdown = [];
  if (goodMs > 0) {
    breakdown.push({
      label: 'Excellent/Average',
      ms: goodMs,
      type: 'good',
      percent: (goodMs / totalMs) * 100,
    });
  }
  if (poorMs > 0) {
    breakdown.push({
      label: 'Poor',
      ms: poorMs,
      type: 'poor',
      percent: (poorMs / totalMs) * 100,
    });
  }

  return breakdown;
}

const FILTERS = {
  all: () => true,
  active: (s) => s.used === true,
  audio: (s) => s.kind === 'audio',
  video: (s) => s.kind === 'video',
  inbound: (s) => s.direction === 'inbound',
  outbound: (s) => s.direction === 'outbound',
  unused: (s) => s.used === false,
};

export const STREAM_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'audio', label: 'Audio' },
  { id: 'video', label: 'Video' },
  { id: 'inbound', label: 'Inbound' },
  { id: 'outbound', label: 'Outbound' },
  { id: 'unused', label: 'Unused' },
];

export function filterStreams(streams, filterId) {
  const predicate = FILTERS[filterId] ?? FILTERS.all;
  return streams.filter(predicate);
}

export function sortStreams(streams, orderBy) {
  const sorted = [...streams];

  if (orderBy === 'time') {
    sorted.sort((a, b) => toMs(a.start) - toMs(b.start));
  } else if (orderBy === 'duration') {
    sorted.sort((a, b) => getStreamDurationMs(b) - getStreamDurationMs(a));
  } else {
    sorted.sort((a, b) => {
      const pcCmp = (a.peerId ?? '').localeCompare(b.peerId ?? '', undefined, {
        numeric: true,
      });
      if (pcCmp !== 0) return pcCmp;
      return a.id.localeCompare(b.id, undefined, { numeric: true });
    });
  }

  return sorted;
}

export function getStreamKindIcon(stream) {
  const isAudio = stream.kind === 'audio';
  const isOut = stream.direction === 'outbound';
  const icon = isAudio ? '🎤' : '📹';
  const arrow = isOut ? '↑' : '↓';
  return { icon, arrow, title: `${stream.kind} ${stream.direction}` };
}
