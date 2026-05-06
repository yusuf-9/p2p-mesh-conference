import { useState } from "react";
import ReactECharts from "echarts-for-react";

export default function HealthChart({ data }) {
  const [selectedLayer, setSelectedLayer] = useState("combined");
  if (!data || !data.length) return <div>No health data</div>;

  // Check if any data has simulcastLayers
  const hasSimulcast = data.some((d) => d.simulcastLayers);
  const availableLayers = hasSimulcast ? ["high", "medium", "low", "combined"] : [];

  const timestamps = data.map((d) =>
    new Date(d.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );

  // Helper to extract bitrate for a specific layer
  const getBitrate = (d, layer) => {
    if (layer === "combined") return d.video?.bitrateKbps ?? 0;
    return d.simulcastLayers?.[layer]?.bitrateKbps ?? null;
  };
  const getPacketsLost = (d, layer) => {
    if (layer === "combined") return d.video?.packetsLostDelta ?? 0;
    return d.simulcastLayers?.[layer]?.packetsLostDelta ?? null;
  };
  const getJitter = (d, layer) => {
    if (layer === "combined") return d.video?.jitter ?? d.remoteInbound?.jitter ?? 0;
    return d.remoteInboundLayers?.[layer]?.jitter ?? 0;
  };
  const getFps = (d, layer) => {
    if (layer === "combined") return d.video?.framesPerSecond ?? 0;
    return d.simulcastLayers?.[layer]?.framesPerSecond ?? null;
  };

  const bitrate = data.map((d) => getBitrate(d, selectedLayer));
  const packetsLost = data.map((d) => getPacketsLost(d, selectedLayer));
  const jitter = data.map((d) => getJitter(d, selectedLayer));
  const fps = data.map((d) => getFps(d, selectedLayer));

  const series = [
    { name: "Bitrate (kbps)", type: "line", data: bitrate, smooth: true },
    { name: "Packets Lost", type: "line", data: packetsLost, smooth: true },
    { name: "Jitter (ms)", type: "line", data: jitter, smooth: true },
    { name: "FPS", type: "line", data: fps, smooth: true, yAxisIndex: 0 },
  ].filter((s) => s.data.some((v) => v !== null));

  const legendData = series.map((s) => s.name);

  const option = {
    tooltip: { trigger: "axis" },
    legend: { data: legendData },
    grid: { left: 50, right: 50, bottom: hasSimulcast ? 80 : 50 },
    xAxis: { type: "category", data: timestamps, name: "Time" },
    yAxis: { type: "value", name: "Value" },
    series,
  };

  return (
    <div className="health-chart">
      {hasSimulcast && (
        <div className="layer-selector">
          <span>Layer: </span>
          {availableLayers.map((layer) => (
            <button
              key={layer}
              className={`layer-btn ${selectedLayer === layer ? "active" : ""}`}
              onClick={() => setSelectedLayer(layer)}
            >
              {layer}
            </button>
          ))}
        </div>
      )}
      <ReactECharts option={option} style={{ height: 400 }} />
    </div>
  );
}
