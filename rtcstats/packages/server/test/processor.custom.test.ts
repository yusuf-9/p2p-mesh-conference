import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readRTCStatsDump } from '@rtcstats/core';
import {
  RtcStatsProcessor,
  createDefaultExtractors,
  sessionMetadataExtractor,
} from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ID = '4305a27a-2480-4a2c-ba95-ac23c7a4ecb2';

describe('RtcStatsProcessor customization', () => {
  it('runs a subset of extractors', async () => {
    const logPath = path.join(__dirname, 'fixtures', `${FIXTURE_ID}.log`);
    const blob = new Blob([readFileSync(logPath)], { type: 'text/plain' });
    const dump = await readRTCStatsDump(blob);

    const processor = new RtcStatsProcessor({
      extractors: [sessionMetadataExtractor],
    });
    const result = processor.process(dump!);

    expect(result.data.schemaVersion).toBe('1.2');
    expect(result.data.pConnectionsNumber).toBe(7);
    expect(result.data.pConnections).toBeUndefined();
    expect(result.data.metadata).toEqual({ clientProtocol: 'rtcstats#3.0' });
  });

  it('default extractor list matches createDefaultExtractors()', () => {
    const names = createDefaultExtractors().map((e) => e.name);
    expect(names).toEqual([
      'sessionMetadata',
      'peerConnections',
      'streams',
      'transports',
      'pairTimeSeries',
      'streamTimeSeries',
      'aggregatedStats',
    ]);
  });
});
