import MetricBar from './MetricBar';
import {
  formatBitrate,
  formatRange,
  formatMs,
  formatPacketLoss,
  formatMos,
} from '../../lib/statsFormat';

function effectiveRange(avg, min, max) {
  if (avg == null) return { min, max };
  return {
    min: min != null ? Math.min(min, avg) : avg,
    max: max != null ? Math.max(max, avg) : avg,
  };
}

function MetricRow({
  label,
  avg,
  min,
  max,
  formatValue,
  formatRangeValue,
  tone = 'good',
  invertBar = false,
}) {
  if (avg == null && min == null && max == null) return null;

  const rangeBounds = effectiveRange(avg, min, max);
  const range = formatRange(
    rangeBounds.min,
    rangeBounds.max,
    formatRangeValue ?? formatValue
  );
  const displayValue = avg != null ? formatValue(avg) : 'N/A';

  return (
    <div className="stream-metric-row">
      <div className="stream-metric-header">
        <span className="stream-metric-label">
          {label}
          {range ? <span className="stream-metric-range"> {range}</span> : null}
        </span>
        <span className="stream-metric-value">{displayValue}</span>
      </div>
      <MetricBar
        avg={avg}
        min={rangeBounds.min}
        max={rangeBounds.max}
        tone={tone}
        invert={invertBar}
      />
    </div>
  );
}

export default function StreamMetricCard({ bucket }) {
  const { direction, kind, count, hasData, bitrate, rtt, packetLoss, jitter, mos } = bucket;
  const arrow = direction === 'out' ? '↑' : '↓';
  const title = `${arrow} ${kind}${count > 0 ? ` (x${count})` : ''}`;

  if (!hasData) {
    return (
      <div className="stream-metric-card stream-metric-card-empty">
        <h4 className="stream-metric-title">{title}</h4>
        <div className="stream-metric-empty">
          <span className="stream-metric-empty-icon" aria-hidden="true">
            ▦
          </span>
          <p className="stream-metric-empty-title">No streams</p>
          <p className="stream-metric-empty-text">No media streams were detected.</p>
        </div>
      </div>
    );
  }

  const mosTone = mos.avg != null && mos.avg < 3 ? 'warn' : 'good';

  return (
    <div className="stream-metric-card">
      <h4 className="stream-metric-title">{title}</h4>
      <MetricRow
        label="Bitrate"
        avg={bitrate.avg}
        min={bitrate.min}
        max={bitrate.max}
        formatValue={formatBitrate}
        formatRangeValue={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}` : v.toFixed(1))}
      />
      <MetricRow
        label="RTT"
        avg={rtt.avg}
        min={rtt.min}
        max={rtt.max}
        formatValue={(v) => formatMs(v, v < 10 ? 1 : 0)}
        formatRangeValue={(v) => (v < 10 ? v.toFixed(1) : Math.round(v))}
      />
      <MetricRow
        label="Packet Loss"
        avg={packetLoss.avg}
        min={packetLoss.min}
        max={packetLoss.max}
        formatValue={formatPacketLoss}
        invertBar
      />
      <MetricRow
        label="Jitter"
        avg={jitter.avg}
        min={jitter.min}
        max={jitter.max}
        formatValue={(v) => formatMs(v, 0)}
        formatRangeValue={(v) => Math.round(v)}
      />
      <MetricRow
        label="MOS"
        avg={mos.avg}
        min={mos.min}
        max={mos.max}
        formatValue={(v) => {
          const maxLabel = mos.max != null ? formatMos(mos.max) : '—';
          return `${formatMos(v)} / ${maxLabel}`;
        }}
        formatRangeValue={formatMos}
        tone={mosTone}
      />
    </div>
  );
}
