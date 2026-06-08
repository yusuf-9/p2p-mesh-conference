# Phase 6: `pairTimeSeries` (ICE candidate-pair metrics)

## Context

Populates `data.pairTimeSeries` — per-PC, per-transport, per-pair getStats metric series for ICE connectivity charts. Does **not** modify `data.transports`.

Schema version bumped to **1.1**.

## Module

| File | Role |
|------|------|
| `transport-utils.js` | Shared `getFirstStatsTimestamp` |
| `pair-timeseries.js` | `extractPairTimeSeries(dump, includedPCIds, transports)` |
| `processor.js` | Calls after `extractTransports` |

## Schema

```text
pairTimeSeries[pcId][transportId][pairId] = {
  latency?: { currentRoundTripTime, totalRoundTripTime, responsesReceived },
  bytes?: { bytesSent, bytesReceived, bytesDiscardedOnSend, availableOutgoingBitrate },
  packets?: { packetsSent, packetsReceived, packetsDiscardedOnSend },
  connectivity?: { requestsSent, responsesReceived, consentRequestsSent, ... },
  meta?: { state, selected, writable }
}
```

Each metric: `[[timestamp_ms, value], ...]`.

- RTT fields stored in **milliseconds** (`× 1000` from WebRTC seconds).
- Counters: raw cumulative values from `candidate-pair` stats.
- Empty metric keys omitted.

## Active pair filter

Series emitted only when the pair summary in `transports` is active:

- `state === 'succeeded'`, OR
- `nominated === true`, OR
- `totalBytesSent > 0`, OR
- `totalBytesReceived > 0`

## Verification

```bash
cd server
node scripts/process-rtcstats.js 1d0d1a82-d190-4457-8626-36320c02954a.log
node scripts/process-rtcstats.js c1a89df1-4885-4c0b-9110-4ad2af7cca78.log
node scripts/inspect-pair-timeseries.mjs
```
