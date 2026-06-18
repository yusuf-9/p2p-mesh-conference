import {
  statsCompression,
  descriptionCompression,
  compressMethod,
  computePressureTable,
  map2obj,
  dumpTrackWithStreams,
  copyAndSanitizeConfig,
} from '@rtcstats/core';
import type { TraceCallback } from '../types.js';
import {
  asRtcStatsPeerConnection,
  asRtcStatsTransceiver,
  createNegotiationCounters,
  createStatsPollState,
  isPeerConnectionClosed,
  patchTransceiverMethods,
  toSessionDescriptionInit,
  type ComputePressureSample,
  type NegotiationCounterKey,
  type RtcStatsIceCandidateErrorEvent,
  type RtcStatsIceCandidateInit,
} from './internal.js';
import type {
  LegacyPeerConnectionConstructor,
  PeerConnectionAddIceCandidate,
  PeerConnectionCreateAnswer,
  PeerConnectionCreateOffer,
  PeerConnectionPatchWindow,
  PeerConnectionSetLocalDescription,
  PeerConnectionSetRemoteDescription,
  RtcStatsPeerConnection,
  RtcStatsPeerConnectionPrototype,
  RtcStatsRtpSender,
  WrapRTCPeerConnection,
  WrapRTCPeerConnectionOptions,
} from './types.js';

type SignalingStateKey =
  | 'signalingState'
  | 'iceConnectionState'
  | 'connectionState'
  | 'iceGatheringState';

type VoidPeerConnectionMethod = 'close' | 'restartIce';

function wrapRTCRtpSender(trace: TraceCallback, window: PeerConnectionPatchWindow): void {
  const RTCRtpSender = window.RTCRtpSender;
  if (!RTCRtpSender) return;

  const nativeSetParameters = RTCRtpSender.prototype.setParameters;
  if (nativeSetParameters) {
    RTCRtpSender.prototype.setParameters = function (
      this: RtcStatsRtpSender,
      parameters: RTCRtpSendParameters,
      ...args: unknown[]
    ) {
      const serializedArgs = JSON.parse(JSON.stringify([parameters, ...args])) as [
        RTCRtpSendParameters & { transactionId?: string },
        ...unknown[],
      ];
      const { transactionId: _transactionId, ...parametersWithoutTxn } = serializedArgs[0];
      serializedArgs[0] = parametersWithoutTxn as RTCRtpSendParameters & { transactionId?: string };
      trace('setParameters', this.__rtcStatsId ?? null, serializedArgs, this.__rtcStatsSenderId);
      return nativeSetParameters.call(this, parameters);
    };
  }

  const nativeReplaceTrack = RTCRtpSender.prototype.replaceTrack;
  if (nativeReplaceTrack) {
    RTCRtpSender.prototype.replaceTrack = function (
      this: RtcStatsRtpSender,
      track: MediaStreamTrack | null,
    ) {
      const serializedArgs = [
        this.track === null ? null : dumpTrackWithStreams(this.track),
        track === null ? null : dumpTrackWithStreams(track),
      ];
      trace('replaceTrack', this.__rtcStatsId ?? null, serializedArgs, this.__rtcStatsSenderId);
      return nativeReplaceTrack.call(this, track);
    };
  }
}

function trackingIdFor(counter: NegotiationCounterKey, counters: Record<NegotiationCounterKey, number>): string {
  return `${compressMethod(counter)}-${counters[counter]++}`;
}

function attachVideoResizeListeners(
  trace: TraceCallback,
  pcId: string,
  track: MediaStreamTrack,
  document: Document,
  setTimeoutFn: typeof setTimeout,
): void {
  setTimeoutFn(() => {
    document.querySelectorAll('video').forEach((el) => {
      const srcObject = el.srcObject;
      if (!(srcObject instanceof MediaStream)) return;
      if (srcObject.getTracks().indexOf(track) === -1) return;

      el.addEventListener('resize', () => {
        const currentSrc = el.srcObject;
        if (!(currentSrc instanceof MediaStream)) return;
        if (currentSrc.getTracks().indexOf(track) === -1) return;
        trace('HTMLMediaElement.resize', pcId, {
          width: el.scrollWidth,
          height: el.scrollHeight,
          videoWidth: el.videoWidth,
          videoHeight: el.videoHeight,
        }, track.id);
      });
    });
  }, 0);
}

