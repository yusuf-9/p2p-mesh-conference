// @ts-nocheck — legacy structured report; typed incrementally.
import { computeConnectivityScore } from './aggregated-stats.js';

const toISO = (ms) => (ms != null ? new Date(ms).toISOString() : null);

// ─── Session metadata ────────────────────────────────────────────────────────

function computeResolutionLabel(screen) {
    if (!screen) return null;
    const h = screen.height ?? 0;
    if (h >= 2160) return '4K';
    if (h >= 1440) return '1440p';
    if (h >= 1080) return '1080p';
    if (h >= 720) return '720p';
    if (h >= 480) return '480p';
    return `${h}p`;
}

function getFirstStatsTimestamp(statsValue) {
    if (!statsValue) return null;
    for (const stat of Object.values(statsValue)) {
        if (stat && typeof stat === 'object' && stat.timestamp != null) return stat.timestamp;
    }
    return null;
}

// Some rtcstats client versions JSON-encode state string values (e.g. '"connected"' instead of 'connected')
function unquote(val) {
    if (typeof val === 'string' && val.length >= 2 && val[0] === '"' && val[val.length - 1] === '"') {
        try { return JSON.parse(val); } catch { return val; }
    }
    return val;
}

export function extractSessionMetadata(dump, includedPCIds) {
    const clientTrace = dump.peerConnections['null'] ?? [];
    const clientCreate = clientTrace.find(e => e.type === 'create')?.value ?? {};

    // callStart = min(createdAt) of included PCs; callEnd = max(last getStats internal timestamp)
    let callStartMs = null;
    let callEndMs = 0;
    for (const pcId of includedPCIds) {
        const trace = dump.peerConnections[pcId] ?? [];
        const createTs = trace.find(e => e.type === 'create')?.timestamp ?? null;
        if (createTs != null && (callStartMs === null || createTs < callStartMs)) callStartMs = createTs;
        for (const event of trace) {
            if (event.type !== 'getStats' || !event.value) continue;
            const ts = getFirstStatsTimestamp(event.value);
            if (ts != null && ts > callEndMs) callEndMs = ts;
        }
    }

    return {
        schemaVersion: '1.2',
        callStart: toISO(callStartMs),
        callEnd: toISO(callEndMs),
        durationMs: callStartMs != null ? Math.round(callEndMs - callStartMs) : null,
        userAgentData: {
            brands: clientCreate.userAgentData?.brands ?? [],
            mobile: clientCreate.userAgentData?.mobile ?? false,
            platform: clientCreate.userAgentData?.platform ?? null,
            deviceMemory: clientCreate.deviceMemory ?? null,
            hardwareConcurrency: clientCreate.hardwareConcurrency ?? null,
            screen: clientCreate.screen ?? null,
            window: clientCreate.window ?? null,
            resolution: computeResolutionLabel(clientCreate.screen),
        },
        pConnectionsNumber: includedPCIds.length,
    };
}

// ─── Track counts (via getStats SSRCs — handles simulcast) ───────────────────

function countTrackSSRCs(trace) {
    const outAudio = new Set();
    const outVideo = new Set();
    const inAudio = new Set();
    const inVideo = new Set();

    for (const event of trace) {
        if (event.type !== 'getStats' || !event.value) continue;
        for (const stat of Object.values(event.value)) {
            if (!stat || typeof stat !== 'object' || !stat.ssrc) continue;
            if (stat.type === 'outbound-rtp') {
                (stat.kind === 'audio' ? outAudio : outVideo).add(stat.ssrc);
            } else if (stat.type === 'inbound-rtp') {
                (stat.kind === 'audio' ? inAudio : inVideo).add(stat.ssrc);
            }
        }
    }

    return {
        audioOut: outAudio.size,
        videoOut: outVideo.size,
        audioIn: inAudio.size,
        videoIn: inVideo.size,
        dataInOut: 0,
    };
}

