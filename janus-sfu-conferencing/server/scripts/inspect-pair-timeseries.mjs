#!/usr/bin/env node
/**
 * Inspect pairTimeSeries in processed JSON — structural validation only.
 * Usage: node scripts/inspect-pair-timeseries.mjs [processed.json ...]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function isActivePair(pair) {
    return (
        pair.state === 'succeeded' ||
        pair.nominated === true ||
        (pair.totalBytesSent ?? 0) > 0 ||
        (pair.totalBytesReceived ?? 0) > 0
    );
}

function countSeries(group) {
    if (!group) return 0;
    return Object.values(group).reduce((sum, arr) => sum + (arr?.length ?? 0), 0);
}

function inspectFile(filePath) {
    const rel = path.relative(serverRoot, filePath);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8')).data;
    const transports = data.transports ?? {};
    const pairTimeSeries = data.pairTimeSeries ?? {};
    let errors = 0;

    console.log(`\n=== ${rel} ===`);
    console.log(`schemaVersion: ${data.schemaVersion ?? '?'}`);

    const activeExpected = new Set();
    for (const [pcId, pcTransports] of Object.entries(transports)) {
        for (const [transportId, transport] of Object.entries(pcTransports)) {
            for (const [pairId, pair] of Object.entries(transport.pairs ?? {})) {
                if (isActivePair(pair)) {
                    activeExpected.add(`${pcId}/${transportId}/${pairId}`);
                }
            }
        }
    }

    const activeFound = new Set();
    for (const [pcId, pcSeries] of Object.entries(pairTimeSeries)) {
        if (!transports[pcId]) {
            console.error(`  ERROR: pairTimeSeries PC ${pcId} missing from transports`);
            errors++;
        }
        for (const [transportId, transportSeries] of Object.entries(pcSeries)) {
            if (!transports[pcId]?.[transportId]) {
                console.error(`  ERROR: orphan transport ${pcId}/${transportId}`);
                errors++;
            }
            for (const [pairId, series] of Object.entries(transportSeries)) {
                activeFound.add(`${pcId}/${transportId}/${pairId}`);
                const pair = transports[pcId]?.[transportId]?.pairs?.[pairId];
                if (!pair) {
                    console.error(`  ERROR: orphan pair ${pcId}/${transportId}/${pairId}`);
                    errors++;
                    continue;
                }
                if (!isActivePair(pair)) {
                    console.error(`  ERROR: inactive pair has series ${pcId}/${transportId}/${pairId}`);
                    errors++;
                }

                const samples = {
                    latency: countSeries(series.latency),
                    bytes: countSeries(series.bytes),
                    packets: countSeries(series.packets),
                    connectivity: countSeries(series.connectivity),
                    meta: countSeries(series.meta),
                };
                const total = Object.values(samples).reduce((a, b) => a + b, 0);
                if (total === 0) {
                    console.error(`  ERROR: empty series for ${pcId}/${transportId}/${pairId}`);
                    errors++;
                }

                const hasData =
                    (series.latency?.currentRoundTripTime?.length ?? 0) > 0 ||
                    (series.bytes?.bytesSent?.length ?? 0) > 0 ||
                    (series.bytes?.bytesReceived?.length ?? 0) > 0;
                if (isActivePair(pair) && (pair.totalBytesSent > 0 || pair.totalBytesReceived > 0) && !hasData) {
                    console.error(
                        `  ERROR: active pair with bytes but no latency/bytes series ${pcId}/${transportId}/${pairId}`
                    );
                    errors++;
                }

                console.log(
                    `  ${pcId}/${transportId}/${pairId} state=${pair.state} nominated=${pair.nominated} samples=${JSON.stringify(samples)}`
                );
            }
        }
    }

    for (const key of activeExpected) {
        if (!activeFound.has(key)) {
            console.error(`  ERROR: missing series for active pair ${key}`);
            errors++;
        }
    }

    console.log(`  active pairs expected: ${activeExpected.size}, found: ${activeFound.size}`);
    console.log(errors ? `  FAILED (${errors} errors)` : '  OK');
    return errors;
}

const files =
    process.argv.length > 2
        ? process.argv.slice(2).map(f => path.resolve(f))
        : [
              path.join(serverRoot, 'processed', '1d0d1a82-d190-4457-8626-36320c02954a_processed.json'),
              path.join(serverRoot, 'processed', 'c1a89df1-4885-4c0b-9110-4ad2af7cca78_processed.json'),
          ];

let totalErrors = 0;
for (const file of files) {
    if (!fs.existsSync(file)) {
        console.error(`File not found: ${file}`);
        totalErrors++;
        continue;
    }
    totalErrors += inspectFile(file);
}

process.exit(totalErrors > 0 ? 1 : 0);
