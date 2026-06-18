import { compressMethod, dumpTrackWithStreams } from '@rtcstats/core';
import type { TraceCallback } from '../types.js';
import {
  asRtcStatsTrack,
  type MediaCaptureMethod,
  type WrappableTrackProperty,
} from './internal.js';
import type {
  EnumerateDevicesPatchTarget,
  EnumerateDevicesWithRtcStats,
  MediaDevicesWithRtcStats,
  MediaPatchTarget,
  RtcStatsMediaStreamTrack,
  WrapEnumerateDevices,
  WrapGetUserMedia,
} from './types.js';

function wrapTrackProperty(
  track: RtcStatsMediaStreamTrack,
  property: WrappableTrackProperty,
  trace: TraceCallback,
  MediaStreamTrackCtor: typeof MediaStreamTrack,
): void {
  const prop = Object.getOwnPropertyDescriptor(MediaStreamTrackCtor.prototype, property);
  if (!prop?.get || !prop?.set) return;

  Object.defineProperty(track, property, {
    configurable: true,
    enumerable: true,
    get(this: RtcStatsMediaStreamTrack) {
      return prop.get!.call(this);
    },
    set(this: RtcStatsMediaStreamTrack, value: boolean | string) {
      trace('MediaStreamTrack.' + property, null, value, this.id);
      prop.set!.call(this, value);
    },
  });
}

function wrapMediaCaptureMethod(
  trace: TraceCallback,
  mediaDevices: MediaDevicesWithRtcStats,
  method: MediaCaptureMethod,
  counters: Record<MediaCaptureMethod, number>,
): void {
  const traceMethod = `navigator.mediaDevices.${method}` as const;

  if (method === 'getUserMedia' && mediaDevices.getUserMedia) {
    const origMethod = mediaDevices.getUserMedia.bind(mediaDevices);
    mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      const trackingId = `${compressMethod(traceMethod)}-${counters[method]++}`;
      trace(traceMethod, null, constraints, trackingId);
      return origMethod(constraints)
        .then((stream) => {
          trace(`${traceMethod}OnSuccess`, null,
            stream.getTracks().map((t) => dumpTrackWithStreams(t, stream)),
            trackingId);
          for (const track of stream.getTracks()) {
            const rtcTrack = asRtcStatsTrack(track);
            rtcTrack.__rtcStatsId = trackingId;
            track.addEventListener('ended', () => {
              trace('MediaStreamTrack.onended', null, track.id, rtcTrack.__rtcStatsId);
            });
            wrapTrackProperty(rtcTrack, 'enabled', trace, MediaStreamTrack);
            wrapTrackProperty(rtcTrack, 'contentHint', trace, MediaStreamTrack);
          }
          return stream;
        })
        .catch((err: unknown) => {
          trace(`${traceMethod}OnFailure`, null, String(err), trackingId);
          return Promise.reject(err);
        });
    };
    return;
  }

  if (method === 'getDisplayMedia' && mediaDevices.getDisplayMedia) {
    const origMethod = mediaDevices.getDisplayMedia.bind(mediaDevices);
    mediaDevices.getDisplayMedia = async (options?: DisplayMediaStreamOptions) => {
      const trackingId = `${compressMethod(traceMethod)}-${counters[method]++}`;
      trace(traceMethod, null, options, trackingId);
      return origMethod(options)
        .then((stream) => {
          trace(`${traceMethod}OnSuccess`, null,
            stream.getTracks().map((t) => dumpTrackWithStreams(t, stream)),
            trackingId);
          for (const track of stream.getTracks()) {
            const rtcTrack = asRtcStatsTrack(track);
            rtcTrack.__rtcStatsId = trackingId;
            track.addEventListener('ended', () => {
              trace('MediaStreamTrack.onended', null, track.id, rtcTrack.__rtcStatsId);
            });
            wrapTrackProperty(rtcTrack, 'enabled', trace, MediaStreamTrack);
            wrapTrackProperty(rtcTrack, 'contentHint', trace, MediaStreamTrack);
          }
          return stream;
        })
        .catch((err: unknown) => {
          trace(`${traceMethod}OnFailure`, null, String(err), trackingId);
          return Promise.reject(err);
        });
    };
  }
}

function wrapMediaStreamTrackPrototype(
  trace: TraceCallback,
  MediaStreamTrackCtor: typeof MediaStreamTrack,
): void {
  const nativeStop = MediaStreamTrackCtor.prototype.stop;
  MediaStreamTrackCtor.prototype.stop = function (this: RtcStatsMediaStreamTrack) {
    if (this.readyState !== 'ended') {
      trace('MediaStreamTrack.stop', null, [], this.id, this.__rtcStatsId);
    }
    return nativeStop.call(this);
  };

  const nativeApplyConstraints = MediaStreamTrackCtor.prototype.applyConstraints;
  MediaStreamTrackCtor.prototype.applyConstraints = function (
    this: RtcStatsMediaStreamTrack,
    constraints?: MediaTrackConstraints,
  ) {
    if (this.readyState !== 'ended') {
      trace('MediaStreamTrack.applyConstraints', null, [constraints], this.id, this.__rtcStatsId);
    }
    return nativeApplyConstraints.call(this, constraints);
  };
}

export const wrapGetUserMedia: WrapGetUserMedia = function wrapGetUserMedia(
  trace: TraceCallback,
  { navigator, MediaStreamTrack: MediaStreamTrackCtor }: MediaPatchTarget,
) {
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices) return;
  if (mediaDevices.__rtcStats) return;

  const counters: Record<MediaCaptureMethod, number> = {
    getUserMedia: 0,
    getDisplayMedia: 0,
  };

  wrapMediaCaptureMethod(trace, mediaDevices, 'getUserMedia', counters);
  wrapMediaCaptureMethod(trace, mediaDevices, 'getDisplayMedia', counters);

  if (MediaStreamTrackCtor) {
    wrapMediaStreamTrackPrototype(trace, MediaStreamTrackCtor);
  }

  mediaDevices.__rtcStats = true;
};

export const wrapEnumerateDevices: WrapEnumerateDevices = function wrapEnumerateDevices(
  trace: TraceCallback,
  { navigator }: EnumerateDevicesPatchTarget,
) {
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices?.enumerateDevices) return;

  const enumerateDevices = mediaDevices.enumerateDevices as EnumerateDevicesWithRtcStats;
  if (enumerateDevices.__rtcStats) return;

  const origMethod = enumerateDevices.bind(mediaDevices);
  const wrappedMethod: EnumerateDevicesWithRtcStats = () =>
    origMethod().then((devices) => {
      trace('navigator.mediaDevices.enumerateDevices', null,
        JSON.parse(JSON.stringify(devices)) as MediaDeviceInfo[]);
      return devices;
    });

  wrappedMethod.__rtcStats = true;
  mediaDevices.enumerateDevices = wrappedMethod;

  if ('ondevicechange' in mediaDevices && mediaDevices.addEventListener) {
    mediaDevices.addEventListener('devicechange', () => {
      trace('navigator.mediaDevices.ondevicechange', null, null);
    });
  }
};
