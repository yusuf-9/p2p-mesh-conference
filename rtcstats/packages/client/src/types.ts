import type { PatchWindow } from './patches/types.js';

/** Wire tuple emitted by the trace engine (method may be compressed). */
export type WireTraceTuple = unknown[];

/** Parsed trace event before wire compression. */
export interface RtcStatsEvent {
  method: string;
  connectionId: string | null;
  value: unknown;
  extra: unknown[];
  deltaMs: number;
  timestamp: number;
}

/** Destination for trace events (WebSocket, callback, custom transport). */
export interface EventSink {
  sendWire(args: WireTraceTuple): void;
  close?(): void;
}

export type TraceCallback = (
  method: string,
  connectionId: string | RTCPeerConnection | null,
  value?: unknown,
  ...extra: unknown[]
) => void;

/** Legacy callable trace function with connect/close (upstream rtcstats API). */
export type LegacyTrace = TraceCallback & {
  connect(wsOrUrl: string | WebSocket): void;
  close(): void;
};

export interface PeerConnectionPatchOptions {
  getStatsInterval?: number;
}

export interface PatchConfig {
  /** Wrap RTCPeerConnection and related APIs. Default: enabled with 1s getStats. */
  peerConnection?: boolean | PeerConnectionPatchOptions;
  /** Wrap getUserMedia / getDisplayMedia / MediaStreamTrack. Default: true. */
  media?: boolean;
  /** Wrap enumerateDevices and devicechange. Default: true. */
  enumerateDevices?: boolean;
}

export interface TraceEngineOptions {
  /** Optional tap for every wire tuple (in addition to WebSocket transport). */
  sink?: EventSink;
  /** Return `null` to drop an event. */
  onBeforeTrace?: (event: RtcStatsEvent) => RtcStatsEvent | null;
  countReloads?: boolean;
  log?: (...args: unknown[]) => void;
  envelope?: (args: WireTraceTuple) => string;
  messageType?: string;
}

export interface ClientConfig {
  getStatsInterval?: number;
  countReloads?: boolean;
  log?: (...args: unknown[]) => void;
  patches?: PatchConfig;
  sink?: EventSink;
  onBeforeTrace?: (event: RtcStatsEvent) => RtcStatsEvent | null;
  autoStart?: boolean;
}

export interface RtcStatsClientOptions extends TraceEngineOptions {
  patches?: PatchConfig;
  getStatsInterval?: number;
  autoStart?: boolean;
  target?: PatchWindow;
  sessionMetadata?: () => Record<string, unknown>;
}

export const DEFAULT_GET_STATS_INTERVAL_MS = 1000;

export const DEFAULT_PATCH_CONFIG: PatchConfig = {
  peerConnection: { getStatsInterval: DEFAULT_GET_STATS_INTERVAL_MS },
  media: true,
  enumerateDevices: true,
};

export const RTCSTATS_PROTOCOL_VERSION = '5.0';
