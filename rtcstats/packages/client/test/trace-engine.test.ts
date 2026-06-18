import { RtcStatsClient, wrapRTCStatsWithDefaultOptions } from '../src/index.js';
import { BufferingSink } from '../src/sinks/CallbackSink.js';
import { TraceEngine } from '../src/trace/TraceEngine.js';
import { compressMethod } from '@rtcstats/core';
import { describe, expect, it, vi } from 'vitest';

describe('TraceEngine', () => {
  it('compresses methods and records deltaMs', () => {
    const sink = new BufferingSink();
    const engine = new TraceEngine({ sink });

    engine.trace('create', null, { platform: 'test' });
    engine.trace('websocket', null, { connectionTime: 0 });

    expect(sink.events).toHaveLength(2);
    expect(sink.events[0]![0]).toBe(compressMethod('create'));
    expect(sink.events[0]![3]).toBeGreaterThanOrEqual(0);
  });

  it('filters events via onBeforeTrace', () => {
    const sink = new BufferingSink();
    const engine = new TraceEngine({
      sink,
      onBeforeTrace: (event) => (event.method === 'drop' ? null : event),
    });

    engine.trace('create', null, {});
    engine.trace('drop', null, {});

    expect(sink.events).toHaveLength(1);
  });
});

describe('RtcStatsClient', () => {
  it('exposes legacy trace API', () => {
    const client = RtcStatsClient.withDefaults();
    const trace = client.asLegacyTrace();

    expect(typeof trace).toBe('function');
    expect(typeof trace.connect).toBe('function');
    expect(typeof trace.close).toBe('function');
  });

  it('wrapRTCStatsWithDefaultOptions returns legacy API without autoStart', () => {
    const trace = wrapRTCStatsWithDefaultOptions({ getStatsInterval: 1000, autoStart: false });
    expect(typeof trace).toBe('function');
    expect(typeof trace.connect).toBe('function');
    expect(typeof trace.close).toBe('function');
  });
});

describe('WebSocket envelope', () => {
  it('sends rtc-stats messages when socket opens', async () => {
    const sent: string[] = [];
    const socket = {
      readyState: WebSocket.CONNECTING,
      send: vi.fn((msg: string) => sent.push(msg)),
      addEventListener: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket;

    const listeners = new Map<string, () => void>();
    (socket.addEventListener as ReturnType<typeof vi.fn>).mockImplementation(
      (event: string, cb: () => void) => {
        listeners.set(event, cb);
      },
    );

    const engine = new TraceEngine({});
    engine.trace('create', null, { test: true });
    engine.connect(socket);

    Object.defineProperty(socket, 'readyState', { value: WebSocket.OPEN });
    listeners.get('open')?.();

    await new Promise((r) => setTimeout(r, 0));

    expect(sent.length).toBeGreaterThan(0);
    const payload = JSON.parse(sent[0]!);
    expect(payload.type).toBe('rtc-stats');
    expect(Array.isArray(payload.data)).toBe(true);
  });
});
