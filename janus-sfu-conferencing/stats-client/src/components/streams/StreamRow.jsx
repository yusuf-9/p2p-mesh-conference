import { useState } from 'react';
import StreamTimeline from './StreamTimeline';
import StreamDetails from './StreamDetails';
import { getStreamBitrateKbps, getStreamTimelinePosition, getStreamKindIcon } from '../../lib/streams';
import { formatBitrate, formatMos } from '../../lib/statsFormat';

export default function StreamRow({ stream, session }) {
  const [expanded, setExpanded] = useState(false);
  const position = getStreamTimelinePosition(stream, session);
  const bitrate = formatBitrate(getStreamBitrateKbps(stream));
  const { icon, arrow, title } = getStreamKindIcon(stream);
  const codec = (stream.codecName ?? '—').toLowerCase();

  return (
    <div className={`stream-row${expanded ? ' stream-row-expanded' : ''}`}>
      <button
        type="button"
        className="stream-row-summary"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
      >
        <span className="stream-expand">{expanded ? '▾' : '▸'}</span>
        <span className="stream-pc-id">{stream.peerId ?? '—'}</span>
        <span className="stream-codec">
          {codec}
          {stream.rid && <span className="stream-rid-badge">RID: {stream.rid}</span>}
        </span>
        <span className="stream-kind" title={title}>
          <span className="stream-kind-icon" aria-hidden>
            {icon}
          </span>
          {arrow}
        </span>
        <span className="stream-bitrate">{bitrate}</span>
        <StreamTimeline stream={stream} position={position} />
        <span className="stream-mos-badge">{formatMos(stream.avgMos)}</span>
        <span className="stream-ssrc">{stream.ssrc ?? '—'}</span>
      </button>

      {expanded && (
        <div className="stream-row-details">
          <StreamDetails stream={stream} />
        </div>
      )}
    </div>
  );
}
