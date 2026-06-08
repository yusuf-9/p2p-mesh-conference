import { barPercent } from '../../lib/statsFormat';

export default function MetricBar({ avg, min, max, tone = 'good', invert = false }) {
  const width = barPercent(avg, min, max, { invert });

  return (
    <div className="metric-bar-track">
      <div className={`metric-bar-fill metric-bar-${tone}`} style={{ width: `${width}%` }} />
    </div>
  );
}
