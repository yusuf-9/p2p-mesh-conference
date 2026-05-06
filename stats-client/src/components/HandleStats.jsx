import { useMemo } from "react";
import useStatsStore from "../store/statsStore";
import ConnectionStats from "./stats/ConnectionStats";
import HealthMetrics from "./stats/HealthMetrics";
import StateChangeLog from "./stats/StateChangeLog";

export default function HandleStats() {
  const stats = useStatsStore((s) => s.stats);
  const healthChartData = useStatsStore((s) => s.healthChartData);
  const loading = useStatsStore((s) => s.loadingStats);
  const selectedHandleId = useStatsStore((s) => s.selectedHandleId);

  // All hooks must be called before any conditional returns
  const sessionStart = stats?.find((s) => s.type === "session_start");
  const stateChanges = stats?.filter((s) => s.type === "state_change") || [];

  // Get latest health data - with proper guards
  const latestHealth = useMemo(() => {
    if (!healthChartData || !healthChartData.length) return null;
    const latest = healthChartData[healthChartData.length - 1];
    if (!latest) return null;

    // The actual stats object is nested under 'stats' key
    const s = latest.stats;
    if (!s) return null;

    // Safely calculate total bitrate from simulcast layers
    let totalBitrate = 0;
    if (s.simulcastLayers) {
      totalBitrate = Object.values(s.simulcastLayers).reduce(
        (sum, layer) => sum + (layer?.bitrateKbps || 0),
        0
      );
    } else if (s.video?.bitrateKbps) {
      totalBitrate = s.video.bitrateKbps;
    }

    // Determine active layer safely
    let activeLayer = "N/A";
    if (s.simulcastLayers) {
      const layers = Object.entries(s.simulcastLayers);
      const active = layers.find(([_, l]) => l?.active);
      if (active) activeLayer = active[0];
      else if (layers.length > 0) activeLayer = layers[0][0];
    } else if (s.video?.rid) {
      activeLayer = s.video.rid;
    }

    return {
      ...latest,
      stats: s,
      totalBitrate,
      activeLayer,
    };
  }, [healthChartData]);

  // Conditional returns AFTER all hooks
  if (!selectedHandleId) return null;
  if (loading) return <div className="loading">Loading stats...</div>;
  if (!stats?.length) return <div className="empty">No stats found for this handle.</div>;

  return (
    <div className="handle-stats">
      <h3>Stats for Handle</h3>

      {sessionStart && (
        <section className="stats-section">
          <h4>Connection Info</h4>
          <ConnectionStats data={sessionStart.stats} />
        </section>
      )}

      {healthChartData?.length > 0 && latestHealth && (
        <section className="stats-section">
          <h4>Health Metrics</h4>
          <HealthMetrics data={healthChartData} latest={latestHealth} />
        </section>
      )}

      {stateChanges.length > 0 && (
        <section className="stats-section">
          <h4>State Changes</h4>
          <StateChangeLog events={stateChanges} />
        </section>
      )}
    </div>
  );
}
