import { useMemo, useState } from 'react';
import DetailSection from './DetailSection';
import NoDataPlaceholder from './NoDataPlaceholder';
import IcePairRow from './IcePairRow';
import { isPairActive, listIcePairs } from '../../lib/transports';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
];

export default function IceConnectivity({ pcId, transports, session }) {
  const [filter, setFilter] = useState('all');

  const allPairs = useMemo(() => listIcePairs(pcId, transports), [pcId, transports]);

  const visiblePairs = useMemo(() => {
    if (filter === 'active') {
      return allPairs.filter((entry) => isPairActive(entry.pair, entry.selected));
    }
    return allPairs;
  }, [allPairs, filter]);

  const activeCount = allPairs.filter((entry) => isPairActive(entry.pair, entry.selected)).length;

  if (!allPairs.length) {
    return (
      <DetailSection title="ICE connectivity">
        <NoDataPlaceholder message="No ICE connectivity data" />
      </DetailSection>
    );
  }

  return (
    <DetailSection title={`ICE connectivity (${allPairs.length})`}>
      <div className="ice-connectivity-toolbar">
        {FILTERS.map((f) => {
          const count = f.id === 'active' ? activeCount : allPairs.length;
          return (
            <button
              key={f.id}
              type="button"
              className={`ice-filter-btn${filter === f.id ? ' ice-filter-btn-active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="ice-pairs-table">
        <div className="ice-pairs-header">
          <span />
          <span>Pair</span>
          <span>State</span>
          <span title="Outbound">↑</span>
          <span title="Inbound">↓</span>
          <span>Type</span>
          <span>Timeline</span>
        </div>
        <div className="ice-pairs-body">
          {visiblePairs.map((entry) => (
            <IcePairRow
              key={`${entry.transportId}-${entry.pairId}`}
              pairEntry={entry}
              session={session}
            />
          ))}
        </div>
      </div>
    </DetailSection>
  );
}