function inferPeerAndContentType(trackCounts, trace) {
    const { audioOut, videoOut, audioIn, videoIn } = trackCounts;
    const isPublisher = audioOut > 0 || videoOut > 0;

    if (isPublisher) {
        const hasSimulcast = videoOut > 1;
        let contentType;
        if (audioOut > 0 && videoOut > 0) {
            contentType = hasSimulcast ? 'BUNDLE+SIMULCAST' : 'BUNDLE';
        } else if (videoOut > 0) {
            contentType = hasSimulcast ? 'SIMULCAST' : 'VIDEO';
        } else {
            contentType = 'AUDIO';
        }
        return { peerType: 'PUBLISHER', contentType };
    }

    // Subscriber — check inbound-rtp contentType for screenshare detection.
    // Some dumps don't populate contentType; for those, use low terminal fps as sharing hint.
    const hasExplicitScreenshare = trace.some(event => {
        if (event.type !== 'getStats' || !event.value) return false;
        return Object.values(event.value).some(
            s => s?.type === 'inbound-rtp' && s.kind === 'video' && s.contentType === 'screenshare'
        );
    });
    let lastInboundVideoFps = null;
    for (let i = trace.length - 1; i >= 0; i--) {
        const event = trace[i];
        if (event.type !== 'getStats' || !event.value) continue;
        const inboundVideo = Object.values(event.value).find(
            s => s?.type === 'inbound-rtp' && s.kind === 'video' && (s.framesPerSecond ?? 0) > 0
        );
        if (inboundVideo) {
            lastInboundVideoFps = inboundVideo.framesPerSecond;
            break;
        }
    }
    const isSharing = hasExplicitScreenshare || (lastInboundVideoFps != null && lastInboundVideoFps <= 5);
    return { peerType: 'SUBSCRIBER', contentType: isSharing ? 'SHARING' : 'VIDEO' };
}

// ─── ICE timings ─────────────────────────────────────────────────────────────

function extractIceTimings(trace) {
    let gathering = null;
    let iceChecking = null;
    let iceConnection = null;
    let lastIceState = null;
    let iceConnectedCount = 0;

    for (const event of trace) {
        if (event.type === 'onicegatheringstatechange') {
            const val = unquote(event.value);
            if (val === 'gathering' && gathering === null) {
                gathering = toISO(event.timestamp);
            }
        } else if (event.type === 'oniceconnectionstatechange') {
            const val = unquote(event.value);
            lastIceState = val;
            if (val === 'checking' && iceChecking === null) {
                iceChecking = toISO(event.timestamp);
            } else if (val === 'connected') {
                iceConnectedCount++;
                if (iceConnection === null) iceConnection = toISO(event.timestamp);
            }
        }
    }

    return { gathering, iceChecking, iceConnection, lastIceState, iceChurn: iceConnectedCount > 1 };
}

// ─── Connection (DTLS) timings ───────────────────────────────────────────────

function extractConnectionTimings(trace) {
    let connectedAt = null;
    let connectedAtMs = null;
    let lastState = null;
    let lastStateTs = null;
    let connectedCount = 0;
    const disconnections = [];

    for (const event of trace) {
        if (event.type !== 'onconnectionstatechange') continue;
        const val = unquote(event.value);
        lastState = val;
        lastStateTs = event.timestamp;
        if (val === 'connected') {
            connectedCount++;
            if (connectedAt === null) {
                connectedAt = toISO(event.timestamp);
                connectedAtMs = event.timestamp;
            }
        } else if (val === 'disconnected' || val === 'failed') {
            disconnections.push(toISO(event.timestamp));
        }
    }

    return { connectedAt, connectedAtMs, disconnections, lastState, lastStateTs, connectionChurn: connectedCount > 1 };
}

// ─── Signaling timings ───────────────────────────────────────────────────────

function extractSignalingTimings(trace) {
    let firstSLDMs = null; // setLocalDescription
    let firstSRDMs = null; // setRemoteDescription
    let createOfferMs = null;
    // Reference ideals always keep this false for rtcstats uploads with trickle ICE.
    let remoteCandidatesInSDP = false;

    for (const event of trace) {
        if (event.type === 'createOffer' && createOfferMs === null) {
            createOfferMs = event.timestamp;
        }
        if (event.type === 'setLocalDescription' && firstSLDMs === null) {
            firstSLDMs = event.timestamp;
        }
        if (event.type === 'setRemoteDescription' && firstSRDMs === null) {
            firstSRDMs = event.timestamp;
        }
    }

    const initiator = firstSLDMs != null && firstSRDMs != null
        ? (firstSLDMs < firstSRDMs ? 'local' : 'remote')
        : (firstSLDMs != null ? 'local' : firstSRDMs != null ? 'remote' : null);

    // negotiationStart: createOffer for publishers, first setRemoteDescription for subscribers
    const negotiationStartMs = initiator === 'local'
        ? (createOfferMs ?? firstSLDMs)
        : firstSRDMs;

    const signalingTimeMs = (firstSLDMs != null && firstSRDMs != null)
        ? Math.abs(firstSRDMs - firstSLDMs)
        : null;

    return {
        firstSetLocalDescription: toISO(firstSLDMs),
        firstSetRemoteDescription: toISO(firstSRDMs),
        negotiationStart: toISO(negotiationStartMs),
        negotiationStartMs,
        initiator,
        remoteCandidatesInSDP,
        signalingTimeMs,
    };
}

