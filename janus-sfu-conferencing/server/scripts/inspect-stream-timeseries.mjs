#!/usr/bin/env node
/**
 * Inspect streamTimeSeries in processed JSON — structural validation only.
 * Usage: node scripts/inspect-stream-timeseries.mjs [processed.json ...]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function countSeries(group) {
    if (!group) return 0;
    return Object.values(group).reduce((sum, arr) => sum + (arr?.length ?? 0), 0);
}

function inspectFile(filePath) {
    const rel = path.relative(serverRoot, filePath);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8')).data;
    const streams = data.streams ?? {};
    const streamTimeSeries = data.streamTimeSeries ?? {};
    let errors = 0;

    console.log(`\n=== ${rel} ===`);
    console.log(`schemaVersion: ${data.schemaVersion ?? '?'}`);

    if (data.schemaVersion !== '1.2') {
        console.error('  ERROR: expected schemaVersion 1.2');
        errors++;
    }

    for (const streamKey of Object.keys(streams)) {
        const stream = streams[streamKey];
        const series = streamTimeSeries[streamKey];

        if (!series) {
            console.error(`  ERROR: missing streamTimeSeries for ${streamKey}`);
            errors++;
            continue;
        }

        const isVideo = stream.kind === 'video';
        const isAudio = stream.kind === 'audio';

        if (isAudio && (series.frames || series.performance)) {
            console.error(`  ERROR: audio stream ${streamKey} has frames/performance groups`);
            errors++;
        }

        if (isVideo && !series.frames) {
            console.error(`  ERROR: video stream ${streamKey} missing frames group`);
            errors++;
        }

        if (isVideo && !(series.frames?.framesPerSecond?.length > 0)) {
            console.error(`  ERROR: video stream ${streamKey} missing framesPerSecond series`);
            errors++;
        }

        const mosLen = series.quality?.mos?.length ?? 0;
        if (mosLen === 0) {
            console.error(`  ERROR: ${streamKey} missing quality.mos samples`);
            errors++;
        }

        const jitterSample = series.latency?.jitter?.[0]?.[1];
        if (jitterSample != null && jitterSample > 0 && jitterSample < 0.01) {
            console.error(
                `  ERROR: ${streamKey} jitter looks like seconds not ms (${jitterSample})`
            );
            errors++;
        }

        const poorMeta = (series.meta?.quality ?? []).filter(([, bucket]) => bucket === 'Poor');
        const poorPeriods = stream.periods ?? [];
        if (isVideo && poorPeriods.length && poorMeta.length === 0) {
            console.error(`  ERROR: ${streamKey} has Poor periods but no Poor meta buckets`);
            errors++;
        }

        const samples = {
            latency: countSeries(series.latency),
            bytes: countSeries(series.bytes),
            packets: countSeries(series.packets),
            frames: countSeries(series.frames),
            quality: countSeries(series.quality),
            performance: countSeries(series.performance),
            meta: countSeries(series.meta),
        };
        const total = Object.values(samples).reduce((a, b) => a + b, 0);
        if (total === 0) {
            console.error(`  ERROR: empty series for ${streamKey}`);
            errors++;
        }

        console.log(
            `  ${streamKey} ${stream.kind}/${stream.direction} mos=${mosLen} samples=${JSON.stringify(samples)}`
        );
    }

    for (const streamKey of Object.keys(streamTimeSeries)) {
        if (!streams[streamKey]) {
            console.error(`  ERROR: orphan streamTimeSeries key ${streamKey}`);
            errors++;
        }
    }

    console.log(`  streams expected: ${Object.keys(streams).length}, found: ${Object.keys(streamTimeSeries).length}`);
    console.log(errors ? `  FAILED (${errors} errors)` : '  OK');
    return errors;
}

const files =
    process.argv.length > 2
        ? process.argv.slice(2).map(f => path.resolve(f))
        : [
              path.join(serverRoot, 'processed', '1d0d1a82-d190-4457-8626-36320c02954a_processed.json'),
              path.join(
                  serverRoot,
                  'processed',
                  'ef2767b9_73f8_4ff9_9a6f_0a9842a64f18_ff1c0525-0ac5-4646-86a0-1f784a1384b1_processed.json'
              ),
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
