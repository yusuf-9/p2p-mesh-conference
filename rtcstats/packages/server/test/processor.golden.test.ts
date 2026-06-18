import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RtcStatsProcessor } from '../src/processor/RtcStatsProcessor.js';
import { processRTCStatsDump } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ID = '4305a27a-2480-4a2c-ba95-ac23c7a4ecb2';

describe('processRTCStatsDump', () => {
  it('matches the reference processed output for the longest upload log', async () => {
    const fixtureDir = path.join(__dirname, 'fixtures');
    const logPath = path.join(fixtureDir, `${FIXTURE_ID}.log`);
    const expectedPath = path.join(fixtureDir, `${FIXTURE_ID}.processed.json`);

    const expected = JSON.parse(readFileSync(expectedPath, 'utf-8'));
    const actual = await processRTCStatsDump(FIXTURE_ID, logPath);

    expect(actual).toEqual(expected);
  });
});

describe('RtcStatsProcessor', () => {
  it('produces identical output via the class API', async () => {
    const fixtureDir = path.join(__dirname, 'fixtures');
    const logPath = path.join(fixtureDir, `${FIXTURE_ID}.log`);
    const expectedPath = path.join(fixtureDir, `${FIXTURE_ID}.processed.json`);
    const expected = JSON.parse(readFileSync(expectedPath, 'utf-8'));

    const processor = RtcStatsProcessor.withDefaults();
    const actual = await processor.processFile(FIXTURE_ID, logPath);

    expect(actual).toEqual(expected);
  });
});