// ─── Candidate pair handovers ────────────────────────────────────────────────

function extractHandovers(trace) {
    let lastPairId = null;
    let prevInternalTs = null;
    const timestamps = [];

    for (const event of trace) {
        if (event.type !== 'getStats' || !event.value) continue;
        const transport = Object.values(event.value).find(
            s => s?.type === 'transport' && s.selectedCandidatePairId != null
        );
        const internalTs = getFirstStatsTimestamp(event.value);
        if (!transport) {
            if (internalTs != null) prevInternalTs = internalTs;
            continue;
        }

        const pairId = transport.selectedCandidatePairId;
        if (pairId !== lastPairId) {
            if (lastPairId !== null) {
                // Record the internal timestamp from the previous getStats (last time old pair was seen)
                timestamps.push(prevInternalTs ?? internalTs);
            }
            lastPairId = pairId;
        }
        if (internalTs != null) prevInternalTs = internalTs;
    }

    return { handovers: timestamps.length, handoversTimestamps: timestamps };
}

// ─── CPU pressure stats ──────────────────────────────────────────────────────

// cpuState values from computePressureTable: 4=nominal, 3=fair, 2=serious, 1=critical
function extractCpuStats(trace) {
    const counts = { 4: 0, 3: 0, 2: 0, 1: 0 };
    let total = 0;
    let firstSeriousTs = null;
    let firstCriticalTs = null;

    for (const event of trace) {
        if (event.type !== 'getStats' || !event.value) continue;
        const pressure = Object.values(event.value).find(s => s?.type === 'compute-pressure');
        if (!pressure) continue;

        const state = pressure.cpuState;
        if (counts[state] === undefined) continue;
        counts[state]++;
        total++;

        const pressureTs = pressure.timestamp ?? event.timestamp;
        if (state === 2 && firstSeriousTs === null) firstSeriousTs = pressureTs;
        if (state === 1 && firstCriticalTs === null) firstCriticalTs = pressureTs;
    }

    if (total === 0) return null;

    const pct = (n) => parseFloat(((counts[n] / total) * 100).toFixed(1));
    const cpu = {
        percentNominal: pct(4),
        percentFair: pct(3),
        percentSerious: pct(2),
        percentCritical: pct(1),
    };
    if (firstSeriousTs != null) cpu.firstTimestampSeriousPressure = firstSeriousTs;
    if (firstCriticalTs != null) cpu.firstTimestampCriticalPressure = firstCriticalTs;
    return cpu;
}

// ─── ICE candidate analysis ──────────────────────────────────────────────────

function formatCandidate(cand) {
    const isHost = cand.candidateType === 'host';
    return {
        address: cand.address,
        port: cand.port,
        class: cand.address?.includes(':') ? 'ipv6' : 'ipv4',
        kind: cand.candidateType,
        protocol: cand.protocol,
        relatedAddress: isHost ? null : (cand.relatedAddress || null),
        relatedPort: isHost ? null : (cand.relatedPort || null),
    };
}

