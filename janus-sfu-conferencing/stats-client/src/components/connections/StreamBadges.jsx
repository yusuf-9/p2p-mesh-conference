function isSharingContent(contentType) {
  return contentType === 'SHARING' || contentType?.includes('SHARING');
}

function StreamBadge({ count, icon, direction, title }) {
  if (!count) return <span className="stream-badge stream-badge-empty">—</span>;
  const arrow = direction === 'out' ? '↑' : '↓';
  return (
    <span className="stream-badge" title={title}>
      <span className="stream-badge-icon" aria-hidden>
        {icon}
      </span>
      {count} {arrow}
    </span>
  );
}

export default function StreamBadges({ pc }) {
  const videoIcon = isSharingContent(pc.contentType) ? '🖥' : '📹';

  return (
    <div className="stream-badges">
      <StreamBadge count={pc.audioOut} icon="🎤" direction="out" title="Outgoing audio" />
      <StreamBadge count={pc.videoOut} icon={videoIcon} direction="out" title="Outgoing video" />
      <StreamBadge count={pc.audioIn} icon="🎤" direction="in" title="Incoming audio" />
      <StreamBadge
        count={pc.videoIn}
        icon={isSharingContent(pc.contentType) ? '🖥' : '📹'}
        direction="in"
        title="Incoming video"
      />
      {pc.dataInOut > 0 && (
        <StreamBadge count={pc.dataInOut} icon="📡" direction="out" title="Data channel" />
      )}
    </div>
  );
}
