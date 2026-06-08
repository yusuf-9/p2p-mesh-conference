function normalizeKind(kind) {
  const k = (kind ?? '').toLowerCase();
  if (k === 'srflx') return 'prflx';
  return k;
}

export function getPcTransports(pcId, transports = {}) {
  return transports[pcId] ?? null;
}

export function findSelectedPair(pcTransports) {
  if (!pcTransports) return null;

  for (const [transportId, transport] of Object.entries(pcTransports)) {
    const selectedIds = transport.selectedPairs ?? [];
    for (const pairId of selectedIds) {
      const pair = transport.pairs?.[pairId];
      if (pair) {
        return { transportId, transport, pairId, pair };
      }
    }
  }

  for (const [transportId, transport] of Object.entries(pcTransports)) {
    for (const [pairId, pair] of Object.entries(transport.pairs ?? {})) {
      if (pair.nominated || pair.states?.some((s) => s.selected)) {
        return { transportId, transport, pairId, pair };
      }
    }
  }

  return null;
}

export function getSelectedIce(pcId, transports = {}) {
  const pcTransports = getPcTransports(pcId, transports);
  return findSelectedPair(pcTransports);
}

export function isCandidateUsed(candidate, selectedLocal) {
  if (!candidate || !selectedLocal) return false;

  const kindMatch =
    normalizeKind(candidate.kind) === normalizeKind(selectedLocal.candidateType);
  const addrMatch = candidate.address === selectedLocal.address;
  const portMatch = Number(candidate.port) === Number(selectedLocal.port);

  return addrMatch && portMatch && kindMatch;
}

export function getUsedInterfaceId(localCandidates, selectedLocal) {
  if (!selectedLocal || !localCandidates) return null;

  for (const [id, group] of Object.entries(localCandidates)) {
    for (const candidate of group.candidates ?? []) {
      if (isCandidateUsed(candidate, selectedLocal)) {
        return id;
      }
    }
  }

  return null;
}

function formatCandidateEndpoint(candidate) {
  if (!candidate) return '—';
  const type = (candidate.candidateType ?? candidate.kind ?? '—').toUpperCase();
  const protocol = candidate.protocol ?? '—';
  const address = candidate.address ?? '—';
  const port = candidate.port ?? '—';
  return `${type} / ${protocol} / ${address}:${port}`;
}

export function formatPairEndpoint(pair, side) {
  return formatCandidateEndpoint(pair?.[side]);
}

export function formatBytes(n) {
  if (n == null || n === 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function toMs(isoOrTs) {
  if (isoOrTs == null) return null;
  if (typeof isoOrTs === 'number') return isoOrTs;
  return new Date(isoOrTs).getTime();
}

export function isPairSelected(pairId, pair, transport) {
  return (
    transport.selectedPairs?.includes(pairId) ||
    pair.nominated === true ||
    pair.states?.some((s) => s.selected)
  );
}

export function getPairDisplayState(pair, selected) {
  if (selected && pair.state === 'succeeded') return 'USED';
  if (pair.state === 'succeeded') return 'UNUSED';
  if (pair.state === 'in-progress') return 'IN-PROGRESS';
  if (pair.state === 'waiting') return 'WAITING';
  if (pair.state === 'failed') return 'FAILED';
  return (pair.state ?? '—').toUpperCase();
}

export function isPairActive(pair, selected) {
  const state = getPairDisplayState(pair, selected);
  return state === 'USED' || state === 'IN-PROGRESS';
}

export function listIcePairs(pcId, transports = {}) {
  const pcTransports = getPcTransports(pcId, transports);
  if (!pcTransports) return [];

  const pairs = [];

  for (const [transportId, transport] of Object.entries(pcTransports)) {
    for (const [pairId, pair] of Object.entries(transport.pairs ?? {})) {
      const selected = isPairSelected(pairId, pair, transport);
      pairs.push({
        transportId,
        pairId,
        pair,
        transport,
        selected,
        displayState: getPairDisplayState(pair, selected),
      });
    }
  }

  return pairs.sort((a, b) => (b.pair.priority ?? 0) - (a.pair.priority ?? 0));
}

export function getPairTimelinePosition(pair, session) {
  const { start: sessionStart, end: sessionEnd, duration } = session;
  const pairStart = toMs(pair.start);
  const pairEnd = toMs(pair.end);

  if (sessionStart == null || sessionEnd == null || duration == null || duration <= 0) {
    return { leftPercent: 0, widthPercent: 100 };
  }
  if (pairStart == null || pairEnd == null) {
    return { leftPercent: 0, widthPercent: 0 };
  }

  const leftPercent = ((pairStart - sessionStart) / duration) * 100;
  const widthPercent = ((pairEnd - pairStart) / duration) * 100;

  return {
    leftPercent: Math.min(100, Math.max(0, leftPercent)),
    widthPercent: Math.min(100 - leftPercent, Math.max(0, widthPercent)),
  };
}

const STATE_BUCKET = {
  succeeded: 'used',
  waiting: 'waiting',
  'in-progress': 'in-progress',
  failed: 'failed',
};

export function getPairStateBreakdown(pair, selected) {
  const states = pair.states ?? [];
  if (!states.length) return [];

  const pairStart = toMs(pair.start) ?? states[0].start;
  const pairEnd = toMs(pair.end) ?? states[states.length - 1].start;
  const totalMs = Math.max(0, pairEnd - pairStart);

  const buckets = {
    used: 0,
    unused: 0,
    waiting: 0,
    'in-progress': 0,
    failed: 0,
  };

  for (let i = 0; i < states.length; i++) {
    const start = states[i].start;
    const end = states[i + 1]?.start ?? pairEnd;
    const ms = Math.max(0, end - start);

    if (states[i].state === 'succeeded') {
      buckets[selected && states[i].selected ? 'used' : 'unused'] += ms;
    } else {
      const key = STATE_BUCKET[states[i].state] ?? states[i].state;
      if (buckets[key] != null) buckets[key] += ms;
    }
  }

  return Object.entries(buckets)
    .filter(([, ms]) => ms > 0)
    .map(([state, ms]) => ({
      state,
      ms,
      percent: totalMs > 0 ? (ms / totalMs) * 100 : 0,
    }));
}

export function isRelayType(type) {
  return (type ?? '').toUpperCase().includes('RELAY');
}
