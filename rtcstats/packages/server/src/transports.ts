// @ts-nocheck — legacy module; typed incrementally.
/**
 * Phase 4: per-transport candidate-pair history from getStats traces.
 */

import { getFirstStatsTimestamp } from './transport-utils.js';

const toISO = (ms) => (ms != null ? new Date(ms).toISOString() : null);

/** getStats gap that starts a new reporting segment (matches external analyzer). */
const GETSTATS_SEGMENT_GAP_MS = 19_000;

const TS_EPS_MS = 2;

function tsEqual(aMs, bMs) {
    return Math.abs(aMs - bMs) <= TS_EPS_MS;
}

const STATE_RANK = {
    succeeded: 4,
    'in-progress': 3,
    waiting: 2,
    failed: 1,
};

function effectiveProtocol(stat) {
    if (!stat) return 'udp';
    if (stat.relayProtocol) return String(stat.relayProtocol).toLowerCase();
    if (stat.url && /transport=tcp/i.test(String(stat.url))) return 'tcp';
    return (stat.protocol || 'udp').toLowerCase();
}

function pairConnectionType(local) {
    if (!local) return null;
    const protocol = effectiveProtocol(local);
    const isDirect = ['host', 'srflx', 'prflx'].includes(local.candidateType);
    return `${isDirect ? 'DIRECT' : 'RELAY'}/${protocol.toUpperCase()}`;
}

function formatTransportLocal(stat) {
    const isHost = stat.candidateType === 'host';
    const protocol = effectiveProtocol(stat);
    return {
        address: stat.address,
        port: stat.port,
        candidateType: stat.candidateType,
        protocol,
        priority: stat.priority,
        relatedAddress: isHost ? '' : (stat.relatedAddress || ''),
        relatedPort: isHost ? 0 : (stat.relatedPort ?? 0),
        networkType: stat.networkType ?? null,
        vpn: stat.vpn ?? null,
    };
}

function formatTransportRemote(stat) {
    return {
        address: stat.address,
        port: stat.port,
        candidateType: stat.candidateType,
        protocol: effectiveProtocol(stat),
        priority: stat.priority,
        relatedAddress: stat.relatedAddress || '',
        relatedPort: stat.relatedPort ?? 0,
    };
}

function indexCandidatesByAddressPort(...maps) {
    const index = new Map();
    for (const map of maps) {
        for (const stat of map.values()) {
            if (!stat?.address) continue;
            const key = `${stat.address}:${stat.port ?? 0}`;
            if (!index.has(key)) index.set(key, stat);
        }
    }
    return index;
}

function hopCandidateType(parent, linked) {
    if (parent.candidateType === 'prflx') {
        if (parent.relatedAddress === '127.0.0.1') return 'relay';
        return 'host';
    }
    if (linked?.candidateType) return linked.candidateType;
    if (parent.candidateType === 'relay') return 'srflx';
    return '';
}

function buildRelatedChain(stat, candidateIndex, { remote = false } = {}) {
    if (!stat?.relatedAddress || stat.candidateType === 'host') return undefined;

    const chain = [];
    const seen = new Set();
    let cur = stat;

    while (cur?.relatedAddress) {
        const key = `${cur.relatedAddress}:${cur.relatedPort ?? 0}`;
        if (seen.has(key)) break;
        seen.add(key);

        const linked = candidateIndex.get(key);
        let hopType = hopCandidateType(cur, linked);
        if (remote && !linked) hopType = '';
        chain.push({
            address: cur.relatedAddress,
            port: cur.relatedPort ?? 0,
            candidateType: hopType,
        });
        if (!linked?.relatedAddress) break;
        cur = linked;
    }

    return chain.length ? chain : undefined;
}

function computePairRtt(lastPairStat) {
    if (!lastPairStat || !lastPairStat.responsesReceived) return null;
    return (lastPairStat.totalRoundTripTime / lastPairStat.responsesReceived) * 1000;
}

function isPairWritable(stat) {
    if (stat.writable === true) return true;
    if (stat.writable === false) return false;
    return stat.state === 'succeeded';
}

function buildGetStatsSegments(snapTimestamps) {
    if (!snapTimestamps.length) return [];
    const segments = [];
    let current = [snapTimestamps[0]];
    for (let i = 1; i < snapTimestamps.length; i++) {
        const ts = snapTimestamps[i];
        if (ts - current[current.length - 1] > GETSTATS_SEGMENT_GAP_MS) {
            segments.push(current);
            current = [];
        }
        current.push(ts);
    }
    if (current.length) segments.push(current);
    return segments;
}

