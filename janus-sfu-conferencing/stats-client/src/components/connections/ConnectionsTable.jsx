import ConnectionRow from './ConnectionRow';
import { getSessionBounds, sortConnections } from '../../lib/pConnections';

const ORDER_OPTIONS = [
  { id: 'pc', label: 'PC' },
  { id: 'time', label: 'Time' },
  { id: 'duration', label: 'Duration' },
];

export default function ConnectionsTable({ data, orderBy, onOrderChange }) {
  const connections = sortConnections(
    Object.entries(data.pConnections ?? {}).map(([id, pc]) => ({ id, ...pc })),
    orderBy
  );
  const session = getSessionBounds(data);

  return (
    <div className="connections-table">
      <div className="connections-table-toolbar">
        <span className="connections-table-title">Connections</span>
        <div className="connections-order">
          <span className="connections-order-label">Order by</span>
          {ORDER_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`connections-order-btn${
                orderBy === option.id ? ' connections-order-btn-active' : ''
              }`}
              onClick={() => onOrderChange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="connections-table-header">
        <span />
        <span>PC</span>
        <span>Role</span>
        <span>Streams</span>
        <span>Timeline</span>
        <span>Score</span>
      </div>

      <div className="connections-table-body">
        {connections.map((pc) => (
          <ConnectionRow
            key={pc.id}
            pc={pc}
            session={session}
            transports={data.transports}
          />
        ))}
      </div>
    </div>
  );
}
