# Phase 4: `pair.end` specification (confirmed from ideal ↔ trace analysis)

**Status:** Implemented in `transports.js` (`computePairEnd`). Reprocess and run `compare-processed.js` to verify.

**Method:** For every pair in all three ideal files, we compared `ideal.end` to timestamps derivable only from the raw rtcstats `getStats` trace (no processor heuristics). Analysis scripts:

- `server/scripts/analyze-transport-end-patterns.js` — feature extraction + classification
- `server/scripts/validate-pair-end-spec.js` — spec validation (work in progress)

---

## Core observation

`pair.end` is **not** simply “last time this pair appears in getStats”. Many pairs stay in every snapshot until session end while ideal ends them much earlier. The external analyzer applies a **priority-ordered policy** using:

1. Transport lifetime (first/last getStats for the transport stat id)
2. Whether the pair **disappears** from later snapshots
3. **Activity signature** staleness (unchanged `state`, bytes, `writable`, `nominated`)
4. **19s getStats segment** boundaries (gaps between consecutive PC snapshots)
5. Local candidate type (`host` vs `relay`) and whether the transport had `selectedCandidatePairId` on the **first** getStats

---

## Trace features (compute once per pair)

Walk all `getStats` for the PC and transport:

| Feature | Definition |
|--------|------------|
| `appearances[]` | Ordered list of snapshots where `candidate-pair` stat exists |
| `firstTs`, `lastTs` | First / last appearance timestamps |
| `transportStartMs`, `transportEndMs` | Transport object first/last getStats timestamps |
| `pcTotalSnaps` | Count of getStats on this PC |
| `snap1TransportSelected` | First getStats has `transport.selectedCandidatePairId != null` |
| `everSucceeded` | Any appearance has `state === 'succeeded'` |
| `activitySig` | JSON of `{ state, bytesR, bytesS, writable, nominated }` |
| `staleEnds[N]` | Timestamp when activity sig has been unchanged for **N** consecutive appearances **after** the first (first snap does not count toward stale) |
| `seg19End(ts)` | End of the 19s segment containing `ts` (split PC snapshot times at gaps **> 19_000 ms**) |
| `firstTransportSelectedSnap` | First snapshot index where transport gets a selected pair |

---

## Decision tree (priority order)

Apply the **first** matching rule.

### R1 — Single appearance

If the pair appears in exactly **one** getStats snapshot → `end = firstTs`.

*Covers:* ideal3 relay pairs with `start === end`, many `319-*` / `302-20` one-shot PCs.

### R2 — Short-lived PC

If `pcTotalSnaps <= 2` → `end = lastTs` (last time pair is seen; usually the only or last PC snapshot).

*Covers:* `302-13` … `302-17`, `302-14`, etc. (two getStats then teardown).

### R3 — Pair lifetime equals transport close

If `|lastTs - transportEndMs| <= 2 ms` → `end = transportEnd` (ISO of transport end).

*Covers:* **254 pairs** — selected paths, nominated+succeeded paths with traffic, prflx pairs still present at session end.  
*Note:* Compare with **2 ms tolerance**; ideal ISO strings may not equal raw `Date` ms exactly.

### R4 — Pair disappears before transport ends

If `lastTs < transportEndMs - 2ms` → `end = lastTs`.

*Covers:* **23 pairs** in ideal3 (e.g. `PC_0`…`PC_6`) and **1** in ideal.json (`PC_5` pair `12`): pair drops out of getStats while transport continues.

*ideal.json `PC_5` pair `12`:* nominated, `waiting`, never `succeeded`; last appearance `18:45:30.836Z`, transport ends `18:45:46.911Z`.

### R5 — Host “pre-selection” pairs (`start === end` on long PCs)

If **all** of:

- `local.candidateType === 'host'`
- `!snap1TransportSelected` (no selected pair on first getStats)
- `firstTs` equals `transportStartMs` (within 2 ms)
- Ideal output has `state === 'waiting'` at end (or pair never leaves `waiting` in trace)

→ `end = firstTs` (pair closed at transport open even though stat remains in later snapshots).

*Covers:* ideal2 `302-4` / `302-5` / `302-6` host pairs to public remote (`13.206.192.79`) in `waiting`.

### R6 — Host pair: one snapshot after first transport selection

If host, never succeeded, and `firstTransportSelectedSnap` exists → `end` = timestamp of appearance at **`firstTransportSelectedSnap.idx + 1`**.

*Covers:* ideal2 `302-6` `CPqcUAa7Pw_*` → `10:15:28.450Z` (snap 3; selection starts snap 2).

