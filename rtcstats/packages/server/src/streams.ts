// @ts-nocheck — legacy module; typed incrementally.
import { createRtcStatsTimeSeries } from '@rtcstats/core';
import { computeStreamQuality, mergePoorPeriods } from './mos.js';

const toISO = ms => (ms != null ? new Date(ms).toISOString() : null);

function lastNonNull(series, prop) {
    const pts = series[prop];
    if (!pts?.length) return null;
    for (let i = pts.length - 1; i >= 0; i--) {
        const v = pts[i][1];
        if (v != null) return v;
    }
    return null;
}

function firstTimestamp(series, prop) {
    const pts = series[prop];
    if (!pts?.length) return null;
    return pts[0][0];
}

function lastTimestamp(series, prop) {
    const pts = series[prop];
    if (!pts?.length) return null;
    return pts[pts.length - 1][0];
}

function streamUsed(series, direction) {
    const key = direction === 'outbound' ? 'bytesSent' : 'bytesReceived';
    const bytes = series[key];
    if (!bytes?.length) return false;
    if (bytes.length < 2) return true;
    const first = bytes.find(p => p[1] != null)?.[1] ?? 0;
    const last = bytes[bytes.length - 1][1] ?? 0;
    return last >= first;
}

/**
 * Mean of positive byte-rate samples between consecutive getStats snapshots.
 * Matches reference dumps when:
 * - outbound simulcast `rid === 'low'`: subtract header byte deltas from payload
 * - otherwise: skip the first growth interval (ramp-up sample is excluded from the mean)
 */
export function avgBytesPerSecond(bytesSeries, headerSeries, subtractHeader = false) {
    if (!bytesSeries || bytesSeries.length < 2) return 0;

    let begin = 1;
    for (let i = 1; i < bytesSeries.length; i++) {
        if (bytesSeries[i][1] > bytesSeries[0][1]) {
            begin = subtractHeader ? i : i + 1;
            break;
        }
    }

    let sum = 0;
    let count = 0;
    for (let i = begin; i < bytesSeries.length; i++) {
        const dt = (bytesSeries[i][0] - bytesSeries[i - 1][0]) / 1000;
        let dBytes = bytesSeries[i][1] - bytesSeries[i - 1][1];
        if (subtractHeader && headerSeries) {
            dBytes -= (headerSeries[i][1] ?? 0) - (headerSeries[i - 1][1] ?? 0);
        }
        if (dt > 0 && dBytes > 0) {
            sum += dBytes / dt;
            count++;
        }
    }
    return count > 0 ? sum / count : 0;
}

/**
 * Fraction of consecutive getStats intervals where payload bytes did not grow.
 * When this is high (subscriber bursty / SFU pacing), reference `avgBytesPerSecond` uses
 * mean(max(0, dBytes) / dt) over **all** intervals — not only strictly positive-growth intervals.
 */
export function fractionNonGrowingByteIntervals(bytesSeries, headerSeries, subtractHeader = false) {
    if (!bytesSeries || bytesSeries.length < 2) return 0;
    let flat = 0;
    let total = 0;
    for (let i = 1; i < bytesSeries.length; i++) {
        const dt = (bytesSeries[i][0] - bytesSeries[i - 1][0]) / 1000;
        if (dt <= 0) continue;
        total++;
        let dBytes = bytesSeries[i][1] - bytesSeries[i - 1][1];
        if (subtractHeader && headerSeries) {
            dBytes -= (headerSeries[i][1] ?? 0) - (headerSeries[i - 1][1] ?? 0);
        }
        if (dBytes <= 0) flat++;
    }
    return total > 0 ? flat / total : 0;
}

/** Mean of max(0, payload rate) per interval; counts flat intervals as 0 kbps (reference analyzer). */
export function avgBytesPerSecondAllNonNegativeIntervals(
    bytesSeries,
    headerSeries,
    subtractHeader = false
) {
    if (!bytesSeries || bytesSeries.length < 2) return 0;

    let sum = 0;
    let count = 0;
    for (let i = 1; i < bytesSeries.length; i++) {
        const dt = (bytesSeries[i][0] - bytesSeries[i - 1][0]) / 1000;
        if (dt <= 0) continue;
        let dBytes = bytesSeries[i][1] - bytesSeries[i - 1][1];
        if (subtractHeader && headerSeries) {
            dBytes -= (headerSeries[i][1] ?? 0) - (headerSeries[i - 1][1] ?? 0);
        }
        sum += Math.max(0, dBytes) / dt;
        count++;
    }
    return count > 0 ? sum / count : 0;
}

