#!/usr/bin/env node
// Compare processor output with ideal reference JSON (data.* scope only).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

const PROCESSOR_KEYS = new Set([
    'schemaVersion',
    'callStart',
    'callEnd',
    'durationMs',
    'userAgentData',
    'pConnectionsNumber',
    'pConnections',
    'streams',
    'transports',
    'aggregatedStats',
    'metadata',
]);

function loadJson(p) {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function pickProcessorShape(data) {
    const out = {};
    for (const k of PROCESSOR_KEYS) {
        if (data[k] !== undefined) out[k] = data[k];
    }
    return out;
}

function summarizeLocalCandidates(lc) {
    if (!lc) return null;
    return Object.fromEntries(
        Object.entries(lc).map(([k, g]) => [
            k,
            {
                type: g.type,
                n: g.candidates?.length ?? 0,
                candidates: (g.candidates ?? []).map(
                    c => `${c.kind}/${c.protocol}/${c.address}:${c.port}`
                ),
            },
        ])
    );
}

function diffPaths(a, b, prefix = '', diffs = []) {
    if (a === b) return diffs;
    if (a === null || b === null || typeof a !== typeof b) {
        diffs.push({ path: prefix || '(root)', ideal: b, proc: a });
        return diffs;
    }
    if (typeof a !== 'object') {
        if (a !== b) diffs.push({ path: prefix, ideal: b, proc: a });
        return diffs;
    }
    if (Array.isArray(a) !== Array.isArray(b)) {
        diffs.push({ path: prefix, ideal: b, proc: a });
        return diffs;
    }
    if (Array.isArray(a)) {
        if (a.length !== b.length) {
            diffs.push({ path: prefix + '.length', ideal: b.length, proc: a.length });
        }
        const n = Math.min(a.length, b.length);
        for (let i = 0; i < n; i++) diffPaths(a[i], b[i], `${prefix}[${i}]`, diffs);
        return diffs;
    }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
        const p = prefix ? `${prefix}.${k}` : k;
        if (!(k in a)) diffs.push({ path: p, ideal: b[k], proc: undefined });
        else if (!(k in b)) diffs.push({ path: p, ideal: undefined, proc: a[k] });
        else diffPaths(a[k], b[k], p, diffs);
    }
    return diffs;
}

const AVG_MOS_TOLERANCE = 0.35;
const PERIOD_START_TOLERANCE_MS = 2000;
const PERIOD_END_TOLERANCE_MS = 3000;

/** Loose match for MOS-derived periods (informational; ideal uses a different scorer). */
function comparePeriodsLoose(idealPeriods, procPeriods) {
    const ideal = idealPeriods ?? [];
    const proc = procPeriods ?? [];
    if (ideal.length === 0 && proc.length === 0) {
        return { ok: true, note: 'none' };
    }
    if (ideal.length !== proc.length) {
        const close =
            ideal.length > 0 &&
            proc.length > 0 &&
            Math.abs(ideal.length - proc.length) <= 1;
        return {
            ok: false,
            note: close
                ? `count ~ok (ideal ${ideal.length} proc ${proc.length})`
                : `count ideal=${ideal.length} proc=${proc.length}`,
        };
    }
    for (let i = 0; i < ideal.length; i++) {
        const ip = ideal[i];
        const pp = proc[i];
        if (ip.category !== pp.category) {
            return { ok: false, note: `period[${i}] category` };
        }
        if (Math.abs(ip.startTimestamp - pp.startTimestamp) > PERIOD_START_TOLERANCE_MS) {
            return {
                ok: false,
                note: `period[${i}] start Δ${Math.abs(ip.startTimestamp - pp.startTimestamp)}ms`,
            };
        }
        if (Math.abs(ip.endTimestamp - pp.endTimestamp) > PERIOD_END_TOLERANCE_MS) {
            return {
                ok: false,
                note: `period[${i}] end Δ${Math.abs(ip.endTimestamp - pp.endTimestamp).toFixed(0)}ms`,
            };
        }
    }
    return { ok: true, note: `${ideal.length} period(s)` };
}

