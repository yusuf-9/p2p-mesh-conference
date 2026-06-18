/** A single point in a time series: [timestampMs, value]. */
export type TimeSeriesPoint = [number, number | null];

/** Parsed RTCStats trace event after dump decompression. */
export interface TraceEvent {
  /** @deprecated Prefer `timestamp`. */
  time: Date;
  timestamp: number;
  type: string;
  value: unknown;
  extra: unknown[];
}

/** Per-event size metadata recorded during dump parsing. */
export interface EventSizeEntry {
  x: number;
  y: number;
  method: string;
}

/** Top-level metadata from the second line of an RTCStats dump file. */
export interface DumpSessionMetadata {
  startTime?: number;
  userId?: string;
  roomId?: string;
  [key: string]: unknown;
}

/** Fully parsed RTCStats dump. */
export interface RTCStatsDump extends DumpSessionMetadata {
  peerConnections: Record<string, TraceEvent[]>;
  eventSizes: Record<string, EventSizeEntry[]>;
}

/** WebRTC stats object keyed by stat id. */
export type StatsObject = Record<string, Record<string, unknown>>;

/** Mapping from full stat ids to compressed numeric string ids. */
export type StatsIdMap = Record<string, string>;

/** Serialized track representation: [kind, id, label, ...streamIds]. */
export type SerializedTrack = [string, string, string, ...string[]];

/** Parsed track metadata extracted from a serialized track tuple. */
export interface TrackInformation {
  kind: string;
  id: string;
  label: string;
  streams: string[];
  startTime?: number;
  direction?: 'inbound' | 'outbound';
  statsId?: string;
}

/** RTCSessionDescription-like object used in trace events. */
export interface SessionDescriptionInit {
  type?: RTCSdpType | string;
  sdp?: string;
}

/** RTC stats time series keyed by property name. */
export type StatTimeSeries = Record<string, TimeSeriesPoint[]>;

/** Time series grouped by stats report id. */
export interface RtcStatsSeriesEntry {
  type?: string;
  [property: string]: TimeSeriesPoint[] | string | undefined;
}

export type RtcStatsTimeSeries = Record<string, RtcStatsSeriesEntry>;
