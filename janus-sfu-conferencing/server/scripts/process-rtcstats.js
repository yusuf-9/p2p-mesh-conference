#!/usr/bin/env node
// Usage: node scripts/process-rtcstats.js <filename>
// Example: node scripts/process-rtcstats.js 3d66a2b0-96d5-4d8d-8eae-da6fa82e58c5.log

import { processRTCStatsDump } from '../src/lib/rtcstats-features/processor.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');

const filename = process.argv[2];
if (!filename) {
    console.error('Usage: node scripts/process-rtcstats.js <filename>');
    console.error('Example: node scripts/process-rtcstats.js 3d66a2b0-96d5-4d8d-8eae-da6fa82e58c5.log');
    process.exit(1);
}

const userId = path.basename(filename, '.log');
const filePath = path.join(serverRoot, 'upload', path.basename(filename));
const processedDir = path.join(serverRoot, 'processed');

console.log(`Processing: ${filePath}`);

const result = await processRTCStatsDump(userId, filePath, processedDir);
if (!result) {
    console.error('Processing failed.');
    process.exit(1);
}

console.log(`Done → processed/${userId}_processed.json`);
