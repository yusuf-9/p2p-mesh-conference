#!/usr/bin/env node
/** Inspect raw rtcstats dump for video bitrate min/max at various aggregation levels. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRTCStatsDump, createRtcStatsTimeSeries } from '../src/lib/rtcstats-shared/index.js';
import { inboundVideoBitrateScale } from '../src/lib/rtcstats-features/aggregated-stats.js';

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
const includedPCIds = Object.keys(dump.peerConnections)
    .filter(k => k !== 'null')
    .filter(pc => dump.peerConnections[pc].some(e => e.type === 'getStats'));

function intervalKbps(bytes, i) {
    const dt = (bytes[i][0] - bytes[i - 1][0]) / 1000;
    const dBytes = bytes[i][1] - bytes[i - 1][1];
    if (dt <= 0 || dBytes <= 0) return null;
    return { kbps: (dBytes * 8) / dt / 1000, t0: bytes[i - 1][0], t1: bytes[i][0], dt };
}

function streamIntervals(bytes) {
    const out = [];
    for (let i = 1; i < bytes.length; i++) {
        const iv = intervalKbps(bytes, i);
        if (iv) out.push(iv);
    }
    return out;
}

function fmt(n) {
    return n == null ? 'null' : Number(n).toFixed(1);
}

function pct(actual, target) {
    if (target == null || target === 0) return 'n/a';
    return `${Math.abs((actual - target) / target * 100).toFixed(1)}%`;
}

console.log('=== Raw log video bitrate analysis ===');
console.log('Upload:', path.basename(upload));
console.log('PCs with getStats:', includedPCIds.join(', '));
console.log('\nIdeal aggregatedStats (video):');
console.log('  in_video  avg/min/max:', fmt(ideal.aggregatedStats.bitrate_in_video), fmt(ideal.aggregatedStats.bitrate_in_video_min), fmt(ideal.aggregatedStats.bitrate_in_video_max));
console.log('  out_video avg/min/max:', fmt(ideal.aggregatedStats.bitrate_out_video), fmt(ideal.aggregatedStats.bitrate_out_video_min), fmt(ideal.aggregatedStats.bitrate_out_video_max));

const inboundVideoBytes = [];
const outboundVideoBytes = [];

console.log('\n--- Per-stream interval bitrates (from raw bytesReceived/bytesSent deltas) ---');
for (const pcId of includedPCIds) {
    const trace = dump.peerConnections[pcId];
    const series = createRtcStatsTimeSeries(trace);
    for (const statId of Object.keys(series).sort((a, b) => Number(a) - Number(b))) {
        const stat = series[statId];
        if (stat.type !== 'inbound-rtp' && stat.type !== 'outbound-rtp') continue;
        const kind = stat.kind?.[0]?.[1];
        if (kind !== 'video') continue;

        const direction = stat.type === 'outbound-rtp' ? 'outbound' : 'inbound';
        const bytesKey = direction === 'outbound' ? 'bytesSent' : 'bytesReceived';
        const bytes = stat[bytesKey];
        if (!bytes || bytes.length < 2) continue;

        const intervals = streamIntervals(bytes);
        if (!intervals.length) continue;

        const kbps = intervals.map(x => x.kbps);
        const min = Math.min(...kbps);
        const max = Math.max(...kbps);
        const mean = kbps.reduce((a, v) => a + v, 0) / kbps.length;
        const key = `${pcId}-${statId}`;

        if (direction === 'inbound') inboundVideoBytes.push({ key, pcId, bytes, intervals, min, max, mean });
        else outboundVideoBytes.push({ key, pcId, bytes, intervals, min, max, mean });

        const idealStream = ideal.streams[key];
        console.log(
            `\n${key} (${direction}) n=${intervals.length} intervals` +
                (idealStream ? ` | ideal avgBps=${fmt(idealStream.avgBytesPerSecond * 8 / 1000)} kbps` : '')
        );
        console.log(`  raw interval kbps: min=${fmt(min)} max=${fmt(max)} mean=${fmt(mean)}`);
        const lowest = [...intervals].sort((a, b) => a.kbps - b.kbps).slice(0, 3);
        const highest = [...intervals].sort((a, b) => b.kbps - a.kbps).slice(0, 3);
        console.log('  lowest 3 intervals:');
        for (const iv of lowest) {
            console.log(`    ${fmt(iv.kbps)} kbps  Δt=${iv.dt.toFixed(2)}s  [${new Date(iv.t0).toISOString()} → ${new Date(iv.t1).toISOString()}]`);
        }
        console.log('  highest 3 intervals:');
        for (const iv of highest) {
            console.log(`    ${fmt(iv.kbps)} kbps  Δt=${iv.dt.toFixed(2)}s  [${new Date(iv.t0).toISOString()} → ${new Date(iv.t1).toISOString()}]`);
        }
    }
}

console.log('\n--- Session-level inbound video aggregations ---');
const scale = inboundVideoBitrateScale(inboundVideoBytes.length);
console.log(`Inbound video streams: ${inboundVideoBytes.length}, scale=${scale}`);

// Per-stream extrema summed
const sumMin = inboundVideoBytes.reduce((a, s) => a + s.min, 0);
const sumMax = inboundVideoBytes.reduce((a, s) => a + s.max, 0);
const sumMean = inboundVideoBytes.reduce((a, s) => a + s.mean, 0);
console.log('\nSum of per-stream interval extrema (unscaled kbps):');
console.log(`  min=${fmt(sumMin)} max=${fmt(sumMax)} mean-of-means=${fmt(sumMean)}`);
console.log(`  scaled: min=${fmt(sumMin * scale)} max=${fmt(sumMax * scale)} avg=${fmt(sumMean * scale)}`);

// Global min of per-stream mins / max of per-stream maxes
console.log('\nGlobal per-stream interval extrema (unscaled kbps):');
console.log(`  min-of-mins=${fmt(Math.min(...inboundVideoBytes.map(s => s.min)))} max-of-maxes=${fmt(Math.max(...inboundVideoBytes.map(s => s.max)))}`);

// 2s bucket sums
const bucketSums = new Map();
for (const { intervals } of inboundVideoBytes) {
    for (const iv of intervals) {
        const bucket = Math.floor(iv.t1 / 2000);
        bucketSums.set(bucket, (bucketSums.get(bucket) ?? 0) + iv.kbps);
    }
}
const bucketVals = [...bucketSums.values()];
console.log('\n2s wall-clock bucket sums (all inbound video, unscaled kbps):');
console.log(`  buckets=${bucketVals.length} min=${fmt(Math.min(...bucketVals))} max=${fmt(Math.max(...bucketVals))}`);
console.log(`  scaled: min=${fmt(Math.min(...bucketVals) * scale)} max=${fmt(Math.max(...bucketVals) * scale)}`);
console.log(`  vs ideal min/max: ${pct(Math.min(...bucketVals) * scale, ideal.aggregatedStats.bitrate_in_video_min)} / ${pct(Math.max(...bucketVals) * scale, ideal.aggregatedStats.bitrate_in_video_max)}`);

// Index-aligned session sums
const minLen = Math.min(...inboundVideoBytes.map(s => s.bytes.length));
const alignedSums = [];
for (let i = 1; i < minLen; i++) {
    let sum = 0;
    let ok = true;
    for (const { bytes } of inboundVideoBytes) {
        const iv = intervalKbps(bytes, i);
        if (!iv) {
            ok = false;
            break;
        }
        sum += iv.kbps;
    }
    if (ok) alignedSums.push(sum);
}
console.log('\nIndex-aligned session sums (same getStats index on all streams, unscaled kbps):');
console.log(`  samples=${alignedSums.length} min=${fmt(Math.min(...alignedSums))} max=${fmt(Math.max(...alignedSums))}`);
console.log(`  scaled: min=${fmt(Math.min(...alignedSums) * scale)} max=${fmt(Math.max(...alignedSums) * scale)}`);

// Outbound video concurrent per PC
console.log('\n--- Outbound video (publisher simulcast) ---');
for (const { key, pcId, min, max, mean, intervals } of outboundVideoBytes) {
    console.log(`${key} on ${pcId}: min=${fmt(min)} max=${fmt(max)} mean=${fmt(mean)} n=${intervals.length}`);
}
if (outboundVideoBytes.length) {
    const outPc = outboundVideoBytes[0].pcId;
    const outStreams = outboundVideoBytes.filter(s => s.pcId === outPc);
    const oMinLen = Math.min(...outStreams.map(s => s.bytes.length));
    const outConcurrent = [];
    for (let i = 1; i < oMinLen; i++) {
        let sum = 0;
        for (const { bytes } of outStreams) {
            const iv = intervalKbps(bytes, i);
            if (iv) sum += iv.kbps;
        }
        if (sum > 0) outConcurrent.push(sum);
    }
    console.log(`\nConcurrent outbound video sum on ${outPc} (simulcast layers, kbps):`);
    console.log(`  min=${fmt(Math.min(...outConcurrent))} max=${fmt(Math.max(...outConcurrent))} mean=${fmt(outConcurrent.reduce((a,v)=>a+v,0)/outConcurrent.length)}`);
    console.log(`  ideal out_video min/max: ${fmt(ideal.aggregatedStats.bitrate_out_video_min)} / ${fmt(ideal.aggregatedStats.bitrate_out_video_max)}`);
}
