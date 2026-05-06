import ReactECharts from "echarts-for-react";

export default function HealthChart({ data }) {
  if (!data || !data.length) return <div>No health data</div>;

  const timestamps = data.map((d) =>
    new Date(d.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );

  const bitrate = data.map((d) => d.bitrateKbps ?? 0);
  const packetsLost = data.map((d) => d.packetsLostDelta ?? 0);
  const jitter = data.map((d) => d.jitter ?? 0);
  const fps = data.map((d) => d.framesPerSecond ?? 0);

  const option = {
    tooltip: { trigger: "axis" },
    legend: { data: ["Bitrate (kbps)", "Packets Lost", "Jitter (ms)", "FPS"] },
    grid: { left: 50, right: 50, bottom: 50 },
    xAxis: { type: "category", data: timestamps, name: "Time" },
    yAxis: { type: "value", name: "Value" },
    series: [
      { name: "Bitrate (kbps)", type: "line", data: bitrate, smooth: true },
      { name: "Packets Lost", type: "line", data: packetsLost, smooth: true },
      { name: "Jitter (ms)", type: "line", data: jitter, smooth: true },
      { name: "FPS", type: "line", data: fps, smooth: true, yAxisIndex: 0 },
    ],
  };

  return (
    <div className="health-chart">
      <ReactECharts option={option} style={{ height: 400 }} />
    </div>
  );
}
