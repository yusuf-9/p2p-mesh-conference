import { listNetworkInterfaces } from '../../lib/pConnections';
import { getUsedInterfaceId, isCandidateUsed } from '../../lib/transports';

function candidateLabel(candidate) {
  const kind = candidate.kind?.toUpperCase() ?? '—';
  const protocol = candidate.protocol ?? '—';
  const address = candidate.address ?? '—';
  const port = candidate.port ?? '—';
  const related =
    candidate.relatedAddress && candidate.relatedPort
      ? ` > ${candidate.relatedAddress}:${candidate.relatedPort}`
      : candidate.relatedAddress
        ? ` > ${candidate.relatedAddress}`
        : '';
  return `${kind} / ${protocol} / ${address}:${port}${related}`;
}

export default function NetworkInterfaces({ localCandidates, selectedLocal }) {
  const interfaces = listNetworkInterfaces(localCandidates);
  const usedInterfaceId = getUsedInterfaceId(localCandidates, selectedLocal);

  if (!interfaces.length) {
    return <p className="empty-message">No network interfaces recorded.</p>;
  }

  return (
    <div className="network-interfaces">
      {interfaces.map((iface) => {
        const interfaceUsed = usedInterfaceId === iface.id;

        return (
          <div key={iface.id} className="network-interface">
            <div className="network-interface-header">
              <span>
                {iface.id} — {iface.type.toUpperCase()} / IPV4
              </span>
              {interfaceUsed && <span className="used-badge">used</span>}
            </div>
            <ul className="candidate-list">
              {iface.candidates.map((candidate, index) => {
                const candidateUsed = isCandidateUsed(candidate, selectedLocal);

                return (
                  <li key={index} className={candidateUsed ? 'candidate-used' : undefined}>
                    <span className={`candidate-kind candidate-kind-${candidate.kind}`}>
                      {candidate.kind}
                    </span>
                    <span className="candidate-text">{candidateLabel(candidate)}</span>
                    {candidateUsed && <span className="used-badge">used</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
