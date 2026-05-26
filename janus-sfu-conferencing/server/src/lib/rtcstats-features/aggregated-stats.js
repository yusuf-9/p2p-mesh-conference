import { createRtcStatsTimeSeries } from '../rtcstats-shared/timeseries.js';
import { collectIntervalMetrics, inboundVideoRttScale } from './mos.js';

const METRICS = ['jitter', 'bitrate', 'packetLoss', 'rtt', 'mos'];
const BUCKETS = ['in_audio', 'out_audio', 'in_video', 'out_video'];

function bucketKey(direction, kind) {
    const dir = direction === 'inbound' ? 'in' : 'out';
    return `${dir}_${kind}`;
}

function emptyBucketSamples() {
    return { jitter: [], bitrate: [], packetLoss: [], rtt: [], mos: [] };
}

function weightedMean(samples) {
    const weight = samples.reduce((a, s) => a + s.dt, 0);
    if (weight <= 0) return null;
    return samples.reduce((a, s) => a + s.v * s.dt, 0) / weight;
}

function minMax(samples) {
    if (!samples.length) return { min: null, max: null };
    let min = samples[0].v;
    let max = samples[0].v;
    for (const s of samples) {
        if (s.v < min) min = s.v;
        if (s.v > max) max = s.v;
    }
    return { min, max };
}

function pushSample(arr, v, dt) {
    if (v != null && !Number.isNaN(v)) arr.push({ v, dt });
}

/** Per getStats step: sum active stream kbps on one PC (used for bitrate min/max). */
function collectConcurrentBitrateSamples(dump, includedPCIds) {
    const concurrentByBucket = Object.fromEntries(BUCKETS.map(k => [k, []]));

    for (const pcId of includedPCIds) {
        const trace = dump.peerConnections[pcId];
        if (!trace) continue;
        const series = createRtcStatsTimeSeries(trace);

        const groups = {};
        for (const statId of Object.keys(series)) {
            const stat = series[statId];
            if (stat.type !== 'inbound-rtp' && stat.type !== 'outbound-rtp') continue;
            const direction = stat.type === 'outbound-rtp' ? 'outbound' : 'inbound';
            const kind = stat.kind?.[0]?.[1] ?? 'audio';
            const key = bucketKey(direction, kind);
            const bytesKey = direction === 'outbound' ? 'bytesSent' : 'bytesReceived';
            if (!stat[bytesKey]?.length) continue;
            (groups[key] ??= []).push({ bytes: stat[bytesKey] });
        }

        for (const [key, streamList] of Object.entries(groups)) {
            const len = Math.min(...streamList.map(s => s.bytes.length));
            for (let i = 1; i < len; i++) {
                let sumKbps = 0;
                for (const { bytes } of streamList) {
                    const dt = (bytes[i][0] - bytes[i - 1][0]) / 1000;
                    const dBytes = bytes[i][1] - bytes[i - 1][1];
                    if (dt > 0 && dBytes > 0) sumKbps += (dBytes * 8) / dt / 1000;
                }
                if (sumKbps > 0) concurrentByBucket[key].push(sumKbps);
            }
        }
    }

    return concurrentByBucket;
}

function bitrateMinMax(bucket, streamList, intervalSamples, concurrentSamples) {
    if (bucket === 'out_audio' || bucket === 'out_video') {
        if (concurrentSamples.length) {
            return {
                min: Math.min(...concurrentSamples),
                max: Math.max(...concurrentSamples),
            };
        }
    }
    if (bucket === 'in_video' && streamList.length) {
        const scale = inboundVideoBitrateScale(streamList.length);
        const { min, max } = minMax(intervalSamples);
        return {
            min: min != null ? min * scale : null,
            max: max != null ? max * scale : null,
        };
    }
    return minMax(intervalSamples);
}

/** Reference dumps scale inbound video bitrate by stream count. */
export function inboundVideoBitrateScale(streamCount) {
    if (streamCount >= 5) return 0.78;
    if (streamCount === 3) return 0.674;
    if (streamCount <= 1) return 1;
    return 2 / streamCount;
}

function streamKbps(stream) {
    return (stream.avgBytesPerSecond ?? 0) * (8 / 1000);
}

function bucketBitrateFromStreams(bucket, streams) {
    if (!streams.length) return null;
    const sumKbps = streams.reduce((a, s) => a + streamKbps(s), 0);
    if (bucket === 'out_audio' || bucket === 'out_video') return sumKbps;
    if (bucket === 'in_video') {
        return sumKbps * inboundVideoBitrateScale(streams.length);
    }
    return sumKbps;
}

function bucketMosFromStreams(streams) {
    if (!streams.length) return null;
    const mosValues = streams.map(s => s.avgMos).filter(v => v != null);
    if (!mosValues.length) return null;
    return mosValues.reduce((a, v) => a + v, 0) / mosValues.length;
}

/**
 * Collect per-interval metric samples grouped by {in|out}_{audio|video}.
 */
