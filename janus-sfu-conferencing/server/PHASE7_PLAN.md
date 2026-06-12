# Phase 7: `streamTimeSeries` (RTP stream metrics)

## Context

Populates `data.streamTimeSeries` — per-stream getStats metric series for Streams tab charts. Does **not** modify `data.streams`.

Schema version bumped to **1.2**.

## Module

| File | Role |
|------|------|
| `stream-timeseries.js` | `extractStreamTimeSeries(dump, includedPCIds, streams)` |
| `mos.js` | `qualityBucket`, `collectStreamQualityIntervals` (shared with MOS aggregates) |
| `processor.js` | Calls after `extractStreams` |

## Schema

```text
streamTimeSeries[streamKey] = {
  latency?: { jitter, roundTripTime?, totalRoundTripTime?, roundTripTimeMeasurements? },
  bytes?: { bytesSent|bytesReceived, headerBytes*, bytesDiscardedOnSend?, availableOutgoingBitrate? },
  packets?: { packetsSent|packetsReceived, packetsLost?, packetsDiscardedOnSend? },
  frames?: { ... },          // video only
  quality?: { mos, packetLoss, fractionLost?, jitterBufferDelay?, ... },
  performance?: { ... },     // video only, when present
  meta?: { quality: [[ts, bucket], ...] }
}
```

Each metric: `[[timestamp_ms, value], ...]`.

- RTT/jitter fields stored in **milliseconds** (`× 1000` from WebRTC seconds).
- Keys match `data.streams` (e.g. `PC_0-21`).
- `frames` / `performance` omitted for audio streams.
- Empty metric keys omitted.

## Quality meta buckets

`Excellent` (MOS ≥ 4), `Average` (≥ 3), `Poor` (< 3) at interval end timestamps.

## Verification

```bash
cd server
node scripts/process-rtcstats.js 1d0d1a82-d190-4457-8626-36320c02954a.log
node scripts/process-rtcstats.js ef2767b9_73f8_4ff9_9a6f_0a9842a64f18_ff1c0525-0ac5-4646-86a0-1f784a1384b1.log
node scripts/inspect-stream-timeseries.mjs
```
