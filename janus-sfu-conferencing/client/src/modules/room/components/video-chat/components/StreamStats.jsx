import { useMemo } from "react";
import { BitrateChart, FPSChart, PacketLossChart, JitterChart } from "./MiniChart";

const StreamStats = ({ 
  feedId,
  stats = null,
  statsHistory = [],
  isLocal = false,
  className = ""
}) => {
  // Check if this is a simulcast feed with multiple layers
  const hasSimulcastLayers = stats?.simulcastLayers?.length > 0;
  const simulcastLayers = stats?.simulcastLayers || [];

  // Helper functions for simulcast layer display
  const getLayerName = (rid) => {
    switch (rid) {
      case 'h': return 'High';
      case 'm': return 'Med';
      case 'l': return 'Low';
      default: return rid || 'Main';
    }
  };

  const getLayerColor = (rid) => {
    switch (rid) {
      case 'h': return '#10b981'; // Green for high quality
      case 'm': return '#f59e0b'; // Yellow for medium quality  
      case 'l': return '#ef4444'; // Red for low quality
      default: return '#8b5cf6'; // Purple for main/other
    }
  };
  // Extract current values from latest stats
  const currentStats = useMemo(() => {
    if (!stats) return null;

    const videoStats = stats.video || {};
    const connectionStats = stats.connectionStats || {};
    
    return {
      bitrate: videoStats.bitrate || 0,
      fps: videoStats.framesPerSecond || 0,
      packetLoss: videoStats.packetLossPercentage || 0,
      jitter: videoStats.jitter || connectionStats.roundTripTime || 0,
      resolution: videoStats.frameWidth && videoStats.frameHeight 
        ? `${videoStats.frameWidth}x${videoStats.frameHeight}`
        : 'N/A',
      codec: videoStats.codecName || 'Unknown'
    };
  }, [stats]);

  // Extract historical data for charts
  const chartData = useMemo(() => {
    if (!statsHistory.length) return null;

    const maxPoints = 15; // Show last 15 data points
    const recentHistory = statsHistory.slice(-maxPoints);

    return {
      bitrate: recentHistory.map(s => s.bitrate || 0),
      fps: recentHistory.map(s => s.framesPerSecond || 0),
      packetLoss: recentHistory.map(s => s.packetLossPercentage || 0),
      jitter: recentHistory.map(s => s.jitter || 0)
    };
  }, [statsHistory]);

  // Format values for display
  const formatBitrate = (bps) => {
    if (bps >= 1000000) return `${(bps / 1000000).toFixed(1)}M`;
    if (bps >= 1000) return `${(bps / 1000).toFixed(1)}K`;
    return `${Math.round(bps)}`;
  };

  const formatPacketLoss = (percentage) => {
    return percentage > 0 ? `${percentage.toFixed(1)}%` : '0%';
  };

  const formatJitter = (ms) => {
    return ms > 0 ? `${ms.toFixed(0)}ms` : '0ms';
  };

  // Get status color based on value quality - PRODUCTION GRADE THRESHOLDS
  const getStatusColor = (metric, value) => {
    switch (metric) {
      case 'bitrate':
        if (value >= 500000) return 'text-green-400'; // Good: >500kbps
        if (value >= 200000) return 'text-yellow-400'; // OK: >200kbps
        return 'text-red-400'; // Poor: <200kbps
      
      case 'fps':
        if (value >= 25) return 'text-green-400'; // Good: 25+ fps
        if (value >= 15) return 'text-yellow-400'; // OK: 15+ fps
        return 'text-red-400'; // Poor: <15 fps
      
      case 'packetLoss':
        if (value <= 1) return 'text-green-400'; // Good: ≤1%
        if (value <= 3) return 'text-yellow-400'; // OK: ≤3% (production threshold)
        return 'text-red-400'; // Poor: >3%
      
      case 'jitter':
        if (value <= 20) return 'text-green-400'; // Good: ≤20ms
        if (value <= 50) return 'text-yellow-400'; // OK: ≤50ms
        return 'text-red-400'; // Poor: >50ms

      case 'rtt':
        if (value <= 100) return 'text-green-400'; // Good: ≤100ms
        if (value <= 200) return 'text-yellow-400'; // OK: ≤200ms
        return 'text-red-400'; // Poor: >200ms

      case 'retransmission':
        if (value <= 2) return 'text-green-400'; // Good: ≤2%
        if (value <= 5) return 'text-yellow-400'; // OK: ≤5%
        return 'text-red-400'; // Poor: >5%

      case 'encodeTime':
        if (value <= 10) return 'text-green-400'; // Good: ≤10ms per frame
        if (value <= 25) return 'text-yellow-400'; // OK: ≤25ms per frame
        return 'text-red-400'; // Poor: >25ms per frame

      case 'decodeTime':
        if (value <= 5) return 'text-green-400'; // Good: ≤5ms per frame
        if (value <= 15) return 'text-yellow-400'; // OK: ≤15ms per frame
        return 'text-red-400'; // Poor: >15ms per frame

      case 'frameDropRate':
        if (value <= 1) return 'text-green-400'; // Good: ≤1%
        if (value <= 5) return 'text-yellow-400'; // OK: ≤5%
        return 'text-red-400'; // Poor: >5%

      case 'freezeCount':
        if (value === 0) return 'text-green-400'; // Good: no freezes
        if (value <= 2) return 'text-yellow-400'; // OK: ≤2 freezes
        return 'text-red-400'; // Poor: >2 freezes
      
      default:
        return 'text-slate-400';
    }
  };

  if (!currentStats) {
    return (
      <div className={`bg-black/70 backdrop-blur-sm rounded-lg p-3 border border-slate-600/50 ${className}`}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-slate-500 rounded-full animate-pulse"></div>
          <span className="text-xs text-slate-400 font-mono">Collecting stats...</span>
        </div>
      </div>
    );
  }

  // Render simulcast layers view or single stream view
  if (hasSimulcastLayers && isLocal) {
    return (
      <div className={`bg-black/80 backdrop-blur-sm rounded-lg p-3 border border-slate-600/50 shadow-xl max-w-sm ${className}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs font-medium text-white">Outgoing Layers</span>
          </div>
          <span className="text-xs text-slate-400 font-mono">Simulcast</span>
        </div>

        {/* Simulcast Layers */}
        <div className="space-y-3">
          {simulcastLayers
            .sort((a, b) => {
              const order = { 'h': 0, 'm': 1, 'l': 2 };
              return (order[a.rid] ?? 3) - (order[b.rid] ?? 3);
            })
            .map((layer, index) => (
            <div key={layer.rid} className="border border-slate-700/50 rounded-md p-2">
              {/* Layer Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: getLayerColor(layer.rid) }}
                  ></div>
                  <span className="text-xs font-medium text-white">
                    {getLayerName(layer.rid)}
                  </span>
                  {layer.frameWidth && layer.frameHeight && (
                    <span className="text-xs text-slate-400 font-mono">
                      {layer.frameWidth}x{layer.frameHeight}
                    </span>
                  )}
                </div>
                {!layer.active && (
                  <span className="text-xs text-red-400">Inactive</span>
                )}
              </div>

              {/* Layer Stats - PRODUCTION GRADE METRICS */}
              <div className="space-y-2">
                {/* Primary metrics row */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Rate:</span>
                    <span className={`font-mono ${getStatusColor('bitrate', layer.bitrate || 0)}`}>
                      {formatBitrate(layer.bitrate || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">FPS:</span>
                    <span className={`font-mono ${getStatusColor('fps', layer.fps || 0)}`}>
                      {Math.round(layer.fps || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Loss:</span>
                    <span className={`font-mono ${getStatusColor('packetLoss', layer.packetLossPercentage || 0)}`}>
                      {formatPacketLoss(layer.packetLossPercentage || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Target:</span>
                    <span className="font-mono text-slate-400">
                      {formatBitrate(layer.targetBitrate || 0)}
                    </span>
                  </div>
                </div>

                {/* CRITICAL PRODUCTION METRICS */}
                <div className="border-t border-slate-700/30 pt-2 space-y-1">
                  {/* Quality Limitation - MOST IMPORTANT */}
                  {layer.qualityLimitationReason && layer.qualityLimitationReason !== 'none' && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-amber-400">Limit:</span>
                      <span className={`font-mono text-xs px-1 rounded ${
                        layer.qualityLimitationReason === 'cpu' ? 'bg-red-600' :
                        layer.qualityLimitationReason === 'bandwidth' ? 'bg-yellow-600' : 'bg-slate-600'
                      }`}>
                        {layer.qualityLimitationReason.toUpperCase()}
                      </span>
                    </div>
                  )}
                  
                  {/* Retransmission Rate */}
                  {(layer.retransmissionRate || 0) > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">Retrans:</span>
                      <span className={`font-mono ${getStatusColor('retransmission', layer.retransmissionRate || 0)}`}>
                        {(layer.retransmissionRate || 0).toFixed(1)}%
                      </span>
                    </div>
                  )}
                  
                  {/* Encode Time */}
                  {(layer.avgEncodeTime || 0) > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">Enc:</span>
                      <span className={`font-mono ${getStatusColor('encodeTime', (layer.avgEncodeTime || 0) * 1000)}`}>
                        {((layer.avgEncodeTime || 0) * 1000).toFixed(1)}ms
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Total Stats */}
        <div className="mt-3 pt-2 border-t border-slate-700/50">
          <div className="text-xs text-slate-400 mb-1">Total:</div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300">Combined Rate:</span>
            <span className={`font-mono ${getStatusColor('bitrate', currentStats?.bitrate || 0)}`}>
              {formatBitrate(currentStats?.bitrate || 0)}bps
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Single stream view (remote feeds or non-simulcast)
  return (
    <div className={`bg-black/80 backdrop-blur-sm rounded-lg p-3 border border-slate-600/50 shadow-xl max-w-xs ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-xs font-medium text-white">
            {isLocal ? 'Outgoing' : 'Incoming'}
          </span>
        </div>
        <span className="text-xs text-slate-400 font-mono">
          {currentStats?.codec || 'Unknown'}
        </span>
      </div>

      {/* Stats Grid - PRODUCTION GRADE */}
      <div className="space-y-2">
        {/* Core Network Metrics */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-xs text-slate-300 w-12">Rate:</span>
            <span className={`text-xs font-mono ${getStatusColor('bitrate', currentStats?.bitrate || 0)}`}>
              {formatBitrate(currentStats?.bitrate || 0)}bps
            </span>
          </div>
          {chartData && (
            <BitrateChart 
              data={chartData.bitrate} 
              width={50} 
              height={16}
              animate={false}
            />
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-xs text-slate-300 w-12">FPS:</span>
            <span className={`text-xs font-mono ${getStatusColor('fps', currentStats?.fps || 0)}`}>
              {Math.round(currentStats?.fps || 0)}
            </span>
          </div>
          {chartData && (
            <FPSChart 
              data={chartData.fps} 
              width={50} 
              height={16}
              animate={false}
            />
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-xs text-slate-300 w-12">Loss:</span>
            <span className={`text-xs font-mono ${getStatusColor('packetLoss', currentStats?.packetLoss || 0)}`}>
              {formatPacketLoss(currentStats?.packetLoss || 0)}
            </span>
          </div>
          {chartData && (
            <PacketLossChart 
              data={chartData.packetLoss} 
              width={50} 
              height={16}
              animate={false}
            />
          )}
        </div>

        {/* RTT - CRITICAL for network analysis */}
        {stats?.connectionStats?.roundTripTime > 0 && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1">
              <span className="text-xs text-slate-300 w-12">RTT:</span>
              <span className={`text-xs font-mono ${getStatusColor('rtt', stats.connectionStats.roundTripTime)}`}>
                {Math.round(stats.connectionStats.roundTripTime)}ms
              </span>
            </div>
          </div>
        )}

        {/* Jitter */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-xs text-slate-300 w-12">Jitter:</span>
            <span className={`text-xs font-mono ${getStatusColor('jitter', currentStats?.jitter || 0)}`}>
              {formatJitter(currentStats?.jitter || 0)}
            </span>
          </div>
          {chartData && (
            <JitterChart 
              data={chartData.jitter} 
              width={50} 
              height={16}
              animate={false}
            />
          )}
        </div>

        {/* CRITICAL PRODUCTION METRICS SECTION */}
        {!isLocal && (
          <>
            {/* Incoming Stream Issues */}
            {(stats?.video?.frameDropRate > 0 || stats?.video?.freezeCount > 0) && (
              <div className="border-t border-slate-700/50 pt-2 space-y-1">
                <div className="text-xs text-amber-400 mb-1">UX Issues:</div>
                
                {stats?.video?.frameDropRate > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">Drops:</span>
                    <span className={`font-mono ${getStatusColor('frameDropRate', stats.video.frameDropRate)}`}>
                      {stats.video.frameDropRate.toFixed(1)}%
                    </span>
                  </div>
                )}

                {stats?.video?.freezeCount > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">Freezes:</span>
                    <span className={`font-mono ${getStatusColor('freezeCount', stats.video.freezeCount)}`}>
                      {stats.video.freezeCount}
                    </span>
                  </div>
                )}

                {stats?.video?.avgDecodeTime > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">Decode:</span>
                    <span className={`font-mono ${getStatusColor('decodeTime', stats.video.avgDecodeTime * 1000)}`}>
                      {(stats.video.avgDecodeTime * 1000).toFixed(1)}ms
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Resolution */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-700/50">
          <span className="text-xs text-slate-300 w-12">Res:</span>
          <span className="text-xs font-mono text-slate-400">
            {currentStats?.resolution || 'N/A'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default StreamStats;