function segmentEndFor(ts, segments) {
    for (const seg of segments) {
        if (ts >= seg[0] && ts <= seg[seg.length - 1]) return seg[seg.length - 1];
    }
    return ts;
}

function isPrivateAddress(address) {
    if (!address) return false;
    if (address.startsWith('10.') || address.startsWith('192.168.')) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return true;
    return false;
}

function hostStaleThreshold(pcTotalSnaps) {
    if (pcTotalSnaps > 19) return 14;
    return Math.max(9, pcTotalSnaps - 4);
}

function staleThresholdFor(localType, snap1TransportSelected, appearanceCount, pcTotalSnaps) {
    if (localType?.startsWith('relay/')) {
        if (snap1TransportSelected) return 9;
        return appearanceCount < pcTotalSnaps ? 9 : 10;
    }
    if (localType?.startsWith('host/')) {
        return hostStaleThreshold(pcTotalSnaps);
    }
    return 14;
}

/**
 * pair.end per PHASE4_PAIR_END_SPEC.md (R1–R8).
 * @param {object} ctx
 */
function computePairEnd(ctx) {
    const {
        appearances,
        pcTotalSnaps,
        firstTs,
        lastTs,
        lastActivityTs,
        everSucceeded,
        localType,
        snap1TransportSelected,
        staleEnds,
        segEndFromActivity,
        transportEndMs,
        transportStartMs,
        firstTransportSelectedSnap,
    } = ctx;

    // R1 — single appearance
    if (appearances.length === 1) return firstTs;

    // R2 — short-lived PC
    if (pcTotalSnaps <= 2) return lastTs;

    const alwaysWaiting = appearances.every((a) => a.stat.state === 'waiting');

    // R5 — host pre-selection (closed at transport open)
    if (
        localType?.startsWith('host/') &&
        !snap1TransportSelected &&
        tsEqual(firstTs, transportStartMs) &&
        alwaysWaiting
    ) {
        return firstTs;
    }

    // R4 — pair disappears before transport ends
    if (lastTs < transportEndMs - TS_EPS_MS) return lastTs;

    // R7 — inactive pair stale freeze + 19s segment cap
    if (!everSucceeded) {
        const threshold = staleThresholdFor(
            localType,
            snap1TransportSelected,
            appearances.length,
            pcTotalSnaps
        );
        const staleEnd = staleEnds[threshold];
        const segCap = segEndFromActivity;
        const candidates = [staleEnd, segCap].filter((t) => t != null);
        if (candidates.length) return Math.min(...candidates);
    }

    // R3 — pair present through transport close (active path)
    if (tsEqual(lastTs, transportEndMs) && everSucceeded) {
        return transportEndMs;
    }

    // R8 — succeeded but closed before transport end
    if (everSucceeded) {
        return segEndFromActivity;
    }

    // Fallback for pairs still in stats at transport close
    if (tsEqual(lastTs, transportEndMs)) {
        return transportEndMs;
    }

    return segEndFromActivity;
}

function pairActivitySignature(stat) {
    return JSON.stringify({
        state: stat.state,
        bytesR: stat.bytesReceived ?? 0,
        bytesS: stat.bytesSent ?? 0,
        writable: stat.writable,
        nominated: stat.nominated === true,
    });
}

function aggregatePairState(states, lastStat) {
    let best = lastStat?.state ?? 'waiting';
    let bestRank = STATE_RANK[best] ?? 0;
    for (const row of states) {
        const rank = STATE_RANK[row.state] ?? 0;
        if (rank > bestRank) {
            bestRank = rank;
            best = row.state;
        }
    }
    return best;
}

function aggregatePairWritable(states, lastStat) {
    if (states.some((row) => row.writable)) return true;
    return isPairWritable(lastStat);
}

function pushState(states, snapTs, state, writable, selected) {
    const last = states[states.length - 1];
    if (
        last &&
        last.state === state &&
        last.writable === writable &&
        last.selected === selected
    ) {
        return;
    }
    const maxRank = states.reduce((m, row) => Math.max(m, STATE_RANK[row.state] ?? 0), 0);
    const newRank = STATE_RANK[state] ?? 0;
    if (maxRank >= STATE_RANK.succeeded && newRank < maxRank) return;
    states.push({ start: snapTs, state, writable, selected });
}

/**
 * @param {object[]} trace - single PC trace
 * @returns {Record<string, object>|null}
 */
