import { useState, useMemo } from "react";
import ReactECharts from "echarts-for-react";

function MetricCard({ label, value, unit, status, hint, alert }) {
  const colors = {
    good: { bg: "#d4edda", text: "#155724", border: "#c3e6cb" },
    warning: { bg: "#fff3cd", text: "#856404", border: "#ffeaa7" },
    error: { bg: "#f8d7da", text: "#721c24", border: "#f5c6cb" },
    unknown: { bg: "#e2e3e5", text: "#383d41", border: "#d6d8db" },
    alert: { bg: "#f0d9ff", text: "#6f42c1", border: "#d4c4e9" },
  };
  const c = colors[status] || colors.unknown;

  return (
    <div className="metric-card" style={{ background: c.bg, borderColor: c.border }}>
      <div className="metric-label">{label}</div>
      <div className="metric-value" style={{ color: c.text }}>
        {value} <span className="metric-unit">{unit}</span>
      </div>
      {hint && <div className="metric-hint">{hint}</div>}
      {alert && <div className="metric-alert">{alert}</div>}
    </div>
  );
}

function getStatus(type, value) {
  if (type === "fps") {
    if (value >= 24) return "good";
    if (value >= 15) return "warning";
    return "error";
  }
  if (type === "rtt") {
    if (value < 150) return "good";
    if (value < 300) return "warning";
    return "error";
  }
  if (type === "loss") {
    if (value === 0) return "good";
    if (value < 2) return "warning";
    return "error";
  }
  if (type === "quality") {
    return value === "none" ? "good" : "error";
  }
  return "unknown";
}

