# Phase 2: ICE Candidate Analysis

## Context

This is a Node.js/TypeScript server that processes WebRTC stats dumps (`.log` files in `server/upload/`) and outputs structured JSON to `server/processed/`.

The core processor is **`server/src/lib/rtcstats-features/processor.js`** — a pure ES module. Phase 1 is complete and populates session metadata and per-PC connection metadata. Phase 2 fills in the ICE candidate fields that are currently hardcoded to `null`.

The reference output shape is in **`/home/yusuf/Desktop/dev/projects/sfu-experiments/mesh-video-conferencing/janus-sfu-conferencing/ideal.json`** (read it to understand the exact output schema).

A CLI script to re-run processing is at `server/scripts/process-rtcstats.js`:
```
node scripts/process-rtcstats.js 3d66a2b0-96d5-4d8d-8eae-da6fa82e58c5.log
```

---

## Goal

Populate these fields (currently `null`) in each `pConnections[pcId]` entry of the processed output:

```
connectionType            — e.g. "DIRECT/UDP", "RELAY/UDP"
connectionViaVPN          — boolean
connectionIPType          — "IPv4" | "IPv6"
localCandidates           — structured object (see below)
connectedToServer         — array, e.g. ["janus"]
timeToFirstTurnUDPCandidateMs
timeToFirstTurnTCPCandidateMs
timeToFirstTurnTLSCandidateMs
timeToFirstTurnDTLSCandidateMs
timeToFirstStunCandidateMs
```

Leave `connectivityScore` and `connectivityGeo` as `null` — those are Phase 5.

---

## Data Source

All data comes from `getStats` events in each PC's trace array. Each `getStats` event has `event.value` — an object keyed by stat ID containing stat entries. Each stat entry has a `type` field. Relevant types:

### `local-candidate`
| Field | Type | Notes |
|---|---|---|
| `id` | string | stat ID |
| `address` | string | IP address |
| `port` | number | |
| `candidateType` | string | `"host"` \| `"srflx"` \| `"prflx"` \| `"relay"` |
| `protocol` | string | `"udp"` \| `"tcp"` |
| `priority` | number | |
| `relatedAddress` | string | base address for srflx/prflx/relay; empty string if host |
| `relatedPort` | number | base port; 0 if host |
| `networkType` | string | `"ethernet"` \| `"wifi"` \| `"cellular"` \| `"vpn"` \| `"unknown"` |
| `vpn` | boolean\|null | VPN flag |

### `remote-candidate`
| Field | Type | Notes |
|---|---|---|
| `id` | string | stat ID |
| `address` | string | |
| `port` | number | |
| `candidateType` | string | `"host"` \| `"srflx"` \| `"prflx"` \| `"relay"` |
| `protocol` | string | |
| `priority` | number | |
| `relatedAddress` | string | |
| `relatedPort` | number | |

### `candidate-pair`
| Field | Type | Notes |
|---|---|---|
| `id` | string | stat ID |
| `localCandidateId` | string | references a local-candidate id |
| `remoteCandidateId` | string | references a remote-candidate id |
| `state` | string | `"waiting"` \| `"in-progress"` \| `"succeeded"` \| `"failed"` \| `"frozen"` |
| `priority` | number | |
| `bytesSent` | number | cumulative |
| `bytesReceived` | number | cumulative |
| `currentRoundTripTime` | number | in **seconds** — multiply × 1000 for ms |
| `nominated` | boolean | |
| `writable` | boolean | |

### `transport`
| Field | Type | Notes |
|---|---|---|
| `id` | string | stat ID |
| `selectedCandidatePairId` | string | which pair is currently active |
| `iceRole` | string | `"controlling"` \| `"controlled"` |

---

## Implementation

Add a new function `extractIceCandidateData(trace)` in `processor.js`. Call it inside `extractPeerConnectionMetadata(trace)` and spread the result to replace the current null-placeholder block.

The `createdAt` timestamp (milliseconds, from the `create` event) must be passed in for the `timeToFirst*` calculations — either pass it as a parameter or re-derive it inside the function.

### Step 1 — Build candidate maps

Iterate over all `getStats` events, accumulating the latest snapshot of each candidate into two maps:

```javascript
const localCandidates = new Map();  // id → stat entry
const remoteCandidates = new Map(); // id → stat entry
```

Overwrite on each new occurrence (later snapshots are more complete).

### Step 2 — Find the final selected candidate pair

After building the maps, get the last `getStats` event and find the `transport` stat entry in its value. Read `selectedCandidatePairId` and `iceRole`.

Then look up the candidate-pair entry with that ID in the last getStats value, and resolve its `localCandidateId` and `remoteCandidateId` against the maps.

If no transport stat or selected pair is found, all fields remain `null`.

### Step 3 — Compute `connectionType`

```
selectedLocalCandidate.candidateType:
  "host" | "srflx" | "prflx"  →  "DIRECT"
  "relay"                       →  "RELAY"

protocol = selectedLocalCandidate.protocol.toUpperCase()  // "UDP" or "TCP"

connectionType = "{DIRECT|RELAY}/{protocol}"
// e.g. "DIRECT/UDP", "RELAY/TCP"
```

### Step 4 — Compute `connectionViaVPN`

```javascript
connectionViaVPN = selectedLocalCandidate.vpn === true;
// false if vpn is null or false
```

### Step 5 — Compute `connectionIPType`

```javascript
connectionIPType = selectedLocalCandidate.address.includes(':') ? 'IPv6' : 'IPv4';
```

### Step 6 — Compute `localCandidates`

Group all unique local candidates (from the map built in Step 1) by network interface. The grouping key is the **host candidate's address** that each candidate derives from.

**Deduplication**: Before grouping, deduplicate candidates by `(address, port, candidateType)` tuple — the same candidate appears in many getStats snapshots.

