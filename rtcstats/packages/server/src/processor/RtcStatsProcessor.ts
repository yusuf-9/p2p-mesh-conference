import { readRTCStatsDump, type RTCStatsDump } from '@rtcstats/core';
import fs from 'node:fs';
import path from 'node:path';
import type {
  DataExtractor,
  ProcessedReport,
  ProcessedReportData,
  RtcStatsProcessorOptions,
} from '../types.js';
import { createExtractionContext } from './context.js';
import { createDefaultExtractors } from './extractors/default.js';

export class RtcStatsProcessor {
  private readonly extractors: DataExtractor[];

  constructor(options: RtcStatsProcessorOptions = {}) {
    this.extractors = options.extractors ?? createDefaultExtractors();
  }

  /** Process an already-parsed RTCStats dump. */
  process(dump: RTCStatsDump): ProcessedReport {
    const ctx = createExtractionContext(dump);
    const data = {} as ProcessedReportData;

    for (const extractor of this.extractors) {
      const result = extractor.extract(ctx);
      if (result.merge === 'root') {
        Object.assign(data, result.data);
      } else {
        data[result.key] = result.data;
      }
    }

    data.metadata = { clientProtocol: 'rtcstats#3.0' };
    return { data };
  }

  /** Parse a dump file from disk and process it. */
  async processFile(
    userId: string,
    filePath: string,
    processedDir?: string,
  ): Promise<ProcessedReport | null> {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const blob = new Blob([fileContent], { type: 'text/plain' });
    const dump = await readRTCStatsDump(blob);

    if (!dump) {
      console.error(`Failed to parse RTCStats dump for user ${userId}`);
      return null;
    }

    const result = this.process(dump);

    if (processedDir) {
      const outputFile = path.join(processedDir, `${userId}_processed.json`);
      fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
      console.log(`📁 Saved processed RTC stats to ${outputFile}`);
    }

    return result;
  }

  /** Create a processor with the default schema 1.2 extractor pipeline. */
  static withDefaults(): RtcStatsProcessor {
    return new RtcStatsProcessor();
  }
}
