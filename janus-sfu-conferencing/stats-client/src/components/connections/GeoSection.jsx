import DetailRow from './DetailRow';
import NoDataPlaceholder from './NoDataPlaceholder';
import { formatGeoLocation, hasConnectivityGeo } from '../../lib/pConnections';

export default function GeoSection({ pc }) {
  const geo = pc.connectivityGeo;

  if (!hasConnectivityGeo(geo)) {
    return <NoDataPlaceholder />;
  }

  return (
    <>
      <DetailRow label="Origin" value={pc.origin ?? '—'} />
      <DetailRow label="Local" value={formatGeoLocation(geo.local) ?? 'Unknown'} />
      <DetailRow label="Remote" value={formatGeoLocation(geo.remote) ?? 'Unknown'} />
    </>
  );
}
