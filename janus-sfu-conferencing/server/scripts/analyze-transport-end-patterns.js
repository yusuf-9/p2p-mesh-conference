#!/usr/bin/env node
/**
 * Empirical analysis: derive pair.end rules from ideal JSON vs raw rtcstats traces.
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

function buildSegments(timestamps, gapMs) {
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

function extractPairTrace(trace, transportId, pairId) {
    const pcSnapTs = [];
    const appearances = [];

    for (const event of trace) {
        if (event.type !== 'getStats' || !event.value) continue;
        const snap = event.value;
        const ts = getTs(snap);
        pcSnapTs.push(ts);

        const transport =
            snap[transportId] ?? Object.values(snap).find((s) => s?.type === 'transport');
        const stat = snap[pairId];
        if (!stat || stat.type !== 'candidate-pair') continue;

        const local = snap[String(stat.localCandidateId)];
        appearances.push({
            ts,
            stat,
            selected: transport?.selectedCandidatePairId != null && String(transport.selectedCandidatePairId) === pairId,
            localType: local ? `${local.candidateType}/${local.protocol ?? 'udp'}` : null,
        });
    }

    if (!appearances.length) return null;

    let lastActivityTs = appearances[0].ts;
    let prevSig = activitySig(appearances[0].stat);
    let everSucceeded = appearances[0].stat.state === 'succeeded';
    let everNominated = appearances[0].stat.nominated === true;
    let everSelected = appearances[0].selected;

    // Stale: count consecutive unchanged activity sigs AFTER first snapshot
    const staleEnds = {}; // threshold -> end ts when count reaches threshold
    let staleCount = 0;
    let staleEndTs = appearances[0].ts;

    for (let i = 1; i < appearances.length; i++) {
        const { ts, stat, selected } = appearances[i];
        const sig = activitySig(stat);
        if (stat.state === 'succeeded') everSucceeded = true;
        if (stat.nominated === true) everNominated = true;
        if (selected) everSelected = true;

        if (sig === prevSig) {
            staleCount++;
            staleEndTs = ts;
        } else {
            staleCount = 0;
            prevSig = sig;
            lastActivityTs = ts;
        }
        for (const t of [1, 2, 3, 5, 9, 10, 11, 14, 15, 20]) {
            if (staleCount === t && staleEnds[t] == null) staleEnds[t] = ts;
        }
    }

    const seg19 = buildSegments(pcSnapTs, 19_000);
    const seg60 = buildSegments(pcSnapTs, 60_000);

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
        firstTs,
        lastTs,
        lastActivityTs,
        snapCount: appearances.length,
        everSucceeded,
        everNominated,
        everSelected,
        localType: appearances[0].localType,
        snap1TransportSelected,
        staleEnds,
        seg19End: segEnd(lastActivityTs, seg19),
        seg60End: segEnd(lastActivityTs, seg60),
        seg19EndLastAppear: segEnd(lastTs, seg19),
        seg60EndLastAppear: segEnd(lastTs, seg60),
    };
}

function predictEnd(rule, row, ideal) {
    const t = row.trace;
    if (!t) return null;
    const transportEndMs = new Date(ideal.transportEnd).getTime();

    switch (rule) {
        case 'lastAppearance':
            return toISO(t.lastTs);
        case 'lastActivity':
            return toISO(t.lastActivityTs);
        case 'transportEnd':
            return ideal.transportEnd;
        case 'firstAppearance':
            return toISO(t.firstTs);
        case 'seg19_activity':
            return toISO(t.seg19End);
        case 'seg60_activity':
            return toISO(t.seg60End);
        case 'seg19_appear':
            return toISO(t.seg19EndLastAppear);
        case 'seg60_appear':
            return toISO(t.seg60EndLastAppear);
        case 'stale9':
            return t.staleEnds[9] != null ? toISO(t.staleEnds[9]) : null;
        case 'stale10':
            return t.staleEnds[10] != null ? toISO(t.staleEnds[10]) : null;
        case 'stale14':
            return t.staleEnds[14] != null ? toISO(t.staleEnds[14]) : null;
        default:
            return null;
    }
}

/** Composite rules to test */
function predictComposite(row, ideal) {
    const t = row.trace;
    if (!t) return null;
    const transportEndMs = new Date(ideal.transportEnd).getTime();
    const idealEndMs = new Date(row.idealEnd).getTime();

    // R1: Short-lived PC (only 1-2 getStats for whole PC) -> end = first/only snap
    if (t.pcTotalSnaps <= 2) return toISO(t.lastTs);

    // R2: Pair appears only once -> end = that snap
    if (t.snapCount === 1) return toISO(t.firstTs);

    // R3: At transport end
    if (idealEndMs === transportEndMs) return ideal.transportEnd;

    // R4: Never succeeded + not selected in ideal -> stale freeze
    if (!t.everSucceeded && !row.isIdealSelected) {
        // try thresholds in order
        for (const n of [10, 11, 9, 14]) {
            if (t.staleEnds[n] != null && toISO(t.staleEnds[n]) === row.idealEnd) return row.idealEnd;
        }
    }

    return null;
}

