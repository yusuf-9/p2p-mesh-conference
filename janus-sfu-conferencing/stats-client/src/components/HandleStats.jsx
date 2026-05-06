import { useMemo } from "react";
import useStatsStore from "../store/statsStore";
import ConnectionStats from "./stats/ConnectionStats";
import HealthChart from "./stats/HealthChart";
import StateChangeLog from "./stats/StateChangeLog";

export default function HandleStats() {
  const stats = useStatsStore((s) => s.stats);
  const healthChartData = useStatsStore((s) => s.healthChartData);
  const loading = useStatsStore((s) => s.loadingStats);
  const selectedHandleId = useStatsStore((s) => s.selectedHandleId);

  if (!selectedHandleId) return null;
  if (loading) return <div className="loading">Loading stats...</div>;
  if (!stats.length) return <div className="empty">No stats found for this handle.</div>;

  const sessionStart = stats.find((s) => s.type === "session_start");
  const stateChanges = stats.filter((s) => s.type === "state_change");

  return (
    <div className="handle-stats">
      <h3>Stats for Handle</h3>

      {sessionStart && (
        <section className="stats-section">
          <h4>Connection Info</h4>
          <ConnectionStats data={sessionStart.stats} />
        </section>
      )}

      {healthChartData.length > 0 && (
        <section className="stats-section">
          <h4>Health Metrics</h4>
          <HealthChart data={healthChartData} />
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
