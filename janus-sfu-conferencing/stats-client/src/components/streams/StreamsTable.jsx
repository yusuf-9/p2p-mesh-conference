import StreamRow from './StreamRow';
import { getSessionBounds } from '../../lib/pConnections';
import {
  STREAM_FILTERS,
  filterStreams,
  listStreams,
  sortStreams,
} from '../../lib/streams';

const ORDER_OPTIONS = [
  { id: 'pc', label: 'PC' },
  { id: 'time', label: 'Time' },
  { id: 'duration', label: 'Duration' },
];

export default function StreamsTable({ data, orderBy, onOrderChange, filter, onFilterChange }) {
  const allStreams = listStreams(data.streams);
  const filtered = filterStreams(allStreams, filter);
  const streams = sortStreams(filtered, orderBy);
  const session = getSessionBounds(data);

  return (
    <div className="streams-table">
      <div className="streams-table-toolbar">
        <span className="streams-table-title">Streams</span>
        <div className="streams-table-controls">
          <div className="streams-order">
            <span className="streams-order-label">Order by</span>
            {ORDER_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`streams-order-btn${
                  orderBy === option.id ? ' streams-order-btn-active' : ''
                }`}
                onClick={() => onOrderChange(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <select
            className="streams-filter-select"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            aria-label="Filter streams"
          >
            {STREAM_FILTERS.map((f) => {
              const count = filterStreams(allStreams, f.id).length;
              return (
                <option key={f.id} value={f.id}>
                  {f.label} ({count})
                </option>
              );
            })}
          </select>
        </div>
      </div>

      <div className="streams-table-header">
        <span />
        <span>PC</span>
        <span>Codec</span>
        <span>Kind</span>
        <span>Bitrate</span>
        <span>Timeline</span>
        <span>MOS</span>
        <span>SSRC</span>
      </div>

      <div className="streams-table-body">
        {streams.length ? (
          streams.map((stream) => (
            <StreamRow
              key={stream.id}
              stream={stream}
              session={session}
              streamTimeSeries={data.streamTimeSeries}
            />
          ))
        ) : (
          <p className="empty-message streams-empty">No streams match this filter.</p>
        )}
      </div>
    </div>
  );
}