function parseIceCandidateSDP(sdp) {
    if (!sdp || !sdp.startsWith('candidate:')) return null;
    const parts = sdp.split(' ');
    const protocol = parts[2]?.toLowerCase();
    const address = parts[4];
    const port = parseInt(parts[5]);
    const typIdx = parts.indexOf('typ');
    const candidateType = typIdx >= 0 ? parts[typIdx + 1] : null;
    if (!address || !port || !candidateType) return null;
    let relatedAddress = null;
    let relatedPort = null;
    const raddrIdx = parts.indexOf('raddr');
    if (raddrIdx >= 0) relatedAddress = parts[raddrIdx + 1] || null;
    const rportIdx = parts.indexOf('rport');
    if (rportIdx >= 0) { const rp = parseInt(parts[rportIdx + 1]); relatedPort = rp || null; }
    const networkIdIdx = parts.indexOf('network-id');
    const networkId = networkIdIdx >= 0 ? parseInt(parts[networkIdIdx + 1], 10) : null;
    return {
        address,
        port,
        protocol,
        candidateType,
        relatedAddress,
        relatedPort,
        networkId: Number.isNaN(networkId) ? null : networkId,
    };
}

function parseIceCandidateFromEvent(event) {
    const parsed = parseIceCandidateSDP(event.value?.candidate);
    if (!parsed) return null;
    if (parsed.candidateType === 'relay' && event.value?.relayProtocol) {
        parsed.protocol = String(event.value.relayProtocol).toLowerCase();
    }
    return parsed;
}

function normalizeNetworkType(networkType) {
    if (networkType === 'ethernet') return 'ethernet';
    if (networkType === 'wifi') return 'wifi';
    if (networkType === 'vpn') return 'vpn';
    return 'unknown';
}

function buildNetworkTypeLookups(localCandidatesMap) {
    const addrToNetworkType = new Map();
    const relAddrToNetworkType = new Map();
    const addrPortToNetworkType = new Map();
    for (const stat of localCandidatesMap.values()) {
        if (!stat.networkType) continue;
        const nt = normalizeNetworkType(stat.networkType);
        if (stat.address) {
            addrToNetworkType.set(stat.address, nt);
            addrPortToNetworkType.set(`${stat.address}:${stat.port}`, nt);
        }
        if (stat.relatedAddress) relAddrToNetworkType.set(stat.relatedAddress, nt);
    }
    return { addrToNetworkType, relAddrToNetworkType, addrPortToNetworkType };
}

function resolveGroupType(candidates, lookups) {
    for (const cand of candidates) {
        const nt = lookups.addrPortToNetworkType.get(`${cand.address}:${cand.port}`);
        if (nt) return nt;
    }
    for (const cand of candidates) {
        const nt = lookups.addrToNetworkType.get(cand.address)
            ?? lookups.relAddrToNetworkType.get(cand.relatedAddress);
        if (nt) return nt;
    }
    return 'unknown';
}

function collectOnIceAndPrflxCandidates(trace, localCandidatesMap) {
    const seenOnIce = new Set();
    const onIceCandidates = [];
    for (const event of trace) {
        if (event.type !== 'onicecandidate' || !event.value?.candidate) continue;
        const parsed = parseIceCandidateFromEvent(event);
        if (!parsed) continue;
        const key = `${parsed.address}:${parsed.port}:${parsed.candidateType}:${parsed.protocol}`;
        if (seenOnIce.has(key)) continue;
        seenOnIce.add(key);
        onIceCandidates.push(parsed);
    }

    const seenPrflx = new Set();
    const prflxCandidates = [];
    for (const stat of localCandidatesMap.values()) {
        if (stat.candidateType !== 'prflx') continue;
        const key = `${stat.address}:${stat.port}:prflx`;
        if (!seenOnIce.has(key) && !seenPrflx.has(key)) {
            seenPrflx.add(key);
            prflxCandidates.push(stat);
        }
    }

    return { onIceCandidates, prflxCandidates, seenOnIce };
}

function serializeLocalCandidateGroups(groupsByKey, keyOrder) {
    const result = {};
    keyOrder.forEach((key, idx) => {
        const group = groupsByKey.get(key);
        if (group) result[String(idx + 1)] = group;
    });
    return result;
}

