import { useEffect, useState } from 'react';
import { fetchRooms } from '../api/statsApi';
import RoomList from '../components/RoomList';
import LoadingMessage from '../components/LoadingMessage';
import ErrorMessage from '../components/ErrorMessage';

export default function RoomsPage() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    fetchRooms()
      .then((result) => {
        if (!cancelled) {
          setRooms(result.rooms ?? []);
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
  }, []);

  return (
    <section className="page">
      <h2>Rooms</h2>
      {loading && <LoadingMessage message="Loading rooms..." />}
      {error && <ErrorMessage message={error} />}
      {!loading && !error && <RoomList rooms={rooms} />}
    </section>
  );
}
