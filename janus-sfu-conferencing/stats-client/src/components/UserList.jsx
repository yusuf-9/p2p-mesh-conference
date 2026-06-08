import { Link } from 'react-router-dom';

function formatDate(dateString) {
  if (!dateString) return null;
  return new Date(dateString).toLocaleString();
}

export default function UserList({ roomId, users }) {
  if (!users.length) {
    return <p className="empty-message">No users in this room.</p>;
  }

  return (
    <ul className="item-list">
      {users.map((user) => {
        const statsMeta =
          user.hasProcessedStats && user.callStart
            ? `Stats: ${formatDate(user.callStart)} – ${formatDate(user.callEnd)}`
            : null;

        if (user.hasProcessedStats) {
          return (
            <li key={user.id}>
              <Link
                to={`/room/${roomId}/user/${user.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="item-link"
              >
                <span className="item-title">{user.name}</span>
                <span className="item-meta">
                  {statsMeta || 'Processed stats available'}
                </span>
              </Link>
            </li>
          );
        }

        return (
          <li key={user.id}>
            <div className="item-button item-button-disabled">
              <span className="item-title">{user.name}</span>
              <span className="item-meta">No processed stats</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
