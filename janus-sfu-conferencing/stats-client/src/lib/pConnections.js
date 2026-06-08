export function listPeerConnections(pConnections = {}) {
  return Object.entries(pConnections)
    .map(([id, pc]) => ({ id, ...pc }))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

function toMs(iso) {
  if (!iso) return null;
  return new Date(iso).getTime();
}

export function getPcDurationMs(pc) {
  const start = toMs(pc.statisticsStartedAt ?? pc.createdAt);
  const end = toMs(pc.end);
  if (start == null || end == null) return null;
  return Math.max(0, end - start);
}

export function getSessionBounds(data) {
  const start = toMs(data.callStart);
  const end = toMs(data.callEnd);
  return { start, end, duration: start != null && end != null ? end - start : null };
}

export function getTimelinePosition(pc, session) {
  const { start: sessionStart, end: sessionEnd, duration } = session;
  const pcStart = toMs(pc.statisticsStartedAt ?? pc.createdAt);
  const pcEnd = toMs(pc.end);

  if (sessionStart == null || sessionEnd == null || duration == null || duration <= 0) {
    return { leftPercent: 0, widthPercent: 100 };
  }
  if (pcStart == null || pcEnd == null) {
    return { leftPercent: 0, widthPercent: 0 };
  }

  const leftPercent = ((pcStart - sessionStart) / duration) * 100;
  const widthPercent = ((pcEnd - pcStart) / duration) * 100;

  return {
    leftPercent: Math.min(100, Math.max(0, leftPercent)),
    widthPercent: Math.min(100 - leftPercent, Math.max(0, widthPercent)),
  };
}

export function getSetupPhases(pc) {
  const segments = [
    { label: 'Start', from: null, to: pc.negotiationStart },
    { label: 'Setup', from: pc.negotiationStart, to: pc.gathering },
    { label: 'Gathering ICE', from: pc.gathering, to: pc.iceChecking },
    { label: 'Checking ICE', from: pc.iceChecking, to: pc.iceConnection },
    { label: 'Connected ICE', from: pc.iceConnection, to: pc.connectedAt },
    { label: 'Connected', from: pc.connectedAt, to: pc.connectedAt },
  ];

  return segments
    .map((segment) => {
      const fromMs = segment.from ? toMs(segment.from) : null;
      const toMsVal = segment.to ? toMs(segment.to) : null;
      const segmentMs =
        fromMs != null && toMsVal != null && segment.label !== 'Start'
          ? toMsVal - fromMs
          : null;

      return {
        label: segment.label,
        timestamp: segment.to ?? segment.from,
        segmentMs: segment.label === 'Connected' ? 0 : segmentMs,
      };
    })
    .filter((phase) => phase.timestamp != null);
}

const SETUP_SEGMENT_LABELS = ['Setup', 'Gathering', 'Connection', 'DTLS'];

export function getSetupStepper(pc) {
  const milestones = [
    { key: 'start', label: 'Start', timestamp: pc.negotiationStart, sublabel: null },
    { key: 'gathering', label: 'Gathering', timestamp: pc.gathering, sublabel: 'ICE' },
    { key: 'checking', label: 'Checking', timestamp: pc.iceChecking, sublabel: 'ICE' },
    { key: 'iceConnected', label: 'Connected', timestamp: pc.iceConnection, sublabel: 'ICE' },
    { key: 'connected', label: 'Connected', timestamp: pc.connectedAt, sublabel: null },
  ].filter((m) => m.timestamp);

  const segments = [];
  for (let i = 1; i < milestones.length; i++) {
    const fromMs = toMs(milestones[i - 1].timestamp);
    const toMsVal = toMs(milestones[i].timestamp);
    segments.push({
      label: SETUP_SEGMENT_LABELS[i - 1] ?? '',
      ms: fromMs != null && toMsVal != null ? Math.max(0, toMsVal - fromMs) : null,
    });
  }

  const firstMs = milestones.length ? toMs(milestones[0].timestamp) : null;
  const lastMs = milestones.length ? toMs(milestones[milestones.length - 1].timestamp) : null;
  const computedTotal =
    firstMs != null && lastMs != null ? Math.max(0, lastMs - firstMs) : null;

  return {
    totalMs: pc.setupTimeMs ?? computedTotal,
    milestones,
    segments,
  };
}

export function formatSetupTransportLabel(pc) {
  const servers = pc.configuration?.iceServers ?? [];

  for (const server of servers) {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    for (const rawUrl of urls) {
      if (!rawUrl) continue;
      const url = String(rawUrl);
      const match = url.match(/^(stun|turn):([^/?]+)(?::(\d+))?/i);
      if (!match) continue;

      const kind = match[1].toUpperCase();
      const port = match[3] || '3478';
      const transport = /transport=tcp/i.test(url) ? 'TCP' : 'UDP';
      return `${kind} ${transport}/${port}`;
    }
  }

  return pc.connectionType ?? null;
}

export function formatIceServers(configuration) {
  if (!configuration?.iceServers?.length) return [];
  const entries = [];

  for (const server of configuration.iceServers) {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    for (const url of urls) {
      if (!url) continue;
      entries.push(url.replace(/^stun:/i, 'STUN ').replace(/^turn:/i, 'TURN '));
    }
  }

  return entries;
}

export function getContentMediaLabel(contentType) {
  if (!contentType) return '—';
  if (contentType.includes('BUNDLE')) return 'Bundle';
  if (contentType === 'VIDEO' || contentType === 'AUDIO') return '—';
  return contentType;
}

export function hasSimulcast(contentType) {
  return contentType?.includes('SIMULCAST') ?? false;
}

export function listNetworkInterfaces(localCandidates = {}) {
  return Object.entries(localCandidates)
    .map(([id, group]) => ({
      id,
      type: group.type ?? 'unknown',
      candidates: group.candidates ?? [],
    }))
    .sort((a, b) => Number(a.id) - Number(b.id));
}

export function getPcTiming(pc) {
  const created = toMs(pc.createdAt);
  const statsStart = toMs(pc.statisticsStartedAt);
  const connected = toMs(pc.connectedAt);
  const end = toMs(pc.end);

  return {
    warmUpMs:
      created != null && statsStart != null ? Math.max(0, statsStart - created) : null,
    setupMs: pc.setupTimeMs ?? null,
    liveMs:
      connected != null && end != null ? Math.max(0, end - connected) : null,
    lifetimeMs: created != null && end != null ? Math.max(0, end - created) : null,
  };
}

export function hasConnectivityGeo(geo) {
  if (!geo) return false;
  const local = geo.local ?? {};
  const remote = geo.remote ?? {};
  return Object.keys(local).length > 0 || Object.keys(remote).length > 0;
}

export function formatGeoLocation(geoSide) {
  if (!geoSide || Object.keys(geoSide).length === 0) return null;
  const parts = [geoSide.city, geoSide.region, geoSide.country].filter(Boolean);
  return parts.length ? parts.join(', ') : JSON.stringify(geoSide);
}

export function sortConnections(connections, orderBy) {
  const sorted = [...connections];

  if (orderBy === 'time') {
    sorted.sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
  } else if (orderBy === 'duration') {
    sorted.sort((a, b) => getPcDurationMs(b) - getPcDurationMs(a));
  } else {
    sorted.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }

  return sorted;
}
