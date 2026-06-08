function EndpointCell({ lines, subLines = [] }) {
  return (
    <div className="pair-endpoint-cell">
      {lines.map((line, i) => (
        <div key={i} className="pair-endpoint-primary">
          {line}
        </div>
      ))}
      {subLines.map((line, i) => (
        <div key={`sub-${i}`} className="pair-endpoint-sub">
          {line}
        </div>
      ))}
    </div>
  );
}

function formatType(candidate) {
  if (!candidate) return '—';
  return (candidate.candidateType ?? candidate.kind ?? '—').toUpperCase();
}

function buildLocalAddressLines(local) {
  if (!local) return { lines: ['—'], subLines: [], typeLine: '—', discovered: false };

  const lines = [local.address ?? '—'];
  const typeLine = formatType(local);
  const subLines = [];

  if (local.relatedChain?.length) {
    for (const link of local.relatedChain) {
      subLines.push(link.address ?? '—');
    }
  }

  return { lines, typeLine, subLines, discovered: local.candidateType === 'prflx' };
}

export default function PairDetails({ pair }) {
  const local = pair.local;
  const remote = pair.remote;
  const localAddr = buildLocalAddressLines(local);

  return (
    <div className="pair-details">
      <h5 className="pair-details-title">Pair details</h5>
      <table className="pair-details-table">
        <thead>
          <tr>
            <th>From</th>
            <th>Address</th>
            <th>Port</th>
            <th>Type</th>
            <th>Protocol</th>
            <th>Priority</th>
            <th>Interface</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <span className="pair-side-badge pair-side-local">Local</span>
            </td>
            <td>
              <EndpointCell lines={localAddr.lines} subLines={localAddr.subLines} />
            </td>
            <td>{local?.port ?? '—'}</td>
            <td>
              <span className="pair-type-cell">
                {localAddr.typeLine ?? formatType(local)}
                {localAddr.discovered && (
                  <span className="pair-discovered-badge">discovered</span>
                )}
              </span>
            </td>
            <td>{(local?.protocol ?? '—').toUpperCase()}</td>
            <td>{local?.priority ?? '—'}</td>
            <td>{(local?.networkType ?? '—').toUpperCase()}</td>
          </tr>
          <tr>
            <td>
              <span className="pair-side-badge pair-side-remote">Remote</span>
            </td>
            <td>{remote ? `${remote.address}:${remote.port}` : '—'}</td>
            <td>{remote?.port ?? '—'}</td>
            <td>{formatType(remote)}</td>
            <td>{(remote?.protocol ?? '—').toUpperCase()}</td>
            <td>{remote?.priority ?? '—'}</td>
            <td>—</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
