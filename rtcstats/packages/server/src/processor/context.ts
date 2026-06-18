import type { RTCStatsDump } from '@rtcstats/core';
import type { ExtractionContext, PeerConnectionReport } from '../types.js';

/** Peer connections that produced at least one getStats event. */
export function resolveIncludedPCIds(dump: RTCStatsDump): string[] {
  const included: string[] = [];

  for (const [pcId, trace] of Object.entries(dump.peerConnections)) {
    if (pcId === 'null') continue;
    if (!trace.some((event) => event.type === 'getStats')) continue;
    included.push(pcId);
  }

  return included;
}

export function createExtractionContext(dump: RTCStatsDump): ExtractionContext {
  const includedPCIds = resolveIncludedPCIds(dump);
  return {
    dump,
    includedPCIds,
    pConnections: {},
  };
}

export function buildPeerConnectionReports(
  dump: RTCStatsDump,
  includedPCIds: string[],
  extractPeerConnectionMetadata: (trace: RTCStatsDump['peerConnections'][string]) => PeerConnectionReport,
): Record<string, PeerConnectionReport> {
  const pConnections: Record<string, PeerConnectionReport> = {};

  for (const pcId of includedPCIds) {
    pConnections[pcId] = extractPeerConnectionMetadata(dump.peerConnections[pcId] ?? []);
  }

  return pConnections;
}
