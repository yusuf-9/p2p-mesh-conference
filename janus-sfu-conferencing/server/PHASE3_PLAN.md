# Phase 3: RTP `streams` extraction

## Context

The processor (`server/src/lib/rtcstats-features/processor.js`) reads rtcstats dumps from `server/upload/` and writes `server/processed/{userId}_processed.json`. Phase 3 populates `data.streams` to match the shape in `ideal.json` / `ideal3.json`.

Reference dumps:

| Upload file | Ideal reference | Stream count |
|---|---|---|
| `3d66a2b0-96d5-4d8d-8eae-da6fa82e58c5.log` | `ideal.json` | 9 |
| `ef2767b9_73f8_4ff9_9a6f_0a9842a64f18_ff1c0525-0ac5-4646-86a0-1f784a1384b1` | `ideal3.json` | 9 |

CLI:

```bash
cd server
node scripts/process-rtcstats.js 3d66a2b0-96d5-4d8d-8eae-da6fa82e58c5.log
node scripts/process-rtcstats.js ef2767b9_73f8_4ff9_9a6f_0a9842a64f18_ff1c0525-0ac5-4646-86a0-1f784a1384b1
node scripts/compare-processed.js
```

## Modules

| File | Role |
|---|---|
| `streams.js` | `extractStreams()` — discovery, codec/bitrate/resolution/simulcast fields |
| `mos.js` | Per-interval `rtcscore` MOS, time-weighted `avgMos`, video `periods` |
| `processor.js` | Calls `extractStreams(dump, includedPCIds)` |

Dependency: `rtcscore` (imported via `createRequire` → `rtcscore/src/rtc_mos.js` because package `main` is broken).

## Stream key and schema

Key: `{peerId}-{statsReportId}` (e.g. `PC_0-16`) — WebRTC-Stats report id, not numeric SSRC.

Per stream:

| Field | Source |
|---|---|
| `peerId`, `ssrcId`, `direction`, `kind` | RTP report `type` + `kind` |
| `ssrc` | Last non-null `ssrc` in time series |
| `start`, `end` | First/last timestamp on byte series (ISO) |
| `codecName` | `codec` stat via `codecId` (`VP8`, `opus`, …) |
| `avgBytesPerSecond` | Mean of positive payload `Δbytes / Δseconds`; outbound simulcast `rid=low` with **numeric** stat ids subtract `headerBytes*` and include the first growth interval; all other streams skip the first growth interval |
| `used` | RTP report present in `getStats` (includes zero-bitrate tail streams) |
| `framerate` | Mode of `framesPerSecond`; single sample uses that fps unless multiple byte samples exist (then 0 if &lt;2 fps samples) |
| `stalled` | `false` on all inbound streams |
| `used` | `true` when total bytes increased over lifetime |
| `avgMos` | Time-weighted mean of interval MOS (`rtcscore`) |
| `periods` | Video only: merged intervals with MOS &lt; 3.0 → `{ category: "Poor", startTimestamp, endTimestamp }` |
| Video | `resolution` (mode `WxH`), `framerate` (mode of `framesPerSecond`), `rid`, `scalabilityMode`, `encoder`/`decoder`, `powerEfficient`, `simulcast`, `stalled` (inbound, `false` when present) |
| Audio | No `periods`; `simulcast: false` |

Inactive RTP flows (no byte growth) are omitted.

## MOS (`mos.js`)

Per consecutive `getStats` pair on the RTP byte counter:

- **Bitrate**: `(Δbytes × 8) / Δt` (bps).
- **Audio outbound**: `remote-inbound-rtp` via `remoteId` for RTT, jitter, loss; else defaults.
- **Audio inbound**: `jitter`, cumulative loss ratio, transport RTT.
- **Video**: `frameWidth`/`frameHeight`, instantaneous `framesPerSecond`, codec from `mimeType`.
- **Expected frame rate (rtcscore)**:
  - Inbound: `30`
  - Outbound simulcast: `0.25 × 30 + 0.75 × mode(framesPerSecond)` (calibrated vs ideal publisher layers)

`avgMos` = Σ(MOS × Δt) / Σ(Δt), rounded to 2 decimals.

## Poor periods (approximate vs ideal)

We derive `periods` from **our** per–`getStats` interval MOS (`rtcscore`), not from the external schema 6.3 analyzer that produced `ideal.json`.

**Processor rule:**

- Mark each interval `[t₀, t₁]` when video MOS &lt; **3.0**.
- Merge adjacent poor intervals with gap **4000 ms** (outbound) or **2000 ms** (inbound).
- Emit `{ category: "Poor", startTimestamp, endTimestamp }` using merged interval bounds (raw trace times, not the ideal 2s bucket grid).
- Omit `periods` when empty (audio).

**Why this will not match ideal byte-for-byte**

Ideal `periods` come from a closed-box scorer (same family as `avgMos` in schema 6.3). That stack uses roughly **2s wall-clock buckets** (1000 ms offset), its own MOS per bucket, and hysteresis (short recoveries can end a period; boundaries like `firstPoorBucket + 1000 ms` appear on later periods). Our `rtcscore` inputs already drift from ideal `avgMos` by ~0.1–0.3 on video, so bucket-level poor/not-poor decisions diverge even when mean quality is similar.

**Policy:** treat `avgMos` and `periods` as **best-effort / informational**. Regression gates use objective RTP fields (bitrate, fps, resolution, codec, keys, etc.). `compare-processed.js` reports MOS delta and loose period checks (count and ±2s/±3s timestamps) without failing the stream row.

## Verification (May 2026)

Both reference dumps: **9/9 stream keys** match ideal.

Typical tolerances vs ideal:

| Field | Tolerance |
|---|---|
| `avgBytesPerSecond` | ~1–3% (ideal may aggregate slightly differently) |
| `avgMos` | Informational only; ~0.1–0.3 vs ideal on video (different scorer) |
| `framerate`, `resolution`, `codecName`, `rid` | Match when mode-based fps used |
| `periods` | Informational only; count ±1 and timestamps ±2s/±3s in compare script |

Known acceptable gaps (other phases): `schemaVersion`, `connectivityScore`, `remoteCandidatesInSDP`, `transports`, `aggregatedStats`, `metadata.custom`.

## Out of scope

- `transports` (Phase 4)
- `aggregatedStats` / `connectivityScore` (Phase 5)