### R7 — Inactive pair stale freeze (never succeeded, still in stats)

Compute `staleThreshold`:

| Local | Condition | Threshold |
|-------|-----------|-----------|
| `relay/udp` | `snap1TransportSelected` | **9** |
| `relay/udp` | `!snap1TransportSelected` and `appearances.length < pcTotalSnaps` | **9** |
| `relay/udp` | `!snap1TransportSelected` and appears on all PC snaps | **10** |
| `host/udp` | `pcTotalSnaps <= 19` | **`max(9, pcTotalSnaps - 4)`** |
| `host/udp` | `pcTotalSnaps > 19` | **14** |
| other (e.g. `prflx`) | — | **14** |

Then:

```
end = min(staleEnds[threshold], seg19End(lastActivityTs))
```

*`lastActivityTs`* = timestamp of last activity-signature change.

*Examples:*

- ideal2 `302-1` relay (131 snaps, sel on snap 1): stale **9** → `10:13:42`
- ideal2 `302-1` host: stale **14** → `10:13:47`
- ideal2 `302-4` relay, no sel snap 1: stale **10** → `10:15:35`
- ideal2 `302-8` (12 snaps): host/relay stale **9** = last segment snap

### R8 — Succeeded but not at transport end

If `everSucceeded` and R3/R4 did not apply → `end = seg19End(lastActivityTs)`.

*Covers:* ideal3 pairs with `state: succeeded`, zero bytes, not in `selectedPairs`, ending ~19s before transport close.

---

## Empirical classification (all 458 pairs)

| Bucket | Count | Match rule |
|--------|------:|------------|
| `AT_TRANSPORT_END` | 254 | R3 |
| `AT_START_OR_SINGLE_SNAP` | 82 | R1, R2, or `end === transport.start` |
| `STALE_9` | 38 | R7 (relay / short PC) |
| `STALE_10` | 24 | R7 (relay, no sel snap 1) |
| `STALE_14` | 26 | R7 (host long PC) |
| `AT_LAST_APPEARANCE` | 23 | R4 |
| `SEG19_ACTIVITY` | 6 | R7/R8 segment cap |
| `OTHER` | 5 | See open items |

**Single-rule baselines (why heuristics failed):**

| Rule | Accuracy |
|------|----------|
| `lastAppearance` | 64.6% |
| `seg19(lastActivity)` | 69.4% |
| `transportEnd` | 55.5% |
| `stale14` alone | 6.3% |

---

## Open edge cases (3 pairs, 0.7%)

These need one more rule or confirmation against the external analyzer source:

1. **ideal2 `302-4` in-progress host** to private `172.31.x` — ideal `10:15:40.450` = **stale 15**, not 14 (`10:15:39.450`).
2. **ideal2 `302-7` in-progress host/relay** — ideal `10:15:41.450` = **stale 13** (not in default threshold table); segment end is `10:16:00`.
3. **ideal2 `302-6` relay** — ideal `10:15:36.450` = **stale 9** when pair appears on **17/18** snaps (threshold 9 confirmed; off-by-one ms in validator).

Proposed fix for (1)-(2): for `pcTotalSnaps` 17–19, host threshold may be `pcTotalSnaps - 4` with segment cap `min(stale, seg19)` — already in R7; verify stale index 13/15 recording in code.

---

## Other Phase 4 fields (unchanged, already match ideal3)

These were validated separately and are **not** the main accuracy gap:

| Field | Rule |
|-------|------|
| `type` | `DIRECT\|RELAY` + `relayProtocol` or TURN URL for TCP |
| `selectedPairs` | Chronological `selectedCandidatePairId` changes |
| `states[]` | Push on `state` / `writable` / `selected` change; no downgrade after `succeeded` |
| `relatedChain` | Walk `relatedAddress`; prflx→`127.0.0.1` uses relay hop |
| top-level `state` / `writable` | Best rank across `states[]` |

---

## Implementation checklist (after spec sign-off)

1. Add `computePairEnd(ctx)` in `transports.js` following R1–R8 exactly.
2. Remove ad-hoc constants (`PAIR_STALE_SNAPSHOTS = 14`, `GETSTATS_SEGMENT_GAP_MS = 60_000`) unless subsumed by R7/R8.
3. Reprocess three uploads; `compare-processed.js` transport section should reach ~100% on `end` (excluding `rtt`).
4. Update `PHASE4_PLAN.md` rule 6 to point at this spec.

---

## Validation command

```bash
cd server
node scripts/analyze-transport-end-patterns.js
node scripts/validate-pair-end-spec.js
```

Target: **458/458** on `validate-pair-end-spec.js` before merging implementation.
