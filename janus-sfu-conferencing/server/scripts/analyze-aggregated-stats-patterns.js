#!/usr/bin/env node
// Compare candidate aggregatedStats rules against ideal reference JSON.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRTCStatsDump } from '../src/lib/rtcstats-shared/index.js';
import {
    extractAggregatedStats,
    computeConnectivityScore,
    inboundVideoBitrateScale,
} from '../src/lib/rtcstats-features/aggregated-stats.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

const PAIRS = [
    {
        label: 'ideal4 / 1d0d1a82',
        ideal: path.join(root, 'ideal4.json'),
        upload: path.join(root, 'server/upload/1d0d1a82-d190-4457-8626-36320c02954a.log'),
    },
    {
        label: 'ideal.json / 3d66a2b0',
        ideal: path.join(root, 'ideal.json'),
        upload: path.join(root, 'server/upload/3d66a2b0-96d5-4d8d-8eae-da6fa82e58c5.log'),
    },
    {
        label: 'ideal3.json / ef2767b9',
        ideal: path.join(root, 'ideal3.json'),
        upload: path.join(
            root,
            'server/upload/ef2767b9_73f8_4ff9_9a6f_0a9842a64f18_ff1c0525-0ac5-4646-86a0-1f784a1384b1'
        ),
    },
];

const MOS_TOLERANCE = 0.05;
const BITRATE_TOLERANCE = 0.01;
const RTT_TOLERANCE = 0.15;
const JITTER_TOLERANCE = 0.5;
const SCORE_TOLERANCE = 0.02;

function relErr(a, b) {
    if (a == null && b == null) return 0;
    if (a == null || b == null) return Infinity;
    return Math.abs(a - b) / (Math.abs(b) || 1);
}

function compareAgg(label, idealAgg, procAgg) {
    const keys = new Set([...Object.keys(idealAgg), ...Object.keys(procAgg)]);
    let mismatches = 0;
    const issues = [];

    for (const k of [...keys].sort()) {
        const iv = idealAgg[k];
        const pv = procAgg[k];
        if (typeof iv === 'number' && typeof pv === 'number') {
            let tol = 0;
            if (k.startsWith('mos')) tol = MOS_TOLERANCE;
            else if (k.includes('bitrate')) tol = BITRATE_TOLERANCE * Math.abs(iv);
            else if (k.startsWith('rtt')) tol = RTT_TOLERANCE;
            else if (k.startsWith('jitter')) tol = JITTER_TOLERANCE;
            else tol = 0.001;
            if (Math.abs(iv - pv) > tol) {
                mismatches++;
                if (issues.length < 12) {
                    issues.push(`${k}: ideal=${iv} proc=${pv} Δ=${(pv - iv).toFixed(4)}`);
                }
            }
        } else if (iv !== pv) {
            mismatches++;
            if (issues.length < 12) issues.push(`${k}: ideal=${iv} proc=${pv}`);
        }
    }

    console.log(`\n${label}: ${mismatches} field mismatch(es) (${keys.size} keys)`);
    for (const line of issues) console.log(`  ${line}`);
    return mismatches;
}

function compareConnectivity(label, idealPCs, procPCs) {
    let mismatches = 0;
    for (const pc of Object.keys(idealPCs)) {
        const iv = idealPCs[pc]?.connectivityScore;
        const pv = procPCs[pc]?.connectivityScore;
        if (iv == null && pv == null) continue;
        if (iv == null || pv == null || Math.abs(iv - pv) > SCORE_TOLERANCE) {
            mismatches++;
            console.log(
                `  ${pc} score ideal=${iv} proc=${pv} setup=${idealPCs[pc]?.setupTimeMs} type=${idealPCs[pc]?.connectionType} formula=${computeConnectivityScore(idealPCs[pc]?.connectionType, idealPCs[pc]?.setupTimeMs)}`
            );
        }
    }
    console.log(`${label} connectivityScore: ${mismatches} mismatch(es)`);
}

async function analyzePair({ label, ideal, upload }) {
    const idealData = JSON.parse(fs.readFileSync(ideal, 'utf-8')).data;
    const dump = await readRTCStatsDump(new Blob([fs.readFileSync(upload)]));
    const includedPCIds = Object.keys(idealData.pConnections ?? {});
    const procAgg = extractAggregatedStats(
        dump,
        includedPCIds,
        idealData.streams ?? {},
        idealData.pConnections ?? {}
    );
    compareAgg(label, idealData.aggregatedStats ?? {}, procAgg);

    const inVideo = Object.values(idealData.streams ?? {}).filter(
        s => s.used && s.direction === 'inbound' && s.kind === 'video'
    );
    if (inVideo.length) {
        const sumKbps = inVideo.reduce((a, s) => a + s.avgBytesPerSecond * (8 / 1000), 0);
        const scale = inboundVideoBitrateScale(inVideo.length);
        console.log(
            `  in_video bitrate scale=${scale} sum*scale=${(sumKbps * scale).toFixed(2)} ideal=${idealData.aggregatedStats?.bitrate_in_video}`
        );
    }

    for (const pc of includedPCIds.slice(0, 2)) {
        const meta = idealData.pConnections[pc];
        console.log(
            `  ${pc} connectivity ideal=${meta.connectivityScore} formula=${computeConnectivityScore(meta.connectionType, meta.setupTimeMs)}`
        );
    }
}

console.log('Phase 5 pattern analysis (ideal vs extractAggregatedStats)\n');

for (const pair of PAIRS) {
    await analyzePair(pair);
}

console.log('\n--- Processor output (if processed file exists) ---');
for (const pair of PAIRS) {
    const base = path.basename(pair.upload).replace(/\.log$/, '');
    const procPath = path.join(root, 'server/processed', `${base}_processed.json`);
    if (!fs.existsSync(procPath)) continue;
    const idealData = JSON.parse(fs.readFileSync(pair.ideal, 'utf-8')).data;
    const procData = JSON.parse(fs.readFileSync(procPath, 'utf-8')).data;
    compareAgg(`${pair.label} (processed)`, idealData.aggregatedStats ?? {}, procData.aggregatedStats ?? {});
    compareConnectivity(pair.label, idealData.pConnections, procData.pConnections);
}
