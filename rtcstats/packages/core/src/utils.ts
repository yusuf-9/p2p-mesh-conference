import type { SerializedTrack, SessionDescriptionInit, TrackInformation } from './types.js';

/**
 * Transforms a maplike to a JS object. Mostly for getStats + JSON.parse(JSON.stringify())
 */
export function map2obj(m: unknown): Record<string, any> {
  if (!m || typeof m !== 'object') {
    return {};
  }
  if (m instanceof Map) {
    const result: Record<string, any> = {};
    for (const [k, v] of m.entries()) {
      result[k] = v;
    }
    return result;
  }
  if ('entries' in m && typeof (m as Map<string, unknown>).entries === 'function') {
    const result: Record<string, any> = {};
    for (const [k, v] of (m as Map<string, unknown>).entries()) {
      result[k] = v;
    }
    return result;
  }
  return m as Record<string, any>;
}

/**
 * Creates a representation of a track and its associated streams for serialization.
 */
export function dumpTrackWithStreams(
  track: MediaStreamTrack,
  ...streams: MediaStream[]
): SerializedTrack {
  return [track.kind, track.id, track.label, ...streams.map((s) => s.id)];
}

/** Parses the serialized track and returns an object (which is not a track). */
export function parseTrackWithStreams(serialized: SerializedTrack | unknown[]): TrackInformation {
  const tuple = serialized as SerializedTrack;
  return {
    kind: tuple[0],
    id: tuple[1],
    label: tuple[2],
    streams: tuple.slice(3),
  };
}

/**
 * Sanitizes a RTCConfiguration by hiding the TURN server credentials and
 * making the certificates serializable.
 */
export function copyAndSanitizeConfig(
  config: RTCConfiguration | undefined,
): SessionDescriptionInit | Record<string, unknown> | undefined {
  if (!config) {
    return undefined;
  }
  const sanitizedConfig = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
  const iceServers = sanitizedConfig.iceServers as RTCIceServer[] | undefined;
  if (iceServers) {
    iceServers.forEach((server) => {
      delete server.credential;
    });
  }
  if (config.certificates) {
    sanitizedConfig.certificates = config.certificates.map((cert: RTCCertificate) => ({
      expires: cert.expires,
      fingerprints: cert.getFingerprints(),
    }));
  }
  return sanitizedConfig;
}
