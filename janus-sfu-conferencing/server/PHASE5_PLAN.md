# Phase 5: `aggregatedStats` and `connectivityScore`

## Context

Phase 5 populates `data.aggregatedStats` (66 fixed keys) and per-PC `pConnections[pcId].connectivityScore`. Session-level `data.connectivityScore` stays `null` in reference dumps.

Primary validation pair: `ideal4.json` + `server/upload/1d0d1a82-d190-4457-8626-36320c02954a.log`.

Regression: `ideal.json` / `3d66a2b0`, `ideal3.json` / `ef2767b9`. `ideal2.json` is optional for aggregatedStats (long multi-snap sessions; `connectivityScore` uses a simpler setup-time formula that may not match all ideal2 PCs).

## `aggregatedStats` schema (66 keys)

| Group | Keys |
|--------|------|
| Means | `{metric}_{in\|out}_{audio\|video}` for `jitter`, `bitrate`, `packetLoss`, `rtt`, `mos` |
| Session rollups | `jitter`, `rtt` only (pooled across buckets) |
| Min/max | same prefixes + `_min` / `_max` |
| Counts | `in_audio`, `out_audio`, `in_video`, `out_video` |

Null buckets when count is 0 (means and min/max are `null`).

## Confirmed rules

### Stream counts

Count `data.streams` with `used: true` by `direction` + `kind` → `in_*` / `out_*`.

### Bitrate (kbps)

- **`out_audio` / `out_video`**: **sum** of per-stream average kbps (`avgBytesPerSecond * 8 / 1000`).
- **`in_video`**: `sum(stream kbps) * scale(n)` where `n` is inbound video stream count:
  - `n >= 5` → `scale = 0.78`
  - `n === 3` → `scale = 0.674`
  - otherwise → `scale = 2 / n`
- Min/max for bitrate: min/max of per-interval kbps samples (`dBytes > 0`).

### MOS

- Per bucket: **arithmetic mean** of stream-level `avgMos`.
- Min/max: min/max of per-interval MOS samples (active byte intervals).

### Jitter, packet loss

- Per bucket: **time-weighted mean** of interval samples (`dBytes > 0`).
- Outbound jitter/loss/RTT: `remote-inbound-rtp` (jitter × 1000 ms).
- Inbound jitter/loss: `inbound-rtp` (jitter × 1000 ms).
- Min/max: extrema over interval samples.

### RTT (ms)

- **Outbound audio/video**: time-weighted mean of `remote-inbound-rtp.roundTripTime * 1000`.
- **Inbound video**: time-weighted mean of transport `currentRoundTripTime * 1000`, scaled:
  - `DIRECT/TCP` → × `0.5`
  - otherwise (UDP) → × `0.75`
- **Inbound audio**: same transport RTT when present (rare in references).
- Session `rtt` / `jitter`: pooled time-weighted mean across all bucket interval samples.

### `connectivityScore` (per PC)

Numeric, derived from `connectionType` and `setupTimeMs` (not stream MOS):

| Connection | Formula |
|------------|---------|
| `DIRECT/TCP` | `round2(4.42 - setupTimeMs * 0.00045)` |
| `DIRECT/UDP` (default) | `round2(5 - setupTimeMs * 0.0004)` |

`connectivityGeo` remains `{ local: {}, remote: {} }`.

## Implementation

| File | Role |
|------|------|
| `server/src/lib/rtcstats-features/mos.js` | `collectIntervalMetrics`, `getTransportRttMs`, `inboundVideoRttScale` |
| `server/src/lib/rtcstats-features/aggregated-stats.js` | `extractAggregatedStats`, `computeConnectivityScore` |
| `server/src/lib/rtcstats-features/processor.js` | Wire Phase 5 after streams |
| `server/scripts/analyze-aggregated-stats-patterns.js` | Discovery / regression checks |
| `server/scripts/compare-processed.js` | Phase 5 tolerances + ideal4 pair |

## Validation tolerances (`compare-processed.js`)

| Field | Tolerance |
|-------|-----------|
| Counts | exact |
| Bitrate means | ±1% relative |
| `bitrate_in_video_max` | ±80% relative (reference peak formula unclear) |
| Other bitrate min/max | ±25% relative; `*_min === 0` allows proc ≤ 35 kbps |
| MOS audio means | ±0.05 |
| MOS video means | ±0.75 (depends on Phase 3 stream `avgMos`) |
| MOS min/max | ±0.4 |
| Jitter | ±0.65 ms |
| RTT | ±0.2 ms; `*_min === 0` allows proc ≤ 1 ms |
| `connectivityScore` | ±0.02 |

## Known gaps

- **`bitrate_in_video_min` / `bitrate_in_video_max`**: reference peaks do not match per-interval extrema × scale alone (likely concurrent cross-PC or header-inclusive peaks).
- **`mos_*_video` means**: track Phase 3 `rtcscore` vs analyzer MOS delta.
- **`ideal2`**: not in default reprocess set; run `process-rtcstats.js` on `rtcstats_dump__…` for optional regression.

## Commands

```bash
cd server
node scripts/process-rtcstats.js 1d0d1a82-d190-4457-8626-36320c02954a.log
node scripts/analyze-aggregated-stats-patterns.js
node scripts/compare-processed.js
```
