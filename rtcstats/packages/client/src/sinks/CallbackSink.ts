import type { EventSink, RtcStatsEvent, WireTraceTuple } from '../types.js';

/** Invokes a callback for each wire tuple (useful for tests and custom transports). */
export class CallbackSink implements EventSink {
  constructor(
    private readonly onEvent: (args: WireTraceTuple, event?: RtcStatsEvent) => void,
  ) {}

  sendWire(args: WireTraceTuple): void {
    this.onEvent(args);
  }
}

/** Buffers wire tuples in memory (e.g. for offline export). */
export class BufferingSink implements EventSink {
  readonly events: WireTraceTuple[] = [];

  sendWire(args: WireTraceTuple): void {
    this.events.push(args);
  }

  drain(): WireTraceTuple[] {
    const copy = [...this.events];
    this.events.length = 0;
    return copy;
  }
}
