import {
  decompressMethod,
  descriptionDecompression,
  statsDecompression,
} from './compression.js';
import { parseTrackWithStreams } from './utils.js';
import type { RTCStatsDump, SessionDescriptionInit, StatsObject, TraceEvent, TrackInformation } from './types.js';

export async function detectRTCStatsDump(blob: Blob): Promise<boolean> {
  const magic = await blob.slice(0, 13).text();
  return magic.startsWith('RTCStatsDump\n');
}

export async function detectWebRTCInternalsDump(blob: Blob): Promise<boolean> {
  return (await blob.text()).startsWith('{');
}

export async function readRTCStatsDump(blob: Blob): Promise<RTCStatsDump | undefined> {
  const textBlob = await blob.text();
  const firstLine = textBlob.slice(0, 13);
  if (firstLine !== 'RTCStatsDump\n') {
    console.error('Not an RTCStatsDump');
    return undefined;
  }
  const lines = textBlob.slice(13).split('\n');

  let data: RTCStatsDump;
  try {
    data = JSON.parse(lines.shift()!) as RTCStatsDump;
  } catch {
    console.error('Second line is not JSON data');
    return undefined;
  }
  if (typeof data !== 'object' || Array.isArray(data)) {
    console.error('Second line must be an object');
    return undefined;
  }
  data.peerConnections = {};
  data.eventSizes = {};

  const baseStats: StatsObject = {};
  let lastTime = 0;

  for (const line of lines) {
    if (!line.length) {
      continue;
    }
    let jsonData: unknown;
    try {
      jsonData = JSON.parse(line);
    } catch {
      console.error('Parsing line as JSON failed');
      return undefined;
    }
    if (!Array.isArray(jsonData)) {
      continue;
    }

    let [method, connectionId, value, ...extra] = jsonData as [string | number, string, unknown, ...unknown[]];
    method = decompressMethod(method);

    const deltaMs = extra.pop() as number;
    lastTime = deltaMs + lastTime;
    const time = new Date(lastTime);

    if (method === 'getStats') {
      value = statsDecompression(baseStats[connectionId], value as Record<string, unknown>);
      baseStats[connectionId] = JSON.parse(JSON.stringify(value));
    } else if (
      method === 'setLocalDescription' &&
      value &&
      connectionId !== 'undefined-undefined'
    ) {
      const description = value as SessionDescriptionInit;
      let createCall: TraceEvent | undefined;
      const trace = data.peerConnections[connectionId] ?? [];
      for (let previousIndex = trace.length - 1; previousIndex >= 0; previousIndex--) {
        if (
          (description.type === 'offer' && trace[previousIndex].type === 'createOfferOnSuccess') ||
          (description.type === 'answer' && trace[previousIndex].type === 'createAnswerOnSuccess')
        ) {
          createCall = trace[previousIndex];
          break;
        }
      }
      if (createCall) {
        value = descriptionDecompression(createCall.value as SessionDescriptionInit, description);
      }
    } else if (['createOfferOnSuccess', 'createAnswerOnSuccess'].includes(method)) {
      const description = value as SessionDescriptionInit;
      let sldCall: TraceEvent | undefined;
      const trace = data.peerConnections[connectionId] ?? [];
      for (let previousIndex = trace.length - 1; previousIndex >= 0; previousIndex--) {
        if (
          (description.type === 'offer' && trace[previousIndex].type === 'setLocalDescription') ||
          (description.type === 'answer' && trace[previousIndex].type === 'setLocalDescription')
        ) {
          sldCall = trace[previousIndex];
          break;
        }
      }
      if (sldCall) {
        value = descriptionDecompression(sldCall.value as SessionDescriptionInit, description);
      }
    }

    if (!data.peerConnections[connectionId]) {
      data.peerConnections[connectionId] = [];
      baseStats[connectionId] = {};
    }

    data.peerConnections[connectionId].push({
      time,
      timestamp: lastTime,
      type: method,
      value,
      extra,
    });

    if (!data.eventSizes[connectionId]) {
      data.eventSizes[connectionId] = [];
    }
    data.eventSizes[connectionId].push({
      x: lastTime,
      y: line.length,
      method,
    });
  }

  return data;
}

