/**
 * Phase 7: per-RTP-stream getStats time series for Streams tab charts.
 */

import { createRtcStatsTimeSeries } from '../rtcstats-shared/timeseries.js';
import { getFirstStatsTimestamp } from './transport-utils.js';
import {
    collectStreamQualityIntervals,
    getTransportRttMs,
    qualityBucket,
} from './mos.js';

const MS_FIELDS = new Set(['jitter', 'roundTripTime', 'totalRoundTripTime']);

const REMOTE_LATENCY_FIELDS = [
    'jitter',
    'roundTripTime',
    'totalRoundTripTime',
    'roundTripTimeMeasurements',
];

const INBOUND_SERIES_FIELDS = {
    bytes: ['bytesReceived', 'headerBytesReceived'],
    packets: ['packetsReceived', 'packetsLost'],
    frames: [
        'framesPerSecond',
        'framesReceived',
        'framesDecoded',
        'framesDropped',
        'frameWidth',
        'frameHeight',
    ],
    quality: ['fractionLost', 'jitterBufferDelay', 'jitterBufferEmittedCount'],
    performance: ['totalDecodeTime', 'jitterBufferDelay', 'jitterBufferEmittedCount'],
};

const OUTBOUND_SERIES_FIELDS = {
    bytes: ['bytesSent', 'headerBytesSent', 'bytesDiscardedOnSend', 'availableOutgoingBitrate'],
    packets: ['packetsSent', 'packetsDiscardedOnSend'],
    frames: ['framesPerSecond', 'framesSent', 'frameWidth', 'frameHeight'],
    quality: ['fractionLost'],
    performance: [
        'totalEncodeTime',
        'qpSum',
        'qualityLimitationReason',
        'powerEfficientEncoder',
    ],
};

const BOOLEAN_FIELDS = new Set(['powerEfficientEncoder', 'powerEfficientDecoder']);

function parseStreamKey(streamKey) {
    const dash = streamKey.lastIndexOf('-');
    if (dash <= 0) return null;
    return {
        peerId: streamKey.slice(0, dash),
        statId: streamKey.slice(dash + 1),
    };
}

function toMs(iso) {
    if (!iso) return null;
    return new Date(iso).getTime();
}

function appendSample(series, ts, value) {
    if (value == null || Number.isNaN(value)) return;
    series.push([ts, value]);
}

function normalizeMetricValue(field, value) {
    if (value == null || Number.isNaN(value)) return null;
    if (BOOLEAN_FIELDS.has(field)) return value ? 1 : 0;
    if (typeof value === 'string') return value;
    if (MS_FIELDS.has(field)) return value * 1000;
    return value;
}

function clipSeries(points, startMs, endMs) {
    if (!points?.length) return [];
    if (startMs == null && endMs == null) return points;
    return points.filter(([ts]) => {
        if (startMs != null && ts < startMs) return false;
        if (endMs != null && ts > endMs) return false;
        return true;
    });
}

function copySeriesField(statSeries, field, startMs, endMs) {
    const points = statSeries[field];
    if (!points?.length) return [];
    return clipSeries(
        points.map(([ts, value]) => [ts, normalizeMetricValue(field, value)]),
        startMs,
        endMs
    );
}

function createStreamSeriesStore(kind, direction) {
    const fieldMap = direction === 'outbound' ? OUTBOUND_SERIES_FIELDS : INBOUND_SERIES_FIELDS;
    const store = {
        latency: { jitter: [] },
        bytes: Object.fromEntries(fieldMap.bytes.map(f => [f, []])),
        packets: Object.fromEntries(fieldMap.packets.map(f => [f, []])),
        quality: {
            mos: [],
            packetLoss: [],
            ...Object.fromEntries(fieldMap.quality.map(f => [f, []])),
        },
        meta: { quality: [] },
    };

    if (kind === 'video') {
        store.frames = Object.fromEntries(fieldMap.frames.map(f => [f, []]));
        store.performance = Object.fromEntries(fieldMap.performance.map(f => [f, []]));
    }

    if (direction === 'outbound') {
        for (const field of REMOTE_LATENCY_FIELDS) {
            if (field !== 'jitter') store.latency[field] = [];
        }
    } else {
        store.latency.roundTripTime = [];
    }

    return store;
}

function copyCounterGroups(store, statSeries, kind, direction, startMs, endMs) {
    const fieldMap = direction === 'outbound' ? OUTBOUND_SERIES_FIELDS : INBOUND_SERIES_FIELDS;

    for (const field of fieldMap.bytes) {
        const pts = copySeriesField(statSeries, field, startMs, endMs);
        if (pts.length) store.bytes[field] = pts;
    }
    for (const field of fieldMap.packets) {
        const pts = copySeriesField(statSeries, field, startMs, endMs);
        if (pts.length) store.packets[field] = pts;
    }
    for (const field of fieldMap.quality) {
        const pts = copySeriesField(statSeries, field, startMs, endMs);
        if (pts.length) store.quality[field] = pts;
    }

    if (kind === 'video') {
        for (const field of fieldMap.frames) {
            const pts = copySeriesField(statSeries, field, startMs, endMs);
            if (pts.length) store.frames[field] = pts;
        }
        for (const field of fieldMap.performance) {
            const pts = copySeriesField(statSeries, field, startMs, endMs);
            if (pts.length) store.performance[field] = pts;
        }
    }

    if (direction === 'inbound') {
        const jitterPts = copySeriesField(statSeries, 'jitter', startMs, endMs);
        if (jitterPts.length) store.latency.jitter = jitterPts;
    }
}

