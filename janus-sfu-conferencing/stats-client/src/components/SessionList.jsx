import { Link } from "react-router-dom";
import useStatsStore from "../store/statsStore";

export default function SessionList({ roomId }) {
  const sessions = useStatsStore((s) => s.sessions);
  const loading = useStatsStore((s) => s.loadingSessions);

  if (loading) return <div className="loading">Loading sessions...</div>;
  if (!sessions.length) return <div className="empty">No sessions found.</div>;

  return (
    <ul className="session-list">
      {sessions.map((session) => (
        <li key={session.id} className="session-item">
          <Link to={`/room/${roomId}/session/${session.id}`} className="session-link">
            <div className="session-id">Session: {session.sessionId}</div>
            <div className="session-meta">
              Handles: {session.handleCount ?? 0} | Active: {session.active ? "Yes" : "No"}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}