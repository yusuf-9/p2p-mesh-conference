import { useCallback, useEffect, useRef, useState } from "react";

function RequestCamera({
  onJoin,
  membersInCall,
  isLoading,
  error
}) {
  const [streamState, setStreamState] = useState({
    error: null,
    streamLoaded: false,
  });
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const videoRef = useRef(null);

  const requestCameraAccess = useCallback(async () => {
    try {
      if (!videoRef.current) return;

      // Always request both audio and video permissions
      const videoStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,    // optional: reduce feedback and echoes
          noiseSuppression: true,    // optional: reduce background noise
          autoGainControl: true,     // optional: stabilize volume
          sampleRate: 48000,         // ideal sample rate (used by WebRTC and pro apps)
          sampleSize: 16,            // 16-bit is standard for decent quality
          channelCount: 2,           // 2 channels = stereo; 1 for mono
        },
        video: {
          width: { ideal: 1980 },
          height: { ideal: 1080 }
        }
      });

      videoRef.current.srcObject = videoStream;
      setStreamState(prev => ({
        ...prev,
        streamLoaded: true,
      }));
      // Pass the stream to the parent via onJoin callback
      // This will be handled when user clicks Join
    } catch (error) {
      setStreamState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : "Something went wrong.",
      }));
    }
  }, []);

  useEffect(() => {
    requestCameraAccess();
  }, [requestCameraAccess]);

  return (
    <div className="h-full p-8">
      <div className="max-w-4xl mx-auto h-full flex flex-col items-center justify-center">
        {/* Header Section */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-100 mb-2">Ready to join?</h1>
          <p className="text-gray-400">Set up your camera and audio before joining the call</p>
        </div>

        {/* Main Content */}
        <div className="flex flex-col lg:flex-row items-center justify-center gap-12 w-full">
          {/* Video Preview Section */}
          <div className="flex-1 max-w-md">
            <div className="bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-700">
              {/* Video Container */}
              <div className="relative mb-6">
                {!streamState.streamLoaded && (
                  <div className="aspect-video bg-gradient-to-br from-gray-900 to-black rounded-xl flex items-center justify-center">
                    <div className="text-center text-gray-300">
                      <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4 mx-auto">
                        <span className="text-2xl">📹</span>
                      </div>
                      <p className="text-sm opacity-75">Loading camera...</p>
                    </div>
                  </div>
                )}
                {streamState.streamLoaded && !videoEnabled && (
                  <div className="aspect-video bg-gradient-to-br from-gray-900 to-black rounded-xl flex items-center justify-center">
                    <div className="text-center text-gray-300">
                      <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4 mx-auto">
                        <span className="text-2xl">📷</span>
                      </div>
                      <p className="text-sm opacity-75">Camera disabled</p>
                    </div>
                  </div>
                )}
                <video
                  id="videoPlayer"
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`${!streamState.streamLoaded || !videoEnabled ? "hidden" : "block"
                    } w-full aspect-video rounded-xl object-cover shadow-lg`}
                >
                  Your browser does not support the video element.
                </video>
              </div>

              {/* Control Buttons */}
              <div className="flex justify-center gap-4 mb-4">
                <button
                  onClick={() => setVideoEnabled(!videoEnabled)}
                  className={`p-3 rounded-full transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 ${videoEnabled
                    ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                    : "bg-red-600 hover:bg-red-700 text-white"
                    }`}
                  title={videoEnabled ? "Disable video" : "Enable video"}
                >
                  <span className="text-lg">{videoEnabled ? "📹" : "📷"}</span>
                </button>
                <button
                  onClick={() => setAudioEnabled(!audioEnabled)}
                  className={`p-3 rounded-full transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 ${audioEnabled
                    ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                    : "bg-red-600 hover:bg-red-700 text-white"
                    }`}
                  title={audioEnabled ? "Disable audio" : "Enable audio"}
                >
                  <span className="text-lg">{audioEnabled ? "🎤" : "🔇"}</span>
                </button>
              </div>

              {/* Error Section */}
              {(streamState.error || error) && (
                <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-4">
                  <div className="flex items-center mb-2">
                    <span className="text-red-400 mr-2">⚠️</span>
                    <h3 className="text-red-200 font-semibold text-sm">
                      {streamState.error ? "Camera Access Failed" : "Error"}
                    </h3>
                  </div>
                  <p className="text-red-300 text-sm mb-3">{streamState.error || error}</p>
                  <button
                    onClick={requestCameraAccess}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Join Section */}
          <div className="flex-1 max-w-sm">
            <div className="bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-700 text-center">
              <div className="mb-6">
                <div className="w-20 h-20 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl text-white">🎥</span>
                </div>
                <h2 className="text-xl font-bold text-gray-100 mb-2" >Join Conference</h2>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  <span>
                    {membersInCall} {membersInCall === 1 ? "person" : "people"} in call
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  // Get the current stream from the video element
                  const stream = videoRef.current?.srcObject;
                  if (stream) {
                    onJoin(stream, audioEnabled, videoEnabled);
                  }
                }}
                id="join-call-btn"
                disabled={isLoading || !streamState.streamLoaded}
                className={`group relative w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-1 ${isLoading ? "opacity-50 cursor-not-allowed" : ""
                  }`}
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  <span>{isLoading ? "Joining..." : "Join Now"}</span>
                  {!isLoading && (
                    <span className="transform group-hover:translate-x-1 transition-transform duration-200">→</span>
                  )}
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-xl blur opacity-30 group-hover:opacity-50 transition-opacity"></div>
              </button>

              <p className="text-xs text-gray-500 mt-4">Make sure your camera and microphone are working properly</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            Having trouble? Check your browser permissions for camera and microphone access.
          </p>
        </div>
      </div>
    </div>
  );
}

export default RequestCamera;