async function main() {
    const allRows = [];

    for (const { label, ideal: idealPath, upload } of DATASETS) {
        const idealDoc = JSON.parse(fs.readFileSync(idealPath, 'utf-8')).data;
        const content = fs.readFileSync(upload, 'utf-8');
        const dump = await readRTCStatsDump(new Blob([content]));

        for (const [pcId, idealTransports] of Object.entries(idealDoc.transports ?? {})) {
            const trace = dump.peerConnections[pcId];
            if (!trace) continue;

            const pcTotalSnaps = trace.filter((e) => e.type === 'getStats' && e.value).length;

            for (const [transportId, idealTransport] of Object.entries(idealTransports)) {
                const selectedSet = new Set((idealTransport.selectedPairs ?? []).map(String));

                for (const [pairId, idealPair] of Object.entries(idealTransport.pairs ?? {})) {
                    const traceInfo = extractPairTrace(trace, transportId, pairId);
                    if (traceInfo) traceInfo.pcTotalSnaps = pcTotalSnaps;

                    allRows.push({
                        dump: label,
                        pcId,
                        transportId,
                        pairId,
                        idealEnd: idealPair.end,
                        idealStart: idealPair.start,
                        idealState: idealPair.state,
                        idealNom: idealPair.nominated,
                        idealBytesR: idealPair.totalBytesReceived,
                        isIdealSelected: selectedSet.has(pairId),
                        transportEnd: idealTransport.end,
                        transportStart: idealTransport.start,
                        trace: traceInfo,
                    });
                }
            }
        }
    }

    console.log(`Analyzed ${allRows.length} pairs across ${DATASETS.length} dumps\n`);

    const simpleRules = [
        'lastAppearance',
        'lastActivity',
        'transportEnd',
        'firstAppearance',
        'seg19_activity',
        'seg60_activity',
        'seg19_appear',
        'seg60_appear',
        'stale9',
        'stale10',
        'stale14',
    ];

    console.log('=== Single-rule accuracy ===');
    for (const rule of simpleRules) {
        let match = 0;
        for (const row of allRows) {
            const pred = predictEnd(rule, row, { transportEnd: row.transportEnd });
            if (pred === row.idealEnd) match++;
        }
        console.log(`${rule}: ${match}/${allRows.length} (${((100 * match) / allRows.length).toFixed(1)}%)`);
    }

    // Test combined decision tree built from observations
    console.log('\n=== Building decision tree from data ===');

    function classifyEnd(row) {
        const t = row.trace;
        if (!t) return 'NO_TRACE';
        const idealEndMs = new Date(row.idealEnd).getTime();
        const transportEndMs = new Date(row.transportEnd).getTime();
        const transportStartMs = new Date(row.transportStart).getTime();

        if (idealEndMs === transportEndMs) return 'AT_TRANSPORT_END';
        if (idealEndMs === transportStartMs || t.snapCount === 1) return 'AT_START_OR_SINGLE_SNAP';
        if (toISO(t.lastTs) === row.idealEnd) return 'AT_LAST_APPEARANCE';
        if (toISO(t.lastActivityTs) === row.idealEnd) return 'AT_LAST_ACTIVITY';
        if (t.staleEnds[10] && toISO(t.staleEnds[10]) === row.idealEnd) return 'STALE_10';
        if (t.staleEnds[9] && toISO(t.staleEnds[9]) === row.idealEnd) return 'STALE_9';
        if (t.staleEnds[11] && toISO(t.staleEnds[11]) === row.idealEnd) return 'STALE_11';
        if (t.staleEnds[14] && toISO(t.staleEnds[14]) === row.idealEnd) return 'STALE_14';
        if (toISO(t.seg19End) === row.idealEnd) return 'SEG19_ACTIVITY';
        if (toISO(t.seg60End) === row.idealEnd) return 'SEG60_ACTIVITY';
        if (toISO(t.seg19EndLastAppear) === row.idealEnd) return 'SEG19_APPEAR';
        if (toISO(t.seg60EndLastAppear) === row.idealEnd) return 'SEG60_APPEAR';
        return 'OTHER';
    }

    const classDist = {};
    for (const row of allRows) {
        const c = classifyEnd(row);
        classDist[c] = (classDist[c] || 0) + 1;
    }
    console.log('Classification of ideal.end:', classDist);

    const others = allRows.filter((r) => classifyEnd(r) === 'OTHER');
    console.log(`\nOTHER count: ${others.length}`);
    for (const r of others.slice(0, 15)) {
        const t = r.trace;
        console.log({
            dump: r.dump,
            pc: r.pcId,
            pair: r.pairId.slice(0, 16),
            idealEnd: r.idealEnd,
            lastApp: toISO(t.lastTs),
            lastAct: toISO(t.lastActivityTs),
            stale10: t.staleEnds[10] ? toISO(t.staleEnds[10]) : null,
            stale14: t.staleEnds[14] ? toISO(t.staleEnds[14]) : null,
            seg19: toISO(t.seg19End),
            state: r.idealState,
            nom: r.idealNom,
            sel: r.isIdealSelected,
            snaps: t.snapCount,
            pcSnaps: t.pcTotalSnaps,
        });
    }

    fs.writeFileSync(
        path.join(__dirname, '../processed/transport-end-analysis.json'),
        JSON.stringify({ classDist, rows: allRows.map((r) => ({ ...r, class: classifyEnd(r) })) }, null, 2)
    );
    console.log('\nWrote processed/transport-end-analysis.json');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
