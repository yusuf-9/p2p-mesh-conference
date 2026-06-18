import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { detectRTCStatsDump, readRTCStatsDump } from '../src/dump.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ID = '4305a27a-2480-4a2c-ba95-ac23c7a4ecb2';
const fixtureDir = path.join(__dirname, 'fixtures');
const logPath = path.join(fixtureDir, `${FIXTURE_ID}.log`);

describe('readRTCStatsDump', () => {
  it('detects RTCStats dump format', async () => {
    const blob = new Blob([readFileSync(logPath)], { type: 'text/plain' });
    await expect(detectRTCStatsDump(blob)).resolves.toBe(true);
  });

  it('parses session metadata and peer connection traces', async () => {
    const blob = new Blob([readFileSync(logPath)], { type: 'text/plain' });
    const dump = await readRTCStatsDump(blob);

    expect(dump).toBeDefined();
    expect(dump!.userId).toBe(FIXTURE_ID);
    expect(dump!.roomId).toBe('6aeec75e-ea15-4021-aecb-4d52c601fb39');
    expect(Object.keys(dump!.peerConnections)).toContain('null');
    expect(Object.keys(dump!.peerConnections)).toContain('PC_0');

    const clientTrace = dump!.peerConnections.null!;
    expect(clientTrace.some((event) => event.type === 'create')).toBe(true);
    expect(clientTrace.some((event) => event.type === 'navigator.mediaDevices.getUserMedia')).toBe(true);

    const publisherTrace = dump!.peerConnections.PC_0!;
    expect(publisherTrace.some((event) => event.type === 'getStats')).toBe(true);
    expect(publisherTrace.find((event) => event.type === 'create')?.value).toMatchObject({
      iceServers: expect.any(Array),
    });
  });

  it('decompresses getStats deltas into full stat reports', async () => {
    const blob = new Blob([readFileSync(logPath)], { type: 'text/plain' });
    const dump = await readRTCStatsDump(blob);
    const statsEvent = dump!.peerConnections.PC_0!.find((event) => event.type === 'getStats' && event.value);

    expect(statsEvent).toBeDefined();
    const report = statsEvent!.value as Record<string, Record<string, unknown>>;
    const statIds = Object.keys(report);
    expect(statIds.length).toBeGreaterThan(0);

    const firstStat = report[statIds[0]!]!;
    expect(firstStat.timestamp).toEqual(expect.any(Number));
    expect(firstStat.type).toEqual(expect.any(String));
  });
});