// Simulcast table component for publishers
function SimulcastTable({ stats, role }) {
  if (role !== "publisher" || !stats?.simulcastLayers) {
    if (!stats?.video) return null;
    return (
      <div className="single-video-section">
        <table className="simulcast-metrics-table">
          <thead>
            <tr>
              <th>Resolution</th>
              <th>FPS</th>
              <th>Bitrate</th>
              <th>Packets Received</th>
              <th>Frames Decoded</th>
              <th>Jitter</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{stats.video.frameWidth || 0} × {stats.video.frameHeight || 0}</td>
              <td>{stats.video.framesPerSecond || 0}</td>
              <td>{stats.video.bitrateKbps || 0} Kbps</td>
              <td>{stats.video.packetsReceivedDelta || 0}</td>
              <td>{stats.video.framesDecodedDelta || 0}</td>
              <td>{(stats.video.jitter || 0).toFixed(3)}s</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <table className="simulcast-metrics-table">
      <thead>
        <tr>
          <th>Layer</th>
          <th>Resolution</th>
          <th>FPS</th>
          <th>Bitrate</th>
          <th>Packets Sent</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {["high", "medium", "low"].map((rid) => {
          const l = stats.simulcastLayers[rid];
          if (!l) return null;
          return (
            <tr key={rid}>
              <td><span className={`rid-badge ${rid}`}>{rid}</span></td>
              <td>{l.frameWidth || 0} × {l.frameHeight || 0}</td>
              <td>{l.framesPerSecond || 0}</td>
              <td>{l.bitrateKbps || 0} Kbps</td>
              <td>{l.packetsSentDelta || 0}</td>
              <td><span className={`status-text ${l.active ? "active" : "inactive"}`}>{l.active ? "Active" : "Inactive"}</span></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Chart component
function Charts({ data, role }) {
  const timestamps = data.map((d) =>
    new Date(d.stats.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );

  const hasSimulcast = data.some((d) => d.stats.simulcastLayers);

  // Bitrate series
  let bitrateSeries = [];
  if (hasSimulcast && role === "publisher") {
    ["high", "medium", "low"].forEach((rid) => {
      const values = data.map((d) => d.stats.simulcastLayers?.[rid]?.bitrateKbps ?? null);
      if (values.some((v) => v !== null)) {
        const resolution = rid === "high" ? "1280×720" : rid === "medium" ? "640×360" : "320×180";
        bitrateSeries.push({
          name: `${rid} (${resolution})`,
          type: "line",
          data: values,
          smooth: true,
          lineStyle: { width: rid === "high" ? 3 : 2 },
        });
      }
    });
    const totalBitrate = data.map((d) =>
      Object.values(d.stats.simulcastLayers || {}).reduce((sum, layer) => sum + (layer.bitrateKbps || 0), 0)
    );
    bitrateSeries.push({
      name: "Total",
      type: "line",
      data: totalBitrate,
      smooth: true,
      lineStyle: { width: 4, type: "dashed" },
    });
  } else {
    bitrateSeries.push({
      name: "Bitrate",
      type: "line",
      data: data.map((d) => d.stats.video?.bitrateKbps ?? 0),
      smooth: true,
    });
  }

  // Packet loss series
  let packetLossSeries = [];
  if (role === "publisher" && hasSimulcast) {
    packetLossSeries.push({
      name: "Packet Loss",
      type: "bar",
      data: data.map((d) => d.stats.remoteInbound?.packetsLostDelta ?? 0),
      barMaxWidth: 30,
    });
  } else if (role === "subscriber") {
    packetLossSeries.push({
      name: "Packet Loss",
      type: "bar",
      data: data.map((d) => d.stats.video?.packetsLostDelta ?? 0),
      barMaxWidth: 30,
    });
  } else {
    packetLossSeries.push({
      name: "Packets Sent",
      type: "bar",
      data: data.map((d) => d.stats.video?.packetsSentDelta ?? 0),
      barMaxWidth: 30,
    });
  }

  // RTT series
  const rttData = data.map((d) => {
    const net = d.stats.network;
    return net?.currentRoundTripTime ? Math.round(net.currentRoundTripTime * 1000) : 0;
  });

  // FPS series
  let fpsData;
  if (role === "publisher" && hasSimulcast) {
    fpsData = data.map((d) => d.stats.simulcastLayers?.["high"]?.framesPerSecond || d.stats.video?.framesPerSecond || 0);
  } else {
    fpsData = data.map((d) => d.stats.video?.framesPerSecond ?? 0);
  }

  const bitrateOption = {
    tooltip: { trigger: "axis" },
    legend: { data: bitrateSeries.map((s) => s.name) },
    grid: { left: 60, right: 40, bottom: 50 },
    xAxis: { type: "category", data: timestamps, name: "Time" },
    yAxis: { type: "value", name: "Kbps" },
    series: bitrateSeries,
  };

  const lossOption = {
    tooltip: { trigger: "axis" },
    legend: { data: packetLossSeries.map((s) => s.name) },
    grid: { left: 60, right: 40, bottom: 50 },
    xAxis: { type: "category", data: timestamps, name: "Time" },
    yAxis: { type: "value", name: "Packets" },
    series: packetLossSeries,
  };

  const rttOption = {
    tooltip: { trigger: "axis" },
    grid: { left: 60, right: 40, bottom: 50 },
    xAxis: { type: "category", data: timestamps, name: "Time" },
    yAxis: { type: "value", name: "ms" },
    series: [{ name: "RTT", type: "line", data: rttData, smooth: true, itemStyle: { color: "#ff6b6b" } }],
  };

  const fpsOption = {
    tooltip: { trigger: "axis" },
    grid: { left: 60, right: 40, bottom: 50 },
    xAxis: { type: "category", data: timestamps, name: "Time" },
    yAxis: { type: "value", name: "FPS" },
    series: [{ name: "FPS", type: "line", data: fpsData, smooth: true, itemStyle: { color: "#36cfc9" } }],
  };

  return (
    <div className="charts-container">
      <div className="chart-section">
        <h5>Bitrate Over Time</h5>
        <ReactECharts option={bitrateOption} style={{ height: 300 }} />
      </div>
      <div className="chart-section">
        <h5>{role === "subscriber" ? "Packet Loss" : "Packets"}</h5>
        <ReactECharts option={lossOption} style={{ height: 300 }} />
      </div>
      <div className="chart-row">
        <div className="chart-half">
          <h5>Round Trip Time</h5>
          <ReactECharts option={rttOption} style={{ height: 250 }} />
        </div>
        <div className="chart-half">
          <h5>Frame Rate</h5>
          <ReactECharts option={fpsOption} style={{ height: 250 }} />
        </div>
      </div>
    </div>
  );
}

export default function HealthMetrics({ data, latest }) {
  const [activeTab, setActiveTab] = useState("cards");

  const latestStats = latest?.stats;

  if (!data || !data.length) return <div className="no-data">No health data</div>;
  if (!latestStats) return <div className="no-data">No health data</div>;

  const role = latestStats.role || "publisher";

  // Total bitrate
  const totalBitrate = useMemo(() => {
    if (latestStats.simulcastLayers) {
      return Object.values(latestStats.simulcastLayers).reduce(
        (sum, layer) => sum + (layer.bitrateKbps || 0),
        0
      );
    }
    return latestStats.video?.bitrateKbps || 0;
  }, [latestStats]);

  // RTT
  const rtt = latestStats.network?.currentRoundTripTime
    ? Math.round(latestStats.network.currentRoundTripTime * 1000)
    : 0;

  // Packet loss - different for publisher vs subscriber
  const packetLoss = role === "publisher"
    ? latestStats.remoteInbound?.packetsLostDelta ?? 0
    : latestStats.video?.packetsLostDelta ?? 0;

  const fps = latestStats.video?.framesPerSecond ?? 0;
  const quality = latestStats.video?.qualityLimitationReason || "none";
  const activeLayer = latestStats.video?.rid || null;

  // NACK/PLI alerts
  const nackCount = role === "publisher"
    ? latestStats.video?.nackCountDelta ?? 0
    : latestStats.video?.nackCountDelta ?? 0;
  const pliCount = role === "publisher"
    ? latestStats.video?.pliCountDelta ?? 0
    : latestStats.video?.pliCountDelta ?? 0;

  return (
    <div className="health-metrics">
      {/* Role badge */}
      <div className="role-indicator">
        <span className={`role-badge ${role}`}>{role}</span>
      </div>

      {/* Metric Cards */}
      <div className="metric-cards-row">
        {role === "publisher" && (
          <MetricCard
            label="Active Layer"
            value={activeLayer || "N/A"}
            unit=""
            status="good"
            hint={activeLayer && latestStats.video?.frameWidth ? `${latestStats.video.frameWidth}×${latestStats.video.frameHeight}` : null}
          />
        )}
        <MetricCard
          label="Total Bitrate"
          value={role === "publisher" ? (totalBitrate / 1000).toFixed(2) : (latestStats.video?.bitrateKbps / 1000).toFixed(2)}
          unit="Mbps"
          status={totalBitrate < 2000000 ? "good" : "warning"}
        />
        <MetricCard
          label="Frame Rate"
          value={fps}
          unit="fps"
          status={getStatus("fps", fps)}
          hint={fps < 24 ? "Low framerate" : null}
        />
        <MetricCard
          label="Round Trip Time"
          value={rtt}
          unit="ms"
          status={getStatus("rtt", rtt)}
        />
        <MetricCard
          label="Packet Loss"
          value={packetLoss}
          unit="packets"
          status={getStatus("loss", packetLoss)}
        />
        <MetricCard
          label="Quality Limitation"
          value={quality}
          unit=""
          status={getStatus("quality", quality)}
        />
      </div>

      {/* Alerts for NACK/PLI - only show when non-zero */}
      {(nackCount > 0 || pliCount > 0) && (
        <div className="alerts-row">
          {nackCount > 0 && (
            <div className="alert-box">
              <span className="alert-icon">⚠️</span>
              <span>NACK: {nackCount}</span>
            </div>
          )}
          {pliCount > 0 && (
            <div className="alert-box">
              <span className="alert-icon">⚠️</span>
              <span>PLI: {pliCount}</span>
            </div>
          )}
        </div>
      )}

      {/* Tab Selector */}
      <div className="tab-selector">
        <button
          className={`tab-btn ${activeTab === "cards" ? "active" : ""}`}
          onClick={() => setActiveTab("cards")}
        >
          {role === "publisher" ? "Simulcast Table" : "Video Stats"}
        </button>
        <button
          className={`tab-btn ${activeTab === "charts" ? "active" : ""}`}
          onClick={() => setActiveTab("charts")}
        >
          Charts
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "cards" && (
        <div className="simulcast-table-section">
          <h5>{role === "publisher" ? "Simulcast Layer Breakdown" : "Current Video Stats"}</h5>
          <SimulcastTable stats={latestStats} role={role} />
        </div>
      )}

      {activeTab === "charts" && (
        <Charts data={data} role={role} />
      )}
    </div>
  );
}