export function extractTransportsForPc(trace) {
    const localById = new Map();
    const remoteById = new Map();
    /** @type {Map<string, object>} */
    const pairs = new Map();
    const snapTimestamps = [];
    /** @type {Map<string, { firstTs: number, lastTs: number, iceRole: string|null, selectedPairs: string[], snap1TransportSelected: boolean|null, firstTransportSelectedSnap: { idx: number, ts: number }|null }>} */
    const transports = new Map();

    let lastGlobalSelectedPair = null;
    let pcSnapIdx = 0;

    for (const event of trace) {
        if (event.type !== 'getStats' || !event.value) continue;
        const snap = event.value;
        const snapTs = getFirstStatsTimestamp(snap) ?? event.timestamp;
        pcSnapIdx += 1;
        snapTimestamps.push(snapTs);

        for (const [id, stat] of Object.entries(snap)) {
            if (!stat || typeof stat !== 'object') continue;
            if (stat.type === 'local-candidate') localById.set(id, stat);
            else if (stat.type === 'remote-candidate') remoteById.set(id, stat);
        }

        for (const [id, stat] of Object.entries(snap)) {
            if (stat?.type !== 'transport') continue;
            const tid = String(id);
            if (!transports.has(tid)) {
                transports.set(tid, {
                    firstTs: snapTs,
                    lastTs: snapTs,
                    iceRole: stat.iceRole ?? null,
                    selectedPairs: [],
                    snap1TransportSelected: null,
                    firstTransportSelectedSnap: null,
                });
            } else {
                const t = transports.get(tid);
                t.lastTs = snapTs;
                if (stat.iceRole) t.iceRole = stat.iceRole;
            }

            const t = transports.get(tid);
            if (pcSnapIdx === 1 && t.snap1TransportSelected === null) {
                t.snap1TransportSelected = stat.selectedCandidatePairId != null;
            }
            if (stat.selectedCandidatePairId != null && t.firstTransportSelectedSnap == null) {
                t.firstTransportSelectedSnap = { idx: pcSnapIdx, ts: snapTs };
            }

            const sel = stat.selectedCandidatePairId;
            if (sel != null) {
                const selId = String(sel);
                const t = transports.get(tid);
                if (selId !== lastGlobalSelectedPair) {
                    if (!t.selectedPairs.includes(selId)) t.selectedPairs.push(selId);
                    lastGlobalSelectedPair = selId;
                }
            }
        }

        const activeTransport = Object.entries(snap).find(
            ([, s]) => s?.type === 'transport' && s.selectedCandidatePairId != null
        );
        const selectedPairId = activeTransport
            ? String(activeTransport[1].selectedCandidatePairId)
            : null;

        for (const [id, stat] of Object.entries(snap)) {
            if (stat?.type !== 'candidate-pair') continue;
            const pairId = String(id);
            const transportId = String(stat.transportId ?? activeTransport?.[0] ?? '');
            const sig = pairActivitySignature(stat);

            const localRaw = localById.get(String(stat.localCandidateId));
            const remoteRaw = remoteById.get(String(stat.remoteCandidateId));
            const appearance = {
                ts: snapTs,
                snapIdx: pcSnapIdx,
                stat,
                selected: selectedPairId === pairId,
                remoteAddress: remoteRaw?.address ?? null,
            };

            if (!pairs.has(pairId)) {
                pairs.set(pairId, {
                    transportId,
                    firstTs: snapTs,
                    lastTs: snapTs,
                    lastActivityTs: snapTs,
                    states: [],
                    lastStat: stat,
                    appearances: [appearance],
                    staleEnds: {},
                    staleCount: 0,
                    prevSig: null,
                    everSucceeded: stat.state === 'succeeded',
                    localType: localRaw
                        ? `${localRaw.candidateType}/${effectiveProtocol(localRaw)}`
                        : null,
                });
            }
            const tracker = pairs.get(pairId);
            tracker.lastStat = stat;
            tracker.lastTs = snapTs;
            if (transportId) tracker.transportId = transportId;
            if (stat.state === 'succeeded') tracker.everSucceeded = true;

            if (tracker.appearances[tracker.appearances.length - 1].ts !== snapTs) {
                tracker.appearances.push(appearance);
            } else {
                tracker.appearances[tracker.appearances.length - 1] = appearance;
            }

            if (tracker.prevSig === null) {
                tracker.prevSig = sig;
                tracker.lastActivityTs = snapTs;
            } else if (sig === tracker.prevSig) {
                tracker.staleCount += 1;
                if (tracker.staleEnds[tracker.staleCount] == null) {
                    tracker.staleEnds[tracker.staleCount] = snapTs;
                }
            } else {
                tracker.staleCount = 0;
                tracker.prevSig = sig;
                tracker.lastActivityTs = snapTs;
            }

            const writable = isPairWritable(stat);
            const selected = selectedPairId === pairId;
            pushState(tracker.states, snapTs, stat.state, writable, selected);
        }
    }

    if (!transports.size) return null;

    for (const [transportId, t] of transports) {
        if (t.snap1TransportSelected !== null) continue;
        for (const event of trace) {
            if (event.type !== 'getStats' || !event.value) continue;
            const snap = event.value;
            const transport =
                snap[transportId] ??
                Object.values(snap).find((s) => s?.type === 'transport');
            t.snap1TransportSelected = transport?.selectedCandidatePairId != null;
            break;
        }
        if (t.snap1TransportSelected === null) t.snap1TransportSelected = false;
    }

    const pcTotalSnaps = snapTimestamps.length;
    const getStatsSegments = buildGetStatsSegments(snapTimestamps);
    const candidateIndex = indexCandidatesByAddressPort(localById, remoteById);
    const result = {};

    for (const [transportId, tMeta] of transports) {
        const pairIds = [...pairs.entries()]
            .filter(([, p]) => p.transportId === transportId)
            .map(([pid]) => pid);

        const pairsOut = {};
        for (const pairId of pairIds) {
            const tracker = pairs.get(pairId);
            const last = tracker.lastStat;
            const localRaw = localById.get(String(last.localCandidateId));
            const remoteRaw = remoteById.get(String(last.remoteCandidateId));
            if (!localRaw || !remoteRaw) continue;

            const local = formatTransportLocal(localRaw);
            const localChain = buildRelatedChain(localRaw, candidateIndex);
            if (localChain) local.relatedChain = localChain;

            const remote = formatTransportRemote(remoteRaw);
            const remoteChain = buildRelatedChain(remoteRaw, candidateIndex, { remote: true });
            if (remoteChain) remote.relatedChain = remoteChain;

            const rtt = computePairRtt(last);
            const lastState = tracker.states[tracker.states.length - 1];
            const summaryState = aggregatePairState(tracker.states, last);
            const summaryWritable = aggregatePairWritable(tracker.states, last);

            const transportMeta = transports.get(transportId);
            const pairEndTs = computePairEnd(
                {
                    appearances: tracker.appearances,
                    pcTotalSnaps,
                    firstTs: tracker.firstTs,
                    lastTs: tracker.lastTs,
                    lastActivityTs: tracker.lastActivityTs,
                    everSucceeded: tracker.everSucceeded,
                    localType: tracker.localType,
                    snap1TransportSelected: transportMeta?.snap1TransportSelected === true,
                    staleEnds: tracker.staleEnds,
                    segEndFromActivity: segmentEndFor(tracker.lastActivityTs, getStatsSegments),
                    transportEndMs: transportMeta.lastTs,
                    transportStartMs: transportMeta.firstTs,
                    firstTransportSelectedSnap: transportMeta?.firstTransportSelectedSnap ?? null,
                }
            );

            pairsOut[pairId] = {
                start: toISO(tracker.firstTs),
                end: toISO(pairEndTs),
                state: summaryState,
                totalBytesReceived: last.bytesReceived ?? 0,
                totalBytesSent: last.bytesSent ?? 0,
                priority: last.priority,
                type: pairConnectionType(localRaw),
                local,
                remote,
                rtt,
                iceRole: transportMeta?.iceRole ?? null,
                writable: summaryWritable,
                nominated: last.nominated === true,
                states: tracker.states,
            };
        }

        if (!Object.keys(pairsOut).length) continue;

        const selectedPairs =
            tMeta.selectedPairs.length > 0
                ? tMeta.selectedPairs
                : Object.keys(pairsOut).filter(pid => pairsOut[pid].nominated);

        result[transportId] = {
            start: toISO(tMeta.firstTs),
            end: toISO(tMeta.lastTs),
            selectedPairs,
            iceRole: tMeta.iceRole,
            pairs: pairsOut,
        };
    }

    return Object.keys(result).length ? result : null;
}

/**
 * @param {object} dump
 * @param {string[]} includedPCIds
 */
export function extractTransports(dump, includedPCIds) {
    const transports = {};
    for (const pcId of includedPCIds) {
        const trace = dump.peerConnections[pcId];
        if (!trace) continue;
        const pcTransports = extractTransportsForPc(trace);
        if (pcTransports) transports[pcId] = pcTransports;
    }
    return transports;
}