/** Above this flat-interval share, inbound video uses `avgBytesPerSecondAllNonNegativeIntervals`. */
const INBOUND_VIDEO_FLAT_INTERVAL_THRESHOLD = 0.03;

function globalAvgBytesPerSecond(bytesSeries, headerSeries, subtractHeader = false) {
    if (!bytesSeries || bytesSeries.length < 2) return 0;
    const t0 = bytesSeries[0][0];
    const t1 = bytesSeries[bytesSeries.length - 1][0];
    const dt = (t1 - t0) / 1000;
    if (dt <= 0) return 0;

    let dBytes = (bytesSeries[bytesSeries.length - 1][1] ?? 0) - (bytesSeries[0][1] ?? 0);
    if (subtractHeader && headerSeries?.length >= bytesSeries.length) {
        dBytes -=
            (headerSeries[headerSeries.length - 1][1] ?? 0) -
            (headerSeries[0][1] ?? 0);
    }
    return dBytes > 0 ? dBytes / dt : 0;
}

function detectStall(bytesSeries, thresholdMs = 30000) {
    if (!bytesSeries || bytesSeries.length < 2) {
        return { stalled: false, stalledSinceTimestamp: null };
    }
    let lastGrowthTs = bytesSeries[0][0];
    for (let i = 1; i < bytesSeries.length; i++) {
        if ((bytesSeries[i][1] ?? 0) > (bytesSeries[i - 1][1] ?? 0)) {
            lastGrowthTs = bytesSeries[i][0];
        }
    }
    const tailMs = bytesSeries[bytesSeries.length - 1][0] - lastGrowthTs;
    if (tailMs >= thresholdMs) {
        return { stalled: true, stalledSinceTimestamp: lastGrowthTs };
    }
    return { stalled: false, stalledSinceTimestamp: null };
}

/** @param {string} statId WebRTC-Stats report id (numeric or string). */
export function shouldSubtractHeaderBytes(direction, rid, statId) {
    return direction === 'outbound' && rid === 'low' && /^\d+$/.test(String(statId));
}

