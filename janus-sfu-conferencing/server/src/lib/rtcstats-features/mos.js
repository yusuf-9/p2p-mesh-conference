import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { score } = require('rtcscore/src/rtc_mos.js');

/** Outbound simulcast layers: blend target fps (30) with stream mean fps for rtcscore. */
const OUTBOUND_EXPECTED_FPS_BLEND = 0.25;
const INBOUND_EXPECTED_FPS = 30;
const POOR_MOS_THRESHOLD = 3.0;
const PERIOD_MERGE_GAP_MS = { inbound: 2000, outbound: 4000 };

function round2(n) {
    return Math.round(n * 100) / 100;
}

export function getTransportRttMs(snap) {
    const transport = Object.values(snap).find(
        s => s?.type === 'transport' && s.selectedCandidatePairId
    );
    if (!transport) return null;
    const pair = snap[transport.selectedCandidatePairId];
    const rtt = pair?.currentRoundTripTime;
    return rtt != null && rtt > 0 ? rtt * 1000 : null;
}

/** Inbound video RTT in reference dumps scales transport RTT (TCP ≈ half, UDP ≈ 0.75). */
export function inboundVideoRttScale(connectionType) {
    if (connectionType?.includes('TCP')) return 0.5;
    return 0.75;
}

function intervalLossPercent(currOk, currLost, prevOk, prevLost) {
    const dOk = (currOk ?? 0) - (prevOk ?? 0);
    const dLost = Math.max(0, (currLost ?? 0) - (prevLost ?? 0));
    if (dOk + dLost > 0) return (dLost / (dOk + dLost)) * 100;
    const total = (currOk ?? 0) + (currLost ?? 0);
    return total > 0 ? ((currLost ?? 0) / total) * 100 : 0;
}

function outboundIntervalLoss(rem, prevRem) {
    const dLost = Math.max(0, (rem?.packetsLost ?? 0) - (prevRem?.packetsLost ?? 0));
    const dReceived = Math.max(
        0,
        (rem?.packetsReceived ?? 0) - (prevRem?.packetsReceived ?? 0)
    );
    if (dReceived + dLost > 0) return (dLost / (dReceived + dLost)) * 100;
    return 0;
}

/**
 * Per active byte interval: jitter (ms), packetLoss (%), rtt (ms), bitrate (kbps), mos.
 * Only intervals with dBytes > 0 are included.
 */
export function collectIntervalMetrics(
    snap,
    prevSnap,
    rtp,
    kind,
    direction,
    dBytes,
    dtSec,
    series,
    statId
) {
    const bitrateKbps = dtSec > 0 ? (dBytes * 8) / dtSec / 1000 : 0;
    let jitter = null;
    let packetLoss = null;
    let rtt = null;

    if (direction === 'outbound' && rtp.remoteId && snap[rtp.remoteId]) {
        const rem = snap[rtp.remoteId];
        const prevRem = prevSnap?.[rtp.remoteId];
        rtt = (rem.roundTripTime ?? 0) * 1000;
        jitter = (rem.jitter ?? 0) * 1000;
        packetLoss = outboundIntervalLoss(rem, prevRem);
    } else if (direction === 'inbound') {
        jitter = (rtp.jitter ?? 0) * 1000;
        const prevRtp = prevSnap?.[statId];
        packetLoss = intervalLossPercent(
            rtp.packetsReceived,
            rtp.packetsLost,
            prevRtp?.packetsReceived,
            prevRtp?.packetsLost
        );
        const transportRtt = getTransportRttMs(snap);
        if (kind === 'video' && transportRtt != null) {
            rtt = transportRtt;
        } else if (transportRtt != null) {
            rtt = transportRtt;
        }
    }

    let mos;
    if (kind === 'audio') {
        mos = score({
            audio: {
                packetLoss: packetLoss ?? 0,
                roundTripTime: rtt ?? 50,
                bufferDelay: jitter ?? 0,
                bitrate: bitrateKbps * 1000,
            },
        }).audio;
    } else {
        const expectedFrameRate = expectedVideoFrameRate(series, statId, direction);
        mos = videoIntervalMos(snap, rtp, direction, bitrateKbps * 1000, expectedFrameRate);
    }

    return { jitter, packetLoss, rtt, bitrateKbps, mos };
}

function getCodecKind(snap, codecId) {
    const mime = codecId && snap[codecId]?.mimeType;
    if (!mime) return 'vp8';
    if (mime.includes('vp9')) return 'vp9';
    if (mime.includes('h264')) return 'h264';
    return 'vp8';
}

function modeFramerate(framesPerSecond) {
    if (!framesPerSecond?.length) return INBOUND_EXPECTED_FPS;
    const counts = new Map();
    for (const [, fps] of framesPerSecond) {
        if (fps > 0) counts.set(fps, (counts.get(fps) ?? 0) + 1);
    }
    if (!counts.size) return INBOUND_EXPECTED_FPS;
    let best = INBOUND_EXPECTED_FPS;
    let bestN = -1;
    for (const [fps, n] of counts) {
        if (n > bestN) {
            bestN = n;
            best = fps;
        }
    }
    return best;
}

