import { useMemo } from 'react';
import useStore from '../../../store';

const NODE_R = 22;
const RING_R = 110;
const LINE_GAP = 7;

function pointOnCircle(cx, cy, r, angle) {
  return [cx + r * Math.cos(angle - Math.PI / 2), cy + r * Math.sin(angle - Math.PI / 2)];
}

function parallelLine(x1, y1, x2, y2, offset) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = (-dy / len) * offset;
  const ny = (dx / len) * offset;
  return [x1 + nx, y1 + ny, x2 + nx, y2 + ny];
}

// Visual style per RTCPeerConnectionState
const STATE_STYLE = {
  new:          { stroke: '#475569', dash: '4 4', opacity: 0.5 },
  connecting:   { stroke: '#f59e0b', dash: '6 3', opacity: 0.8 },
  connected:    { stroke: '#8b5cf6', dash: null,  opacity: 1   },
  disconnected: { stroke: '#ef4444', dash: '3 3', opacity: 0.6 },
  failed:       { stroke: '#ef4444', dash: null,  opacity: 0.9 },
  closed:       { stroke: '#334155', dash: '2 4', opacity: 0.3 },
};

// Screen share uses cyan when connected
const SCREENSHARE_CONNECTED_STROKE = '#06b6d4';

function lineStyle(feedType, connectionState) {
  const base = STATE_STYLE[connectionState] ?? STATE_STYLE.new;
  if (feedType === 'screenshare' && connectionState === 'connected') {
    return { ...base, stroke: SCREENSHARE_CONNECTED_STROKE };
  }
  return base;
}

export function MeshTopology() {
  const { members, user, peerConnectionStates, callState } = useStore();
  const { isInCall } = callState;

  const usersInCall = useMemo(
    () => members.filter(m => m.joinedCall || m.id === user?.id),
    [members, user]
  );

  // Group connection states by userId
  const connsByUser = useMemo(() => {
    const map = {};
    peerConnectionStates.forEach(pc => {
      if (!map[pc.userId]) map[pc.userId] = [];
      map[pc.userId].push(pc);
    });
    return map;
  }, [peerConnectionStates]);

  const SVG_SIZE = 280;
  const cx = SVG_SIZE / 2;
  const cy = SVG_SIZE / 2;

  const peers = useMemo(() => {
    const others = usersInCall.filter(m => m.id !== user?.id);
    return others.map((member, i) => {
      const angle = (2 * Math.PI * i) / (others.length || 1);
      const [x, y] = pointOnCircle(cx, cy, RING_R, angle);
      return { ...member, x, y };
    });
  }, [usersInCall, user, cx, cy]);

  const totalConns = peerConnectionStates.length;

  if (!isInCall) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-4">
        <svg className="w-12 h-12 text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        <p className="text-slate-500 text-sm">Join the call to see peer connections</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <h3 className="flex-shrink-0 text-slate-300 text-sm font-semibold mb-3 px-1">
        Mesh Topology
      </h3>

      <div className="flex-shrink-0 flex items-center justify-center">
        <svg width={SVG_SIZE} height={SVG_SIZE} className="overflow-visible">
          {peers.map(peer => {
            const conns = connsByUser[peer.id] ?? [];

            if (conns.length === 0) {
              // Peer is in call but no PC created yet
              return (
                <line
                  key={`${peer.id}-pending`}
                  x1={cx} y1={cy} x2={peer.x} y2={peer.y}
                  stroke="#334155" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.4}
                />
              );
            }

            return conns.map((pc, idx) => {
              const offset = conns.length > 1
                ? (idx - (conns.length - 1) / 2) * LINE_GAP
                : 0;
              const [lx1, ly1, lx2, ly2] = parallelLine(cx, cy, peer.x, peer.y, offset);
              const { stroke, dash, opacity } = lineStyle(pc.feedType, pc.connectionState);
              return (
                <line
                  key={`${peer.id}-${pc.feedType}`}
                  x1={lx1} y1={ly1} x2={lx2} y2={ly2}
                  stroke={stroke}
                  strokeWidth={2}
                  strokeDasharray={dash ?? undefined}
                  opacity={opacity}
                />
              );
            });
          })}

          {/* Peer nodes */}
          {peers.map(peer => {
            const conns = connsByUser[peer.id] ?? [];
            const allConnected = conns.length > 0 && conns.every(p => p.connectionState === 'connected');
            return (
              <g key={peer.id}>
                <circle
                  cx={peer.x} cy={peer.y} r={NODE_R}
                  fill="#1e293b"
                  stroke={allConnected ? '#64748b' : '#334155'}
                  strokeWidth={2}
                />
                <text
                  x={peer.x} y={peer.y}
                  textAnchor="middle" dominantBaseline="middle"
                  fill="#e2e8f0" fontSize={10} fontWeight="600"
                >
                  {peer.name.substring(0, 2).toUpperCase()}
                </text>
                <text
                  x={peer.x} y={peer.y + NODE_R + 11}
                  textAnchor="middle" fill="#94a3b8" fontSize={9}
                >
                  {peer.name.length > 10 ? peer.name.slice(0, 9) + '…' : peer.name}
                </text>
              </g>
            );
          })}

          {/* Me — centre */}
          <circle cx={cx} cy={cy} r={NODE_R} fill="#4c1d95" stroke="#8b5cf6" strokeWidth={2.5} />
          <text
            x={cx} y={cy}
            textAnchor="middle" dominantBaseline="middle"
            fill="white" fontSize={10} fontWeight="700"
          >
            {user?.name?.substring(0, 2).toUpperCase() ?? 'ME'}
          </text>
          <text x={cx} y={cy + NODE_R + 11} textAnchor="middle" fill="#a78bfa" fontSize={9} fontWeight="600">
            You
          </text>
        </svg>
      </div>

      {/* Stats */}
      <div className="flex-shrink-0 mt-2 px-1 flex justify-between text-xs text-slate-500">
        <span>{peers.length} peer{peers.length !== 1 ? 's' : ''}</span>
        <span>{totalConns} connection{totalConns !== 1 ? 's' : ''}</span>
      </div>

      {/* Legend */}
      <div className="flex-shrink-0 mt-3 px-1 space-y-1.5">
        {[
          { stroke: STATE_STYLE.connected.stroke, dash: null,    label: 'Camera — connected'    },
          { stroke: SCREENSHARE_CONNECTED_STROKE,  dash: null,    label: 'Screen — connected'    },
          { stroke: STATE_STYLE.connecting.stroke, dash: '6 3',  label: 'Connecting…'           },
          { stroke: STATE_STYLE.failed.stroke,     dash: null,    label: 'Failed'                },
        ].map(({ stroke, dash, label }) => (
          <div key={label} className="flex items-center gap-2 text-xs text-slate-400">
            <svg width={24} height={8}>
              <line
                x1={0} y1={4} x2={24} y2={4}
                stroke={stroke} strokeWidth={2}
                strokeDasharray={dash ?? undefined}
              />
            </svg>
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