export function modeResolution(frameWidth, frameHeight) {
    if (!frameWidth?.length || !frameHeight?.length) return null;
    const counts = new Map();
    for (let i = 0; i < frameWidth.length; i++) {
        const w = frameWidth[i][1];
        const h = frameHeight[i]?.[1];
        if (w > 0 && h > 0) {
            const key = `${w}x${h}`;
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
    }
    if (!counts.size) return null;
    let best = null;
    let bestN = -1;
    for (const [k, n] of counts) {
        if (n > bestN) {
            bestN = n;
            best = k;
        }
    }
    return best;
}

export function avgFramerate(framesPerSecond, bytesSeries) {
    if (!framesPerSecond?.length) return null;
    const positive = framesPerSecond.filter(([, fps]) => fps > 0);
    if (!positive.length) return 0;
    if (positive.length === 1) {
        return bytesSeries && bytesSeries.length >= 2 ? 0 : Math.round(positive[0][1]);
    }
    const counts = new Map();
    for (const [, fps] of positive) {
        counts.set(fps, (counts.get(fps) ?? 0) + 1);
    }
    let best = null;
    let bestN = -1;
    for (const [fps, n] of counts) {
        if (n > bestN) {
            bestN = n;
            best = fps;
        }
    }
    return Math.round(best);
}

function lookupCodecName(lastSnap, codecId) {
    if (!codecId || !lastSnap?.[codecId]) return null;
    const mime = lastSnap[codecId].mimeType ?? '';
    const slash = mime.indexOf('/');
    if (slash === -1) return mime || null;
    const name = mime.slice(slash + 1);
    if (name.toLowerCase() === 'vp8' || name.toLowerCase() === 'vp9') {
        return name.toUpperCase();
    }
    return name.toLowerCase();
}

function getLastStatsSnapshot(trace) {
    for (let i = trace.length - 1; i >= 0; i--) {
        if (trace[i].type === 'getStats' && trace[i].value) return trace[i].value;
    }
    return null;
}

function buildStreamEntry(pcId, statId, series, trace, direction, kind) {
    const bytesKey = direction === 'outbound' ? 'bytesSent' : 'bytesReceived';
    const bytesSeries = series[statId][bytesKey];
    const used = streamUsed(series[statId], direction);
    if (!used) return null;

    const start = toISO(firstTimestamp(series[statId], bytesKey));
    const end = toISO(lastTimestamp(series[statId], bytesKey));
    const lastSnap = getLastStatsSnapshot(trace);
    const lastRtp = lastSnap?.[statId];
    const headerKey =
        direction === 'outbound' ? 'headerBytesSent' : 'headerBytesReceived';
    const subtractHeader = shouldSubtractHeaderBytes(
        direction,
        lastRtp?.rid,
        statId
    );

    const quality = computeStreamQuality(trace, series, statId, kind, direction);
    const stall =
        direction === 'inbound' && kind === 'video'
            ? detectStall(bytesSeries)
            : { stalled: false, stalledSinceTimestamp: null };
    const headerSeries = series[statId][headerKey];
    let avgBps;
    if (stall.stalled) {
        avgBps = globalAvgBytesPerSecond(bytesSeries, headerSeries, subtractHeader);
    } else if (direction === 'inbound' && kind === 'video') {
        const flatFrac = fractionNonGrowingByteIntervals(bytesSeries, headerSeries, subtractHeader);
        avgBps =
            flatFrac > INBOUND_VIDEO_FLAT_INTERVAL_THRESHOLD
                ? avgBytesPerSecondAllNonNegativeIntervals(
                      bytesSeries,
                      headerSeries,
                      subtractHeader
                  )
                : avgBytesPerSecond(bytesSeries, headerSeries, subtractHeader);
    } else {
        avgBps = avgBytesPerSecond(bytesSeries, headerSeries, subtractHeader);
    }

    const entry = {
        peerId: pcId,
        ssrc: lastNonNull(series[statId], 'ssrc'),
        ssrcId: statId,
        direction,
        kind,
        start,
        end,
        codecName: lookupCodecName(lastSnap, lastRtp?.codecId),
        avgBytesPerSecond: avgBps,
        used: true,
        avgMos: quality.avgMos,
        simulcast: false,
    };

    if (kind === 'video') {
        const resolution = modeResolution(
            series[statId].frameWidth,
            series[statId].frameHeight
        );
        const framerate = avgFramerate(
            series[statId].framesPerSecond,
            bytesSeries
        );
        if (resolution) entry.resolution = resolution;
        if (framerate != null) entry.framerate = framerate;

        const periods = mergePoorPeriods(quality.poorRanges, direction);
        if (periods.length) entry.periods = periods;

        if (lastRtp) {
            if (lastRtp.rid != null) entry.rid = lastRtp.rid;
            if (lastRtp.scalabilityMode != null) entry.scalabilityMode = lastRtp.scalabilityMode;
            if (direction === 'outbound') {
                if (lastRtp.encoderImplementation != null) {
                    entry.encoder = lastRtp.encoderImplementation;
                }
                if (lastRtp.powerEfficientEncoder != null) {
                    entry.powerEfficient = lastRtp.powerEfficientEncoder;
                }
                entry.simulcast = Boolean(lastRtp.rid);
            } else {
                if (lastRtp.decoderImplementation != null) {
                    entry.decoder = lastRtp.decoderImplementation;
                }
                if (lastRtp.powerEfficientDecoder != null) {
                    entry.powerEfficient = lastRtp.powerEfficientDecoder;
                }
            }
        }
    }

    if (direction === 'inbound' && kind === 'video') {
        entry.stalled = stall.stalled;
        if (stall.stalledSinceTimestamp != null) {
            entry.stalledSinceTimestamp = stall.stalledSinceTimestamp;
        }
    }

    return entry;
}

/**
 * Extract active RTP streams for included peer connections.
 * Keys: `{peerId}-{statsReportId}` (e.g. `PC_0-16`).
 */
export function extractStreams(dump, includedPCIds) {
    const streams = {};

    for (const pcId of includedPCIds) {
        const trace = dump.peerConnections[pcId];
        if (!trace) continue;

        const series = createRtcStatsTimeSeries(trace);
        for (const statId of Object.keys(series)) {
            const statType = series[statId].type;
            if (statType !== 'inbound-rtp' && statType !== 'outbound-rtp') continue;

            const kind = series[statId].kind?.[0]?.[1];
            if (kind !== 'audio' && kind !== 'video') continue;

            const direction = statType === 'outbound-rtp' ? 'outbound' : 'inbound';
            const entry = buildStreamEntry(pcId, statId, series, trace, direction, kind);
            if (entry) {
                streams[`${pcId}-${statId}`] = entry;
            }
        }
    }

    return streams;
}