/** Chrome multi-homed: group by network-id from the ICE candidate SDP. */
function computeLocalCandidateGroupsByNetworkId(onIceCandidates, prflxCandidates, localCandidatesMap) {
    const lookups = buildNetworkTypeLookups(localCandidatesMap);
    const groupsByNetworkId = new Map();
    // Map local base port (host port or srflx/relay rport) → network-id for prflx assignment.
    const portToNetworkId = new Map();

    for (const cand of onIceCandidates) {
        if (cand.networkId == null) continue;
        if (!groupsByNetworkId.has(cand.networkId)) {
            groupsByNetworkId.set(cand.networkId, { candidates: [], type: 'unknown' });
        }
        groupsByNetworkId.get(cand.networkId).candidates.push(formatCandidate(cand));
        portToNetworkId.set(cand.port, cand.networkId);
        if (cand.relatedPort) {
            portToNetworkId.set(cand.relatedPort, cand.networkId);
        }
    }

    for (const stat of prflxCandidates) {
        const networkId = stat.relatedPort != null
            ? portToNetworkId.get(stat.relatedPort)
            : null;
        if (networkId == null || !groupsByNetworkId.has(networkId)) continue;
        groupsByNetworkId.get(networkId).candidates.push(formatCandidate(stat));
    }

    const networkIds = [...groupsByNetworkId.keys()].sort((a, b) => a - b);
    for (const networkId of networkIds) {
        const group = groupsByNetworkId.get(networkId);
        group.type = resolveGroupType(group.candidates, lookups);
    }

    const keyOrder = networkIds.map(id => `network:${id}`);
    const groupsByKey = new Map(networkIds.map(id => [`network:${id}`, groupsByNetworkId.get(id)]));
    return serializeLocalCandidateGroups(groupsByKey, keyOrder);
}

/** Host / srflx path: group by local host address (no network-id in SDP). */
function computeLocalCandidateGroupsByHostAddress(onIceCandidates, prflxCandidates, localCandidatesMap) {
    const lookups = buildNetworkTypeLookups(localCandidatesMap);

    function getGroupType(hostAddress) {
        const nt = lookups.addrToNetworkType.get(hostAddress)
            ?? lookups.relAddrToNetworkType.get(hostAddress);
        return nt ?? 'unknown';
    }

    const srflxKeyToHostAddr = new Map();
    for (const cand of onIceCandidates) {
        if (cand.candidateType === 'srflx' && cand.relatedAddress) {
            srflxKeyToHostAddr.set(`${cand.address}:${cand.port}`, cand.relatedAddress);
        }
    }

    const groups = new Map();
    const groupOrder = [];

    function addToGroup(relAddr, relPort, formatted) {
        if (relAddr && groups.has(relAddr)) {
            groups.get(relAddr).candidates.push(formatted);
            return;
        }
        const srflxKey = relAddr && relPort ? `${relAddr}:${relPort}` : null;
        if (srflxKey && srflxKeyToHostAddr.has(srflxKey)) {
            const hostAddr = srflxKeyToHostAddr.get(srflxKey);
            if (groups.has(hostAddr)) {
                groups.get(hostAddr).candidates.push(formatted);
                return;
            }
        }
        const fb = `__unk__:${formatted.address}:${formatted.port}`;
        if (!groups.has(fb)) { groups.set(fb, { candidates: [], type: 'unknown' }); groupOrder.push(fb); }
        groups.get(fb).candidates.push(formatted);
    }

    for (const cand of onIceCandidates) {
        const formatted = formatCandidate(cand);
        if (cand.candidateType === 'host') {
            if (!groups.has(cand.address)) {
                groups.set(cand.address, { candidates: [], type: getGroupType(cand.address) });
                groupOrder.push(cand.address);
            }
            groups.get(cand.address).candidates.push(formatted);
        } else {
            addToGroup(cand.relatedAddress, cand.relatedPort, formatted);
        }
    }

    const candidateKeyToGroupKey = new Map();
    for (const [groupKey, group] of groups.entries()) {
        for (const cand of group.candidates) {
            candidateKeyToGroupKey.set(`${cand.address}:${cand.port}`, groupKey);
        }
    }

    for (const stat of prflxCandidates) {
        const formatted = formatCandidate(stat);
        const relAddr = stat.relatedAddress;
        const relPort = stat.relatedPort;
        if (relAddr && groups.has(relAddr)) {
            groups.get(relAddr).candidates.push(formatted);
            continue;
        }
        const lookupKey = relAddr && relPort ? `${relAddr}:${relPort}` : null;
        if (lookupKey && candidateKeyToGroupKey.has(lookupKey)) {
            groups.get(candidateKeyToGroupKey.get(lookupKey)).candidates.push(formatted);
            continue;
        }
        // prflx may reference the host base port while relatedAddress is the NAT/public side
        if (relPort != null) {
            let placed = false;
            for (const [groupKey, group] of groups.entries()) {
                if (groupKey.startsWith('__unk__')) continue;
                const matchesBasePort = group.candidates.some(
                    c => c.port === relPort || c.relatedPort === relPort
                );
                if (matchesBasePort) {
                    group.candidates.push(formatted);
                    placed = true;
                    break;
                }
            }
            if (placed) continue;
        }
        const fb = `__unk__:${formatted.address}:${formatted.port}`;
        if (!groups.has(fb)) { groups.set(fb, { candidates: [], type: 'unknown' }); groupOrder.push(fb); }
        groups.get(fb).candidates.push(formatted);
    }

    for (const group of groups.values()) {
        group.type = resolveGroupType(group.candidates, lookups);
    }

    return serializeLocalCandidateGroups(groups, groupOrder);
}

