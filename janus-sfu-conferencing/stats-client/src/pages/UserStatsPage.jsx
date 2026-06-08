import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchUserProcessed } from '../api/statsApi';
import UserStatsView from '../components/UserStatsView';
import LoadingMessage from '../components/LoadingMessage';
import ErrorMessage from '../components/ErrorMessage';

export default function UserStatsPage() {
  const { userId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchUserProcessed(userId)
      .then((result) => {
        if (!cancelled) {
          setData(result.data ?? null);
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
  }, [userId]);

  return (
    <section className="page page-wide">
      {loading && <LoadingMessage message="Loading processed stats..." />}
      {error && <ErrorMessage message={error} />}
      {!loading && !error && data && <UserStatsView userId={userId} data={data} />}
    </section>
  );
}