export const wrapRTCPeerConnection: WrapRTCPeerConnection = (
  trace: TraceCallback,
  window: PeerConnectionPatchWindow,
  { getStatsInterval }: WrapRTCPeerConnectionOptions,
) => {
  const RTCPeerConnectionCtor = window.RTCPeerConnection;
  if (!RTCPeerConnectionCtor) return;

  const proto = RTCPeerConnectionCtor.prototype as RtcStatsPeerConnectionPrototype;
  if (proto.__rtcStats) return;

  let lastComputePressureRecord: ComputePressureSample | undefined;
  if (window.PressureObserver && getStatsInterval) {
    const PressureObserver = window.PressureObserver;
    const observer = new PressureObserver((records) => {
      const lastRecord = records[records.length - 1];
      if (lastRecord) {
        lastComputePressureRecord = [Date.now(), lastRecord];
      }
    });
    observer.observe('cpu', { sampleInterval: getStatsInterval });
  }

  patchTransceiverMethods(trace, window);
  wrapRTCRtpSender(trace, window);

  const OrigPeerConnection = RTCPeerConnectionCtor;
  let peerConnectionCounter = 0;
  const counters = createNegotiationCounters();

  const clearIntervalFn = window.clearInterval ?? clearInterval;
  const setIntervalFn = window.setInterval ?? setInterval;
  const setTimeoutFn = window.setTimeout ?? setTimeout;
  const document = window.document ?? globalThis.document;

  function RTCStatsPeerConnection(
    config?: RTCConfiguration,
    constraints?: MediaStreamConstraints,
  ): RtcStatsPeerConnection {
    const pc = asRtcStatsPeerConnection(
      new (OrigPeerConnection as LegacyPeerConnectionConstructor)(config, constraints),
    );
    const pcId = `PC_${peerConnectionCounter++}`;
    pc.__rtcStatsId = pcId;

    trace('create', pcId, copyAndSanitizeConfig(config));
    if (constraints) {
      trace('constraints', pcId, constraints);
    }

    pc.addEventListener('icecandidate', (e: RTCPeerConnectionIceEvent) => {
      const candidate = e.candidate as (RTCIceCandidate & RtcStatsIceCandidateInit) | null;
      if (candidate && (candidate.url || candidate.relayProtocol)) {
        const serializedCandidate = candidate.toJSON() as RtcStatsIceCandidateInit;
        serializedCandidate.url = candidate.url;
        serializedCandidate.relayProtocol = candidate.relayProtocol;
        trace('onicecandidate', pcId, serializedCandidate);
        return;
      }
      trace('onicecandidate', pcId, candidate);
    });

    pc.addEventListener('icecandidateerror', (e: RtcStatsIceCandidateErrorEvent) => {
      const serializedArgs: Record<string, unknown> = {
        address: e.address,
        port: e.port,
        hostCandidate: e.hostCandidate,
        url: e.url,
        errorCode: e.errorCode,
        errorText: e.errorText,
      };
      trace('onicecandidateerror', pcId, serializedArgs);
    });

    pc.addEventListener('track', (e: RTCTrackEvent) => {
      trace('ontrack', pcId, dumpTrackWithStreams(e.track, ...e.streams));
      e.track.addEventListener('unmute', () => {
        trace('MediaStreamTrack.onunmute', pcId, e.track.id);
      });
      e.track.addEventListener('mute', () => {
        trace('MediaStreamTrack.onmute', pcId, e.track.id);
      });
      if (e.transceiver) {
        const transceiver = asRtcStatsTransceiver(e.transceiver);
        transceiver.__rtcStatsId = pcId;
        transceiver.sender.__rtcStatsId = pcId;
        transceiver.sender.__rtcStatsSenderId = e.track.id;
      }
      if (e.track.kind === 'video' && document) {
        attachVideoResizeListeners(trace, pcId, e.track, document, setTimeoutFn);
      }
    });

    const stateKeys: SignalingStateKey[] = [
      'signalingState',
      'iceConnectionState',
      'connectionState',
      'iceGatheringState',
    ];
    for (const state of stateKeys) {
      const eventName = `${state.toLowerCase()}change` as const;
      pc.addEventListener(eventName, () => {
        trace(`on${state.toLowerCase()}change`, pcId, pc[state]);
      });
    }

    pc.addEventListener('negotiationneeded', () => {
      trace('onnegotiationneeded', pcId, undefined);
    });

    pc.addEventListener('datachannel', (e: RTCDataChannelEvent) => {
      trace('ondatachannel', pcId, [e.channel.id, e.channel.label]);
    });

    const pollState = createStatsPollState();
    let statsInterval: ReturnType<typeof setInterval> | undefined;

    const getStats = async (reason?: string): Promise<void> => {
      if (isPeerConnectionClosed(pc)) {
        if (statsInterval !== undefined) {
          clearIntervalFn(statsInterval);
        }
        return;
      }

      const stats = map2obj(await pc.getStats());
      if (isPeerConnectionClosed(pc)) return;

      if (lastComputePressureRecord) {
        const [timestamp, record] = lastComputePressureRecord;
        stats.rtcStatsComputePressure = {
          type: 'compute-pressure',
          timestamp,
          cpuState: computePressureTable[record.state] ?? record.state,
        };
      }

      const baseStats = JSON.parse(JSON.stringify(stats)) as Record<string, Record<string, unknown>>;
      const compressedStats = statsCompression(pollState.prevStats, stats, pollState.statsIdMap);
      if (reason) {
        trace('getStats', pc.__rtcStatsId, compressedStats, reason);
      } else {
        trace('getStats', pc.__rtcStatsId, compressedStats);
      }
      pollState.prevStats = baseStats;
    };

    pc.addEventListener('connectionstatechange', function onFirstConnect() {
      if (pc.connectionState === 'connected' || pc.connectionState === 'failed') {
        pc.removeEventListener('connectionstatechange', onFirstConnect);
        if (getStatsInterval) {
          statsInterval = setIntervalFn(() => {
            void getStats();
          }, getStatsInterval);
        }
        void getStats(`${pc.connectionState}-0`);
      }
    });

    return pc;
  }

  const nativeCreateDataChannel = OrigPeerConnection.prototype.createDataChannel;
  if (nativeCreateDataChannel) {
    OrigPeerConnection.prototype.createDataChannel = function (
      this: RtcStatsPeerConnection,
      label: string,
      dataChannelDict?: RTCDataChannelInit,
    ) {
      trace('createDataChannel', this.__rtcStatsId, [label, dataChannelDict]);
      return nativeCreateDataChannel.call(this, label, dataChannelDict);
    };
  }

  const voidMethods: VoidPeerConnectionMethod[] = ['close', 'restartIce'];
  for (const method of voidMethods) {
    const nativeMethod = OrigPeerConnection.prototype[method];
    if (!nativeMethod) continue;
    OrigPeerConnection.prototype[method] = function (this: RtcStatsPeerConnection) {
      trace(method, this.__rtcStatsId, undefined);
      return nativeMethod.call(this);
    };
  }

  const nativeAddTrack = OrigPeerConnection.prototype.addTrack;
  if (nativeAddTrack) {
    OrigPeerConnection.prototype.addTrack = function (
      this: RtcStatsPeerConnection,
      track: MediaStreamTrack,
      ...streams: MediaStream[]
    ) {
      trace('addTrack', this.__rtcStatsId, dumpTrackWithStreams(track, ...streams));
      const sender = nativeAddTrack.call(this, track, ...streams) as RtcStatsRtpSender;
      sender.__rtcStatsId = this.__rtcStatsId;
      const transceiver = this.getTransceivers().find((t) => t.sender === sender);
      if (transceiver) {
        const rtcTransceiver = asRtcStatsTransceiver(transceiver);
        rtcTransceiver.__rtcStatsId = this.__rtcStatsId;
        sender.__rtcStatsSenderId = transceiver.receiver.track.id;
        trace('addTrackOnSuccess', this.__rtcStatsId, null, transceiver.receiver.track.id);
      }
      return sender;
    };
  }

  const nativeAddTransceiver = OrigPeerConnection.prototype.addTransceiver;
  if (nativeAddTransceiver) {
    OrigPeerConnection.prototype.addTransceiver = function (
      this: RtcStatsPeerConnection,
      trackOrKind: MediaStreamTrack | string,
      init?: RTCRtpTransceiverInit,
    ) {
      const serializedArgs: unknown[] = [
        typeof trackOrKind === 'string' ? trackOrKind : dumpTrackWithStreams(trackOrKind),
      ];
      if (init) {
        const initCopy = JSON.parse(JSON.stringify(init)) as RTCRtpTransceiverInit;
        if (init.streams) {
          initCopy.streams = init.streams.map((s) => s.id) as unknown as MediaStream[];
        }
        serializedArgs.push(initCopy);
      }
      trace('addTransceiver', this.__rtcStatsId, serializedArgs);
      const transceiver = asRtcStatsTransceiver(
        nativeAddTransceiver.call(this, trackOrKind, init),
      );
      transceiver.__rtcStatsId = this.__rtcStatsId;
      transceiver.sender.__rtcStatsId = this.__rtcStatsId;
      transceiver.sender.__rtcStatsSenderId = transceiver.receiver.track.id;
      trace('addTransceiverOnSuccess', this.__rtcStatsId, null, transceiver.receiver.track.id);
      return transceiver;
    };
  }

  const nativeRemoveTrack = OrigPeerConnection.prototype.removeTrack;
  if (nativeRemoveTrack) {
    OrigPeerConnection.prototype.removeTrack = function (
      this: RtcStatsPeerConnection,
      sender: RTCRtpSender,
    ) {
      const rtcSender = sender as RtcStatsRtpSender;
      trace('removeTrack', this.__rtcStatsId, rtcSender.__rtcStatsSenderId);
      return nativeRemoveTrack.call(this, sender);
    };
  }

  const nativeCreateOffer = OrigPeerConnection.prototype.createOffer as
    | PeerConnectionCreateOffer
    | undefined;
  if (nativeCreateOffer) {
    OrigPeerConnection.prototype.createOffer = async function (
      this: RtcStatsPeerConnection,
      options?: RTCOfferOptions,
    ) {
      const id = trackingIdFor('createOffer', counters);
      trace('createOffer', this.__rtcStatsId, options, id);
      return nativeCreateOffer.call(this, options)
        .then((description) => {
          trace('createOfferOnSuccess', this.__rtcStatsId,
            descriptionCompression(
              toSessionDescriptionInit(this.localDescription),
              toSessionDescriptionInit(description)!,
            ),
            id);
          if (!this.localDescription) {
            this.__rtcStatsLastCreatedOffer = description;
          }
          return description;
        })
        .catch((err: unknown) => {
          trace('createOfferOnFailure', this.__rtcStatsId, String(err), id);
          throw err;
        });
    } as typeof OrigPeerConnection.prototype.createOffer;
  }

  const nativeCreateAnswer = OrigPeerConnection.prototype.createAnswer as
    | PeerConnectionCreateAnswer
    | undefined;
  if (nativeCreateAnswer) {
    OrigPeerConnection.prototype.createAnswer = async function (
      this: RtcStatsPeerConnection,
      options?: RTCAnswerOptions,
    ) {
      const id = trackingIdFor('createAnswer', counters);
      trace('createAnswer', this.__rtcStatsId, options, id);
      return nativeCreateAnswer.call(this, options)
        .then((description) => {
          trace('createAnswerOnSuccess', this.__rtcStatsId,
            descriptionCompression(
              toSessionDescriptionInit(this.localDescription),
              toSessionDescriptionInit(description)!,
            ),
            id);
          if (!this.localDescription) {
            this.__rtcStatsLastCreatedAnswer = description;
          }
          return description;
        })
        .catch((err: unknown) => {
          trace('createAnswerOnFailure', this.__rtcStatsId, String(err), id);
          throw err;
        });
    } as typeof OrigPeerConnection.prototype.createAnswer;
  }

  const nativeSetLocalDescription = OrigPeerConnection.prototype.setLocalDescription as
    | PeerConnectionSetLocalDescription
    | undefined;
  if (nativeSetLocalDescription) {
    OrigPeerConnection.prototype.setLocalDescription = async function (
      this: RtcStatsPeerConnection,
      description?: RTCLocalSessionDescriptionInit,
    ) {
      const id = trackingIdFor('setLocalDescription', counters);
      let implicitBaseDescription: RTCSessionDescriptionInit | null | undefined;

      if (description) {
        let explicitBaseDescription: RTCSessionDescriptionInit | undefined;
        if (description.type === 'offer') {
          explicitBaseDescription = this.__rtcStatsLastCreatedOffer;
        } else if (description.type === 'answer') {
          explicitBaseDescription = this.__rtcStatsLastCreatedAnswer;
        }
        delete this.__rtcStatsLastCreatedOffer;
        delete this.__rtcStatsLastCreatedAnswer;
        trace('setLocalDescription', this.__rtcStatsId,
          descriptionCompression(
            toSessionDescriptionInit(this.localDescription ?? explicitBaseDescription ?? null),
            toSessionDescriptionInit(description)!,
          ),
          id);
      } else {
        implicitBaseDescription = this.localDescription
          ? JSON.parse(JSON.stringify(this.localDescription)) as RTCSessionDescriptionInit
          : null;
        trace('setLocalDescription', this.__rtcStatsId, null, id);
      }

      return nativeSetLocalDescription.call(this, description)
        .then(() => {
          if (!description) {
            const localDescription = this.localDescription;
            if (localDescription) {
              trace('setLocalDescriptionOnSuccess', this.__rtcStatsId,
                descriptionCompression(
                  toSessionDescriptionInit(implicitBaseDescription ?? null),
                  toSessionDescriptionInit(localDescription)!,
                ),
                id);
            }
          } else {
            trace('setLocalDescriptionOnSuccess', this.__rtcStatsId, undefined, id);
          }
        })
        .catch((err: unknown) => {
          trace('setLocalDescriptionOnFailure', this.__rtcStatsId, String(err), id);
          throw err;
        });
    } as typeof OrigPeerConnection.prototype.setLocalDescription;
  }

  const nativeSetRemoteDescription = OrigPeerConnection.prototype.setRemoteDescription as
    | PeerConnectionSetRemoteDescription
    | undefined;
  if (nativeSetRemoteDescription) {
    OrigPeerConnection.prototype.setRemoteDescription = async function (
      this: RtcStatsPeerConnection,
      description: RTCSessionDescriptionInit,
    ) {
      const id = trackingIdFor('setRemoteDescription', counters);
      trace('setRemoteDescription', this.__rtcStatsId,
        descriptionCompression(
          toSessionDescriptionInit(this.remoteDescription),
          toSessionDescriptionInit(description)!,
        ),
        id);
      return nativeSetRemoteDescription.call(this, description)
        .then(() => {
          trace('setRemoteDescriptionOnSuccess', this.__rtcStatsId, undefined, id);
        })
        .catch((err: unknown) => {
          trace('setRemoteDescriptionOnFailure', this.__rtcStatsId, String(err), id);
          throw err;
        });
    } as typeof OrigPeerConnection.prototype.setRemoteDescription;
  }

  const nativeAddIceCandidate = OrigPeerConnection.prototype.addIceCandidate as
    | PeerConnectionAddIceCandidate
    | undefined;
  if (nativeAddIceCandidate) {
    OrigPeerConnection.prototype.addIceCandidate = async function (
      this: RtcStatsPeerConnection,
      candidate?: RTCIceCandidateInit | null,
    ) {
      const id = trackingIdFor('addIceCandidate', counters);
      trace('addIceCandidate', this.__rtcStatsId, candidate, id);
      return nativeAddIceCandidate.call(this, candidate)
        .then(() => {
          trace('addIceCandidateOnSuccess', this.__rtcStatsId, undefined, id);
        })
        .catch((err: unknown) => {
          trace('addIceCandidateOnFailure', this.__rtcStatsId, String(err), id);
          throw err;
        });
    } as typeof OrigPeerConnection.prototype.addIceCandidate;
  }

  const nativeSetConfiguration = OrigPeerConnection.prototype.setConfiguration;
  if (nativeSetConfiguration) {
    OrigPeerConnection.prototype.setConfiguration = function (
      this: RtcStatsPeerConnection,
      configuration?: RTCConfiguration,
    ) {
      trace('setConfiguration', this.__rtcStatsId, copyAndSanitizeConfig(configuration));
      return nativeSetConfiguration.call(this, configuration);
    };
  }

  const WrappedPeerConnection = RTCStatsPeerConnection as unknown as typeof RTCPeerConnection;
  if (OrigPeerConnection.generateCertificate) {
    WrappedPeerConnection.generateCertificate = OrigPeerConnection.generateCertificate;
  }

  window.RTCPeerConnection = WrappedPeerConnection;
  window.RTCPeerConnection.prototype = OrigPeerConnection.prototype;
  (window.RTCPeerConnection.prototype as RtcStatsPeerConnectionPrototype).__rtcStats = true;
};
