import { compressMethod } from '@rtcstats/core';
import type { EventSink, RtcStatsEvent, TraceEngineOptions, WireTraceTuple } from '../types.js';
import { RTCSTATS_PROTOCOL_VERSION } from '../types.js';

const RELOAD_COUNT_KEY = 'rtcstatsReloadCount';

const defaultEnvelope = (args: WireTraceTuple, messageType: string) =>
  JSON.stringify({ type: messageType, data: args });

/**
 * Records WebRTC API calls, applies optional hooks, compresses method names,
 * buffers until a WebSocket is connected, and optionally taps events to a sink.
 */
export class TraceEngine {
  private readonly additionalSink?: EventSink;
  private readonly onBeforeTrace?: TraceEngineOptions['onBeforeTrace'];
  private readonly log?: TraceEngineOptions['log'];
  private readonly countReloads: boolean;
  private readonly envelope: (args: WireTraceTuple) => string;

  private buffer: WireTraceTuple[] = [];
  private socket: WebSocket | null = null;
  private lastTime = 0;
  private connectionStartTime = 0;
  private reloadCount: number | undefined;

  readonly trace: (
    method: string,
    connectionId: string | RTCPeerConnection | null,
    value?: unknown,
    ...extra: unknown[]
  ) => void;

  constructor(options: TraceEngineOptions) {
    this.additionalSink = options.sink;
    this.onBeforeTrace = options.onBeforeTrace;
    this.log = options.log;
    this.countReloads = options.countReloads ?? false;
    const messageType = options.messageType ?? 'rtc-stats';
    this.envelope =
      options.envelope ?? ((args) => defaultEnvelope(args, messageType));

    if (typeof window !== 'undefined' && window.sessionStorage && this.countReloads) {
      const stored = parseInt(window.sessionStorage.getItem(RELOAD_COUNT_KEY) ?? '', 10);
      this.reloadCount = Number.isNaN(stored) ? 0 : stored + 1;
      window.sessionStorage.setItem(RELOAD_COUNT_KEY, String(this.reloadCount));
    }

    this.trace = (method, connectionId, value?, ...extra) => {
      const now = Date.now();
      const deltaMs = now - this.lastTime;
      this.lastTime = now;

      let resolvedConnectionId: string | null =
        typeof connectionId === 'string' ? connectionId : null;
      if (
        typeof RTCPeerConnection !== 'undefined' &&
        connectionId instanceof RTCPeerConnection
      ) {
        resolvedConnectionId =
          (connectionId as RTCPeerConnection & { __rtcStatsId?: string }).__rtcStatsId ?? null;
      }

      let event: RtcStatsEvent = {
        method,
        connectionId: resolvedConnectionId,
        value,
        extra: [...extra],
        deltaMs,
        timestamp: now,
      };

      if (this.onBeforeTrace) {
        const transformed = this.onBeforeTrace(event);
        if (!transformed) return;
        event = transformed;
      }

      const wireArgs: WireTraceTuple = [
        compressMethod(event.method),
        event.connectionId,
        event.value,
        ...event.extra,
        event.deltaMs,
      ];

      this.additionalSink?.sendWire(wireArgs);
      this.enqueueOrSend(wireArgs);
    };
  }

  getSocket(): WebSocket | null {
    return this.socket;
  }

  connect(wsOrUrl: string | WebSocket, sessionMetadata?: Record<string, unknown>): void {
    if (this.socket) {
      this.socket.close();
      this.lastTime = 0;
    }

    this.trace('create', null, {
      ...sessionMetadata,
      reloadCount: this.reloadCount,
    });
    this.connectionStartTime = Date.now();

    if (typeof wsOrUrl === 'string') {
      this.socket = new WebSocket(wsOrUrl, `rtcstats#${RTCSTATS_PROTOCOL_VERSION}`);
    } else {
      this.socket = wsOrUrl;
    }

    this.attachSocketListeners(this.socket);
  }

  close(): void {
    if (typeof window !== 'undefined' && window.sessionStorage && this.countReloads) {
      window.sessionStorage.removeItem(RELOAD_COUNT_KEY);
    }
    this.socket?.close();
    this.socket = null;
    this.lastTime = 0;
    this.additionalSink?.close?.();
  }

  private enqueueOrSend(args: WireTraceTuple): void {
    const socket = this.socket;
    if (!socket) {
      this.buffer.push(args);
      return;
    }

    if (socket.readyState === WebSocket.OPEN) {
      if (this.buffer.length === 0) {
        socket.send(this.envelope(args));
      } else {
        this.buffer.push(args);
      }
    } else if (socket.readyState === WebSocket.CONNECTING) {
      this.buffer.push(args);
    }
  }

  private attachSocketListeners(ws: WebSocket): void {
    ws.addEventListener('error', (event) => {
      this.log?.('rtcstats websocket connection error', event, ws.readyState);
    });

    ws.addEventListener('close', (event) => {
      if (event.code === 1008) {
        this.log?.(
          'rtcstats websocket connection closed with error=1008. ' +
            'Typically this means authorization is required and failed.',
        );
      }
    });

    const flush = () => {
      if (!this.buffer.length) {
        const connectionTime = Date.now() - this.connectionStartTime;
        this.trace('websocket', null, { connectionTime });
        return;
      }
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(this.envelope(this.buffer.shift()!));
      setTimeout(flush, 0);
    };

    if (ws.readyState === WebSocket.OPEN) {
      setTimeout(flush, 0);
    } else {
      ws.addEventListener('open', () => setTimeout(flush, 0));
    }
  }
}
