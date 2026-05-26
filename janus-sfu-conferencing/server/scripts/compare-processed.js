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

    console.log('\n## Phase 3–5 (not yet implemented in processor)');
    for (const section of ['streams', 'transports', 'aggregatedStats']) {
        const ik = Object.keys(ideal[section] ?? {}).length;
        const pk = Object.keys(proc[section] ?? {}).length;
        const match = ik === pk && ik === 0 ? 'empty both' : ik === pk ? `${ik} keys` : `ideal ${ik} vs proc ${pk}`;
        console.log(`  ${section}: ${match}`);
    }

    const allDiffs = diffPaths(proc, ideal);
    const significant = allDiffs.filter(d => {
        if (d.path.includes('connectivityScore')) return false;
        if (d.path.includes('remoteCandidatesInSDP')) return false;
        if (d.path.includes('schemaVersion')) return false;
        if (d.path === 'streams' || d.path.startsWith('streams.')) return false;
        if (d.path === 'transports' || d.path.startsWith('transports.')) return false;
        if (d.path === 'aggregatedStats' || d.path.startsWith('aggregatedStats.')) return false;
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

compareSession(
    'ef2767b9 vs ideal3.json',
    path.join(root, 'ideal3.json'),
    path.join(root, 'server/processed/ef2767b9_73f8_4ff9_9a6f_0a9842a64f18_ff1c0525-0ac5-4646-86a0-1f784a1384b1_processed.json')
);

compareSession(
    '3d66a2b0 vs ideal.json',
    path.join(root, 'ideal.json'),
    path.join(root, 'server/processed/3d66a2b0-96d5-4d8d-8eae-da6fa82e58c5_processed.json')
);
