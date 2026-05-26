#!/usr/bin/env node
/**
 * Validate the pair.end specification against all ideal pairs.
 * Run after analyze-transport-end-patterns.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readRTCStatsDump } from '../src/lib/rtcstats-shared/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

const DATASETS = [
    { label: 'ideal.json', ideal: path.join(root, 'ideal.json'), upload: path.join(__dirname, '../upload/3d66a2b0-96d5-4d8d-8eae-da6fa82e58c5.log') },
    { label: 'ideal2.json', ideal: path.join(root, 'ideal2.json'), upload: path.join(__dirname, '../upload/rtcstats_dump__1__6d2dc969-125d-445b-ae09-df17b48ee97d') },
    { label: 'ideal3.json', ideal: path.join(root, 'ideal3.json'), upload: path.join(__dirname, '../upload/ef2767b9_73f8_4ff9_9a6f_0a9842a64f18_ff1c0525-0ac5-4646-86a0-1f784a1384b1') },
];

const toISO = (ms) => new Date(ms).toISOString();
const SEG_GAP_MS = 19_000;
const TS_EPS_MS = 2; // ISO rounding between ideal and trace timestamps

function tsEqual(aMs, bMs) {
    return Math.abs(aMs - bMs) <= TS_EPS_MS;
}

function getTs(snap) {
    for (const s of Object.values(snap)) {
        if (s?.timestamp != null) return s.timestamp;
    }
    return null;
}

function activitySig(stat) {
    return JSON.stringify({
        state: stat.state,
        bytesR: stat.bytesReceived ?? 0,
        bytesS: stat.bytesSent ?? 0,
        writable: stat.writable,
        nominated: stat.nominated === true,
    });
}

function buildSegments(timestamps, gapMs = SEG_GAP_MS) {
    if (!timestamps.length) return [];
    const segs = [];
    let cur = [timestamps[0]];
    for (let i = 1; i < timestamps.length; i++) {
        if (timestamps[i] - cur[cur.length - 1] > gapMs) {
            segs.push(cur);
            cur = [];
        }
        cur.push(timestamps[i]);
    }
    if (cur.length) segs.push(cur);
    return segs;
}

function segEnd(ts, segments) {
    for (const s of segments) {
        if (ts >= s[0] && ts <= s[s.length - 1]) return s[s.length - 1];
    }
    return ts;
}

function extractPcContext(trace, transportId, pairId) {
    const pcSnapTs = [];
    const appearances = [];
    let firstTransportSelectedSnap = null;
    let snapIdx = 0;

    for (const event of trace) {
        if (event.type !== 'getStats' || !event.value) continue;
        snapIdx++;
        const snap = event.value;
        const ts = getTs(snap);
        pcSnapTs.push(ts);

        const transport =
            snap[transportId] ?? Object.values(snap).find((s) => s?.type === 'transport');
        if (transport?.selectedCandidatePairId != null && firstTransportSelectedSnap == null) {
            firstTransportSelectedSnap = { idx: snapIdx, ts };
        }

        const stat = snap[pairId];
        if (!stat || stat.type !== 'candidate-pair') continue;

        const local = snap[String(stat.localCandidateId)];
        appearances.push({
            ts,
            snapIdx,
            stat,
            selected: transport?.selectedCandidatePairId != null && String(transport.selectedCandidatePairId) === pairId,
            localType: local ? `${local.candidateType}/${local.protocol ?? 'udp'}` : null,
        });
    }

    if (!appearances.length) return null;

    let lastActivityTs = appearances[0].ts;
    let prevSig = activitySig(appearances[0].stat);
    let everSucceeded = appearances[0].stat.state === 'succeeded';
    const staleEnds = {};
    let staleCount = 0;

    for (let i = 1; i < appearances.length; i++) {
        const { ts, stat } = appearances[i];
        const sig = activitySig(stat);
        if (stat.state === 'succeeded') everSucceeded = true;

        if (sig === prevSig) {
            staleCount++;
        } else {
            staleCount = 0;
            prevSig = sig;
            lastActivityTs = ts;
        }
        if (staleEnds[staleCount] == null) staleEnds[staleCount] = ts;
    }

    const segments = buildSegments(pcSnapTs);
    const firstTs = appearances[0].ts;
    const lastTs = appearances[appearances.length - 1].ts;

    const snap1TransportSelected = (() => {
        for (const event of trace) {
            if (event.type !== 'getStats' || !event.value) continue;
            const transport =
                event.value[transportId] ??
                Object.values(event.value).find((s) => s?.type === 'transport');
            return transport?.selectedCandidatePairId != null;
        }
        return false;
    })();

    return {
        pcTotalSnaps: pcSnapTs.length,
        appearances,
        firstTs,
        lastTs,
        lastActivityTs,
        everSucceeded,
        localType: appearances[0].localType,
        snap1TransportSelected,
        staleEnds,
        segEndFromActivity: segEnd(lastActivityTs, segments),
        segEndFromLastAppear: segEnd(lastTs, segments),
        firstTransportSelectedSnap,
    };
}

/**
 * Confirmed pair.end specification (derived from ideal ↔ trace cross-check).
 */
