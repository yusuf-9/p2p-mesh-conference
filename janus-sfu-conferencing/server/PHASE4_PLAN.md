# Phase 4: `transports` (candidate-pair history)

## Context

Populates `data.transports` in processed JSON — per-PC, per-transport (`getStats` transport id) timelines of ICE candidate pairs.

Reference: `ideal.json` / `ideal2.json` / `ideal3.json` → `data.transports[pcId][transportId]`.

## Module

| File | Role |
|---|---|
| `transports.js` | `extractTransports(dump, includedPCIds)` |
| `processor.js` | Calls `extractTransports` after streams |

## Schema

```text
transports[peerId][transportStatId] = {
  start, end,                    // ISO — first/last getStats for this transport
  selectedPairs: [pairId, ...],  // order of transport.selectedCandidatePairId changes
  iceRole,                       // "controlling" | "controlled"
  pairs: {
    [pairStatId]: {
      start, end,                // ISO — first/last snapshot containing this pair
      state, writable, nominated,  // from last snapshot; writable also from last state entry
      totalBytesSent, totalBytesReceived,
      priority, type,              // e.g. "DIRECT/UDP"
      rtt,                         // (totalRoundTripTime / responsesReceived) × 1000, or null
      iceRole,
      local, remote,               // candidate fields (empty string for unused relatedAddress)
      relatedChain?,               // prflx/relay one-hop chain when relatedAddress set
      states: [{ start, state, writable, selected }]
    }
  }
}
```

## Derivation rules

1. Walk all `getStats` snapshots; keep latest `local-candidate` / `remote-candidate` maps.
2. For each `candidate-pair`, record first/last timestamp and push to `states` when `state`, `writable`, or `selected` changes (no downgrade after `succeeded`).
3. `selected` = (`transport.selectedCandidatePairId === pairId`) at that snapshot.
4. `writable` on state rows: `stat.writable` when boolean; else `state === 'succeeded'`.
5. Top-level `state` / `writable`: best state across `states[]` (e.g. `succeeded` even if last snapshot regressed).
6. `pair.end`: see `PHASE4_PAIR_END_SPEC.md` (R1–R8: transport close, disappearance, stale freeze by candidate type, 19s segment caps).
7. `selectedPairs`: chronological list when `selectedCandidatePairId` changes (matches handover trace).
8. `type` / `protocol`: use `relayProtocol` or TURN URL when present (TURN/TCP); else `local-candidate.protocol`.
9. `relatedChain`: walk `relatedAddress` hops via candidate index; prflx→`127.0.0.1` uses `relay` hop; remote srflx uses empty hop type when unknown.
10. `rtt`: mean RTT from last snapshot’s `totalRoundTripTime / responsesReceived` (seconds → ms).

## Verification

```bash
cd server
node scripts/process-rtcstats.js 3d66a2b0-96d5-4d8d-8eae-da6fa82e58c5.log
node scripts/compare-processed.js
```

`ideal.json` (6 PCs): transport ids, pair ids, `selectedPairs`, bytes, types, and state timelines align; `rtt` may differ slightly from the external analyzer.

## Out of scope

- Phase 5: `aggregatedStats`, `connectivityScore`
