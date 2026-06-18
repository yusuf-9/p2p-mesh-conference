import {
  PatchRegistry,
  resolveGetStatsInterval,
  resolvePatches,
} from './patches/PatchRegistry.js';
import { TraceEngine } from './trace/TraceEngine.js';
import type { EventSink, LegacyTrace, PatchConfig, RtcStatsClientOptions } from './types.js';
import {
  DEFAULT_GET_STATS_INTERVAL_MS,
  DEFAULT_PATCH_CONFIG,
} from './types.js';

/**
 * Browser-side RTCStats client: applies WebRTC patches and streams trace events
 * over WebSocket (with an optional additional {@link EventSink}).
 */
export class RtcStatsClient {
  private readonly engine: TraceEngine;
  private readonly patchRegistry: PatchRegistry;
  private readonly target: Window & typeof globalThis;
  private readonly sessionMetadata: () => Record<string, unknown>;

  constructor(options: RtcStatsClientOptions = {}) {
    const patchConfig = options.patches ?? DEFAULT_PATCH_CONFIG;
    const getStatsInterval =
      options.getStatsInterval ??
      resolveGetStatsInterval(patchConfig, DEFAULT_GET_STATS_INTERVAL_MS);

    this.target = options.target ?? window;
    this.sessionMetadata = options.sessionMetadata ?? (() => this.defaultSessionMetadata());

    this.engine = new TraceEngine({
      sink: options.sink,
      onBeforeTrace: options.onBeforeTrace,
      countReloads: options.countReloads,
      log: options.log,
      envelope: options.envelope,
      messageType: options.messageType,
    });

    this.patchRegistry = new PatchRegistry(resolvePatches(patchConfig), {
      target: this.target,
      getStatsInterval,
    });

    if (options.autoStart) {
      this.start();
    }
  }

  start(): void {
    this.patchRegistry.start(this.engine.trace.bind(this.engine));
  }

  stop(): void {
    this.close();
  }

  connect(wsOrUrl: string | WebSocket): void {
    this.engine.connect(wsOrUrl, this.sessionMetadata());
  }

  close(): void {
    this.engine.close();
  }

  trace(
    method: string,
    connectionId: string | RTCPeerConnection | null,
    value?: unknown,
    ...extra: unknown[]
  ): void {
    this.engine.trace(method, connectionId, value, ...extra);
  }

  asLegacyTrace(): LegacyTrace {
    const legacy = this.engine.trace.bind(this.engine) as LegacyTrace;
    legacy.connect = (wsOrUrl) => this.connect(wsOrUrl);
    legacy.close = () => this.close();
    return legacy;
  }

  static withDefaults(options: RtcStatsClientOptions = {}): RtcStatsClient {
    return new RtcStatsClient({
      patches: DEFAULT_PATCH_CONFIG,
      getStatsInterval: DEFAULT_GET_STATS_INTERVAL_MS,
      ...options,
    });
  }

  private defaultSessionMetadata(): Record<string, unknown> {
    return {
      hardwareConcurrency: navigator.hardwareConcurrency,
      userAgentData: (navigator as Navigator & { userAgentData?: unknown }).userAgentData,
      deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
      screen: {
        width: this.target.screen.availWidth,
        height: this.target.screen.availHeight,
        devicePixelRatio: this.target.devicePixelRatio,
      },
      window: {
        width: this.target.innerWidth,
        height: this.target.innerHeight,
      },
    };
  }
}
