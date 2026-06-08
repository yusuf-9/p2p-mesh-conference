import { formatSetupTransportLabel, getSetupStepper } from '../../lib/pConnections';

function formatPhaseMs(ms) {
  if (ms == null) return null;
  return `${Math.round(ms)} ms`;
}

function nodeClass(index, total) {
  if (index === 0) return 'setup-stepper-node setup-stepper-node-start';
  if (index === total - 1) return 'setup-stepper-node setup-stepper-node-end';
  return 'setup-stepper-node setup-stepper-node-mid';
}

export default function SetupTimeline({ pc }) {
  const { totalMs, milestones, segments } = getSetupStepper(pc);
  const transportLabel = formatSetupTransportLabel(pc);

  if (!milestones.length) {
    return <p className="empty-message">No setup timing data.</p>;
  }

  return (
    <div className="setup-stepper">
      {totalMs != null && (
        <div className="setup-stepper-total">{formatPhaseMs(totalMs)}</div>
      )}

      <div className="setup-stepper-line">
        {milestones.map((milestone, index) => {
          const items = [];

          if (index > 0) {
            items.push(
              <div key={`bridge-${index}`} className="setup-stepper-bridge">
                <div className="setup-stepper-segment">
                  <span className="setup-stepper-segment-label">
                    {segments[index - 1]?.label}
                  </span>
                  <span className="setup-stepper-segment-ms">
                    {formatPhaseMs(segments[index - 1]?.ms) ?? '—'}
                  </span>
                </div>
                <span className="setup-stepper-bridge-line" />
              </div>
            );
          }

          items.push(
            <div key={`node-${milestone.key}`} className={nodeClass(index, milestones.length)}>
              <div className="setup-stepper-node-head">
                <span className="setup-stepper-node-label">{milestone.label}</span>
                {milestone.sublabel && (
                  <span className="setup-stepper-node-sublabel">{milestone.sublabel}</span>
                )}
              </div>
              <span className="setup-stepper-dot" aria-hidden />
            </div>
          );

          return items;
        })}
      </div>

      {transportLabel && (
        <div className="setup-stepper-footer">{transportLabel}</div>
      )}
    </div>
  );
}