function computePairEnd(ctx, transportEndMs, transportStartMs) {
    const {
        appearances,
        pcTotalSnaps,
        firstTs,
        lastTs,
        everSucceeded,
        localType,
        snap1TransportSelected,
        staleEnds,
        segEndFromActivity,
        firstTransportSelectedSnap,
    } = ctx;

    // Rule 1: only one snapshot with this pair
    if (appearances.length === 1) return toISO(firstTs);

    // Rule 2: entire PC has ≤2 getStats (teardown / probe PCs)
    if (pcTotalSnaps <= 2) return toISO(lastTs);

    // Rule 3: host pair opened before transport had a selected pair — closed at first snapshot
    if (
        localType?.startsWith('host/') &&
        !snap1TransportSelected &&
        tsEqual(firstTs, transportStartMs)
    ) {
        return toISO(firstTs);
    }

    // Rule 4: pair's last trace appearance aligns with transport end
    if (tsEqual(lastTs, transportEndMs)) return toISO(transportEndMs);

    // Rule 5: pair vanishes from getStats before transport ends
    if (lastTs < transportEndMs - TS_EPS_MS) return toISO(lastTs);

    // Rule 6: inactive pair still present in stats — stale freeze + segment cap
    if (!everSucceeded) {
        const isRelay = localType?.startsWith('relay/');
        const isHost = localType?.startsWith('host/');

        let staleThreshold;
        if (isRelay) {
            if (snap1TransportSelected) staleThreshold = 9;
            else staleThreshold = appearances.length < pcTotalSnaps ? 9 : 10;
        } else if (isHost) {
            staleThreshold = pcTotalSnaps <= 19 ? Math.max(9, pcTotalSnaps - 4) : 14;
            // Host pair ends one snap after transport first gets selectedCandidatePairId
            if (firstTransportSelectedSnap) {
                const endSnap = appearances.find((a) => a.snapIdx === firstTransportSelectedSnap.idx + 1);
                if (endSnap && staleEnds[1] === endSnap.ts) return toISO(endSnap.ts);
            }
        } else {
            staleThreshold = 14;
        }

        const staleEnd = staleEnds[staleThreshold];
        const segCap = segEndFromActivity;
        const candidates = [staleEnd, segCap].filter((t) => t != null);
        if (candidates.length) return toISO(Math.min(...candidates));
    }

    // Rule 7: succeeded but not at transport end — segment boundary from last activity
    return toISO(segEndFromActivity);
}

async function main() {
    const misses = [];
    let total = 0;
    let match = 0;

    for (const { label, ideal: idealPath, upload } of DATASETS) {
        const idealDoc = JSON.parse(fs.readFileSync(idealPath, 'utf-8')).data;
        const content = fs.readFileSync(upload, 'utf-8');
        const dump = await readRTCStatsDump(new Blob([content]));

        for (const [pcId, idealTransports] of Object.entries(idealDoc.transports ?? {})) {
            const trace = dump.peerConnections[pcId];
            if (!trace) continue;

            for (const [transportId, idealTransport] of Object.entries(idealTransports)) {
                const transportEndMs = new Date(idealTransport.end).getTime();
                const transportStartMs = new Date(idealTransport.start).getTime();
                const selectedSet = new Set((idealTransport.selectedPairs ?? []).map(String));

                for (const [pairId, idealPair] of Object.entries(idealTransport.pairs ?? {})) {
                    total++;
                    const ctx = extractPcContext(trace, transportId, pairId);
                    if (!ctx) {
                        misses.push({ dump: label, pcId, pairId, reason: 'no trace' });
                        continue;
                    }

                    const pred = computePairEnd(ctx, transportEndMs, transportStartMs);
                    if (pred === idealPair.end) {
                        match++;
                    } else {
                        misses.push({
                            dump: label,
                            pcId,
                            pairId,
                            ideal: idealPair.end,
                            pred,
                            localType: ctx.localType,
                            snaps: ctx.appearances.length,
                            pcSnaps: ctx.pcTotalSnaps,
                        });
                    }
                }
            }
        }
    }

    console.log(`pair.end spec validation: ${match}/${total} (${((100 * match) / total).toFixed(2)}%)`);
    if (misses.length) {
        console.log('\nMisses:');
        for (const m of misses.slice(0, 20)) console.log(m);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
