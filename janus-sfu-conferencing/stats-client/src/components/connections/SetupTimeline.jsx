import { getSetupPhases } from '../../lib/pConnections';

function formatPhaseMs(ms) {
  if (ms == null) return null;
  return `${Math.round(ms)} ms`;
}

export default function SetupTimeline({ pc }) {
  const phases = getSetupPhases(pc);

  if (!phases.length) {
    return <p className="empty-message">No setup timing data.</p>;
  }

  return (
    <div className="setup-timeline">
      <div className="setup-timeline-track">
        {phases.map((phase, index) => (
          <div key={`${phase.label}-${index}`} className="setup-timeline-step">
            <span className="setup-timeline-node" />
            <span className="setup-timeline-label">{phase.label}</span>
            {phase.segmentMs != null && phase.segmentMs > 0 && (
              <span className="setup-timeline-segment">{formatPhaseMs(phase.segmentMs)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
