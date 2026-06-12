export default function ChartStatusBar({ segments }) {
  if (!segments?.length) return null;

  return (
    <div className="metric-status-bar" aria-hidden>
      {segments.map((seg, i) => (
        <div
          key={`${seg.title ?? seg.state ?? 'seg'}-${i}`}
          className="metric-status-bar-segment"
          style={{
            left: `${seg.leftPercent}%`,
            width: `${seg.widthPercent}%`,
            backgroundColor: seg.color ?? '#bdbdbd',
          }}
          title={seg.title ?? seg.state}
        />
      ))}
    </div>
  );
}
