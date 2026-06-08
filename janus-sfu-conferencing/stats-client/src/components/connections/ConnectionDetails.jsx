import DetailSection from './DetailSection';
import DetailRow from './DetailRow';
import SetupTimeline from './SetupTimeline';
import NetworkInterfaces from './NetworkInterfaces';
import GeoSection from './GeoSection';
import SecuritySection from './SecuritySection';
import IceConnectivity from './IceConnectivity';
import {
  formatIceServers,
  getContentMediaLabel,
  getPcTiming,
  hasSimulcast,
} from '../../lib/pConnections';
import { getSelectedIce } from '../../lib/transports';
import { formatTime, formatMs } from '../../lib/statsFormat';

export default function ConnectionDetails({ pc, transports, session, pairTimeSeries }) {
  const iceServers = formatIceServers(pc.configuration);
  const gatheringDelays = [
    pc.timeToFirstTurnUDPCandidateMs != null &&
      `TURN/UDP ${Math.round(pc.timeToFirstTurnUDPCandidateMs)} ms`,
    pc.timeToFirstTurnTCPCandidateMs != null &&
      `TURN/TCP ${Math.round(pc.timeToFirstTurnTCPCandidateMs)} ms`,
    pc.timeToFirstTurnTLSCandidateMs != null &&
      `TURN/TLS ${Math.round(pc.timeToFirstTurnTLSCandidateMs)} ms`,
    pc.timeToFirstStunCandidateMs != null &&
      `STUN ${Math.round(pc.timeToFirstStunCandidateMs)} ms`,
  ].filter(Boolean);

  const selectedIce = getSelectedIce(pc.id, transports);
  const selectedLocal = selectedIce?.pair?.local ?? null;
  const timing = getPcTiming(pc);

  return (
    <div className="connection-details">
      <DetailSection title="Setup">
        <SetupTimeline pc={pc} />
      </DetailSection>

      <DetailSection title="Geo">
        <GeoSection pc={pc} />
      </DetailSection>

      <DetailSection title="Connectivity">
        <div className="conn-detail-row">
          <span className="conn-detail-label">STUN &amp; TURN ({iceServers.length})</span>
          <span className="conn-detail-value">
            {iceServers.length ? (
              <ul className="ice-server-list">
                {iceServers.map((server) => (
                  <li key={server}>{server}</li>
                ))}
              </ul>
            ) : (
              '—'
            )}
          </span>
        </div>
        <DetailRow
          label="Transport policy"
          value={pc.configuration?.iceTransportPolicy ?? '—'}
        />
        <DetailRow
          label="Connection type"
          value={pc.connectionType ?? '—'}
        />
        <DetailRow
          label="Gathering delay"
          value={gatheringDelays.length ? gatheringDelays.join(' · ') : '—'}
        />
        <DetailRow
          label="Signaling duration"
          value={
            pc.signalingTimeMs != null
              ? `${Math.round(pc.signalingTimeMs)} ms (Local Offer → Remote Answer)`
              : '—'
          }
        />
        {pc.connectedToServer?.length > 0 && (
          <DetailRow label="Connected to" value={pc.connectedToServer.join(', ')} />
        )}
      </DetailSection>

      <DetailSection title={`Network interfaces (${Object.keys(pc.localCandidates ?? {}).length})`}>
        <NetworkInterfaces
          localCandidates={pc.localCandidates}
          selectedLocal={selectedLocal}
        />
      </DetailSection>

      <IceConnectivity
        pcId={pc.id}
        transports={transports}
        session={session}
        pairTimeSeries={pairTimeSeries}
      />

      <DetailSection title="Stability">
        <DetailRow
          label="Disconnections"
          value={pc.disconnections?.length ? String(pc.disconnections.length) : 'None'}
        />
        <DetailRow label="Handovers" value={pc.handovers ? String(pc.handovers) : 'None'} />
        <DetailRow label="Connection churn" value={pc.connectionChurn ? 'Yes' : 'None'} />
        <DetailRow label="ICE churn" value={pc.iceChurn ? 'Yes' : 'None'} />
        <DetailRow label="Symmetric NAT" value={<span className="no-data-inline">No data yet</span>} />
        <DetailRow label="UDP blocked" value={<span className="no-data-inline">No data yet</span>} />
      </DetailSection>

      <DetailSection title="Content">
        <DetailRow label="Role" value={pc.peerType ?? '—'} />
        <DetailRow label="Media" value={getContentMediaLabel(pc.contentType)} />
        <DetailRow label="Simulcast/SVC" value={hasSimulcast(pc.contentType) ? 'Yes' : 'No'} />
        {pc.contentType && (
          <DetailRow label="Content type" value={pc.contentType} />
        )}
      </DetailSection>

      <DetailSection title="Security">
        <SecuritySection />
      </DetailSection>

      <DetailSection title="Timing">
        <DetailRow label="Created at" value={formatTime(pc.createdAt)} />
        <DetailRow label="Connected at" value={formatTime(pc.connectedAt)} />
        <DetailRow label="Ended at" value={formatTime(pc.end)} />
        <DetailRow label="Warm-up" value={formatMs(timing.warmUpMs)} />
        <DetailRow label="Setup" value={formatMs(timing.setupMs)} />
        <DetailRow label="Live" value={formatMs(timing.liveMs)} />
        <DetailRow label="Lifetime" value={formatMs(timing.lifetimeMs)} />
      </DetailSection>
    </div>
  );
}