function computeLocalCandidateGroups(trace, localCandidatesMap) {
    const { onIceCandidates, prflxCandidates } = collectOnIceAndPrflxCandidates(trace, localCandidatesMap);

    if (onIceCandidates.some(c => c.networkId != null)) {
        return computeLocalCandidateGroupsByNetworkId(onIceCandidates, prflxCandidates, localCandidatesMap);
    }

    return computeLocalCandidateGroupsByHostAddress(onIceCandidates, prflxCandidates, localCandidatesMap);
}

function computeTimeToFirstCandidates(trace) {
    const gatheringTs = trace.find(
        e => e.type === 'onicegatheringstatechange' && unquote(e.value) === 'gathering'
    )?.timestamp ?? null;

    let firstStunTs = null;
    let firstTurnUDPTs = null;
    let firstTurnTCPTs = null;
    let firstTurnTLSTs = null;
    let firstTurnDTLSTs = null;

    for (const event of trace) {
        if (event.type !== 'onicecandidate' || !event.value?.candidate) continue;
        const parsed = parseIceCandidateFromEvent(event);
        if (!parsed) continue;
        const ts = event.timestamp;
        if (parsed.candidateType === 'srflx' && firstStunTs === null) {
            firstStunTs = ts;
        }
        if (parsed.candidateType === 'relay') {
            const url = (event.value.url ?? event.value.serverUrl ?? '').toLowerCase();
            if (parsed.protocol === 'udp') {
                if (url.includes('dtls') && firstTurnDTLSTs === null) firstTurnDTLSTs = ts;
                else if (firstTurnUDPTs === null) firstTurnUDPTs = ts;
            } else if (parsed.protocol === 'tcp') {
                if (url.includes('tls') && firstTurnTLSTs === null) firstTurnTLSTs = ts;
                else if (firstTurnTCPTs === null) firstTurnTCPTs = ts;
            }
        }
    }

    const diff = (ts) => (ts != null && gatheringTs != null) ? Math.round(ts - gatheringTs) : null;
    return {
        timeToFirstStunCandidateMs: diff(firstStunTs),
        timeToFirstTurnUDPCandidateMs: diff(firstTurnUDPTs),
        timeToFirstTurnTCPCandidateMs: diff(firstTurnTCPTs),
        timeToFirstTurnTLSCandidateMs: diff(firstTurnTLSTs),
        timeToFirstTurnDTLSCandidateMs: diff(firstTurnDTLSTs),
    };
}

function extractIceCandidateData(trace, createdAtMs) {
    const localCandidatesMap = new Map();
    const remoteCandidatesMap = new Map();

    for (const event of trace) {
        if (event.type !== 'getStats' || !event.value) continue;
        for (const [key, stat] of Object.entries(event.value)) {
            if (!stat || typeof stat !== 'object') continue;
            if (stat.type === 'local-candidate') localCandidatesMap.set(key, stat);
            else if (stat.type === 'remote-candidate') remoteCandidatesMap.set(key, stat);
        }
    }

    const timings = computeTimeToFirstCandidates(trace);
    const localCandidates = localCandidatesMap.size > 0 ? computeLocalCandidateGroups(trace, localCandidatesMap) : null;

    let connectionType = null;
    let connectionViaVPN = null;
    let connectionIPType = null;

    const lastStatsEvent = [...trace].reverse().find(e => e.type === 'getStats' && e.value);
    if (lastStatsEvent) {
        const transport = Object.values(lastStatsEvent.value).find(
            s => s?.type === 'transport' && s.selectedCandidatePairId != null
        );
        if (transport) {
            const pair = lastStatsEvent.value[transport.selectedCandidatePairId];
            if (pair?.type === 'candidate-pair') {
                const local = localCandidatesMap.get(String(pair.localCandidateId));
                if (local) {
                    const isDirect = ['host', 'srflx', 'prflx'].includes(local.candidateType);
                    const transportProto = (local.relayProtocol || local.protocol || '').toUpperCase();
                    connectionType = `${isDirect ? 'DIRECT' : 'RELAY'}/${transportProto}`;
                    connectionViaVPN = local.vpn === true;
                    connectionIPType = local.address?.includes(':') ? 'IPv6' : 'IPv4';
                }
            }
        }
    }

    return {
        connectionType,
        connectionViaVPN,
        connectionIPType,
        localCandidates,
        connectedToServer: ['janus'],
        ...timings,
    };
}

