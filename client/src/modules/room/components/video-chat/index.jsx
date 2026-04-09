import { useState } from "react";
import useStore from "../../../../store";

export function VideoChat({ joinCallAutomatically = false }) {
  const {
    callState,
    updateCallState,
    localStreams,
    remoteStreams,
    roomManager,
    user,
  } = useStore();

  const { isInCall, isAudioEnabled, isVideoEnabled, joinRequestState } = callState;
  const [localStream, setLocalStream] = useState(null);

  const handleToggleAudio = () => {
    updateCallState({ isAudioEnabled: !isAudioEnabled });
  };

  const handleToggleVideo = () => {
    updateCallState({ isVideoEnabled: !isVideoEnabled });
  };

  const handleRequestCamera = async () => {
    try {
      updateCallState({ 
        joinRequestState: { isLoading: true, error: null } 
      });

      // Always request both audio and video permissions like containers/client
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      setLocalStream(stream);
      updateCallState({ 
        joinRequestState: { isLoading: false, error: null } 
      });
    } catch (error) {
      console.error("Failed to get user media:", error);
      updateCallState({ 
        joinRequestState: { 
          isLoading: false, 
          error: "Failed to access camera/microphone. Please check permissions." 
        } 
      });
    }
  };

  const handleJoinCall = () => {
    if (!roomManager) {
      console.error("Room manager not available");
      return;
    }

    updateCallState({
      isInCall: true,
      joinRequestState: { isLoading: true, error: null },
    });

    // Pass the local MediaStream so P2PMeshManager can use it immediately
    const success = roomManager.joinCall(isAudioEnabled, isVideoEnabled, localStream);
    if (!success) {
      updateCallState({
        isInCall: false,
        joinRequestState: {
          isLoading: false,
          error: "Failed to send join call request. Please check your connection.",
        },
      });
    }
  };

  const handleLeaveCall = () => {
    if (roomManager) {
      roomManager.leaveCall();
    } else {
      updateCallState({
        isInCall: false,
        joinRequestState: { isLoading: false, error: null },
      });
    }
    // Stop the pre-join preview stream if still held
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      setLocalStream(null);
    }
  };

  if (isInCall) {
    // Show joining/loading state or streams
    if (joinRequestState.isLoading) {
      return (
        <div className="h-full flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="animate-spin h-12 w-12 border-4 border-violet-500 border-t-transparent rounded-full mx-auto"></div>
            <h3 className="text-xl font-semibold text-white">Joining call...</h3>
            <p className="text-slate-400">Connecting to other participants</p>
          </div>
        </div>
      );
    }

    // Show streams
    const allStreams = [...localStreams, ...remoteStreams];
    
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 p-4">
          <div className="grid gap-4 h-full" style={{
            gridTemplateColumns: allStreams.length === 1 ? '1fr' : 
                                 allStreams.length === 2 ? 'repeat(2, 1fr)' :
                                 allStreams.length <= 4 ? 'repeat(2, 1fr)' :
                                 'repeat(3, 1fr)',
            gridTemplateRows: allStreams.length <= 2 ? '1fr' :
                             allStreams.length <= 4 ? 'repeat(2, 1fr)' :
                             'repeat(auto-fit, minmax(200px, 1fr))'
          }}>
            {allStreams.map((streamObj) => (
              <div key={streamObj.id} className="bg-slate-800 rounded-xl overflow-hidden shadow-lg flex flex-col">
                <div className="flex-1 relative">
                  {streamObj.stream ? (
                    // Show actual video stream
                    <video
                      ref={(video) => {
                        if (video && streamObj.stream) {
                          video.srcObject = streamObj.stream;
                        }
                      }}
                      autoPlay
                      playsInline
                      muted={streamObj.userId === user?.id} // Mute local streams
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    // Show spinner for streams without actual MediaStream
                    <div className="w-full h-full bg-gradient-to-br from-slate-900 to-black flex items-center justify-center">
                      <div className="text-center text-slate-300">
                        <div className="animate-spin h-8 w-8 border-2 border-violet-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                        <p className="text-sm">Loading stream...</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Stream info overlay */}
                  <div className="absolute bottom-3 left-3 flex space-x-2">
                    <div className={`px-2 py-1 rounded text-xs font-medium ${
                      streamObj.audioEnabled ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                    }`}>
                      {streamObj.audioEnabled ? 'Mic On' : 'Mic Off'}
                    </div>
                    <div className={`px-2 py-1 rounded text-xs font-medium ${
                      streamObj.videoEnabled ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                    }`}>
                      {streamObj.videoEnabled ? 'Camera On' : 'Camera Off'}
                    </div>
                    {streamObj.userId === user?.id && (
                      <div className="px-2 py-1 rounded text-xs font-medium bg-blue-600 text-white">
                        You
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {/* Show message if no streams */}
            {allStreams.length === 0 && (
              <div className="col-span-full flex items-center justify-center h-full">
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mx-auto">
                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-white">Waiting for streams...</h3>
                  <p className="text-slate-400">Connecting to participants</p>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Call controls */}
        <div className="flex-shrink-0 p-4 border-t border-slate-700">
          <div className="flex justify-center space-x-4">
            <button
              onClick={handleToggleAudio}
              className={`p-3 rounded-full transition-all duration-200 ${
                isAudioEnabled 
                  ? 'bg-slate-700 text-white hover:bg-slate-600' 
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isAudioEnabled ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-3a1 1 0 011-1h1.586l4.707-4.707C10.923 5.663 12 6.109 12 7v10c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                )}
              </svg>
            </button>

            <button
              onClick={handleToggleVideo}
              className={`p-3 rounded-full transition-all duration-200 ${
                isVideoEnabled 
                  ? 'bg-slate-700 text-white hover:bg-slate-600' 
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isVideoEnabled ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18 12M6 6l12 12" />
                )}
              </svg>
            </button>
            
            <button
              onClick={handleLeaveCall}
              className="p-3 rounded-full bg-red-600 text-white hover:bg-red-700 transition-all duration-200"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 3l1.664 1.664M21 21l-1.5-1.5m-5.485-1.242L12 17l-1.5-1.5M9 9l10.5 10.5M3.055 11H5a2 2 0 012 2v1a2 2 0 01-2 2H3.055" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!localStream) {
    // Show pre-join UI - request camera access
    return (
      <div className="h-full flex items-center justify-center">
        <div className="max-w-md w-full space-y-6 text-center">
          <div className="space-y-4">
            <div className="w-20 h-20 bg-gradient-to-br from-violet-600 to-purple-600 rounded-full mx-auto flex items-center justify-center shadow-2xl">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-white">Join Video Call</h3>
            <p className="text-slate-400">Configure your camera and microphone settings before joining</p>
          </div>

          {/* Media controls */}
          <div className="flex justify-center space-x-4">
            <button
              onClick={handleToggleAudio}
              className={`p-3 rounded-full transition-all duration-200 ${
                isAudioEnabled 
                  ? 'bg-slate-700 text-white hover:bg-slate-600' 
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isAudioEnabled ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-3a1 1 0 011-1h1.586l4.707-4.707C10.923 5.663 12 6.109 12 7v10c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                )}
              </svg>
            </button>

            <button
              onClick={handleToggleVideo}
              className={`p-3 rounded-full transition-all duration-200 ${
                isVideoEnabled 
                  ? 'bg-slate-700 text-white hover:bg-slate-600' 
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isVideoEnabled ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18 12M6 6l12 12" />
                )}
              </svg>
            </button>
          </div>

          {/* Error display */}
          {joinRequestState.error && (
            <div className="bg-red-900/50 border border-red-500/50 rounded-lg p-3">
              <p className="text-red-200 text-sm">{joinRequestState.error}</p>
            </div>
          )}

          {/* Join button */}
          <button
            onClick={handleRequestCamera}
            disabled={joinRequestState.isLoading}
            className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 disabled:from-slate-600 disabled:to-slate-600 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:cursor-not-allowed disabled:transform-none"
          >
            {joinRequestState.isLoading ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                <span>Requesting access...</span>
              </div>
            ) : (
              "Request Camera Access"
            )}
          </button>
        </div>
      </div>
    );
  }

  // Show preview with local stream and join button
  return (
    <div className="h-full flex items-center justify-center">
      <div className="max-w-md w-full space-y-6 text-center">
        <div className="space-y-4">
          <h3 className="text-2xl font-bold text-white">Ready to Join</h3>
          <p className="text-slate-400">Preview your camera and join when ready</p>
        </div>

        {/* Video preview */}
        <div className="relative bg-slate-800 rounded-xl overflow-hidden shadow-2xl">
          {/* Video disabled overlay */}
          {!isVideoEnabled && (
            <div className="w-full h-48 bg-gradient-to-br from-slate-900 to-black rounded-xl flex items-center justify-center">
              <div className="text-center text-slate-300">
                <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mb-4 mx-auto">
                  <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18 12M6 6l12 12" />
                  </svg>
                </div>
                <p className="text-sm opacity-75">Camera disabled</p>
              </div>
            </div>
          )}
          
          {/* Video element */}
          <video
            ref={(video) => {
              if (video && localStream) {
                video.srcObject = localStream;
              }
            }}
            autoPlay
            muted
            className={`${!isVideoEnabled ? 'hidden' : 'block'} w-full h-48 object-cover`}
          />
          
          {/* Status indicators */}
          <div className="absolute bottom-3 left-3 flex space-x-2">
            <div className={`px-2 py-1 rounded text-xs font-medium ${
              isAudioEnabled ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
            }`}>
              {isAudioEnabled ? 'Mic On' : 'Mic Off'}
            </div>
            <div className={`px-2 py-1 rounded text-xs font-medium ${
              isVideoEnabled ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
            }`}>
              {isVideoEnabled ? 'Camera On' : 'Camera Off'}
            </div>
          </div>
        </div>

        {/* Media controls */}
        <div className="flex justify-center space-x-4">
          <button
            onClick={handleToggleAudio}
            className={`p-3 rounded-full transition-all duration-200 ${
              isAudioEnabled 
                ? 'bg-slate-700 text-white hover:bg-slate-600' 
                : 'bg-red-600 text-white hover:bg-red-700'
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isAudioEnabled ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-3a1 1 0 011-1h1.586l4.707-4.707C10.923 5.663 12 6.109 12 7v10c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              )}
            </svg>
          </button>

          <button
            onClick={handleToggleVideo}
            className={`p-3 rounded-full transition-all duration-200 ${
              isVideoEnabled 
                ? 'bg-slate-700 text-white hover:bg-slate-600' 
                : 'bg-red-600 text-white hover:bg-red-700'
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isVideoEnabled ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18 12M6 6l12 12" />
              )}
            </svg>
          </button>
        </div>

        {/* Join call button */}
        <button
          onClick={handleJoinCall}
          className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
        >
          Join Call
        </button>
      </div>
    </div>
  );
}