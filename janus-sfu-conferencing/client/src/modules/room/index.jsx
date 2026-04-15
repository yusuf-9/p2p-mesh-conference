import { RoomLoader } from './components/RoomLoader';
import useStore from '../../store';
import { ChatMessages } from './components/chat-messages';
import { VideoChat } from './components/video-chat';

function Room({ roomParams }) {
  const {
    room,
    user,
    userToken,
    members,
    roomLoadingStatus,
    roomManager,
  } = useStore();

  const isConnecting = roomLoadingStatus.step !== "connected-to-socket" && !roomLoadingStatus.error;

  // Handle leave room
  const handleLeaveRoom = async () => {
    try {
      if (!roomManager || !room || !userToken) {
        console.error("❌ Missing required data for leaving room");
        return;
      }

      console.log("🚪 Leaving room...");
      await roomManager.leaveRoom(room.id, userToken);
      
      // Redirect to root path and refresh
      window.location.href = '/';
    } catch (error) {
      console.error("❌ Failed to leave room:", error);
      alert("Failed to leave room: " + error.message);
    }
  };

  // Loading state
  if (isConnecting) {
    return (
      <>
        <RoomLoader roomParams={roomParams} />
        <div className="w-full max-w-7xl mx-auto">
          <div className="flex justify-center items-center h-screen">
            <div className="flex flex-col items-center">
              <div className="flex flex-col items-center">
                <div className="w-10 h-10 border-4 border-slate-500 border-t-slate-300 rounded-full animate-spin"></div>
                <p className="text-slate-300 font-medium text-lg mt-4">
                  {roomParams.mode === 'create' ? 'Creating and joining room...' : 'Joining room...'}
                </p>
                <p className="text-slate-400 font-normal text-sm mt-1">{roomLoadingStatus.step.split("-").join(" ")}</p>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Error state
  if (roomLoadingStatus.error) {
    return (
      <div className="w-full max-w-7xl mx-auto">
        <div className="flex justify-center items-center h-screen">
          <div className="flex flex-col items-center">
            <div className="flex flex-col items-center">
              <p className="text-red-400 font-bold text-lg mt-4">Error joining room</p>
              <p className="text-red-400 font-normal text-sm mt-1">{roomLoadingStatus.error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Connected state - show room UI
  if (!room || !user) {
    return (
      <div className="w-full max-w-7xl mx-auto">
        <div className="flex justify-center items-center h-screen">
          <div className="text-red-400">Room data not loaded</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col mx-auto px-4 py-2">
      {/* Room header */}
      <div className="flex-shrink-0 mb-2">
        <div className="flex items-center gap-4 mb-2">
          <h1 className="text-2xl font-bold text-white">Room: {room.name}</h1>
          <div className="flex items-center gap-2 bg-slate-800/60 rounded-lg px-3 py-1.5 border border-slate-600/50">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m2 0v10a2 2 0 01-2 2H7a2 2 0 01-2-2V9a2 2 0 012-2m8 0V7a2 2 0 00-2-2H9a2 2 0 00-2 2v2m8 0h2m-2 0a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V9a2 2 0 012-2h2m8 0V7a2 2 0 00-2-2H9a2 2 0 00-2 2v2" />
            </svg>
            <span className="text-slate-300 text-sm font-medium">ID:</span>
            <code className="text-violet-400 text-sm font-mono bg-slate-900/50 px-2 py-0.5 rounded border border-slate-700">
              {room.id}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(room.id)}
              className="text-slate-400 hover:text-violet-400 transition-colors p-1 rounded hover:bg-slate-700/50"
              title="Copy Room ID"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              onClick={() => {
                const shareUrl = `${window.location.origin}${window.location.pathname}?room_id=${room.id}`;
                navigator.clipboard.writeText(shareUrl);
                // Could add toast notification here
                console.log("🔗 Room link copied to clipboard:", shareUrl);
              }}
              className="text-slate-400 hover:text-blue-400 transition-colors p-1 rounded hover:bg-slate-700/50"
              title="Share Room Link"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
              </svg>
            </button>
            <button
              onClick={handleLeaveRoom}
              className="text-slate-400 hover:text-red-400 transition-colors p-1 rounded hover:bg-slate-700/50"
              title="Leave Room"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
        {room.description && (
          <p className="text-slate-400 text-sm mb-2">{room.description}</p>
        )}

        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-300">Participants ({members.length})</h2>
          <div className="flex flex-wrap items-center gap-3">
            {members.map(member => (
              <div
                key={member.id}
                className="flex items-center gap-2 bg-slate-800/60 rounded-lg px-3 py-2"
              >
                <div className={`flex bg-indigo-600 items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${!member.connected && "opacity-50"
                  }`}
                  title={`${member.name}${!member.connected ? " (disconnected)" : ""}`}
                >
                  {member.name.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex flex-col">
                  <p className={`text-slate-300 ${!member.connected && 'opacity-50'}`}>{member.name}</p>
                  {member.isHost && <p className="text-green-500 text-[10px]">Host</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 bg-slate-700/60 backdrop-blur-sm rounded-2xl border border-slate-600/60 shadow-2xl overflow-hidden">
        <div className="flex h-full">
          {/* Left column - Video chat */}
          <div className="flex-1 p-4 h-full">
            <VideoChat joinCallAutomatically={roomParams?.joinCallAutomatically} />
          </div>

          {/* Divider */}
          <div className="w-px bg-gradient-to-b from-slate-500/60 via-slate-400/60 to-slate-500/60"></div>

          {/* Right column - Chat messages */}
          <div className="w-80 p-4 h-full">
            <ChatMessages />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Room;
