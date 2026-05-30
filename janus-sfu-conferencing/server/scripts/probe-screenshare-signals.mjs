#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRTCStatsDump, createRtcStatsTimeSeries } from '../src/lib/rtcstats-shared/index.js';

const upload = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../upload/ef2767b9_73f8_4ff9_9a6f_0a9842a64f18_ff1c0525-0ac5-4646-86a0-1f784a1384b1'
);
const ideal = JSON.parse(
    fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../ideal3.json'), 'utf8')
).data;

const dump = await readRTCStatsDump(new Blob([fs.readFileSync(upload, 'utf8')]));

function extractSdpContentTypeHints(sdp) {
    if (!sdp) return [];
    const hints = [];
    if (/video-content-type/.test(sdp)) hints.push('has-video-content-type-extmap');
    const matches = sdp.match(/a=content:[^\r\n]+/g) ?? [];
    hints.push(...matches);
    const msidLines = sdp.match(/a=msid:[^\r\n]+/g) ?? [];
    return { hints, msidLines: msidLines.slice(0, 4) };
}

console.log('=== Ideal subscriber contentType ===');
for (const pc of Object.keys(ideal.pConnections).sort()) {
    const meta = ideal.pConnections[pc];
    if (meta.peerType === 'SUBSCRIBER') {
        console.log(`${pc}: contentType=${meta.contentType}`);
    }
}

console.log('\n=== addTrack / create events (track labels) ===');
for (const [pcId, trace] of Object.entries(dump.peerConnections)) {
    if (pcId === 'null') continue;
    for (const event of trace) {
        if (event.type === 'addTrack' || event.type === 'create' || event.type === 'track') {
            console.log(`${pcId} ${event.type}:`, JSON.stringify(event.value)?.slice(0, 300));
        }
    }
}

console.log('\n=== SDP content hints per PC ===');
for (const [pcId, trace] of Object.entries(dump.peerConnections)) {
    if (pcId === 'null') continue;
    for (const event of trace) {
        if (!['createOffer', 'createAnswer', 'setLocalDescription', 'setRemoteDescription'].includes(event.type)) continue;
        const sdp = event.value?.sdp;
        if (!sdp || !sdp.includes('m=video')) continue;
        const { hints, msidLines } = extractSdpContentTypeHints(sdp);
        if (hints.length || msidLines.length) {
            console.log(`\n${pcId} ${event.type}:`);
            console.log('  hints:', hints);
            for (const m of msidLines) console.log('  ', m);
        }
    }
}

console.log('\n=== Per-PC video RTP stat properties (from getStats) ===');
for (const pcId of Object.keys(dump.peerConnections).filter(k => k !== 'null').sort()) {
    const trace = dump.peerConnections[pcId];
    const series = createRtcStatsTimeSeries(trace);
    const idealPc = ideal.pConnections[pcId];

    const statSummaries = [];
    for (const statId of Object.keys(series)) {
        const s = series[statId];
        if (s.type !== 'inbound-rtp' && s.type !== 'outbound-rtp') continue;
        const kind = s.kind?.[0]?.[1];
        if (kind !== 'video') continue;

        // collect unique values seen in last snapshots
        const lastSnap = [...trace].reverse().find(e => e.type === 'getStats' && e.value?.[statId])?.value?.[statId];
        if (!lastSnap) continue;

        statSummaries.push({
            statId,
            direction: s.type === 'outbound-rtp' ? 'out' : 'in',
            contentType: lastSnap.contentType ?? null,
            rid: lastSnap.rid ?? null,
            scalabilityMode: lastSnap.scalabilityMode ?? null,
            trackIdentifier: lastSnap.trackIdentifier ?? null,
            encoder: lastSnap.encoderImplementation ?? null,
            decoder: lastSnap.decoderImplementation ?? null,
            width: lastSnap.frameWidth ?? null,
            height: lastSnap.frameHeight ?? null,
            fps: lastSnap.framesPerSecond ?? null,
            qpSum: lastSnap.qpSum ?? null,
        });
    }

    if (!statSummaries.length) continue;
    console.log(`\n${pcId} ideal.contentType=${idealPc?.contentType ?? 'n/a'} ideal.peerType=${idealPc?.peerType ?? 'n/a'}`);
    for (const s of statSummaries) {
        console.log(' ', JSON.stringify(s));
    }

    // scan ALL getStats for any contentType values on video RTP
    const contentTypes = new Set();
    const trackIds = new Set();
    for (const event of trace) {
        if (event.type !== 'getStats' || !event.value) continue;
        for (const stat of Object.values(event.value)) {
            if (stat?.kind !== 'video') continue;
            if (stat.type !== 'inbound-rtp' && stat.type !== 'outbound-rtp') continue;
            if (stat.contentType) contentTypes.add(stat.contentType);
            if (stat.trackIdentifier) trackIds.add(stat.trackIdentifier);
        }
    }
    if (contentTypes.size) console.log('  all contentType values:', [...contentTypes]);
    if (trackIds.size) console.log('  all trackIdentifier values:', [...trackIds]);
}

console.log('\n=== media-source / track / outbound-rtp cross refs ===');
for (const pcId of ['PC_0', 'PC_4', 'PC_6']) {
    const trace = dump.peerConnections[pcId];
    if (!trace) continue;
    console.log(`\n--- ${pcId} ---`);
    const typesSeen = new Map();
    for (const event of trace) {
        if (event.type !== 'getStats' || !event.value) continue;
        for (const [id, stat] of Object.entries(event.value)) {
            if (!['media-source', 'track', 'outbound-rtp', 'inbound-rtp', 'producer', 'codec'].includes(stat?.type)) continue;
            if (stat.kind && stat.kind !== 'video') continue;
            const key = `${stat.type}:${id}`;
            if (!typesSeen.has(key)) typesSeen.set(key, stat);
        }
    }
    for (const [key, stat] of [...typesSeen.entries()].sort()) {
        const pick = {
            type: stat.type,
            kind: stat.kind,
            contentType: stat.contentType,
            trackIdentifier: stat.trackIdentifier,
            width: stat.width ?? stat.frameWidth,
            height: stat.height ?? stat.frameHeight,
            framesPerSecond: stat.framesPerSecond,
            rid: stat.rid,
            mimeType: stat.mimeType,
            source: stat.source,
        };
        console.log(key, JSON.stringify(pick));
    }
}

// type 32 events in rtcstats = addTrack with device label
console.log('\n=== rtcstats addTrack (type 32) video labels ===');
for (const [pcId, trace] of Object.entries(dump.peerConnections)) {
    for (const event of trace) {
        if (event.type !== 'addTrack') continue;
        const val = event.value;
        if (Array.isArray(val) && val[0]?.[0] === 'video') {
            console.log(`${pcId}: label="${val[0][2]}" direction=${val[1]?.direction}`);
        }
    }
}
