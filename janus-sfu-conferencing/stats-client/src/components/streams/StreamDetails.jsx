import NoDataPlaceholder from '../connections/NoDataPlaceholder';

function DetailItem({ label, value, badge }) {
  if (value == null && !badge) return null;
  return (
    <div className="stream-detail-item">
      <span className="stream-detail-label">{label}</span>
      <span className="stream-detail-value">
        {value}
        {badge && <span className={`stream-detail-badge stream-detail-badge-${badge.type}`}>{badge.text}</span>}
      </span>
    </div>
  );
}

export default function StreamDetails({ stream }) {
  const isOutbound = stream.direction === 'outbound';
  const codecLabel = isOutbound ? 'Encoder' : 'Decoder';
  const codecValue = isOutbound ? stream.encoder : stream.decoder;

  const hasDetails =
    stream.resolution ||
    stream.framerate != null ||
    stream.scalabilityMode ||
    stream.simulcast ||
    codecValue ||
    stream.rid;

  if (!hasDetails) {
    return <NoDataPlaceholder message="No additional stream details" />;
  }

  const powerBadge =
    stream.powerEfficient != null
      ? {
          text: stream.powerEfficient ? 'HARDWARE' : 'SOFTWARE',
          type: stream.powerEfficient ? 'hardware' : 'software',
        }
      : null;

  return (
    <div className="stream-details">
      <DetailItem label="Resolution" value={stream.resolution} />
      <DetailItem
        label="Framerate"
        value={stream.framerate != null ? `${stream.framerate} fps` : null}
      />
      <DetailItem
        label="Mode"
        value={stream.scalabilityMode}
        badge={stream.simulcast ? { text: 'SIMULCAST', type: 'simulcast' } : null}
      />
      {stream.rid && <DetailItem label="RID" value={stream.rid} />}
      {codecValue && (
        <DetailItem label={codecLabel} value={codecValue} badge={powerBadge} />
      )}
    </div>
  );
}
