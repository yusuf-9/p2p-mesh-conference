import { Link } from "react-router-dom";
import useStatsStore from "../store/statsStore";

export default function RoomList() {
  const rooms = useStatsStore((s) => s.rooms);
  const loading = useStatsStore((s) => s.loadingRooms);

  if (loading) return <div className="loading">Loading rooms...</div>;
  if (!rooms.length) return <div className="empty">No rooms found.</div>;

  return (
    <ul className="room-list">
      {rooms.map((room) => (
        <li key={room.id} className="room-item">
          <Link to={`/room/${room.id}`} className="room-link">
            <div className="room-name">{room.name}</div>
            <div className="room-meta">
              Type: {room.type} | Sessions: {room.sessionCount ?? 0}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}