**Grouping algorithm** (two modes):

1. **network-id mode** (Chrome multi-homed — used for both TURN-only and direct/STUN dumps when SDP includes `network-id`): group all `onicecandidate` rows with the same `network-id` (host, srflx, relay). Assign prflx from `getStats` by matching `relatedPort` to any **base port** in that group (host port, srflx `rport`, or relay port). Order groups by numeric `network-id` (1, 2, 3, …).

2. **host-address mode** (no `network-id` in SDP): separate candidates into host and non-host (srflx, prflx, relay).
3. For each host candidate, create a group keyed by its address. Determine the group's `type` from `networkType`:
   - `"ethernet"` → `"ethernet"`
   - `"wifi"` → `"wifi"`
   - `"vpn"` → `"vpn"`
   - anything else → `"unknown"`
3. For each non-host candidate, find its group by matching `relatedAddress` against the host candidate addresses. If no match, create a new group with type `"unknown"`.
4. Number groups sequentially as `"1"`, `"2"`, `"3"`, etc. in order of first appearance.

**Per-candidate output shape**:
```json
{
  "address": "172.19.0.1",
  "port": 46444,
  "class": "ipv4",
  "kind": "host",
  "protocol": "udp",
  "relatedAddress": null,
  "relatedPort": null
}
```
- `class`: `"ipv6"` if address contains `':'`, else `"ipv4"`
- `kind`: maps directly from `candidateType` (`"host"`, `"srflx"`, `"prflx"`, `"relay"`)
- `relatedAddress`: `null` if candidateType is `"host"`, else the `relatedAddress` string (empty string → `null`)
- `relatedPort`: `null` if candidateType is `"host"`, else the `relatedPort` (0 → `null`)

**Final output shape**:
```json
{
  "1": {
    "candidates": [ ...candidateObjects ],
    "type": "ethernet"
  },
  "2": {
    "candidates": [ ... ],
    "type": "wifi"
  }
}
```

See `ideal.json` `pConnections.PC_0.localCandidates` for a concrete example.

### Step 7 — Compute `connectedToServer`

All peer connections in this application connect to a Janus SFU. Set to `["janus"]` for any PC that has at least one `getStats` event (i.e., any PC that makes it into `pConnections`).

This is a fixed value for this app — skip complex server-type detection.

### Step 8 — Compute `timeToFirst*CandidateMs`

`createdAtMs` = timestamp of the `create` event in the trace (already computed as `createdAt` in `extractPeerConnectionMetadata`).

Scan through `getStats` events in **chronological order**. For each event, inspect all `local-candidate` stat entries. Track the **first timestamp** at which each candidate category appears:

| Field | Condition |
|---|---|
| `timeToFirstStunCandidateMs` | First `local-candidate` with `candidateType === "srflx"` |
| `timeToFirstTurnUDPCandidateMs` | First `local-candidate` with `candidateType === "relay"` and `protocol === "udp"` |
| `timeToFirstTurnTCPCandidateMs` | First `local-candidate` with `candidateType === "relay"` and `protocol === "tcp"` (and not TLS — see note) |
| `timeToFirstTurnTLSCandidateMs` | First relay+TCP candidate where the `url` field (if present) contains `"tls"` |
| `timeToFirstTurnDTLSCandidateMs` | First relay+UDP candidate where `url` contains `"dtls"` (if present) |

For the timestamp, use the **internal stats timestamp** from the getStats report (same approach as `statisticsStartedAt` — get `timestamp` from any stat entry in the event value).

```javascript
timeToFirstStunCandidateMs = firstStunInternalTs - createdAtMs;
// or null if no srflx candidate ever appeared
```

Round to integer (Math.round).

Note: In this app's test data, all connections are direct (no relay candidates appear), so all four TURN fields will be `null` and only `timeToFirstStunCandidateMs` will have a value.

---

## Where to make changes

**File**: `server/src/lib/rtcstats-features/processor.js`

1. Add the `extractIceCandidateData(trace, createdAtMs)` function (pure, no I/O).
2. In `extractPeerConnectionMetadata(trace)`:
   - Get `createdAtMs` from the `create` event timestamp.
   - Call `extractIceCandidateData(trace, createdAtMs)`.
   - Replace the current hardcoded null block:
     ```javascript
     // Phase 2: populated by ICE candidate analysis
     connectionType: null,
     connectionViaVPN: null,
     ...
     ```
     with the actual computed values from `extractIceCandidateData`.

No other files need to change.

---

## Verification

After implementing, run:
```
node scripts/process-rtcstats.js 3d66a2b0-96d5-4d8d-8eae-da6fa82e58c5.log
```

Then compare `processed/3d66a2b0-96d5-4d8d-8eae-da6fa82e58c5_processed.json` against `ideal.json` for all Phase 2 fields.

Expected values from `ideal.json`:

| PC | connectionType | connectionViaVPN | connectionIPType | connectedToServer | timeToFirstStunCandidateMs |
|---|---|---|---|---|---|
| PC_0 | DIRECT/UDP | false | IPv4 | ["janus"] | 11 |
| PC_2 | DIRECT/UDP | false | IPv4 | ["janus"] | null |
| PC_3 | DIRECT/UDP | false | IPv4 | ["janus"] | null |
| PC_4 | DIRECT/UDP | false | IPv4 | ["janus"] | null |
| PC_5 | DIRECT/UDP | false | IPv4 | ["janus"] | null |
| PC_6 | DIRECT/UDP | false | IPv4 | ["janus"] | null |

All TURN fields are `null` for all PCs (no relay candidates in this recording).

`localCandidates` for each PC should match the structure in `ideal.json` exactly (same addresses, ports, candidate types, and interface groupings).
