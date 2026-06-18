// @ts-nocheck — legacy module; typed incrementally.
/**
 * Phase 6: per-candidate-pair getStats time series for ICE connectivity charts.
 */

import { getFirstStatsTimestamp } from './transport-utils.js';

const METRIC_GROUPS = {
    latency: ['currentRoundTripTime', 'totalRoundTripTime', 'responsesReceived'],
    bytes: ['bytesSent', 'bytesReceived', 'bytesDiscardedOnSend', 'availableOutgoingBitrate'],
    packets: ['packetsSent', 'packetsReceived', 'packetsDiscardedOnSend'],
    connectivity: [
        'requestsSent',
        'responsesReceived',
        'consentRequestsSent',
        'requestsReceived',
        'responsesSent',
        'lastPacketSentTimestamp',
        'lastPacketReceivedTimestamp',
    ],
};

const RTT_MS_FIELDS = new Set(['currentRoundTripTime', 'totalRoundTripTime']);

function isActivePair(pair) {
    return (
        pair.state === 'succeeded' ||
        pair.nominated === true ||
        (pair.totalBytesSent ?? 0) > 0 ||
        (pair.totalBytesReceived ?? 0) > 0
    );
}

function buildActivePairKeys(pcTransports) {
    const keys = new Map();

    for (const [transportId, transport] of Object.entries(pcTransports)) {
        for (const [pairId, pair] of Object.entries(transport.pairs ?? {})) {
            if (!isActivePair(pair)) continue;
            keys.set(`${transportId}:${pairId}`, { transportId, pairId });
        }
    }

    return keys;
}

function createPairSeriesStore() {
    const store = { meta: { state: [], selected: [], writable: [] } };
    for (const [group, fields] of Object.entries(METRIC_GROUPS)) {
        store[group] = Object.fromEntries(fields.map(f => [f, []]));
    }
    return store;
}

function normalizeMetricValue(field, value) {
    if (value == null || Number.isNaN(value)) return null;
    if (RTT_MS_FIELDS.has(field)) return value * 1000;
    return value;
}

function appendSample(series, ts, value) {
    if (value == null || Number.isNaN(value)) return;
    series.push([ts, value]);
}

function isPairWritable(stat) {
    if (stat.writable === true) return 1;
    if (stat.writable === false) return 0;
    return stat.state === 'succeeded' ? 1 : 0;
}

function pruneEmptyMetrics(store) {
    const out = {};

    for (const [group, fields] of Object.entries(store)) {
        if (group === 'meta') {
            const meta = {};
            for (const [key, series] of Object.entries(fields)) {
                if (series.length) meta[key] = series;
            }
            if (Object.keys(meta).length) out.meta = meta;
            continue;
        }

        const groupOut = {};
        for (const [field, series] of Object.entries(fields)) {
            if (series.length) groupOut[field] = series;
        }
        if (Object.keys(groupOut).length) out[group] = groupOut;
    }

    return out;
}

function extractPairTimeSeriesForPc(trace, pcTransports) {
    const activeKeys = buildActivePairKeys(pcTransports);
    if (!activeKeys.size) return null;

    const stores = new Map();
    for (const { transportId, pairId } of activeKeys.values()) {
        stores.set(`${transportId}:${pairId}`, createPairSeriesStore());
    }

    for (const event of trace) {
        if (event.type !== 'getStats' || !event.value) continue;

        const snap = event.value;
        const snapTs = getFirstStatsTimestamp(snap) ?? event.timestamp;

        let selectedPairId = null;
        for (const stat of Object.values(snap)) {
            if (stat?.type === 'transport' && stat.selectedCandidatePairId != null) {
                selectedPairId = String(stat.selectedCandidatePairId);
                break;
            }
        }

        for (const [id, stat] of Object.entries(snap)) {
            if (stat?.type !== 'candidate-pair') continue;

            const transportId = String(stat.transportId ?? '');
            const pairId = String(id);
            const key = `${transportId}:${pairId}`;
            const store = stores.get(key);
            if (!store) continue;

            for (const [group, fields] of Object.entries(METRIC_GROUPS)) {
                for (const field of fields) {
                    appendSample(
                        store[group][field],
                        snapTs,
                        normalizeMetricValue(field, stat[field])
                    );
                }
            }

            if (stat.state != null) {
                store.meta.state.push([snapTs, stat.state]);
            }
            store.meta.selected.push([snapTs, selectedPairId === pairId ? 1 : 0]);
            store.meta.writable.push([snapTs, isPairWritable(stat)]);
        }
    }

    const transportOut = {};

    for (const [key, store] of stores.entries()) {
        const pruned = pruneEmptyMetrics(store);
        if (!Object.keys(pruned).length) continue;

        const { transportId, pairId } = activeKeys.get(key);
        if (!transportOut[transportId]) transportOut[transportId] = {};
        transportOut[transportId][pairId] = pruned;
    }

    return Object.keys(transportOut).length ? transportOut : null;
}

/**
 * @param {object} dump
 * @param {string[]} includedPCIds
 * @param {Record<string, object>} transports
 * @returns {Record<string, object>}
 */
export function extractPairTimeSeries(dump, includedPCIds, transports) {
    const result = {};

    for (const pcId of includedPCIds) {
        const pcTransports = transports[pcId];
        if (!pcTransports) continue;

        const trace = dump.peerConnections[pcId];
        if (!trace) continue;

        const pcSeries = extractPairTimeSeriesForPc(trace, pcTransports);
        if (pcSeries) result[pcId] = pcSeries;
    }

    return result;
}
