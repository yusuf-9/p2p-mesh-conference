import { useState } from 'react';
import ConnectionsTable from './ConnectionsTable';

export default function ConnectionsTab({ data }) {
  const [orderBy, setOrderBy] = useState('pc');
  const count = data.pConnectionsNumber ?? Object.keys(data.pConnections ?? {}).length;

  if (!count) {
    return <p className="empty-message">No peer connections in this session.</p>;
  }

  return <ConnectionsTable data={data} orderBy={orderBy} onOrderChange={setOrderBy} />;
}
