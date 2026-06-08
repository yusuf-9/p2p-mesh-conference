export default function DetailSection({ title, children }) {
  return (
    <section className="conn-detail-section">
      <h4 className="conn-detail-section-title">{title}</h4>
      {children}
    </section>
  );
}
