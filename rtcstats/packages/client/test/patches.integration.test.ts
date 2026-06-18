import { compressMethod, readRTCStatsDump } from '@rtcstats/core';
import { describe, expect, it } from 'vitest';
import { RtcStatsClient } from '../src/RtcStatsClient.js';
import { BufferingSink } from '../src/sinks/CallbackSink.js';
import type { PatchWindow } from '../src/patches/types.js';

type WireTuple = unknown[];

function wireMethod(tuple: WireTuple): string | number {
  return tuple[0] as string | number;
}

function wireConnectionId(tuple: WireTuple): string | null {
  return tuple[1] as string | null;
}

function buildLogBlob(metadata: Record<string, unknown>, events: WireTuple[]): Blob {
  const lines = [
    'RTCStatsDump',
    JSON.stringify(metadata),
    ...events.map((event) => JSON.stringify(event)),
  ];
  return new Blob([lines.join('\n')], { type: 'text/plain' });
}

function createMockRTCPeerConnection(): typeof RTCPeerConnection {
  class MockRTCPeerConnection extends EventTarget {
    signalingState: RTCSignalingState = 'stable';
    connectionState: RTCPeerConnectionState = 'new';
    iceConnectionState: RTCIceConnectionState = 'new';
    iceGatheringState: RTCIceGatheringState = 'new';
    localDescription: RTCSessionDescription | null = null;
    remoteDescription: RTCSessionDescription | null = null;

    constructor(_config?: RTCConfiguration) {
      super();
    }

    async createOffer(): Promise<RTCSessionDescriptionInit> {
      return { type: 'offer', sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' };
    }

    async createAnswer(): Promise<RTCSessionDescriptionInit> {
      return { type: 'answer', sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' };
    }

    async setLocalDescription(description?: RTCLocalSessionDescriptionInit): Promise<void> {
      this.localDescription = description
        ? { type: description.type!, sdp: description.sdp ?? '', toJSON: () => description }
        : this.localDescription;
      this.signalingState = description?.type === 'offer' ? 'have-local-offer' : this.signalingState;
    }

    async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
      this.remoteDescription = {
        type: description.type!,
        sdp: description.sdp ?? '',
        toJSON: () => description,
      };
    }

    async addIceCandidate(): Promise<void> {}

    addTrack(): RTCRtpSender {
      const track = { id: 'track-1', kind: 'audio' } as MediaStreamTrack;
      return { track, __rtcStatsId: undefined, __rtcStatsSenderId: undefined } as RTCRtpSender;
    }

    addTransceiver(): RTCRtpTransceiver {
      const track = { id: 'track-2', kind: 'video' } as MediaStreamTrack;
      const sender = { track, __rtcStatsId: undefined, __rtcStatsSenderId: undefined } as RTCRtpSender;
      const receiver = { track } as RTCRtpReceiver;
      return { sender, receiver, direction: 'sendrecv' } as RTCRtpTransceiver;
    }

    removeTrack(): void {}

    createDataChannel(label: string): RTCDataChannel {
      return { label, id: 1 } as RTCDataChannel;
    }

    close(): void {
      this.connectionState = 'closed';
      this.signalingState = 'closed' as RTCSignalingState;
    }

    setConfiguration(): void {}

    getTransceivers(): RTCRtpTransceiver[] {
      return [];
    }

    async getStats(): Promise<RTCStatsReport> {
      const report = new Map<string, Record<string, unknown>>();
      report.set('transport-1', {
        type: 'transport',
        id: 'transport-1',
        timestamp: Date.now(),
        bytesSent: 0,
        bytesReceived: 0,
      });
      return report as unknown as RTCStatsReport;
    }

    static async generateCertificate(): Promise<RTCCertificate> {
      return {
        expires: Date.now() + 1000,
        getFingerprints: () => [{ algorithm: 'sha-256', value: 'AB:CD' }],
      } as RTCCertificate;
    }
  }

  return MockRTCPeerConnection as unknown as typeof RTCPeerConnection;
}

function createMockMediaStreamTrack(): typeof MediaStreamTrack {
  class MockMediaStreamTrack extends EventTarget {
    id = 'mock-track';
    kind: 'audio' | 'video' = 'audio';
    label = 'Mock Mic';
    readyState: MediaStreamTrackState = 'live';
    enabled = true;
    contentHint = '';

    stop(): void {
      this.readyState = 'ended';
    }

    applyConstraints(): Promise<void> {
      return Promise.resolve();
    }
  }

  return MockMediaStreamTrack as unknown as typeof MediaStreamTrack;
}

function createPatchTarget(): PatchWindow {
  const MediaStreamTrackCtor = createMockMediaStreamTrack();
  const mediaDevices = {
    getUserMedia: async (constraints?: MediaStreamConstraints) => {
      const track = new MediaStreamTrackCtor();
      track.kind = constraints?.video ? 'video' : 'audio';

      return {
        id: 'mock-stream',
        getTracks: () => [track],
      } as MediaStream;
    },
    enumerateDevices: async () => [
      {
        deviceId: 'audio-1',
        kind: 'audioinput',
        label: 'Mock Mic',
        groupId: 'group-1',
        toJSON() {
          return this;
        },
      } as MediaDeviceInfo,
    ],
    addEventListener: (type: string, listener: EventListener) => {
      if (type === 'devicechange') {
        deviceChangeListeners.push(listener);
      }
    },
  };

  const deviceChangeListeners: EventListener[] = [];

  return {
    RTCPeerConnection: createMockRTCPeerConnection(),
    RTCRtpTransceiver: class {} as typeof RTCRtpTransceiver,
    RTCRtpSender: class {} as typeof RTCRtpSender,
    navigator: { mediaDevices },
    MediaStreamTrack: MediaStreamTrackCtor,
    screen: { availWidth: 1920, availHeight: 1080 } as Screen,
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    document: {
      querySelectorAll: () => [],
    } as unknown as Document,
    setTimeout: (fn: () => void) => {
      fn();
      return 0;
    },
    clearInterval: () => {},
    setInterval: () => 0,
  };
}

describe('patch wire output', () => {
  it('emits compressed tuples that parse as a valid RTCStatsDump log', async () => {
    const sink = new BufferingSink();
    const target = createPatchTarget();
    const client = new RtcStatsClient({
      target,
      sink,
      getStatsInterval: 0,
      autoStart: true,
      patches: {
        peerConnection: { getStatsInterval: 0 },
        media: true,
        enumerateDevices: true,
      },
    });

    const config: RTCConfiguration = {
      iceServers: [{ urls: 'stun:localhost:3478', username: 'user', credential: 'secret' }],
    };
    const pc = new target.RTCPeerConnection!(config);
    await pc.createOffer();
    await pc.setLocalDescription({ type: 'offer', sdp: 'v=0\r\n' });
    pc.close();

    await target.navigator.mediaDevices!.getUserMedia!({ audio: true });
    await target.navigator.mediaDevices!.enumerateDevices!();

    client.close();

    expect(sink.events.length).toBeGreaterThan(0);

    const blob = buildLogBlob({ userId: 'test-user', roomId: 'test-room' }, sink.events);
    const dump = await readRTCStatsDump(blob);

    expect(dump).toBeDefined();
    expect(dump!.userId).toBe('test-user');
    expect(dump!.peerConnections.PC_0).toBeDefined();
    expect(dump!.peerConnections.null).toBeDefined();
    expect(dump!.peerConnections.PC_0!.some((event) => event.type === 'create')).toBe(true);
    expect(dump!.peerConnections.PC_0!.some((event) => event.type === 'createOffer')).toBe(true);
    expect(dump!.peerConnections.PC_0!.some((event) => event.type === 'close')).toBe(true);
    expect(dump!.peerConnections.null!.some((event) => event.type === 'navigator.mediaDevices.getUserMedia')).toBe(true);
    expect(dump!.peerConnections.null!.some((event) => event.type === 'navigator.mediaDevices.enumerateDevices')).toBe(true);
  });

  it('matches golden-log shape for peer connection create (credentials stripped)', () => {
    const sink = new BufferingSink();
    const target = createPatchTarget();

    new RtcStatsClient({
      target,
      sink,
      getStatsInterval: 0,
      autoStart: true,
      patches: { peerConnection: { getStatsInterval: 0 }, media: false, enumerateDevices: false },
    });

    const config: RTCConfiguration = {
      iceServers: [
        {
          urls: ['turn:localhost:3478?transport=udp'],
          username: 'turn-user',
          credential: 'turn-secret',
        },
      ],
      iceTransportPolicy: 'all',
    };

    new target.RTCPeerConnection!(config);

    const createEvent = sink.events.find((event) => wireMethod(event) === compressMethod('create'));
    expect(createEvent).toBeDefined();
    expect(wireConnectionId(createEvent!)).toBe('PC_0');
    expect(createEvent![2]).toMatchObject({
      iceServers: [{ urls: ['turn:localhost:3478?transport=udp'], username: 'turn-user' }],
      iceTransportPolicy: 'all',
    });
    expect((createEvent![2] as { iceServers: Array<{ credential?: string }> }).iceServers[0]).not.toHaveProperty('credential');
    expect(typeof createEvent!.at(-1)).toBe('number');
  });

  it('matches golden-log correlation ids for getUserMedia', async () => {
    const sink = new BufferingSink();
    const target = createPatchTarget();

    new RtcStatsClient({
      target,
      sink,
      autoStart: true,
      patches: { peerConnection: false, media: true, enumerateDevices: false },
    });

    await target.navigator.mediaDevices!.getUserMedia!({
      audio: { echoCancellation: true },
      video: { width: { ideal: 1280 } },
    });

    const startEvent = sink.events.find(
      (event) => wireMethod(event) === compressMethod('navigator.mediaDevices.getUserMedia'),
    );
    const successEvent = sink.events.find(
      (event) => wireMethod(event) === compressMethod('navigator.mediaDevices.getUserMediaOnSuccess'),
    );

    expect(startEvent).toBeDefined();
    expect(successEvent).toBeDefined();
    expect(startEvent![3]).toBe(`${compressMethod('navigator.mediaDevices.getUserMedia')}-0`);
    expect(successEvent![3]).toBe(startEvent![3]);
    expect(Array.isArray(successEvent![2])).toBe(true);
  });
});
