import useStatsStore from "../store/statsStore";

export default function SessionList() {
  const sessions = useStatsStore((s) => s.sessions);
  const loading = useStatsStore((s) => s.loadingSessions);
  const selectSession = useStatsStore((s) => s.selectSession);

  if (loading) return <div className="loading">Loading sessions...</div>;
  if (!sessions.length) return <div className="empty">No sessions found.</div>;

  return (
    <ul className="session-list">
      {sessions.map((session) => (
        <li
          key={session.id}
          className="session-item"
          onClick={() => selectSession(session.id)}
        >
          <div className="session-id">Session: {session.sessionId}</div>
          <div className="session-meta">
            Handles: {session.handleCount ?? 0} | Active: {session.active ? "Yes" : "No"}
          </div>
        </li>
      ))}
    </ul>
  );
}