// ─── Per-PC metadata ─────────────────────────────────────────────────────────

export function extractPeerConnectionMetadata(trace) {
    const createEvent = trace.find(e => e.type === 'create');
    const createdAtMs = createEvent?.timestamp ?? null;
    const createdAt = toISO(createdAtMs);
    const configuration = createEvent?.value ?? null;

    const firstStats = trace.find(e => e.type === 'getStats' && e.value);
    const statisticsStartedAt = toISO(getFirstStatsTimestamp(firstStats?.value));

    let lastStatsInternalTs = null;
    for (const event of trace) {
        if (event.type !== 'getStats' || !event.value) continue;
        const ts = getFirstStatsTimestamp(event.value);
        if (ts != null) lastStatsInternalTs = ts;
    }
    const end = toISO(lastStatsInternalTs);

    const trackCounts = countTrackSSRCs(trace);
    const { peerType, contentType } = inferPeerAndContentType(trackCounts, trace);
    const ice = extractIceTimings(trace);
    const conn = extractConnectionTimings(trace);
    const sig = extractSignalingTimings(trace);
    const handoverData = extractHandovers(trace);
    const cpu = extractCpuStats(trace);
    const iceData = extractIceCandidateData(trace, createdAtMs);

    const setupTimeMs = conn.connectedAtMs != null && sig.negotiationStartMs != null
        ? Math.ceil(conn.connectedAtMs - sig.negotiationStartMs)
        : null;

    return {
        statisticsStartedAt,
        end,
        createdAt,
        ...trackCounts,
        peerType,
        contentType,
        connectedAt: conn.connectedAt,
        disconnections: conn.disconnections,
        iceConnection: ice.iceConnection,
        iceChecking: ice.iceChecking,
        gathering: ice.gathering,
        negotiationStart: sig.negotiationStart,
        setupTimeMs,
        initiator: sig.initiator,
        remoteCandidatesInSDP: sig.remoteCandidatesInSDP,
        lastconnectionstate: conn.lastState,
        lastconnectionstateTimestamp: conn.lastStateTs,
        lasticeconnectionstate: ice.lastIceState,
        connectionChurn: conn.connectionChurn,
        iceChurn: ice.iceChurn,
        configuration,
        ...handoverData,
        connectionType: iceData.connectionType,
        connectionViaVPN: iceData.connectionViaVPN,
        connectionIPType: iceData.connectionIPType,
        connectivityGeo: { local: {}, remote: {} },
        connectivityScore: computeConnectivityScore(iceData.connectionType, setupTimeMs),
        localCandidates: iceData.localCandidates,
        connectedToServer: iceData.connectedToServer,
        timeToFirstTurnUDPCandidateMs: iceData.timeToFirstTurnUDPCandidateMs,
        timeToFirstTurnTCPCandidateMs: iceData.timeToFirstTurnTCPCandidateMs,
        timeToFirstTurnTLSCandidateMs: iceData.timeToFirstTurnTLSCandidateMs,
        timeToFirstTurnDTLSCandidateMs: iceData.timeToFirstTurnDTLSCandidateMs,
        timeToFirstStunCandidateMs: iceData.timeToFirstStunCandidateMs,
        signalingTimeMs: sig.signalingTimeMs,
        firstSetLocalDescription: sig.firstSetLocalDescription,
        firstSetRemoteDescription: sig.firstSetRemoteDescription,
        ...(cpu != null ? { cpu } : {}),
    };
}
