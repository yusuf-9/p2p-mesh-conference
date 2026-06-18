import type { RTCStatsDump } from '@rtcstats/core';

/** Context shared across all extractors during processing. */
export interface ExtractionContext {
  dump: RTCStatsDump;
  includedPCIds: string[];
  /** Populated by the peer-connections extractor for downstream use. */
  pConnections: Record<string, PeerConnectionReport>;
}

/** Merge strategy for extractor output. */
export type ExtractorMerge =
  | { merge: 'root'; data: Record<string, unknown> }
  | { merge: 'key'; key: string; data: unknown };

/** Composable extractor plugin. */
export interface DataExtractor {
  readonly name: string;
  extract(ctx: ExtractionContext): ExtractorMerge;
}

/** Session + per-PC metadata (shape is intentionally open for schema evolution). */
export type PeerConnectionReport = Record<string, unknown>;

export interface ProcessedReportData {
  schemaVersion?: string;
  callStart?: string | null;
  callEnd?: string | null;
  durationMs?: number | null;
  userAgentData?: Record<string, unknown>;
  pConnectionsNumber?: number;
  pConnections: Record<string, PeerConnectionReport>;
  streams: unknown;
  transports: unknown;
  pairTimeSeries: unknown;
  streamTimeSeries: unknown;
  aggregatedStats: unknown;
  metadata: { clientProtocol: string };
  [key: string]: unknown;
}

export interface ProcessedReport {
  data: ProcessedReportData;
}

export interface RtcStatsProcessorOptions {
  extractors?: DataExtractor[];
}

export interface ProcessFileOptions {
  userId: string;
  filePath: string;
  processedDir?: string;
}
