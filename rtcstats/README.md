# @rtcstats

TypeScript monorepo for RTCStats — WebRTC trace collection (client) and log processing (server).

## Packages

| Package | Description |
|---------|-------------|
| `@rtcstats/core` | Shared compression, dump parsing, and utilities (TypeScript) |
| `@rtcstats/server` | Structured analytics processor (`RtcStatsProcessor`, composable extractors) |
| `@rtcstats/client` | Browser WebRTC patches + pluggable sinks (`RtcStatsClient`) |

## Development

```bash
cd rtcstats
pnpm install
pnpm run build    # compile all packages → dist/
pnpm test         # core + server + client tests
```

### Client API (browser)

```typescript
import { RtcStatsClient, BufferingSink, wrapRTCStatsWithDefaultOptions } from '@rtcstats/client';

// Janus drop-in (legacy API)
const trace = wrapRTCStatsWithDefaultOptions({ getStatsInterval: 1000 });
trace.connect(existingWebSocket);

// Composable client
const sink = new BufferingSink();
const client = new RtcStatsClient({
  sink,
  patches: { peerConnection: { getStatsInterval: 1000 }, media: true },
  onBeforeTrace: (e) => (e.method === 'getStats' ? null : e), // sample: drop stats
});
client.start();
client.connect(webSocket);
```

### Server API

```typescript
import { RtcStatsProcessor, createDefaultExtractors, sessionMetadataExtractor } from '@rtcstats/server';

// Full schema 1.2 output (default)
const processor = RtcStatsProcessor.withDefaults();
const report = await processor.processFile(userId, '/path/to/dump.log');

// Custom pipeline — only session metadata
const partial = new RtcStatsProcessor({ extractors: [sessionMetadataExtractor] });
const partialReport = partial.process(parsedDump);
```

Legacy `processRTCStatsDump()` remains exported for backward compatibility.

### Golden test

`packages/server/test/processor.golden.test.ts` runs `processRTCStatsDump` against the longest
session log (`4305a27a-2480-4a2c-ba95-ac23c7a4ecb2.log`, ~95s, 7 peer connections) and asserts
byte-for-byte parity with the reference `*.processed.json` output.

### Core tests

`packages/core/test/dump.test.ts` validates dump detection, metadata parsing, and getStats
decompression using the same fixture log.

## Roadmap

- [x] Port `@rtcstats/core` to TypeScript
- [x] Port `@rtcstats/server` to TypeScript with composable extractors
- [x] Port `@rtcstats/client` browser package
- [ ] Publish to npm