function compareSession(label, idealPath, procPath) {
    console.log(`\n${'='.repeat(72)}\n${label}\n${'='.repeat(72)}`);

    const idealRaw = loadJson(idealPath);
    const procRaw = loadJson(procPath);
    const ideal = pickProcessorShape(idealRaw.data ?? idealRaw);
    const proc = pickProcessorShape(procRaw.data ?? procRaw);

    console.log('\n## Top-level (processor scope)');
    const topFields = [
        'schemaVersion',
        'callStart',
        'callEnd',
        'durationMs',
        'pConnectionsNumber',
    ];
    for (const f of topFields) {
        const match = JSON.stringify(ideal[f]) === JSON.stringify(proc[f]);
        console.log(`  ${match ? '✓' : '✗'} ${f}: ideal=${JSON.stringify(ideal[f])} proc=${JSON.stringify(proc[f])}`);
    }

    const idealPCs = Object.keys(ideal.pConnections ?? {}).sort();
    const procPCs = Object.keys(proc.pConnections ?? {}).sort();
    console.log(`\n## pConnections: ideal [${idealPCs.join(', ')}] proc [${procPCs.join(', ')}]`);
    if (JSON.stringify(idealPCs) !== JSON.stringify(procPCs)) {
        console.log('  ✗ PC id list mismatch');
    } else {
        console.log('  ✓ Same PC ids');
    }

    const phase2Fields = [
        'connectionType',
        'connectionViaVPN',
        'connectionIPType',
        'connectedToServer',
        'timeToFirstStunCandidateMs',
        'timeToFirstTurnUDPCandidateMs',
        'timeToFirstTurnTCPCandidateMs',
        'timeToFirstTurnTLSCandidateMs',
        'timeToFirstTurnDTLSCandidateMs',
        'remoteCandidatesInSDP',
        'connectivityScore',
    ];

    console.log('\n## Phase 2 fields (per PC)');
    for (const pc of idealPCs) {
        if (!proc.pConnections?.[pc]) continue;
        const mismatches = [];
        for (const f of phase2Fields) {
            const iv = ideal.pConnections[pc][f];
            const pv = proc.pConnections[pc][f];
            if (JSON.stringify(iv) !== JSON.stringify(pv)) {
                mismatches.push({ f, ideal: iv, proc: pv });
            }
        }
        const lcMatch =
            JSON.stringify(summarizeLocalCandidates(ideal.pConnections[pc].localCandidates)) ===
            JSON.stringify(summarizeLocalCandidates(proc.pConnections[pc].localCandidates));
        const icon = mismatches.length === 0 && lcMatch ? '✓' : '✗';
        console.log(
            `  ${icon} ${pc}: localCandidates=${lcMatch ? 'match' : 'MISMATCH'} phase2 diffs=${mismatches.length}`
        );
        for (const m of mismatches) {
            console.log(`      ${m.f}: ideal=${JSON.stringify(m.ideal)} proc=${JSON.stringify(m.proc)}`);
        }
        if (!lcMatch) {
            console.log('      ideal localCandidates:', JSON.stringify(summarizeLocalCandidates(ideal.pConnections[pc].localCandidates)));
            console.log('      proc  localCandidates:', JSON.stringify(summarizeLocalCandidates(proc.pConnections[pc].localCandidates)));
        }
    }

    console.log('\n## Phase 3: streams');
    const idealStreamKeys = Object.keys(ideal.streams ?? {}).sort();
    const procStreamKeys = Object.keys(proc.streams ?? {}).sort();
    const streamKeysMatch = JSON.stringify(idealStreamKeys) === JSON.stringify(procStreamKeys);
    console.log(
        `  ${streamKeysMatch ? '✓' : '✗'} stream keys: ideal ${idealStreamKeys.length} proc ${procStreamKeys.length}`
    );
    if (!streamKeysMatch) {
        const onlyIdeal = idealStreamKeys.filter(k => !procStreamKeys.includes(k));
        const onlyProc = procStreamKeys.filter(k => !idealStreamKeys.includes(k));
        if (onlyIdeal.length) console.log(`      only in ideal: ${onlyIdeal.join(', ')}`);
        if (onlyProc.length) console.log(`      only in proc:  ${onlyProc.join(', ')}`);
    }

    // Objective stream fields (strict). avgMos / periods reported separately (approximate).
    const streamFields = [
        'peerId',
        'ssrcId',
        'ssrc',
        'direction',
        'kind',
        'start',
        'end',
        'codecName',
        'avgBytesPerSecond',
        'resolution',
        'framerate',
        'rid',
        'scalabilityMode',
        'encoder',
        'decoder',
        'powerEfficient',
        'stalled',
        'simulcast',
        'used',
    ];
    const BITRATE_TOLERANCE = 0.01;

    for (const key of idealStreamKeys) {
        if (!proc.streams?.[key]) continue;
        const iv = ideal.streams[key];
        const pv = proc.streams[key];
        const issues = [];

        for (const f of streamFields) {
            if (iv[f] === undefined && pv[f] === undefined) continue;
            if (f === 'avgBytesPerSecond') {
                if (iv[f] != null && pv[f] != null) {
                    const rel = Math.abs(iv[f] - pv[f]) / (iv[f] || 1);
                    if (rel > BITRATE_TOLERANCE) {
                        issues.push(`${f}: ideal=${iv[f].toFixed(0)} proc=${pv[f].toFixed(0)} rel=${(rel * 100).toFixed(2)}%`);
                    }
                }
            } else if (JSON.stringify(iv[f]) !== JSON.stringify(pv[f])) {
                issues.push(`${f}: ideal=${JSON.stringify(iv[f])} proc=${JSON.stringify(pv[f])}`);
            }
        }

        const icon = issues.length === 0 ? '✓' : '✗';
        console.log(`  ${icon} ${key}`);
        for (const msg of issues) console.log(`      ${msg}`);
    }

    console.log('\n## Phase 3: MOS / periods (informational — rtcscore vs ideal analyzer)');
    for (const key of idealStreamKeys) {
        if (!proc.streams?.[key]) continue;
        const iv = ideal.streams[key];
        const pv = proc.streams[key];
        const parts = [];

        if (iv.avgMos != null || pv.avgMos != null) {
            const delta =
                iv.avgMos != null && pv.avgMos != null
                    ? Math.abs(iv.avgMos - pv.avgMos)
                    : null;
            const mosOk = delta != null && delta <= AVG_MOS_TOLERANCE;
            parts.push(
                mosOk
                    ? `avgMos Δ${delta.toFixed(2)}`
                    : `avgMos ideal=${iv.avgMos} proc=${pv.avgMos}${delta != null ? ` Δ${delta.toFixed(2)}` : ''}`
            );
        }

        if (iv.kind === 'video') {
            const periodCmp = comparePeriodsLoose(iv.periods, pv.periods);
            parts.push(`periods ${periodCmp.note}`);
            if (!periodCmp.ok) parts.push('(loose mismatch)');
        }

        if (parts.length) console.log(`  ≈ ${key}: ${parts.join('; ')}`);
    }

    console.log('\n## Phase 4: transports');
    const idealTransportPCs = Object.keys(ideal.transports ?? {}).sort();
    const procTransportPCs = Object.keys(proc.transports ?? {}).sort();
    const transportPCsMatch = JSON.stringify(idealTransportPCs) === JSON.stringify(procTransportPCs);
    console.log(
        `  ${transportPCsMatch ? '✓' : '✗'} PC keys: ideal ${idealTransportPCs.length} proc ${procTransportPCs.length}`
    );
    if (!transportPCsMatch) {
        const onlyIdeal = idealTransportPCs.filter(k => !procTransportPCs.includes(k));
        const onlyProc = procTransportPCs.filter(k => !idealTransportPCs.includes(k));
        if (onlyIdeal.length) console.log(`      only in ideal: ${onlyIdeal.slice(0, 8).join(', ')}${onlyIdeal.length > 8 ? '…' : ''}`);
        if (onlyProc.length) console.log(`      only in proc:  ${onlyProc.slice(0, 8).join(', ')}${onlyProc.length > 8 ? '…' : ''}`);
    }
    for (const pc of idealTransportPCs.slice(0, 6)) {
        if (!proc.transports?.[pc]) continue;
        const it = ideal.transports[pc];
        const pt = proc.transports[pc];
        const tIdsMatch = JSON.stringify(Object.keys(it).sort()) === JSON.stringify(Object.keys(pt).sort());
        const tid = Object.keys(it)[0];
        const pairCountI = tid ? Object.keys(it[tid].pairs ?? {}).length : 0;
        const pairCountP = tid ? Object.keys(pt[tid]?.pairs ?? {}).length : 0;
        const selMatch =
            tid && JSON.stringify(it[tid].selectedPairs) === JSON.stringify(pt[tid].selectedPairs);
        const icon = tIdsMatch && pairCountI === pairCountP && selMatch ? '✓' : '✗';
        console.log(
            `  ${icon} ${pc}: transports=${tIdsMatch ? 'ok' : 'diff'} pairs=${pairCountI}/${pairCountP} selectedPairs=${selMatch ? 'ok' : 'diff'}`
        );
    }
    if (idealTransportPCs.length > 6) {
        console.log(`  … and ${idealTransportPCs.length - 6} more PCs (run full diff for details)`);
    }

    console.log('\n## Phase 5: aggregatedStats');
    const AGG_KEYS = 66;
    const ik = Object.keys(ideal.aggregatedStats ?? {}).length;
    const pk = Object.keys(proc.aggregatedStats ?? {}).length;
    const keysOk = ik === AGG_KEYS && pk === AGG_KEYS;
    console.log(`  ${keysOk ? '✓' : '✗'} key count: ideal ${ik} proc ${pk} (expected ${AGG_KEYS})`);

    const MOS_AGG_TOLERANCE = 0.05;
    const MOS_VIDEO_MEAN_TOLERANCE = 0.75;
    const MOS_MINMAX_TOLERANCE = 0.4;
    const BITRATE_AGG_REL = 0.01;
    const BITRATE_MINMAX_REL = 0.25;
    const JITTER_AGG_TOLERANCE = 0.65;
    const RTT_AGG_TOLERANCE = 0.2;
    const BITRATE_IN_VIDEO_MAX_REL = 0.8;
    const SCORE_TOLERANCE = 0.02;
    let aggMismatches = 0;

    for (const k of Object.keys(ideal.aggregatedStats ?? {}).sort()) {
        const iv = ideal.aggregatedStats[k];
        const pv = proc.aggregatedStats?.[k];
        if (typeof iv === 'number' && typeof pv === 'number') {
            let ok = false;
            if (k.startsWith('mos') && (k.endsWith('_min') || k.endsWith('_max'))) {
                ok = Math.abs(iv - pv) <= MOS_MINMAX_TOLERANCE;
            } else if (k.startsWith('mos') && k.includes('_video') && !k.endsWith('_min') && !k.endsWith('_max')) {
                ok = Math.abs(iv - pv) <= MOS_VIDEO_MEAN_TOLERANCE;
            } else if (k.startsWith('mos')) ok = Math.abs(iv - pv) <= MOS_AGG_TOLERANCE;
            else if (k === 'bitrate_in_video_max') {
                ok = Math.abs(iv - pv) / (Math.abs(iv) || 1) <= BITRATE_IN_VIDEO_MAX_REL;
            } else if (k.includes('bitrate') && (k.endsWith('_min') || k.endsWith('_max'))) {
                ok = Math.abs(iv - pv) / (Math.abs(iv) || 1) <= BITRATE_MINMAX_REL;
            } else if (k.includes('bitrate')) ok = Math.abs(iv - pv) / (Math.abs(iv) || 1) <= BITRATE_AGG_REL;
            else if (k.startsWith('jitter')) ok = Math.abs(iv - pv) <= JITTER_AGG_TOLERANCE;
            else if (k.startsWith('rtt') && k.endsWith('_min') && iv === 0) {
                ok = pv == null || pv <= 1;
            } else if (k.startsWith('rtt')) ok = Math.abs(iv - pv) <= RTT_AGG_TOLERANCE;
            else if (k.includes('bitrate') && k.endsWith('_min') && iv === 0) {
                ok = pv == null || pv <= 35;
            }
            else ok = iv === pv;
            if (!ok) {
                aggMismatches++;
                if (aggMismatches <= 8) {
                    console.log(`  ✗ ${k}: ideal=${iv} proc=${pv}`);
                }
            }
        } else if (iv !== pv) {
            aggMismatches++;
            if (aggMismatches <= 8) console.log(`  ✗ ${k}: ideal=${iv} proc=${pv}`);
        }
    }
    if (aggMismatches > 8) console.log(`  … and ${aggMismatches - 8} more aggregatedStats mismatch(es)`);
    else if (aggMismatches === 0) console.log('  ✓ All aggregatedStats fields within tolerance');

    let scoreMismatches = 0;
    for (const pc of idealPCs) {
        const iv = ideal.pConnections[pc]?.connectivityScore;
        const pv = proc.pConnections?.[pc]?.connectivityScore;
        if (iv == null && pv == null) continue;
        if (iv == null || pv == null || Math.abs(iv - pv) > SCORE_TOLERANCE) {
            scoreMismatches++;
            if (scoreMismatches <= 4) {
                console.log(`  ✗ ${pc} connectivityScore: ideal=${iv} proc=${pv}`);
            }
        }
    }
    if (scoreMismatches > 4) console.log(`  … and ${scoreMismatches - 4} more connectivityScore mismatch(es)`);
    else if (scoreMismatches === 0) console.log('  ✓ connectivityScore within tolerance (all PCs)');

    const allDiffs = diffPaths(proc, ideal);
    const significant = allDiffs.filter(d => {
        if (d.path.includes('connectivityScore')) return false;
        if (d.path.includes('remoteCandidatesInSDP')) return false;
        if (d.path.includes('schemaVersion')) return false;
        if (d.path.startsWith('streams.') && d.path.includes('periods')) return false;
        if (d.path.startsWith('streams.') && d.path.includes('avgMos')) return false;
        if (d.path.startsWith('transports.') && d.path.includes('.rtt')) return false;
        if (d.path.includes('handoversTimestamps')) return false;
        if (d.path.includes('connectivityGeo')) return false;
        return true;
    });

    console.log(`\n## Full diff (processor scope, excluding known gaps): ${significant.length} difference(s)`);
    for (const d of significant.slice(0, 40)) {
        console.log(`  ${d.path}`);
        console.log(`    ideal: ${JSON.stringify(d.ideal)}`);
        console.log(`    proc:  ${JSON.stringify(d.proc)}`);
    }
    if (significant.length > 40) {
        console.log(`  ... and ${significant.length - 40} more`);
    }

    return { significant: significant.length, idealPCs: idealPCs.length };
}

const REFERENCE_PAIRS = [
    {
        label: '3d66a2b0 vs ideal.json',
        ideal: path.join(root, 'ideal.json'),
        upload: '3d66a2b0-96d5-4d8d-8eae-da6fa82e58c5.log',
    },
    {
        label: 'rtcstats_dump vs ideal2.json',
        ideal: path.join(root, 'ideal2.json'),
        upload: 'rtcstats_dump__1__6d2dc969-125d-445b-ae09-df17b48ee97d',
    },
    {
        label: 'ef2767b9 vs ideal3.json',
        ideal: path.join(root, 'ideal3.json'),
        upload: 'ef2767b9_73f8_4ff9_9a6f_0a9842a64f18_ff1c0525-0ac5-4646-86a0-1f784a1384b1',
    },
    {
        label: '1d0d1a82 vs ideal4.json',
        ideal: path.join(root, 'ideal4.json'),
        upload: '1d0d1a82-d190-4457-8626-36320c02954a.log',
    },
];

for (const { label, ideal, upload } of REFERENCE_PAIRS) {
    const base = upload.replace(/\.log$/, '');
    const procPath = path.join(root, 'server/processed', `${base}_processed.json`);
    compareSession(label, ideal, procPath);
}
