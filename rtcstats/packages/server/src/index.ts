import { RtcStatsProcessor } from './processor/RtcStatsProcessor.js';
import type { ProcessedReport } from './types.js';

export { RtcStatsProcessor } from './processor/RtcStatsProcessor.js';
export {
  createDefaultExtractors,
  createExtractionContext,
  resolveIncludedPCIds,
  sessionMetadataExtractor,
  peerConnectionsExtractor,
  streamsExtractor,
  transportsExtractor,
  pairTimeSeriesExtractor,
  streamTimeSeriesExtractor,
  aggregatedStatsExtractor,
} from './processor/index.js';
export type {
  DataExtractor,
  ExtractionContext,
  ExtractorMerge,
  PeerConnectionReport,
  ProcessedReport,
  ProcessedReportData,
  RtcStatsProcessorOptions,
} from './types.js';

export { extractSessionMetadata, extractPeerConnectionMetadata } from './structured-report.js';
export { extractStreams } from './streams.js';
export { extractAggregatedStats, computeConnectivityScore } from './aggregated-stats.js';
export { extractTransports } from './transports.js';
export { extractPairTimeSeries } from './pair-timeseries.js';
export { extractStreamTimeSeries } from './stream-timeseries.js';

const defaultProcessor = RtcStatsProcessor.withDefaults();

/** @deprecated Prefer `RtcStatsProcessor.processFile()` — kept for backward compatibility. */
export async function processRTCStatsDump(
  userId: string,
  filePath: string,
  processedDir?: string,
): Promise<ProcessedReport | null> {
  return defaultProcessor.processFile(userId, filePath, processedDir);
}