export async function readWebRTCInternalsDump(blob: Blob): Promise<unknown> {
  const textBlob = await blob.text();
  return JSON.parse(textBlob);
}

export async function extractTracks(peerConnectionTrace: TraceEvent[]): Promise<TrackInformation[]> {
  const tracks: TrackInformation[] = [];

  for (const traceEvent of peerConnectionTrace) {
    if (traceEvent.type === 'addTrack') {
      const trackInformation = parseTrackWithStreams(traceEvent.value as unknown[]);
      trackInformation.startTime = traceEvent.timestamp;
      trackInformation.direction = 'outbound';
      tracks.push(trackInformation);
    } else if (traceEvent.type === 'ontrack') {
      const trackInformation = parseTrackWithStreams(traceEvent.value as unknown[]);
      trackInformation.startTime = traceEvent.timestamp;
      trackInformation.direction = 'inbound';
      tracks.push(trackInformation);
    } else if (traceEvent.type === 'addTransceiver') {
      const args = traceEvent.value as unknown[];
      if (typeof args[0] !== 'string') {
        const trackInformation = parseTrackWithStreams(args[0] as unknown[]);
        const init = args[1] as { streams?: string[] } | undefined;
        if (init?.streams) {
          trackInformation.streams = init.streams;
        }
        trackInformation.startTime = traceEvent.timestamp;
        trackInformation.direction = 'outbound';
        tracks.push(trackInformation);
      }
    } else if (traceEvent.type === 'replaceTrack') {
      const [, newTrack] = traceEvent.value as [unknown, unknown[] | null];
      if (newTrack) {
        const trackInformation = parseTrackWithStreams(newTrack);
        trackInformation.startTime = traceEvent.timestamp;
        trackInformation.direction = 'outbound';
        if (tracks.find((info) => info.id === trackInformation.id) === undefined) {
          tracks.push(trackInformation);
        }
      }
    } else if (traceEvent.type === 'getStats') {
      const report = traceEvent.value as Record<string, Record<string, unknown>>;
      Object.keys(report).forEach((id) => {
        const stats = report[id];
        if (!['inbound-rtp', 'outbound-rtp'].includes(String(stats.type))) {
          return;
        }
        const associatedTrack = tracks.find((trackInformation) => {
          if (trackInformation.statsId !== undefined) {
            return trackInformation.statsId === id;
          }
          if (stats.type === 'inbound-rtp') {
            return trackInformation.id === stats.trackIdentifier;
          }
          const mediaSourceId = stats.mediaSourceId as string | undefined;
          return (
            trackInformation.id ===
            (mediaSourceId && report[mediaSourceId] && report[mediaSourceId].trackIdentifier)
          );
        });
        if (!associatedTrack) {
          return;
        }
        associatedTrack.statsId = id;
      });
    } else if (traceEvent.type === 'transceiverAdded') {
      const eventValue = traceEvent.value as {
        reason?: string;
        kind?: string;
        sender?: { track?: string; streams?: string[] };
        receiver?: { track?: string; streams?: string[] };
      };
      if (['addTrack', 'addTransceiver'].includes(eventValue?.reason ?? '')) {
        tracks.push({
          startTime: traceEvent.timestamp,
          direction: 'outbound',
          kind: eventValue.kind ?? '',
          id: eventValue.sender?.track ?? '',
          label: eventValue.sender?.track ?? '',
          streams: eventValue.sender?.streams ?? [],
        });
      } else if (eventValue?.reason === 'setRemoteDescription') {
        tracks.push({
          startTime: traceEvent.timestamp,
          direction: 'inbound',
          kind: eventValue.kind ?? '',
          id: eventValue.receiver?.track ?? '',
          label: eventValue.receiver?.track ?? '',
          streams: eventValue.receiver?.streams ?? [],
        });
      }
    }
  }

  return tracks;
}
