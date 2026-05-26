import { readRTCStatsDump, extractTracks } from '../rtcstats-shared/index.js';
import { extractClientFeatures, extractConnectionFeatures, extractTrackFeatures } from './features.js';
import { processRTCStatsDump } from './processor.js';
import fs from 'node:fs';
import path from 'node:path';

export async function extract(userId, filePath, processedDir) {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const blob = new Blob([fileContent], { type: 'text/plain' });
    
    const dump = await readRTCStatsDump(blob);
    if (!dump) {
        console.error(`Failed to parse RTCStats dump for user ${userId}`);
        return;
    }

    const result = {
        userId,
        metadata: {},
        clientFeatures: null,
        connections: [],
    };

    const metadata = Object.keys(dump).reduce((res, key) => {
        if (!['peerConnections', 'eventSizes', 'locations'].includes(key)) {
            res[key] = dump[key];
        }
        return res;
    }, {});

    result.metadata = metadata;

    const clientTrace = dump.peerConnections['null'];
    if (clientTrace) {
        result.clientFeatures = extractClientFeatures(clientTrace);
    }

    for (const peerConnectionId of Object.keys(dump.peerConnections)) {
        if (peerConnectionId === 'null') {
            continue;
        }
        const peerConnectionTrace = dump.peerConnections[peerConnectionId];
        
        const connectionFeatures = extractConnectionFeatures(clientTrace, peerConnectionTrace);
        const connectionData = {
            id: peerConnectionId,
            ...connectionFeatures,
            tracks: [],
        };

        const tracks = await extractTracks(peerConnectionTrace);
        for (const trackInformation of tracks) {
            const trackFeatures = extractTrackFeatures(clientTrace, peerConnectionTrace, trackInformation);
            connectionData.tracks.push({
                id: trackInformation.id,
                direction: trackInformation.direction,
                kind: trackInformation.kind,
                ...trackFeatures,
            });
        }

        result.connections.push(connectionData);
    }

    const outputFile = path.join(processedDir, `${userId}_features.json`);
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));

    console.log(`📁 Saved RTC stats features to ${outputFile}`);

    // Run the new structured processor alongside the existing features extraction
    await processRTCStatsDump(userId, filePath, processedDir);

    return result;
}

export function processFile(userId, filePath) {
    return extract(userId, filePath);
}
