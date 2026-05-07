import { useMemo } from "react";
import useStatsStore from "../store/statsStore";
import ConnectionStats from "./stats/ConnectionStats";
import HealthMetrics from "./stats/HealthMetrics";
import StateChangeLog from "./stats/StateChangeLog";

export default function HandleStats({ stats: externalStats }) {
  const storeStats = useStatsStore((s) => s.stats);
  const stats = externalStats || storeStats;

  const sessionStart = stats?.find((s) => s.type === "session_start");
  const stateChanges = stats?.filter((s) => s.type === "state_change") || [];
  const healthMetrics = useMemo(
    () => stats?.filter((s) => s.type === "health_metrics") || [],
    [stats]
  );

  const latestHealth = useMemo(() => {
    if (!healthMetrics.length) return null;
    return healthMetrics[healthMetrics.length - 1];
  }, [healthMetrics]);

  if (!stats || !stats.length) return null;

  return (
    <div className="handle-stats">
      {sessionStart && (
        <section className="stats-section">
          <h4>Connection Info</h4>
          <ConnectionStats data={sessionStart.stats} />
        </section>
      )}

      {healthMetrics.length > 0 && latestHealth && (
        <section className="stats-section">
          <h4>Health Metrics</h4>
          <HealthMetrics data={healthMetrics} latest={latestHealth} />
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
