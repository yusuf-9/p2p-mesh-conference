import { useState } from 'react';
import StreamsTable from './StreamsTable';

export default function StreamsTab({ data }) {
  const [orderBy, setOrderBy] = useState('pc');
  const [filter, setFilter] = useState('all');
  const count = Object.keys(data.streams ?? {}).length;

  if (!count) {
    return <p className="empty-message">No media streams in this session.</p>;
  }

  return (
    <StreamsTable
      data={data}
      orderBy={orderBy}
      onOrderChange={setOrderBy}
      filter={filter}
      onFilterChange={setFilter}
    />
  );
}
