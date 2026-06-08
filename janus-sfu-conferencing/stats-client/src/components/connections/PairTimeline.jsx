import { getPairStateBreakdown } from '../../lib/transports';
import { formatTime, formatMs } from '../../lib/statsFormat';

function toMs(isoOrTs) {
  if (isoOrTs == null) return null;
  if (typeof isoOrTs === 'number') return isoOrTs;
  return new Date(isoOrTs).getTime();
}

function formatStateLabel(state) {
  const labels = {
    used: 'Used',
    unused: 'Unused',
    waiting: 'Waiting',
    'in-progress': 'In-progress',
    failed: 'Failed',
  };
  return labels[state] ?? state;
}

export default function PairTimeline({ pairEntry, position }) {
  const { pair, pairId, selected } = pairEntry;
  const breakdown = getPairStateBreakdown(pair, selected);
  const pairStart = toMs(pair.start);
  const pairEnd = toMs(pair.end);
  const lastedMs = pairStart != null && pairEnd != null ? pairEnd - pairStart : null;

  const usedState = pair.states?.find((s) => s.selected && s.state === 'succeeded');

  return (
    <div className="pair-timeline">
      <span className="pair-timeline-start">{formatTime(pair.start)}</span>
      <div className="pair-timeline-bar-wrap">
        <div className="pair-timeline-bar">
          <div
            className={`pair-timeline-fill pair-timeline-fill-${pairEntry.displayState.toLowerCase()}`}
            style={{
              marginLeft: `${position.leftPercent}%`,
              width: `${position.widthPercent}%`,
            }}
          />
        </div>
        <div className="pair-timeline-tooltip" role="tooltip">
          <div className="timeline-tooltip-header">{pairId}</div>
          <div className="timeline-tooltip-row">
            <span>Created</span>
            <span>{formatTime(pair.start)}</span>
          </div>
          <div className="timeline-tooltip-row">
            <span>Connected</span>
            <span>{usedState ? formatTime(usedState.start) : '—'}</span>
          </div>
          <div className="timeline-tooltip-row">
            <span>Used</span>
            <span>{selected ? formatTime(usedState?.start ?? pair.start) : '—'}</span>
          </div>
          <div className="timeline-tooltip-row">
            <span>Ended</span>
            <span>{formatTime(pair.end)}</span>
          </div>
          <div className="timeline-tooltip-divider" />
          <div className="timeline-tooltip-subhead">States</div>
          {['used', 'unused', 'waiting', 'in-progress', 'failed'].map((state) => {
            const entry = breakdown.find((b) => b.state === state);
            const ms = entry?.ms ?? 0;
            const pct = entry?.percent ?? 0;
            return (
              <div key={state} className="timeline-tooltip-row">
                <span>{formatStateLabel(state)}</span>
                <span>
                  {formatMs(ms)} ({pct.toFixed(1)}%)
                </span>
              </div>
            );
          })}
          <div className="timeline-tooltip-divider" />
          <div className="timeline-tooltip-row">
            <span>Lasted</span>
            <span>{formatMs(lastedMs)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
