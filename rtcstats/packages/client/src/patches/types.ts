import type { PeerConnectionPatchOptions, TraceCallback } from '../types.js';

/** Compute Pressure API constructor (Chrome); optional. */
export type PressureObserverConstructor = new (
  callback: (records: Array<{ state: string }>) => void,
) => {
  observe(type: string, options?: { sampleInterval?: number }): void;
  disconnect(): void;
};

/**
 * Window globals used by the peer-connection patch.
 * All fields are optional so the patch can no-op when APIs are missing.
 */
export interface PeerConnectionPatchWindow {
  RTCPeerConnection?: typeof RTCPeerConnection;
  RTCRtpTransceiver?: typeof RTCRtpTransceiver;
  RTCRtpSender?: typeof RTCRtpSender;
  PressureObserver?: PressureObserverConstructor;
  clearInterval?: typeof clearInterval;
  setInterval?: typeof setInterval;
  setTimeout?: typeof setTimeout;
  document?: Document;
}

/** Options passed to {@link wrapRTCPeerConnection}. */
export interface WrapRTCPeerConnectionOptions extends PeerConnectionPatchOptions {
  /** Interval in ms for periodic getStats polling after connect. `0` disables polling. */
  getStatsInterval?: number;
}

/** navigator.mediaDevices with rtcstats idempotency markers. */
export interface MediaDevicesWithRtcStats extends MediaDevices {
  __rtcStats?: boolean;
}

export interface EnumerateDevicesWithRtcStats {
  (...args: []): Promise<MediaDeviceInfo[]>;
  __rtcStats?: boolean;
}

/** Navigator surface required by media / enumerateDevices patches. */
export interface MediaPatchNavigator {
  mediaDevices?: MediaDevicesWithRtcStats & {
    getUserMedia?: MediaDevices['getUserMedia'];
    getDisplayMedia?: MediaDevices['getDisplayMedia'];
    enumerateDevices?: EnumerateDevicesWithRtcStats;
    addEventListener?: MediaDevices['addEventListener'];
  };
}

/** Target passed to {@link wrapGetUserMedia}. */
export interface MediaPatchTarget {
  navigator: MediaPatchNavigator;
  MediaStreamTrack?: typeof MediaStreamTrack;
}

/** Target passed to {@link wrapEnumerateDevices}. */
export interface EnumerateDevicesPatchTarget {
  navigator: MediaPatchNavigator;
}

/** Window fields used for session metadata on connect. */
export interface WindowSessionTarget {
  screen: Screen;
  innerWidth: number;
  innerHeight: number;
  devicePixelRatio: number;
}

/** Unified browser target for all patches (what PatchRegistry passes). */
export type PatchWindow = PeerConnectionPatchWindow &
  MediaPatchTarget &
  EnumerateDevicesPatchTarget &
  WindowSessionTarget;

/** RTCPeerConnection prototype marker to prevent double-wrapping. */
export interface RtcStatsPeerConnectionPrototype extends RTCPeerConnection {
  __rtcStats?: true;
}

/** RTCPeerConnection instance augmented with rtcstats correlation id. */
export interface RtcStatsPeerConnection extends RTCPeerConnection {
  __rtcStatsId: string;
  __rtcStatsLastCreatedOffer?: RTCSessionDescriptionInit;
  __rtcStatsLastCreatedAnswer?: RTCSessionDescriptionInit;
}

/** Legacy constructor that accepted constraints as a second argument. */
export type LegacyPeerConnectionConstructor = new (
  configuration?: RTCConfiguration,
  constraints?: MediaStreamConstraints,
) => RTCPeerConnection;

/** Promise-based WebRTC method signatures (modern API only). */
export type PeerConnectionCreateOffer = (
  this: RTCPeerConnection,
  options?: RTCOfferOptions,
) => Promise<RTCSessionDescriptionInit>;

export type PeerConnectionCreateAnswer = (
  this: RTCPeerConnection,
  options?: RTCAnswerOptions,
) => Promise<RTCSessionDescriptionInit>;

export type PeerConnectionSetLocalDescription = (
  this: RTCPeerConnection,
  description?: RTCLocalSessionDescriptionInit,
) => Promise<void>;

export type PeerConnectionSetRemoteDescription = (
  this: RTCPeerConnection,
  description: RTCSessionDescriptionInit,
) => Promise<void>;

export type PeerConnectionAddIceCandidate = (
  this: RTCPeerConnection,
  candidate?: RTCIceCandidateInit | null,
) => Promise<void>;

/** RTCRtpSender / transceiver objects augmented for trace correlation. */
export interface RtcStatsRtpSender extends RTCRtpSender {
  __rtcStatsId?: string;
  __rtcStatsSenderId?: string;
}

export interface RtcStatsRtpTransceiver extends RTCRtpTransceiver {
  __rtcStatsId?: string;
  sender: RtcStatsRtpSender;
}

/** MediaStreamTrack augmented with per-capture tracking id. */
export interface RtcStatsMediaStreamTrack extends MediaStreamTrack {
  __rtcStatsId?: string;
}

export type WrapRTCPeerConnection = (
  trace: TraceCallback,
  window: PeerConnectionPatchWindow,
  options: WrapRTCPeerConnectionOptions,
) => void;

export type WrapGetUserMedia = (
  trace: TraceCallback,
  target: MediaPatchTarget,
) => void;

export type WrapEnumerateDevices = (
  trace: TraceCallback,
  target: EnumerateDevicesPatchTarget,
) => void;
