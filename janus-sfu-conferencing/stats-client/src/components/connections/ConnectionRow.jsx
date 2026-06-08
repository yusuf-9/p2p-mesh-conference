import { useState } from 'react';
import StreamBadges from './StreamBadges';
import ConnectionTimeline from './ConnectionTimeline';
import ConnectionDetails from './ConnectionDetails';
import { getTimelinePosition } from '../../lib/pConnections';

export default function ConnectionRow({ pc, session, transports, pairTimeSeries }) {
  const [expanded, setExpanded] = useState(false);
  const position = getTimelinePosition(pc, session);
  const score =
    pc.connectivityScore != null ? Number(pc.connectivityScore).toFixed(2) : '—';

  return (
    <div className={`connection-row${expanded ? ' connection-row-expanded' : ''}`}>
      <button
        type="button"
        className="connection-row-summary"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
      >
        <span className="connection-expand-icon">{expanded ? '▾' : '▸'}</span>
        <span className="connection-pc-id">{pc.id}</span>
        <span className="connection-role">{pc.peerType ?? '—'}</span>
        <StreamBadges pc={pc} />
        <ConnectionTimeline pc={pc} position={position} />
        <span className="connection-score">{score}</span>
      </button>

      {expanded && (
        <div className="connection-row-details">
          <ConnectionDetails
            pc={pc}
            transports={transports}
            session={session}
            pairTimeSeries={pairTimeSeries}
          />
        </div>
      )}
    </div>
  );
}
