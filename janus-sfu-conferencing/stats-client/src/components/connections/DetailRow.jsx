export default function DetailRow({ label, value }) {
  return (
    <div className="conn-detail-row">
      <span className="conn-detail-label">{label}</span>
      <span className="conn-detail-value">{value ?? '—'}</span>
    </div>
  );
}
