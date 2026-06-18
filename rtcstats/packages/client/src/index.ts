import { compressMethod } from '@rtcstats/core';
import { RtcStatsClient } from './RtcStatsClient.js';
import type { ClientConfig, LegacyTrace } from './types.js';
import { DEFAULT_GET_STATS_INTERVAL_MS } from './types.js';

export { RtcStatsClient } from './RtcStatsClient.js';
export { TraceEngine } from './trace/TraceEngine.js';
export { CallbackSink, BufferingSink } from './sinks/CallbackSink.js';
export { WebSocketSink } from './sinks/WebSocketSink.js';
export {
  PatchRegistry,
  peerConnectionPatch,
  mediaPatch,
  enumerateDevicesPatch,
  resolvePatches,
  resolveGetStatsInterval,
} from './patches/PatchRegistry.js';
export { wrapRTCPeerConnection } from './patches/peer-connection.js';
export { wrapGetUserMedia, wrapEnumerateDevices } from './patches/media.js';
export type {
  PatchWindow,
  PeerConnectionPatchWindow,
  WrapRTCPeerConnectionOptions,
  MediaPatchTarget,
  EnumerateDevicesPatchTarget,
  RtcStatsPeerConnection,
  RtcStatsMediaStreamTrack,
  WrapRTCPeerConnection,
  WrapGetUserMedia,
  WrapEnumerateDevices,
} from './patches/types.js';

export type {
  ClientConfig,
  EventSink,
  LegacyTrace,
  PatchConfig,
  PeerConnectionPatchOptions,
  RtcStatsClientOptions,
  RtcStatsEvent,
  TraceCallback,
  TraceEngineOptions,
  WireTraceTuple,
} from './types.js';

export {
  DEFAULT_GET_STATS_INTERVAL_MS,
  DEFAULT_PATCH_CONFIG,
  RTCSTATS_PROTOCOL_VERSION,
} from './types.js';

export { compressMethod };

/**
 * Drop-in replacement for upstream `wrapRTCStatsWithDefaultOptions`.
 * Returns a callable trace function with `.connect()` and `.close()`.
 */
export function wrapRTCStatsWithDefaultOptions(
  config: ClientConfig = { getStatsInterval: DEFAULT_GET_STATS_INTERVAL_MS },
): LegacyTrace {
  const client = new RtcStatsClient({
    getStatsInterval: config.getStatsInterval,
    countReloads: config.countReloads,
    log: config.log,
    patches: config.patches,
    sink: config.sink,
    onBeforeTrace: config.onBeforeTrace,
    autoStart: config.autoStart ?? true,
  });
  return client.asLegacyTrace();
}

/** @deprecated Use {@link wrapRTCStatsWithDefaultOptions} or {@link RtcStatsClient}. */
export const WebSocketTrace = wrapRTCStatsWithDefaultOptions;
