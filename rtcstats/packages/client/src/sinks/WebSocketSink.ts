import type { EventSink, WireTraceTuple } from '../types.js';

export interface WebSocketEnvelopeOptions {
  /**
   * Wrap wire tuples before sending. Default matches janus app format:
   * `{ type: 'rtc-stats', data: args }`
   */
  envelope?: (args: WireTraceTuple) => string;
  /** Message type field when using the default envelope. */
  messageType?: string;
}

const defaultEnvelope = (args: WireTraceTuple, messageType: string) =>
  JSON.stringify({ type: messageType, data: args });

/**
 * Sends trace wire tuples over a WebSocket (directly or via JSON envelope).
 * Buffering while the socket is connecting is handled by {@link TraceEngine}.
 */
export class WebSocketSink implements EventSink {
  private readonly envelope: (args: WireTraceTuple) => string;

  constructor(
    private readonly getSocket: () => WebSocket | null,
    options: WebSocketEnvelopeOptions = {},
  ) {
    const messageType = options.messageType ?? 'rtc-stats';
    this.envelope =
      options.envelope ?? ((args) => defaultEnvelope(args, messageType));
  }

  sendWire(args: WireTraceTuple): void {
    const socket = this.getSocket();
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(this.envelope(args));
  }
}
