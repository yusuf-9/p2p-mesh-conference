import type { SessionDescriptionInit, StatsIdMap } from '@rtcstats/core';
import type { TraceCallback } from '../types.js';
import type {
  PeerConnectionPatchWindow,
  RtcStatsMediaStreamTrack,
  RtcStatsPeerConnection,
  RtcStatsRtpTransceiver,
} from './types.js';

/** Negotiation methods that use compressMethod correlation ids. */
export type NegotiationCounterKey =
  | 'createOffer'
  | 'createAnswer'
  | 'setLocalDescription'
  | 'setRemoteDescription'
  | 'addIceCandidate';

export type NegotiationCounters = Record<NegotiationCounterKey, number>;

export function createNegotiationCounters(): NegotiationCounters {
  return {
    createOffer: 0,
    createAnswer: 0,
    setLocalDescription: 0,
    setRemoteDescription: 0,
    addIceCandidate: 0,
  };
}

export type MediaCaptureMethod = 'getUserMedia' | 'getDisplayMedia';

export type WrappableTrackProperty = 'enabled' | 'contentHint';

export type WrappableTrackMethod = 'stop' | 'applyConstraints';

/** ICE candidate with non-standard fields present in Chrome rtcstats dumps. */
export interface RtcStatsIceCandidateInit extends RTCIceCandidateInit {
  url?: string;
  relayProtocol?: string;
}

/** icecandidateerror event with Chrome-specific hostCandidate field. */
export interface RtcStatsIceCandidateErrorEvent extends RTCPeerConnectionIceErrorEvent {
  hostCandidate?: string;
}

/** RTCRtpTransceiver prototype methods not present in all DOM lib versions. */
export interface RtcStatsRtpTransceiverPrototype {
  setCodecPreferences?(
    this: RtcStatsRtpTransceiver,
    codecs: RTCRtpCodec[],
  ): RTCRtpTransceiver;
  setHeaderExtensionsToNegotiate?(
    this: RtcStatsRtpTransceiver,
    extensions: RTCRtpHeaderExtensionCapability[],
  ): RTCRtpTransceiver;
}

export interface ComputePressureRecord {
  state: string;
}

export type ComputePressureSample = [timestamp: number, record: ComputePressureRecord];

export interface StatsPollState {
  prevStats: Record<string, Record<string, unknown>>;
  statsIdMap: StatsIdMap;
}

export function createStatsPollState(): StatsPollState {
  return {
    prevStats: {},
    statsIdMap: {},
  };
}

export function asRtcStatsPeerConnection(pc: RTCPeerConnection): RtcStatsPeerConnection {
  return pc as RtcStatsPeerConnection;
}

export function asRtcStatsTransceiver(transceiver: RTCRtpTransceiver): RtcStatsRtpTransceiver {
  return transceiver as RtcStatsRtpTransceiver;
}

export function asRtcStatsTrack(track: MediaStreamTrack): RtcStatsMediaStreamTrack {
  return track as RtcStatsMediaStreamTrack;
}

export function toSessionDescriptionInit(
  description: RTCSessionDescription | RTCSessionDescriptionInit | SessionDescriptionInit | null | undefined,
): SessionDescriptionInit | null | undefined {
  if (!description) return description ?? null;
  return { type: description.type, sdp: description.sdp ?? undefined };
}

export function isPeerConnectionClosed(pc: RTCPeerConnection): boolean {
  return (pc.signalingState as string) === 'closed' || pc.connectionState === 'closed';
}

export function patchTransceiverMethods(
  trace: TraceCallback,
  window: PeerConnectionPatchWindow,
): void {
  const RTCRtpTransceiver = window.RTCRtpTransceiver;
  if (!RTCRtpTransceiver) return;

  const proto = RTCRtpTransceiver.prototype as unknown as RtcStatsRtpTransceiverPrototype;

  const nativeSetCodecPreferences = proto.setCodecPreferences;
  if (nativeSetCodecPreferences) {
    proto.setCodecPreferences = function (
      this: RtcStatsRtpTransceiver,
      codecs: RTCRtpCodec[],
    ) {
      trace('setCodecPreferences', this.__rtcStatsId ?? null, codecs, this.receiver.track.id);
      return nativeSetCodecPreferences.call(this, codecs);
    };
  }

  const nativeSetHeaderExtensions = proto.setHeaderExtensionsToNegotiate;
  if (nativeSetHeaderExtensions) {
    proto.setHeaderExtensionsToNegotiate = function (
      this: RtcStatsRtpTransceiver,
      extensions: RTCRtpHeaderExtensionCapability[],
    ) {
      trace('setHeaderExtensionsToNegotiate', this.__rtcStatsId ?? null, extensions, this.receiver.track.id);
      return nativeSetHeaderExtensions.call(this, extensions);
    };
  }
}
