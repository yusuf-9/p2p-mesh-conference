import { STATE_COLORS } from '../../lib/pairTimeSeries';

export default function PairStateBar({ segments }) {
  if (!segments?.length) return null;

  return (
    <div className="pair-state-bar" aria-hidden>
      {segments.map((seg, i) => (
        <div
          key={`${seg.state}-${i}`}
          className="pair-state-bar-segment"
          style={{
            left: `${seg.leftPercent}%`,
            width: `${seg.widthPercent}%`,
            backgroundColor: seg.color ?? STATE_COLORS[seg.state] ?? '#bdbdbd',
          }}
          title={seg.state}
        />
      ))}
    </div>
  );
}
