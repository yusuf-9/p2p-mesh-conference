import { useState } from 'react';
import PairTimeline from './PairTimeline';
import PairDetails from './PairDetails';
import { formatBytes, getPairTimelinePosition, isRelayType } from '../../lib/transports';

const STATE_CLASS = {
  USED: 'ice-state-used',
  UNUSED: 'ice-state-unused',
  'IN-PROGRESS': 'ice-state-in-progress',
  WAITING: 'ice-state-waiting',
  FAILED: 'ice-state-failed',
};

export default function IcePairRow({ pairEntry, session }) {
  const [expanded, setExpanded] = useState(false);
  const { pairId, pair, displayState } = pairEntry;
  const position = getPairTimelinePosition(pair, session);
  const bytesOut = formatBytes(pair.totalBytesSent);
  const bytesIn = formatBytes(pair.totalBytesReceived);
  const relay = isRelayType(pair.type);

  return (
    <div className={`ice-pair-row${expanded ? ' ice-pair-row-expanded' : ''}`}>
      <button
        type="button"
        className="ice-pair-row-summary"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
      >
        <span className="ice-pair-expand">{expanded ? '▾' : '▸'}</span>
        <span className="ice-pair-id">{pairId}</span>
        <span className={`ice-state-badge ${STATE_CLASS[displayState] ?? ''}`}>
          {displayState}
        </span>
        <span className="ice-pair-bytes" title="Outbound">
          {bytesOut ? `↑ ${bytesOut}` : '—'}
        </span>
        <span className="ice-pair-bytes" title="Inbound">
          {bytesIn ? `↓ ${bytesIn}` : '—'}
        </span>
        <span className="ice-pair-type">
          <span className="ice-pair-type-icon" aria-hidden>
            {relay ? '📶' : '🖥'}
          </span>
          {pair.type ?? '—'}
        </span>
        <PairTimeline pairEntry={pairEntry} position={position} />
      </button>

      {expanded && (
        <div className="ice-pair-row-details">
          <PairDetails pair={pair} />
        </div>
      )}
    </div>
  );
}
