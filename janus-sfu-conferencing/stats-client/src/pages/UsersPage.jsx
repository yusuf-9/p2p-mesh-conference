import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchRoomUsers } from '../api/statsApi';
import UserList from '../components/UserList';
import LoadingMessage from '../components/LoadingMessage';
import ErrorMessage from '../components/ErrorMessage';

export default function UsersPage() {
  const { roomId } = useParams();
  const [room, setRoom] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchRoomUsers(roomId)
      .then((result) => {
        if (!cancelled) {
          setRoom(result.room ?? null);
          setUsers(result.users ?? []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [roomId]);

  return (
    <section className="page">
      <Link to="/" className="back-link">
        Back to rooms
      </Link>
      <h2>{room ? room.name : 'Users'}</h2>
      {room && <p className="meta">Room ID: {room.id}</p>}
      {loading && <LoadingMessage message="Loading users..." />}
      {error && <ErrorMessage message={error} />}
      {!loading && !error && <UserList roomId={roomId} users={users} />}
    </section>
  );
}
