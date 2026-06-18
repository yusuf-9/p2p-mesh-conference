import { extractAggregatedStats } from '../../aggregated-stats.js';
import { extractPairTimeSeries } from '../../pair-timeseries.js';
import { extractStreamTimeSeries } from '../../stream-timeseries.js';
import {
  extractPeerConnectionMetadata,
  extractSessionMetadata,
} from '../../structured-report.js';
import { extractStreams } from '../../streams.js';
import { extractTransports } from '../../transports.js';
import type { DataExtractor } from '../../types.js';
import { buildPeerConnectionReports } from '../context.js';

/** Session-level fields merged at the root of `data`. */
export const sessionMetadataExtractor: DataExtractor = {
  name: 'sessionMetadata',
  extract(ctx) {
    return {
      merge: 'root',
      data: extractSessionMetadata(ctx.dump, ctx.includedPCIds) as Record<string, unknown>,
    };
  },
};

/** Per peer-connection metadata (also stored on context for downstream extractors). */
export const peerConnectionsExtractor: DataExtractor = {
  name: 'peerConnections',
  extract(ctx) {
    ctx.pConnections = buildPeerConnectionReports(
      ctx.dump,
      ctx.includedPCIds,
      extractPeerConnectionMetadata,
    );
    return { merge: 'key', key: 'pConnections', data: ctx.pConnections };
  },
};

export const streamsExtractor: DataExtractor = {
  name: 'streams',
  extract(ctx) {
    return {
      merge: 'key',
      key: 'streams',
      data: extractStreams(ctx.dump, ctx.includedPCIds),
    };
  },
};

export const transportsExtractor: DataExtractor = {
  name: 'transports',
  extract(ctx) {
    return {
      merge: 'key',
      key: 'transports',
      data: extractTransports(ctx.dump, ctx.includedPCIds),
    };
  },
};

export const pairTimeSeriesExtractor: DataExtractor = {
  name: 'pairTimeSeries',
  extract(ctx) {
    const transports = extractTransports(ctx.dump, ctx.includedPCIds);
    return {
      merge: 'key',
      key: 'pairTimeSeries',
      data: extractPairTimeSeries(ctx.dump, ctx.includedPCIds, transports),
    };
  },
};

export const streamTimeSeriesExtractor: DataExtractor = {
  name: 'streamTimeSeries',
  extract(ctx) {
    const streams = extractStreams(ctx.dump, ctx.includedPCIds);
    return {
      merge: 'key',
      key: 'streamTimeSeries',
      data: extractStreamTimeSeries(ctx.dump, ctx.includedPCIds, streams),
    };
  },
};

export const aggregatedStatsExtractor: DataExtractor = {
  name: 'aggregatedStats',
  extract(ctx) {
    const streams = extractStreams(ctx.dump, ctx.includedPCIds);
    return {
      merge: 'key',
      key: 'aggregatedStats',
      data: extractAggregatedStats(ctx.dump, ctx.includedPCIds, streams, ctx.pConnections),
    };
  },
};

/**
 * Default extractor pipeline matching schema 1.2 structured analytics output.
 * Order matters: peer connections must run before aggregated stats.
 */
export function createDefaultExtractors(): DataExtractor[] {
  return [
    sessionMetadataExtractor,
    peerConnectionsExtractor,
    streamsExtractor,
    transportsExtractor,
    pairTimeSeriesExtractor,
    streamTimeSeriesExtractor,
    aggregatedStatsExtractor,
  ];
}
