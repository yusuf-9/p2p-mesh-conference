import { useNavigate } from 'react-router-dom';

function formatDate(dateString) {
  return new Date(dateString).toLocaleString();
}

export default function RoomList({ rooms }) {
  const navigate = useNavigate();

  if (!rooms.length) {
    return <p className="empty-message">No rooms found.</p>;
  }

  return (
    <ul className="item-list">
      {rooms.map((room) => (
        <li key={room.id}>
          <button
            type="button"
            className="item-button"
            onClick={() => navigate(`/room/${room.id}`)}
          >
            <span className="item-title">{room.name}</span>
            <span className="item-meta">
              {room.type} · {room.userCount} user{room.userCount === 1 ? '' : 's'} ·{' '}
              {formatDate(room.createdAt)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
