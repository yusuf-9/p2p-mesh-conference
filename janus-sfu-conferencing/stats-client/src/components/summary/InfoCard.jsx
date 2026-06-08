export default function InfoCard({ title, children }) {
  return (
    <div className="info-card">
      <h3 className="info-card-title">{title}</h3>
      <div className="info-card-body">{children}</div>
    </div>
  );
}
