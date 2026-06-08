import {
  getMosBreakdown,
  getQualitySegments,
  getStreamDurationMs,
} from '../../lib/streams';
import { formatTime, formatDuration } from '../../lib/statsFormat';

function formatBreakdownMs(ms) {
  if (ms == null) return '—';
  const seconds = Math.round(ms / 1000);
  return `${seconds} s`;
}

export default function StreamTimeline({ stream, position }) {
  const segments = getQualitySegments(stream);
  const breakdown = getMosBreakdown(stream);
  const durationMs = getStreamDurationMs(stream);

  return (
    <div className="stream-timeline">
      <span className="stream-timeline-start">{formatTime(stream.start)}</span>
      <div className="stream-timeline-bar-wrap">
        <div className="stream-timeline-bar">
          <div
            className="stream-timeline-fill"
            style={{
              marginLeft: `${position.leftPercent}%`,
              width: `${position.widthPercent}%`,
            }}
          >
            {segments.map((seg, i) => (
              <div
                key={i}
                className={`stream-timeline-segment stream-timeline-segment-${seg.type}`}
                style={{
                  left: `${seg.leftPercent}%`,
                  width: `${seg.widthPercent}%`,
                }}
              />
            ))}
          </div>
        </div>
        <div className="stream-timeline-tooltip" role="tooltip">
          <div className="timeline-tooltip-header">{stream.ssrc}</div>
          <div className="timeline-tooltip-row">
            <span>Duration</span>
            <span>{formatDuration(durationMs)}</span>
          </div>
          <div className="timeline-tooltip-row">
            <span>Start time</span>
            <span>{formatTime(stream.start)}</span>
          </div>
          <div className="timeline-tooltip-row">
            <span>End time</span>
            <span>{formatTime(stream.end)}</span>
          </div>
          {breakdown.length > 0 && (
            <>
              <div className="timeline-tooltip-divider" />
              <div className="timeline-tooltip-subhead">MOS</div>
              {breakdown.map((entry) => (
                <div key={entry.label} className="timeline-tooltip-row">
                  <span>
                    <span className={`mos-swatch mos-swatch-${entry.type}`} />
                    {entry.label}
                  </span>
                  <span>
                    {formatBreakdownMs(entry.ms)} ({entry.percent.toFixed(1)}%)
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