function expectedVideoFrameRate(series, statId, direction) {
    if (direction === 'inbound') return INBOUND_EXPECTED_FPS;
    const mode = modeFramerate(series[statId].framesPerSecond);
    return OUTBOUND_EXPECTED_FPS_BLEND * INBOUND_EXPECTED_FPS + (1 - OUTBOUND_EXPECTED_FPS_BLEND) * mode;
}

function audioIntervalMos(snap, rtp, direction, bitrate) {
    let rtt = 50;
    let jitter = 0;
    let loss = 0;

    if (direction === 'outbound' && rtp.remoteId && snap[rtp.remoteId]) {
        const rem = snap[rtp.remoteId];
        rtt = (rem.roundTripTime ?? 0) * 1000;
        jitter = (rem.jitter ?? 0) * 1000;
        const ps = rem.packetsSent ?? 0;
        const pl = rem.packetsLost ?? 0;
        loss = ps + pl > 0 ? (pl / (ps + pl)) * 100 : 0;
    } else if (direction === 'inbound') {
        jitter = (rtp.jitter ?? 0) * 1000;
        const pr = rtp.packetsReceived ?? 0;
        const pl = rtp.packetsLost ?? 0;
        loss = pr + pl > 0 ? (pl / (pr + pl)) * 100 : 0;
        rtt = getTransportRttMs(snap) ?? 50;
    }

    return score({
        audio: { packetLoss: loss, roundTripTime: rtt, bufferDelay: jitter, bitrate },
    }).audio;
}

function videoIntervalMos(snap, rtp, direction, bitrate, expectedFrameRate) {
    const fw = rtp.frameWidth ?? 0;
    const fh = rtp.frameHeight ?? 0;
    const fps = rtp.framesPerSecond ?? 0;
    if (!fw || !fh || fps <= 0) return null;

    let rtt = 50;
    if (direction === 'outbound' && rtp.remoteId && snap[rtp.remoteId]) {
        rtt = (snap[rtp.remoteId].roundTripTime ?? 0) * 1000;
    } else if (direction === 'inbound') {
        rtt = getTransportRttMs(snap) ?? 50;
    }

    const codec = getCodecKind(snap, rtp.codecId);
    return score({
        video: {
            bitrate,
            width: fw,
            height: fh,
            frameRate: fps,
            expectedFrameRate,
            codec,
            roundTripTime: rtt,
            bufferDelay: 0,
        },
    }).video;
}

/**
 * Walk consecutive getStats byte deltas; return interval MOS samples and aggregates.
 */
export function computeStreamQuality(trace, series, statId, kind, direction) {
    const snapshots = trace
        .filter(e => e.type === 'getStats' && e.value)
        .map(e => e.value);
    const bytesKey = direction === 'outbound' ? 'bytesSent' : 'bytesReceived';
    const bytes = series[statId]?.[bytesKey];
    if (!bytes || bytes.length < 2) {
        return { avgMos: null, intervals: [], poorRanges: [] };
    }

    const intervals = [];
    let mosWeightedSum = 0;
    let weightSum = 0;

    for (let i = 1; i < bytes.length; i++) {
        const t0 = bytes[i - 1][0];
        const t1 = bytes[i][0];
        const dtSec = (t1 - t0) / 1000;
        const dBytes = bytes[i][1] - bytes[i - 1][1];
        if (dtSec <= 0 || dBytes < 0) continue;

        const snap = snapshots[i];
        const rtp = snap?.[statId];
        if (!rtp) continue;

        const metrics = collectIntervalMetrics(
            snap,
            snapshots[i - 1],
            rtp,
            kind,
            direction,
            dBytes,
            dtSec,
            series,
            statId
        );
        if (kind === 'video' && metrics.mos == null) continue;

        intervals.push({
            startMs: t0,
            endMs: t1,
            mos: metrics.mos,
            durationSec: dtSec,
            ...metrics,
        });
        mosWeightedSum += metrics.mos * dtSec;
        weightSum += dtSec;
    }

    const poorRanges = [];
    if (kind === 'video') {
        for (const iv of intervals) {
            if (iv.mos < POOR_MOS_THRESHOLD) {
                poorRanges.push([iv.startMs, iv.endMs]);
            }
        }
    }

    return {
        avgMos: weightSum > 0 ? round2(mosWeightedSum / weightSum) : null,
        intervals,
        poorRanges,
    };
}

export function mergePoorPeriods(poorRanges, direction) {
    if (!poorRanges.length) return [];
    const gapMs = PERIOD_MERGE_GAP_MS[direction] ?? 2000;
    poorRanges.sort((a, b) => a[0] - b[0]);
    const merged = [[poorRanges[0][0], poorRanges[0][1]]];
    for (let i = 1; i < poorRanges.length; i++) {
        const [start, end] = poorRanges[i];
        const last = merged[merged.length - 1];
        if (start <= last[1] + gapMs) {
            last[1] = Math.max(last[1], end);
        } else {
            merged.push([start, end]);
        }
    }
    return merged.map(([startTimestamp, endTimestamp]) => ({
        category: 'Poor',
        startTimestamp,
        endTimestamp,
    }));
}