function appendOutboundRemoteLatency(store, trace, statId, startMs, endMs) {
    for (const event of trace) {
        if (event.type !== 'getStats' || !event.value) continue;

        const snap = event.value;
        const snapTs = getFirstStatsTimestamp(snap) ?? event.timestamp;
        if (startMs != null && snapTs < startMs) continue;
        if (endMs != null && snapTs > endMs) continue;

        const rtp = snap[statId];
        if (!rtp?.remoteId) continue;

        const rem = snap[rtp.remoteId];
        if (!rem) continue;

        for (const field of REMOTE_LATENCY_FIELDS) {
            appendSample(store.latency[field], snapTs, normalizeMetricValue(field, rem[field]));
        }
    }
}

function appendInboundLatency(store, trace, statId, startMs, endMs) {
    for (const event of trace) {
        if (event.type !== 'getStats' || !event.value) continue;

        const snap = event.value;
        const snapTs = getFirstStatsTimestamp(snap) ?? event.timestamp;
        if (startMs != null && snapTs < startMs) continue;
        if (endMs != null && snapTs > endMs) continue;

        if (!snap[statId]) continue;

        const rtt = getTransportRttMs(snap);
        appendSample(store.latency.roundTripTime, snapTs, rtt);
    }
}

function appendOutboundBitrateFallback(store, trace, statId, startMs, endMs) {
    if (store.bytes.availableOutgoingBitrate?.length) return;

    for (const event of trace) {
        if (event.type !== 'getStats' || !event.value) continue;

        const snap = event.value;
        const snapTs = getFirstStatsTimestamp(snap) ?? event.timestamp;
        if (startMs != null && snapTs < startMs) continue;
        if (endMs != null && snapTs > endMs) continue;

        const rtp = snap[statId];
        let bitrate = rtp?.availableOutgoingBitrate;
        if (bitrate == null) {
            const transport = Object.values(snap).find(s => s?.type === 'transport');
            bitrate = transport?.availableOutgoingBitrate;
        }
        appendSample(store.bytes.availableOutgoingBitrate, snapTs, bitrate);
    }
}

function appendQualityIntervals(store, trace, series, statId, kind, direction, startMs, endMs) {
    const intervals = collectStreamQualityIntervals(trace, series, statId, kind, direction);

    for (const iv of intervals) {
        if (startMs != null && iv.endMs < startMs) continue;
        if (endMs != null && iv.endMs > endMs) continue;

        appendSample(store.quality.mos, iv.endMs, iv.mos);
        appendSample(store.quality.packetLoss, iv.endMs, iv.packetLoss);

        const bucket = qualityBucket(iv.mos);
        if (bucket) store.meta.quality.push([iv.endMs, bucket]);
    }
}

function pruneEmptyMetrics(store) {
    const out = {};

    for (const [group, fields] of Object.entries(store)) {
        if (group === 'meta') {
            const meta = {};
            for (const [key, series] of Object.entries(fields)) {
                if (series.length) meta[key] = series;
            }
            if (Object.keys(meta).length) out.meta = meta;
            continue;
        }

        const groupOut = {};
        for (const [field, series] of Object.entries(fields)) {
            if (series.length) groupOut[field] = series;
        }
        if (Object.keys(groupOut).length) out[group] = groupOut;
    }

    return out;
}

function extractStreamTimeSeriesForPc(trace, pcStreams, series) {
    const result = {};

    for (const [streamKey, stream] of Object.entries(pcStreams)) {
        const parsed = parseStreamKey(streamKey);
        if (!parsed) continue;

        const { statId } = parsed;
        const statSeries = series[statId];
        if (!statSeries) continue;

        const { direction, kind } = stream;
        const startMs = toMs(stream.start);
        const endMs = toMs(stream.end);

        const store = createStreamSeriesStore(kind, direction);
        copyCounterGroups(store, statSeries, kind, direction, startMs, endMs);

        if (direction === 'outbound') {
            appendOutboundRemoteLatency(store, trace, statId, startMs, endMs);
            appendOutboundBitrateFallback(store, trace, statId, startMs, endMs);
        } else {
            appendInboundLatency(store, trace, statId, startMs, endMs);
        }

        appendQualityIntervals(store, trace, series, statId, kind, direction, startMs, endMs);

        const pruned = pruneEmptyMetrics(store);
        if (Object.keys(pruned).length) {
            result[streamKey] = pruned;
        }
    }

    return result;
}

/**
 * @param {object} dump
 * @param {string[]} includedPCIds
 * @param {Record<string, object>} streams
 * @returns {Record<string, object>}
 */
export function extractStreamTimeSeries(dump, includedPCIds, streams) {
    const streamsByPc = {};

    for (const [streamKey, stream] of Object.entries(streams)) {
        const peerId = stream.peerId ?? parseStreamKey(streamKey)?.peerId;
        if (!peerId) continue;
        if (!streamsByPc[peerId]) streamsByPc[peerId] = {};
        streamsByPc[peerId][streamKey] = stream;
    }

    const result = {};

    for (const pcId of includedPCIds) {
        const pcStreams = streamsByPc[pcId];
        if (!pcStreams || !Object.keys(pcStreams).length) continue;

        const trace = dump.peerConnections[pcId];
        if (!trace) continue;

        const series = createRtcStatsTimeSeries(trace);
        const pcSeries = extractStreamTimeSeriesForPc(trace, pcStreams, series);
        Object.assign(result, pcSeries);
    }

    return result;
}
