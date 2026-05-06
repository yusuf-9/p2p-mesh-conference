import { useMemo } from "react";

export default function ConnectionStats({ data }) {
  if (!data) return <div className="no-data">No connection data</div>;

  const stats = data.stats || data;
  const { timestamp, rawStatsDump, device } = stats;

  const parsed = useMemo(() => {
    if (!rawStatsDump) return null;

    const reports = Object.values(rawStatsDump);

    // Step 1: Identify role
    const hasOutbound = reports.some((r) => r.type === "outbound-rtp");
    const hasInbound = reports.some((r) => r.type === "inbound-rtp");
    const role = hasOutbound ? "publisher" : hasInbound ? "subscriber" : "unknown";

    // Step 2: Find selected ICE candidate pair
    const transport = reports.find((r) => r.type === "transport");
    let selectedPair = null;
    let localCandidate = null;
    let remoteCandidate = null;

    if (transport?.selectedCandidatePairId) {
      selectedPair = reports.find(
        (r) => r.type === "candidate-pair" && r.id === transport.selectedCandidatePairId
      );
      if (selectedPair) {
        localCandidate = reports.find(
          (r) => r.type === "local-candidate" && r.id === selectedPair.localCandidateId
        );
        remoteCandidate = reports.find(
          (r) => r.type === "remote-candidate" && r.id === selectedPair.remoteCandidateId
        );
      }
    }

    // Step 3: Count local candidates by type
    const localCandidates = reports.filter((r) => r.type === "local-candidate");
    const hostCandidates = localCandidates.filter((c) => c.candidateType === "host");
    const srflxCandidates = localCandidates.filter((c) => c.candidateType === "srflx");
    const relayCandidates = localCandidates.filter((c) => c.candidateType === "relay");
    const hostCount = hostCandidates.length;
    const srflxCount = srflxCandidates.length;
    const relayCount = relayCandidates.length;

    // Step 4: Extract codecs
    const codecs = reports.filter((r) => r.type === "codec");
    const videoCodecs = codecs.filter((c) => c.mimeType?.includes("video"));
    const audioCodecs = codecs.filter((c) => c.mimeType?.includes("audio"));
    const rtxEnabled = codecs.some((c) => c.mimeType?.includes("rtx"));

    // Step 5: Extract simulcast layers
    const videoOutbound = reports.filter(
      (r) => r.type === "outbound-rtp" && r.kind === "video"
    );
    const simulcastActive = videoOutbound.length > 1;

    // Step 6: Transport state
    const transportState = {
      dtlsState: transport?.dtlsState || "N/A",
      iceState: transport?.iceState || "N/A",
      iceRole: transport?.iceRole || "N/A",
      dtlsRole: transport?.dtlsRole || "N/A",
      selectedCandidatePairChanges: transport?.selectedCandidatePairChanges ?? "N/A",
    };

    // Step 7: Parse device info
    const deviceInfo = device ? parseUserAgent(device.userAgent) : null;

    // Media source
    const mediaSource = reports.find((r) => r.type === "media-source");

    return {
      role,
      selectedPair,
      localCandidate,
      remoteCandidate,
      hostCandidates,
      srflxCandidates,
      relayCandidates,
      hostCount,
      srflxCount,
      relayCount,
      videoCodecs,
      audioCodecs,
      rtxEnabled,
      simulcastActive,
      videoOutbound,
      transportState,
      deviceInfo,
      mediaSource,
    };
  }, [rawStatsDump, device]);

  if (!parsed) return <div className="no-data">Unable to parse stats dump</div>;

  const {
    role,
    selectedPair,
    localCandidate,
    remoteCandidate,
    hostCandidates,
    srflxCandidates,
    relayCandidates,
    hostCount,
    srflxCount,
    relayCount,
    videoCodecs,
    audioCodecs,
    rtxEnabled,
    simulcastActive,
    videoOutbound,
    transportState,
    deviceInfo,
    mediaSource,
  } = parsed;

  const handleId = data.handleId || "N/A";
  const shortHandleId = handleId.length > 8 ? handleId.slice(0, 8) + "..." : handleId;

  const usingRelay = localCandidate?.candidateType === "relay" || remoteCandidate?.candidateType === "relay";

  return (
    <div className="connection-stats">
      {/* Section 1: Session Header */}
      <div className="session-header">
        <div className="handle-id" title={handleId}>
          Handle: <code>{shortHandleId}</code>
        </div>
        <div className="timestamp">
          {timestamp ? new Date(timestamp).toLocaleString() : "N/A"}
        </div>
        <span className={`role-badge ${role}`}>{role}</span>
      </div>

      {/* Section 2: Connection Status Row */}
      <div className="status-row">
        <span className={`status-badge ice-${transportState.iceState}`}>
          ICE: {transportState.iceState}
        </span>
        <span className={`status-badge dtls-${transportState.dtlsState}`}>
          DTLS: {transportState.dtlsState}
        </span>
        <span className="status-badge">{transportState.iceRole}</span>
        <span className="status-badge">DTLS: {transportState.dtlsRole}</span>
      </div>

      {/* Section 3: Selected ICE Candidate Pair */}
      <div className="candidate-pair-section">
        <h5>Selected ICE Candidate Pair</h5>
        <div className="candidate-cards">
          <div className="candidate-card">
            <div className="card-title">Local</div>
            {localCandidate ? (
              <>
                <span className={`candidate-type-badge ${localCandidate.candidateType}`}>
                  {localCandidate.candidateType}
                </span>
                <div className="candidate-detail">
                  {localCandidate.address}:{localCandidate.port}
                </div>
                <div className="candidate-detail">{localCandidate.protocol}</div>
                {localCandidate.networkType && (
                  <div className="candidate-detail">Network: {localCandidate.networkType}</div>
                )}
              </>
            ) : (
              <div className="no-data">Not found</div>
            )}
          </div>
          <div className="candidate-card">
            <div className="card-title">Remote</div>
            {remoteCandidate ? (
              <>
                <span className={`candidate-type-badge ${remoteCandidate.candidateType}`}>
                  {remoteCandidate.candidateType}
                </span>
                <div className="candidate-detail">
                  {remoteCandidate.address}:{remoteCandidate.port}
                </div>
                <div className="candidate-detail">{remoteCandidate.protocol}</div>
              </>
            ) : (
              <div className="no-data">Not found</div>
            )}
          </div>
        </div>
        <div className="relay-note">
          {!localCandidate && !remoteCandidate
            ? "No candidate pair selected"
            : usingRelay
              ? "⚠️ Using TURN relay"
              : "✓ Direct connection — no TURN relay"}
        </div>
      </div>

      {/* Section 4: Candidate Counts */}
      <div className="metric-row">
        <div className="metric-box">
          <div className="metric-value">{hostCount}</div>
          <div className="metric-label">Host</div>
        </div>
        <div className="metric-box">
          <div className="metric-value">{srflxCount}</div>
          <div className="metric-label">srflx</div>
        </div>
        <div className="metric-box">
          <div className="metric-value">{relayCount}</div>
          <div className="metric-label">Relay</div>
        </div>
      </div>

      {/* Individual Candidates Lists */}
      {hostCount > 0 && (
        <div className="candidate-list">
          <h6>Host Candidates ({hostCount})</h6>
          <table className="candidates-table">
            <thead>
              <tr>
                <th>Address</th>
                <th>Port</th>
                <th>Protocol</th>
                <th>Network Type</th>
              </tr>
            </thead>
            <tbody>
              {hostCandidates.map((c, i) => (
                <tr key={c.id || i}>
                  <td><code>{c.address || "N/A"}</code></td>
                  <td>{c.port || "N/A"}</td>
                  <td>{c.protocol || "N/A"}</td>
                  <td>{c.networkType || "N/A"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {srflxCount > 0 && (
        <div className="candidate-list">
          <h6>srflx Candidates ({srflxCount})</h6>
          <table className="candidates-table">
            <thead>
              <tr>
                <th>Address</th>
                <th>Port</th>
                <th>Protocol</th>
                <th>Network Type</th>
              </tr>
            </thead>
            <tbody>
              {srflxCandidates.map((c, i) => (
                <tr key={c.id || i}>
                  <td><code>{c.address || "N/A"}</code></td>
                  <td>{c.port || "N/A"}</td>
                  <td>{c.protocol || "N/A"}</td>
                  <td>{c.networkType || "N/A"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {relayCount > 0 && (
        <div className="candidate-list">
          <h6>Relay Candidates ({relayCount})</h6>
          <table className="candidates-table">
            <thead>
              <tr>
                <th>Address</th>
                <th>Port</th>
                <th>Protocol</th>
                <th>Network Type</th>
              </tr>
            </thead>
            <tbody>
              {relayCandidates.map((c, i) => (
                <tr key={c.id || i}>
                  <td><code>{c.address || "N/A"}</code></td>
                  <td>{c.port || "N/A"}</td>
                  <td>{c.protocol || "N/A"}</td>
                  <td>{c.networkType || "N/A"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Section 5: Codec Information */}
      <div className="codec-section">
        <h5>Codecs</h5>
        <div className="codec-cards">
          <div className="codec-card">
            <div className="card-title">Video</div>
            {videoCodecs.length > 0 ? (
              videoCodecs.map((c) => (
                <div key={c.payloadType} className="codec-detail">
                  <div>{c.mimeType} @ {c.clockRate}Hz</div>
                  <div>Payload: {c.payloadType}</div>
                  {c.sdpFmtpLine && <div className="fmtp">{c.sdpFmtpLine}</div>}
                </div>
              ))
            ) : (
              <div className="no-data">No video codecs</div>
            )}
            <div className="rtx-note">RTX: {rtxEnabled ? "Yes" : "No"}</div>
          </div>
          <div className="codec-card">
            <div className="card-title">Audio</div>
            {audioCodecs.length > 0 ? (
              audioCodecs.map((c) => (
                <div key={c.payloadType} className="codec-detail">
                  <div>{c.mimeType} @ {c.clockRate}Hz</div>
                  <div>Channels: {c.channels || 1}</div>
                  <div>Payload: {c.payloadType}</div>
                  {c.sdpFmtpLine && <div className="fmtp">{c.sdpFmtpLine}</div>}
                </div>
              ))
            ) : (
              <div className="no-data">No audio codecs</div>
            )}
          </div>
        </div>
      </div>

      {/* Section 6: Simulcast Layers */}
      <div className="simulcast-section">
        <h5>Simulcast Layers</h5>
        {simulcastActive ? (
          <table className="simulcast-table">
            <thead>
              <tr>
                <th>Layer</th>
                <th>SSRC</th>
                <th>RTX SSRC</th>
                <th>Codec</th>
              </tr>
            </thead>
            <tbody>
              {videoOutbound.map((layer) => {
                const codec = videoCodecs.find((c) => c.id === layer.codecId);
                return (
                  <tr key={layer.rid || layer.ssrc}>
                    <td>
                      <span className={`rid-badge ${layer.rid || "none"}`}>
                        {layer.rid || "N/A"}
                      </span>
                    </td>
                    <td><code>{layer.ssrc}</code></td>
                    <td><code>{layer.rtxSsrc || "N/A"}</code></td>
                    <td>{codec?.mimeType?.split("/")[1] || "N/A"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="no-simulcast">Simulcast: not active</div>
        )}
      </div>

      {/* Section 7: Media Source */}
      {mediaSource && (
        <div className="media-source-section">
          <h5>Media Source</h5>
          <div className="source-details">
            <div>Resolution: {mediaSource.width || 0} × {mediaSource.height || 0}</div>
            <div>Frames per second: {mediaSource.framesPerSecond || 0}</div>
          </div>
        </div>
      )}

      {/* Section 8: Device Info */}
      {deviceInfo && (
        <div className="device-section">
          <h5>Device Info</h5>
          <div className="device-details">
            <div>Browser: {deviceInfo.browser}</div>
            <div>OS: {deviceInfo.os}</div>
            <div>CPU cores: {device?.hardwareConcurrency ?? "N/A"}</div>
            <div>Memory: {device?.deviceMemory ? `${device.deviceMemory} GB` : "N/A"}</div>
            <div>Network: {device?.effectiveType ?? "N/A"}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function parseUserAgent(userAgent) {
  let browser = "Unknown";
  let os = "Unknown";

  if (!userAgent) return { browser, os };

  // Browser detection
  if (userAgent.includes("Chrome/") && !userAgent.includes("Edg/")) {
    const match = userAgent.match(/Chrome\/(\d+)/);
    browser = match ? `Chrome ${match[1]}` : "Chrome";
  } else if (userAgent.includes("Firefox/")) {
    const match = userAgent.match(/Firefox\/(\d+)/);
    browser = match ? `Firefox ${match[1]}` : "Firefox";
  } else if (userAgent.includes("Safari/") && !userAgent.includes("Chrome/")) {
    const match = userAgent.match(/Version\/(\d+)/);
    browser = match ? `Safari ${match[1]}` : "Safari";
  } else if (userAgent.includes("Edg/")) {
    const match = userAgent.match(/Edg\/(\d+)/);
    browser = match ? `Edge ${match[1]}` : "Edge";
  }

  // OS detection
  if (userAgent.includes("Windows")) os = "Windows";
  else if (userAgent.includes("Mac")) os = "macOS";
  else if (userAgent.includes("Linux")) os = "Linux";
  else if (userAgent.includes("Android")) os = "Android";
  else if (userAgent.includes("iPhone") || userAgent.includes("iOS")) os = "iOS";

  return { browser, os };
}
