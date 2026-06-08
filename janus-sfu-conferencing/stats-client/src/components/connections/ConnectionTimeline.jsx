import { getPcTiming } from '../../lib/pConnections';
import { formatTime, formatMs } from '../../lib/statsFormat';

export default function ConnectionTimeline({ pc, position }) {
  const timing = getPcTiming(pc);

  return (
    <div className="connection-timeline">
      <span className="connection-timeline-start">
        {formatTime(pc.statisticsStartedAt ?? pc.createdAt)}
      </span>
      <div className="connection-timeline-bar-wrap">
        <div className="connection-timeline-bar">
          <div
            className="connection-timeline-fill"
            style={{
              marginLeft: `${position.leftPercent}%`,
              width: `${position.widthPercent}%`,
            }}
          />
        </div>
        <div className="connection-timeline-tooltip" role="tooltip">
          <div className="timeline-tooltip-row">
            <span>Created</span>
            <span>{formatTime(pc.createdAt)}</span>
          </div>
          <div className="timeline-tooltip-row">
            <span>Connected</span>
            <span>{formatTime(pc.connectedAt)}</span>
          </div>
          <div className="timeline-tooltip-row">
            <span>Ended</span>
            <span>{formatTime(pc.end)}</span>
          </div>
          <div className="timeline-tooltip-divider" />
          <div className="timeline-tooltip-row">
            <span>Warm-up</span>
            <span>{formatMs(timing.warmUpMs)}</span>
          </div>
          <div className="timeline-tooltip-row">
            <span>Setup</span>
            <span>{formatMs(timing.setupMs)}</span>
          </div>
          <div className="timeline-tooltip-row">
            <span>Live</span>
            <span>{formatMs(timing.liveMs)}</span>
          </div>
          <div className="timeline-tooltip-row">
            <span>Lifetime</span>
            <span>{formatMs(timing.lifetimeMs)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
