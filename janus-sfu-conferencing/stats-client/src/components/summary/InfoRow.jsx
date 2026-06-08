export default function InfoRow({ label, value, badge }) {
  return (
    <div className="info-row">
      <span className="info-row-label">{label}</span>
      <span className="info-row-value">
        {badge && <span className="info-badge">{badge}</span>}
        {value}
      </span>
    </div>
  );
}
