#!/usr/bin/env node
/** Compare poor-period logic vs ideal on per-interval MOS from raw dump. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRTCStatsDump, createRtcStatsTimeSeries } from '../src/lib/rtcstats-shared/index.js';
import {
    computeStreamQuality,
    mergePoorPeriods,
    collectIntervalMetrics,
} from '../src/lib/rtcstats-features/mos.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const upload = path.join(
    serverRoot,
    'upload',
    'ef2767b9_73f8_4ff9_9a6f_0a9842a64f18_ff1c0525-0ac5-4646-86a0-1f784a1384b1'
);
const ideal = JSON.parse(
    fs.readFileSync(path.join(serverRoot, '..', 'ideal3.json'), 'utf8')
).data;

const dump = await readRTCStatsDump(
    new Blob([fs.readFileSync(upload, 'utf8')], { type: 'text/plain' })
);

const STREAMS = ['PC_0-23', 'PC_0-22', 'PC_2-30', 'PC_3-30'];

function bucket2sMos(intervals, offsetMs = 0) {
    const buckets = new Map();
    for (const iv of intervals) {
        const mid = (iv.startMs + iv.endMs) / 2;
        const bucket = Math.floor((mid - offsetMs) / 2000);
        const b = buckets.get(bucket) ?? { mosSum: 0, weight: 0, t0: Infinity, t1: 0 };
        b.mosSum += iv.mos * iv.durationSec;
        b.weight += iv.durationSec;
        b.t0 = Math.min(b.t0, iv.startMs);
        b.t1 = Math.max(b.t1, iv.endMs);
        buckets.set(bucket, b);
    }
    return [...buckets.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([bucket, b]) => ({
            bucket,
            startMs: bucket * 2000 + offsetMs,
            endMs: (bucket + 1) * 2000 + offsetMs,
            mos: b.weight > 0 ? b.mosSum / b.weight : null,
            poor: b.weight > 0 ? b.mosSum / b.weight < 3.0 : false,
        }));
}

function periodsFromBuckets(buckets, offsetMs = 0) {
    const poor = buckets.filter(b => b.poor);
    const ranges = poor.map(b => [b.startMs, b.endMs]);
    return mergePoorPeriods(ranges, 'outbound').map(p => ({
        ...p,
        grid: `${offsetMs}ms offset`,
    }));
}

function inIdealPeriod(ts, periods) {
    return periods.some(p => ts >= p.startTimestamp && ts <= p.endTimestamp);
}

for (const streamKey of STREAMS) {
    const [pcId, statId] = [streamKey.split('-')[0], streamKey.split('-').slice(1).join('-')];
    const trace = dump.peerConnections[pcId];
    const series = createRtcStatsTimeSeries(trace);
    const stream = ideal.streams[streamKey];
    const direction = stream.direction;
    const kind = stream.kind;

    const quality = computeStreamQuality(trace, series, statId, kind, direction);
    const ourPeriods = mergePoorPeriods(quality.poorRanges, direction);
    const idealPeriods = stream.periods ?? [];

    console.log(`\n${'='.repeat(72)}\n${streamKey} (${direction} ${kind})`);
    console.log(`avgMos: ours=${quality.avgMos} ideal=${stream.avgMos}`);
    console.log(`intervals=${quality.intervals.length} poorIntervals=${quality.poorRanges.length}`);
    console.log(`ourPeriods=${ourPeriods.length} idealPeriods=${idealPeriods.length}`);

    console.log('\nIdeal periods:');
    for (const p of idealPeriods) {
        console.log(
            `  ${new Date(p.startTimestamp).toISOString()} → ${new Date(p.endTimestamp).toISOString()}`
        );
    }
    console.log('Our periods:');
    for (const p of ourPeriods) {
        console.log(
            `  ${new Date(p.startTimestamp).toISOString()} → ${new Date(p.endTimestamp).toISOString()}`
        );
    }

    console.log('\nPer-interval MOS (getStats cadence):');
    console.log('  t_start                  dt    MOS   poor?  ideal?');
    for (const iv of quality.intervals) {
        const ours = iv.mos < 3.0 ? 'P' : '.';
        const idealP = inIdealPeriod(iv.startMs, idealPeriods) ? 'P' : '.';
        const flag = ours !== idealP ? ' <<<' : '';
        console.log(
            `  ${new Date(iv.startMs).toISOString()} ${iv.durationSec.toFixed(2)}s ${iv.mos.toFixed(2).padStart(5)}   ${ours}      ${idealP}${flag}`
        );
    }

    for (const offset of [0, 1000]) {
        const buckets = bucket2sMos(quality.intervals, offset);
        const bucketPeriods = periodsFromBuckets(buckets, offset);
        const poorBuckets = buckets.filter(b => b.poor);
        console.log(`\n2s buckets (offset=${offset}ms): ${poorBuckets.length} poor / ${buckets.length} total → ${bucketPeriods.length} merged period(s)`);
        for (const b of buckets) {
            if (!b.poor && b.mos >= 2.95) continue; // skip clearly good buckets for brevity
            console.log(
                `  bucket ${b.bucket} [${new Date(b.startMs).toISOString()}] mos=${b.mos?.toFixed(2) ?? 'n/a'} ${b.poor ? 'POOR' : 'ok'}`
            );
        }
        if (bucketPeriods.length) {
            console.log('  merged periods:');
            for (const p of bucketPeriods) {
                console.log(
                    `    ${new Date(p.startTimestamp).toISOString()} → ${new Date(p.endTimestamp).toISOString()}`
                );
            }
        }
    }
}
