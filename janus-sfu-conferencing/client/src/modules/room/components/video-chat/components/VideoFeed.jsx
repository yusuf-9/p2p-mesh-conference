import { memo, useEffect, useRef, useState } from "react";
import FeedReactions from "./FeedReactions";
import StreamStats from "./StreamStats";
import useStore from "../../../../../store";

const VideoFeed = memo(({
  videoEnabled,
  audioEnabled,
  videoStream,
  userName,
  isLocal = false,
  handRaised = false,
  isCompact = false,
  feedId = null,
  userId = null,
  isHost = false,
  onTakeScreenshot = null,
  onModerateFeed = null,
  // Simulcast props
  simulcastEnabled = false,
  simulcastResolutions = [],
  subscribedResolution = null,
  onConfigureFeed = null,
  onConfigureFeedSubscription = null
}) => {
  const videoRef = useRef(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  
  // Stats management
  const statsVisibility = useStore((state) => state.statsVisibility);
  const streamStats = useStore((state) => state.streamStats);
  const statsHistory = useStore((state) => state.statsHistory);
  const toggleStatsVisibility = useStore((state) => state.toggleStatsVisibility);
  const setStatsVisibility = useStore((state) => state.setStatsVisibility);
  const loadStatsVisibilityFromStorage = useStore((state) => state.loadStatsVisibilityFromStorage);
  
  // Simulcast configuration state
  const [showSimulcastConfig, setShowSimulcastConfig] = useState(false);
  const [tempResolutions, setTempResolutions] = useState(simulcastResolutions || []);
  const [tempSubscriptionResolution, setTempSubscriptionResolution] = useState(subscribedResolution || 'h');
  
  // Available resolutions for remote feeds (only show what the publisher is actually streaming)
  const availableResolutions = isLocal ? ['h', 'm', 'l'] : (simulcastResolutions || []);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (videoElement && videoStream) {
      videoElement.srcObject = videoStream;
      
      // For remote users, ensure audio plays even when video is disabled
      if (!isLocal) {
        videoElement.play().catch(error => {
          console.warn('Video play failed:', error);
        });
      }
    }
  }, [videoStream, isLocal]);

  // Update temp state when props change
  useEffect(() => {
    setTempResolutions(simulcastResolutions || []);
    setTempSubscriptionResolution(subscribedResolution || 'h');
  }, [simulcastResolutions, subscribedResolution]);

  // Load stats visibility from storage on mount, default to visible
  // useEffect(() => {
  //   if (feedId) {
  //     const stored = loadStatsVisibilityFromStorage(feedId);
  //     // If no stored preference exists, default to visible
  //     if (stored === null) {
  //       setStatsVisibility(feedId, true);
  //     }
  //   }
  // }, [feedId]); // Temporarily disabled

  // Simulcast configuration handlers
  const handleResolutionToggle = (resolution) => {
    if (tempResolutions.includes(resolution)) {
      setTempResolutions(tempResolutions.filter(r => r !== resolution));
    } else {
      setTempResolutions([...tempResolutions, resolution]);
    }
  };

  const handleSaveSimulcastConfig = () => {
    if (isLocal && onConfigureFeed && feedId) {
      // Simulcast is always enabled, just update resolutions
      onConfigureFeed(feedId, true, tempResolutions.length > 0 ? tempResolutions : null);
    }
    setShowSimulcastConfig(false);
    setDropdownOpen(false);
  };

  const handleSubscriptionChange = (resolution) => {
    setTempSubscriptionResolution(resolution);
    if (!isLocal && onConfigureFeedSubscription && feedId) {
      onConfigureFeedSubscription(feedId, resolution);
    }
    setDropdownOpen(false);
  };

  return (
    <div className={`relative bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 shadow-xl overflow-hidden group hover:border-violet-500/70 transition-all duration-300 rounded-lg min-h-0 ${isCompact ? "aspect-video" : "border-2 rounded-xl"}`}>
      {!videoStream ? (
        <div className="w-full h-full flex items-center justify-center bg-slate-800">
          <div className="text-center">
            <div className="w-20 h-20 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-3">
              <div className="w-8 h-8 border-4 border-slate-500 border-t-slate-300 rounded-full animate-spin"></div>
            </div>
            <p className="text-sm text-slate-400 font-medium">{userName}</p>
            <p className="text-xs text-slate-500 mt-1">Connecting...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Always render video element for audio playback, but conditionally show it */}
          <video
            ref={videoRef}
            className={`w-full h-full object-cover ${!videoEnabled ? 'invisible' : ''}`}
            autoPlay
            playsInline
            muted={isLocal} // Only mute local video to prevent feedback
            controls={false}
          />
          
          {/* Show placeholder when video is disabled but stream exists */}
          {!videoEnabled && (
            <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-slate-800">
              <div className="text-center">
                <div className="w-20 h-20 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg
                    className="w-10 h-10 text-slate-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
                <p className="text-sm text-slate-400 font-medium">{userName}</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* User label */}
      {isCompact ? (
        <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between gap-1">
          <span className="bg-black/70 text-white px-1.5 py-0.5 rounded text-xs font-medium truncate max-w-[70%] backdrop-blur-sm">
            {userName}
          </span>
          <div className="flex gap-0.5 flex-shrink-0">
            {handRaised && <span className="text-xs">✋</span>}
            {!audioEnabled && <span className="text-xs bg-red-500 rounded px-0.5">M</span>}
            {!videoEnabled && <span className="text-xs bg-orange-500 rounded px-0.5">V</span>}
          </div>
        </div>
      ) : (
        <>
          <div className="absolute bottom-3 left-3 bg-black/70 text-white px-3 py-1.5 rounded-lg text-sm font-medium backdrop-blur-sm">
            {userName}
          </div>

          {/* Status indicators */}
          <div className="absolute bottom-3 right-3 flex gap-2">
            {handRaised && (
              <div className="w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center shadow-lg border-2 border-yellow-400 animate-pulse">
                <span className="text-white text-lg">✋</span>
              </div>
            )}
            {!videoEnabled && (
              <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center shadow-lg border-2 border-orange-400">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364L5.636 5.636" />
                </svg>
              </div>
            )}
            {!audioEnabled && (
              <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center shadow-lg border-2 border-red-400">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              </div>
            )}
          </div>
        </>
      )}

      {/* 3-dot dropdown menu — hidden in compact mode */}
      {!isCompact && (!isLocal || (onTakeScreenshot && isLocal)) && (
        <div className="absolute top-3 right-3">
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="w-8 h-8 bg-black/70 hover:bg-black/90 text-white rounded-full flex items-center justify-center backdrop-blur-sm transition-colors"
              title="Options"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
            
            {dropdownOpen && (
              <div className="absolute right-0 top-10 bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-2 w-48 z-20">
                {onTakeScreenshot && (
                  <button
                    onClick={() => {
                      onTakeScreenshot(feedId, userId);
                      setDropdownOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-white hover:bg-slate-700 transition-colors text-sm flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Take Screenshot
                  </button>
                )}
                {!isLocal && isHost && onModerateFeed && (
                  <button
                    onClick={() => {
                      onModerateFeed(feedId, userId);
                      setDropdownOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-red-400 hover:bg-slate-700 transition-colors text-sm flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    Moderate Feed
                  </button>
                )}

                {/* Statistics Toggle */}
                {feedId && (
                  <>
                    {(onTakeScreenshot || (isHost && onModerateFeed)) && (
                      <div className="h-px bg-slate-600 my-2"></div>
                    )}
                    <button
                      onClick={() => {
                        toggleStatsVisibility(feedId);
                        setDropdownOpen(false);
                      }}
                      className="w-full px-4 py-2 text-left text-white hover:bg-slate-700 transition-colors text-sm flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      {statsVisibility.get(feedId) ? 'Hide Statistics' : 'Show Statistics'}
                    </button>
                  </>
                )}
                
                {/* Simulcast Options */}
                {feedId && (isLocal ? onConfigureFeed : onConfigureFeedSubscription) && (
                  <>
                    {(onTakeScreenshot || (isHost && onModerateFeed) || feedId) && (
                      <div className="h-px bg-slate-600 my-2"></div>
                    )}
                    
                    {isLocal ? (
                      // Own feed - simulcast configuration
                      <button
                        onClick={() => {
                          setShowSimulcastConfig(!showSimulcastConfig);
                        }}
                        className="w-full px-4 py-2 text-left text-white hover:bg-slate-700 transition-colors text-sm flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                        </svg>
                        Quality Settings
                      </button>
                    ) : (
                      // Other feed - subscription quality
                      <div className="px-4 py-2">
                        <div className="text-white text-sm mb-2 flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Video Quality
                        </div>
                        {availableResolutions.length > 0 ? (
                          <div className="space-y-1">
                            {availableResolutions.map(resolution => (
                              <label key={resolution} className="flex items-center space-x-2 cursor-pointer hover:bg-slate-700 rounded px-2 py-1">
                                <input
                                  type="radio"
                                  name="subscription-resolution"
                                  value={resolution}
                                  checked={tempSubscriptionResolution === resolution}
                                  onChange={() => handleSubscriptionChange(resolution)}
                                  className="text-violet-500 focus:ring-violet-500"
                                />
                                <span className="text-sm text-slate-300">
                                  {resolution === 'h' ? 'High' : resolution === 'm' ? 'Medium' : 'Low'}
                                </span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-slate-500 italic">
                            No quality options available
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Simulcast Configuration Panel for Own Feed */}
            {showSimulcastConfig && isLocal && (
              <div className="absolute right-0 top-10 bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-4 w-64 z-20">
                <div className="text-white text-sm mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                  </svg>
                  Quality Levels
                </div>
                
                <div className="mb-3">
                  <div className="text-sm text-slate-400 mb-2">Select quality levels to stream:</div>
                  <div className="space-y-1">
                    {['h', 'm', 'l'].map(resolution => (
                      <label key={resolution} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tempResolutions.includes(resolution)}
                          onChange={() => handleResolutionToggle(resolution)}
                          className="text-violet-500 focus:ring-violet-500"
                        />
                        <span className="text-sm text-slate-300">
                          {resolution === 'h' ? 'High Quality' : resolution === 'm' ? 'Medium Quality' : 'Low Quality'}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="text-xs text-slate-500 mt-2">
                    Multiple quality streams are always enabled for better viewer experience.
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleSaveSimulcastConfig}
                    className="flex-1 bg-violet-600 hover:bg-violet-700 text-white text-sm py-2 px-3 rounded transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setShowSimulcastConfig(false);
                      // Reset temp values to actual state
                      setTempResolutions(simulcastResolutions || []);
                    }}
                    className="flex-1 bg-slate-600 hover:bg-slate-700 text-white text-sm py-2 px-3 rounded transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            
            {/* Click outside to close dropdown */}
            {(dropdownOpen || showSimulcastConfig) && (
              <div
                className="fixed inset-0 z-10"
                onClick={() => {
                  setDropdownOpen(false);
                  setShowSimulcastConfig(false);
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Reactions for this feed */}
      <FeedReactions feedId={feedId} />

      {/* Stream Statistics Overlay — hidden by default, toggled via 3-dot menu */}
      {feedId && statsVisibility.get(feedId) && (
        <StreamStats
          feedId={feedId}
          stats={streamStats.get(feedId)}
          statsHistory={statsHistory.get(feedId) || []}
          isLocal={isLocal}
          className="absolute top-3 left-3 z-10"
        />
      )}
    </div>
  )
});

export default VideoFeed;