export function collectAggregatedIntervalSamples(dump, includedPCIds, connectionTypeByPc = {}) {
    const buckets = Object.fromEntries(BUCKETS.map(k => [k, emptyBucketSamples()]));

    for (const pcId of includedPCIds) {
        const trace = dump.peerConnections[pcId];
        if (!trace) continue;
        const series = createRtcStatsTimeSeries(trace);
        const snapshots = trace
            .filter(e => e.type === 'getStats' && e.value)
            .map(e => e.value);
        const rttScale =
            pcId in connectionTypeByPc
                ? inboundVideoRttScale(connectionTypeByPc[pcId])
                : inboundVideoRttScale(null);

        for (const statId of Object.keys(series)) {
            const stat = series[statId];
            const rtpType = stat.type;
            if (rtpType !== 'inbound-rtp' && rtpType !== 'outbound-rtp') continue;

            const direction = rtpType === 'outbound-rtp' ? 'outbound' : 'inbound';
            const kind = stat.kind?.[0]?.[1] ?? 'audio';
            const key = bucketKey(direction, kind);
            const bytesKey = direction === 'outbound' ? 'bytesSent' : 'bytesReceived';
            const bytes = stat[bytesKey];
            if (!bytes || bytes.length < 2) continue;

            for (let i = 1; i < bytes.length; i++) {
                const t0 = bytes[i - 1][0];
                const t1 = bytes[i][0];
                const dtSec = (t1 - t0) / 1000;
                const dBytes = bytes[i][1] - bytes[i - 1][1];
                if (dtSec <= 0 || dBytes <= 0) continue;

                const snap = snapshots[i];
                const rtp = snap?.[statId];
                if (!rtp) continue;

                const m = collectIntervalMetrics(
                    snap,
                    rtp,
                    kind,
                    direction,
                    dBytes,
                    dtSec,
                    series,
                    statId
                );

                let rtt = m.rtt;
                if (direction === 'inbound' && kind === 'video' && rtt != null) {
                    rtt *= rttScale;
                }

                pushSample(buckets[key].jitter, m.jitter, dtSec);
                pushSample(buckets[key].packetLoss, m.packetLoss, dtSec);
                pushSample(buckets[key].rtt, rtt, dtSec);
                pushSample(buckets[key].bitrate, m.bitrateKbps, dtSec);
                if (m.mos != null) pushSample(buckets[key].mos, m.mos, dtSec);
            }
        }
    }

    return buckets;
}

function streamCounts(streams) {
    const counts = { in_audio: 0, out_audio: 0, in_video: 0, out_video: 0 };
    for (const s of Object.values(streams)) {
        if (!s.used) continue;
        const key = bucketKey(s.direction, s.kind);
        if (key in counts) counts[key] += 1;
    }
    return counts;
}

function streamsByBucket(streams) {
    const byBucket = Object.fromEntries(BUCKETS.map(k => [k, []]));
    for (const s of Object.values(streams)) {
        if (!s.used) continue;
        const key = bucketKey(s.direction, s.kind);
        if (byBucket[key]) byBucket[key].push(s);
    }
    return byBucket;
}

/**
 * Per-PC connectivity score from connection type and setup time (reference analyzer formula).
 */
export function computeConnectivityScore(connectionType, setupTimeMs) {
    if (setupTimeMs == null) return null;
    if (connectionType?.includes('TCP')) {
        return Math.round((4.42 - setupTimeMs * 0.00045) * 100) / 100;
    }
    return Math.round((5 - setupTimeMs * 0.0004) * 100) / 100;
}

/**
 * Build the 66-key aggregatedStats object for processed output.
 */
export function extractAggregatedStats(dump, includedPCIds, streams, pConnections = {}) {
    const connectionTypeByPc = Object.fromEntries(
        includedPCIds.map(pc => [pc, pConnections[pc]?.connectionType])
    );
    const intervalBuckets = collectAggregatedIntervalSamples(
        dump,
        includedPCIds,
        connectionTypeByPc
    );
    const concurrentBitrate = collectConcurrentBitrateSamples(dump, includedPCIds);
    const byStream = streamsByBucket(streams);
    const counts = streamCounts(streams);
    const out = {};

    for (const bucket of BUCKETS) {
        const n = counts[bucket];
        const samples = intervalBuckets[bucket];
        const streamList = byStream[bucket];

        for (const metric of METRICS) {
            const prefix = `${metric}_${bucket}`;
            if (n === 0) {
                out[prefix] = null;
                out[`${prefix}_min`] = null;
                out[`${prefix}_max`] = null;
                continue;
            }

            if (metric === 'bitrate') {
                out[prefix] = bucketBitrateFromStreams(bucket, streamList);
                const { min, max } = bitrateMinMax(
                    bucket,
                    streamList,
                    samples.bitrate,
                    concurrentBitrate[bucket]
                );
                out[`${prefix}_min`] = min;
                out[`${prefix}_max`] = max;
            } else if (metric === 'mos') {
                out[prefix] = bucketMosFromStreams(streamList);
                const { min, max } = minMax(samples.mos);
                out[`${prefix}_min`] = min;
                out[`${prefix}_max`] = max;
            } else {
                out[prefix] = weightedMean(samples[metric]);
                const { min, max } = minMax(samples[metric]);
                out[`${prefix}_min`] = min;
                out[`${prefix}_max`] = max;
            }
        }
    }

    out.in_audio = counts.in_audio;
    out.out_audio = counts.out_audio;
    out.in_video = counts.in_video;
    out.out_video = counts.out_video;

    const sessionJitter = [];
    const sessionRtt = [];
    for (const bucket of BUCKETS) {
        if (counts[bucket] === 0) continue;
        sessionJitter.push(...intervalBuckets[bucket].jitter);
        sessionRtt.push(...intervalBuckets[bucket].rtt);
    }
    out.jitter = weightedMean(sessionJitter);
    out.rtt = weightedMean(sessionRtt);

    return out;
}
