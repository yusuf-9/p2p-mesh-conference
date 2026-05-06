export default function StateChangeLog({ events }) {
  if (!events || !events.length) return <div>No state changes</div>;

  return (
    <div className="state-change-log">
      <table className="events-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Connection State</th>
            <th>ICE State</th>
            <th>Signaling State</th>
          </tr>
        </thead>
        <tbody>
          {events.map((ev) => {
            const s = ev.stats || {};
            return (
              <tr key={ev.id}>
                <td>{new Date(ev.createdAt).toLocaleTimeString()}</td>
                <td>
                  <span className={`state-badge ${s.connectionState || ""}`}>
                    {s.connectionState || "N/A"}
                  </span>
                </td>
                <td>
                  <span className={`state-badge ${s.iceConnectionState || ""}`}>
                    {s.iceConnectionState || "N/A"}
                  </span>
                </td>
                <td>{s.signalingState || "N/A"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
