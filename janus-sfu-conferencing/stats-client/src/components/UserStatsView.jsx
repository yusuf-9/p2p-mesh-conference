import { useState } from 'react';
import TabBar from './TabBar';
import SummaryTab from './summary/SummaryTab';
import ConnectionsTab from './connections/ConnectionsTab';
import StreamsTab from './streams/StreamsTab';

export default function UserStatsView({ userId, data }) {
  const [activeTab, setActiveTab] = useState('summary');
  const tabCounts = {
    connections: data.pConnectionsNumber ?? Object.keys(data.pConnections ?? {}).length,
    streams: Object.keys(data.streams ?? {}).length,
  };

  return (
    <div className="user-stats-view">
      <div className="user-stats-header">
        <h2>User Stats</h2>
        <p className="meta">User: {userId}</p>
      </div>

      <TabBar activeTab={activeTab} onChange={setActiveTab} counts={tabCounts} />

      <div className="user-stats-panel" role="tabpanel">
        {activeTab === 'summary' && <SummaryTab data={data} />}
        {activeTab === 'connections' && <ConnectionsTab data={data} />}
        {activeTab === 'streams' && <StreamsTab data={data} />}
      </div>
    </div>
  );
}
