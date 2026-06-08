import InfoCard from './InfoCard';
import InfoRow from './InfoRow';
import StreamMetricCard from './StreamMetricCard';
import {
  formatTime,
  formatDuration,
  formatBitrate,
  formatMs,
  formatBrowser,
} from '../../lib/statsFormat';
import {
  STREAM_BUCKETS,
  getBucketSummary,
  getContentBitrate,
} from '../../lib/aggregatedStats';

function contentValue(aggregatedStats, direction, kind) {
  const kbps = getContentBitrate(aggregatedStats, direction, kind);
  return kbps == null ? 'N/A' : formatBitrate(kbps);
}

export default function SummaryTab({ data }) {
  const aggregatedStats = data.aggregatedStats ?? {};
  const userAgentData = data.userAgentData ?? {};
  const buckets = STREAM_BUCKETS.map((b) => ({
    ...b,
    ...getBucketSummary(aggregatedStats, b.key),
  }));

  return (
    <div className="summary-tab">
      <div className="summary-top-row">
        <InfoCard title="Session">
          <InfoRow label="Start" value={formatTime(data.callStart)} />
          <InfoRow label="Duration" value={formatDuration(data.durationMs)} />
          <InfoRow
            label="RTT"
            badge={aggregatedStats.jitter != null ? `Jitter ${Math.round(aggregatedStats.jitter)} ms` : null}
            value={formatMs(aggregatedStats.rtt, aggregatedStats.rtt != null && aggregatedStats.rtt < 10 ? 1 : 0)}
          />
        </InfoCard>

        <InfoCard title="Client">
          <InfoRow label="Browser" value={formatBrowser(userAgentData)} />
          <InfoRow label="OS" value={userAgentData.platform ?? 'N/A'} />
        </InfoCard>

        <InfoCard title="Content">
          <InfoRow label="Audio In" value={contentValue(aggregatedStats, 'in', 'audio')} />
          <InfoRow label="Audio Out" value={contentValue(aggregatedStats, 'out', 'audio')} />
          <InfoRow label="Video In" value={contentValue(aggregatedStats, 'in', 'video')} />
          <InfoRow label="Video Out" value={contentValue(aggregatedStats, 'out', 'video')} />
        </InfoCard>
      </div>

      <div className="summary-stream-row">
        {buckets.map((bucket) => (
          <StreamMetricCard key={bucket.key} bucket={bucket} />
        ))}
      </div>
    </div>
  );
}
