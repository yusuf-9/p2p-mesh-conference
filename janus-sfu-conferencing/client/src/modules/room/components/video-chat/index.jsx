import { useEffect } from "react";
import useStore from "../../../../store";
import { EVENTS } from "../../constants";
import Prompt from "./components/Prompt";
import RequestCamera from "./components/RequestCamera";
import VideoFeed from "./components/VideoFeed";
import Notifications from "./components/Notifications";

export function VideoChat({ joinCallAutomatically = false }) {
  const {
    members,
    roomManager,
    user,
    localFeeds,
    remoteFeeds,
    conferenceState,
    updateConferenceState,
    addLocalFeed,
    updateLocalFeed,
    addReaction,
    addNotification,
  } = useStore();

  const isHost = user?.isHost || false;

  // Get primary local feed for controls
  const primaryLocalFeed = localFeeds.find(f => f.feedType === "camera") || localFeeds[0];
  const screenFeed = localFeeds.find(f => f.feedType === "screenshare");
  const isAudioEnabled = primaryLocalFeed?.audioEnabled ?? true;
  const isVideoEnabled = primaryLocalFeed?.videoEnabled ?? true;
  const isScreenSharing = !!screenFeed;

  // Conference functions
  const joinCall = (stream, audioEnabled, videoEnabled) => {
    if (!stream || !roomManager) {
      console.error("Missing stream or room manager");
      return;
    }

    updateConferenceState({
      step: "joined",
      joinRequestState: { isLoading: true, error: null }
    });

    // Store the stream temporarily in room manager for WebRTC setup
    roomManager.tempLocalStream = stream;

    // Create local feed with null feedId initially
    const localFeed = {
      id: `local-temp-${Date.now()}`,
      feedId: null, // Will be updated when server responds
      userId: user?.id,
      feedType: "camera",
      audioEnabled,
      videoEnabled,
      handRaised: false,
      stream,
      isLocal: true,
      userName: "You"
    };

    addLocalFeed(localFeed);

    // Join via room manager
    roomManager.joinConferenceAsPublisher({
      feedType: "camera",
      audio: audioEnabled,
      video: videoEnabled
    });
  };

  const handleAudioToggle = () => {
    if (primaryLocalFeed && primaryLocalFeed.feedId && roomManager) {
      const newAudioState = !isAudioEnabled;
      roomManager.sendMessage(EVENTS.TOGGLE_MEDIA_STREAM, {
        feedId: primaryLocalFeed.feedId,
        audio: newAudioState,
        video: isVideoEnabled
      });
      // Optimistically update local state
      updateLocalFeed(primaryLocalFeed.feedId, {
        audioEnabled: newAudioState
      });
    }
  };

  const handleVideoToggle = () => {
    if (primaryLocalFeed && primaryLocalFeed.feedId && roomManager) {
      const newVideoState = !isVideoEnabled;
      roomManager.sendMessage(EVENTS.TOGGLE_MEDIA_STREAM, {
        feedId: primaryLocalFeed.feedId,
        audio: isAudioEnabled,
        video: newVideoState
      });
      // Optimistically update local state
      updateLocalFeed(primaryLocalFeed.feedId, {
        videoEnabled: newVideoState
      });
    }
  };

  const handleScreenShare = async () => {
    try {
      // Get screen sharing stream
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      console.log("🖥️ Screen share stream obtained:", screenStream);

      // Store the screen stream temporarily in room manager
      roomManager.tempScreenStream = screenStream;

      // Create local screen share feed
      const screenFeed = {
        id: `local-screen-${Date.now()}`,
        feedId: null, // Will be updated when server responds
        userId: user?.id,
        feedType: "screenshare",
        audioEnabled: true,
        videoEnabled: true,
        handRaised: false,
        stream: screenStream,
        isLocal: true,
        userName: "Your Screen"
      };

      addLocalFeed(screenFeed);

      // Join conference as publisher with screen share
      roomManager.joinConferenceAsPublisher({
        feedType: "screenshare",
        audio: true,
        video: true
      });

      // Handle screen share ended (when user stops sharing from browser)
      screenStream.getVideoTracks()[0].onended = () => {
        console.log("🖥️ Screen share ended by user");
        handleStopScreenShare();
      };

    } catch (error) {
      console.error("❌ Failed to start screen share:", error);
    }
  };

  const handleStopScreenShare = () => {
    // Find screen share feed
    const screenFeed = localFeeds.find(feed => feed.feedType === "screenshare");
    if (screenFeed) {
      // Stop the stream
      if (screenFeed.stream) {
        screenFeed.stream.getTracks().forEach(track => {
          track.stop();
          console.log(`🛑 Stopped screen share ${track.kind} track`);
        });
      }

      // Unpublish the feed if it has a feedId
      if (screenFeed.feedId && roomManager) {
        roomManager.unpublishFeed(screenFeed.feedId);
      }
    }
  };

  const handleLeaveCall = () => {
    // Stop local media streams before leaving
    localFeeds.forEach(feed => {
      if (feed.stream) {
        feed.stream.getTracks().forEach(track => {
          track.stop();
          console.log(`🛑 Stopped ${track.kind} track`);
        });
      }
    });

    // Call room manager to leave conference
    if (roomManager) {
      roomManager.leaveConference();
    }

    // Note: Conference state cleanup will be handled by handleLeftConference when server responds
  };

  // Function to get member name by user ID
  const getMemberNameByUserId = (userId) => {
    const member = members.find(m => m.id === userId);
    return member ? member.name : `User ${userId}`;
  };

  // Handle screenshot capture
  const handleTakeScreenshot = async (feedId, userId) => {
    if (roomManager) {
      try {
        // Send screenshot notification to room
        await roomManager.sendScreenshotNotification({
          feedId,
          userId,
          timestamp: Date.now()
        });
        console.log(`📸 Screenshot notification sent for ${getMemberNameByUserId(userId)}`);

        // Show notification
        addNotification({
          type: 'screenshot',
          title: 'Screenshot Captured',
          message: `Screenshot of ${getMemberNameByUserId(userId)} has been taken`,
          timestamp: Date.now()
        });

        // TODO: Implement actual screenshot capture using canvas
      } catch (error) {
        console.error('Failed to send screenshot notification:', error);
      }
    }
  };

  // Handle feed moderation
  const handleModerateFeed = async (feedId, userId) => {
    if (roomManager && isHost) {
      try {
        await roomManager.moderateFeed(feedId);
        console.log(`🔨 Moderated feed for ${getMemberNameByUserId(userId)}`);

        // Show notification
        addNotification({
          type: 'moderation',
          title: 'Feed Moderated',
          message: `${getMemberNameByUserId(userId)}'s feed has been moderated`,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('Failed to moderate feed:', error);
        addNotification({
          type: 'warning',
          title: 'Moderation Failed',
          message: `Failed to moderate ${getMemberNameByUserId(userId)}'s feed`,
          timestamp: Date.now()
        });
      }
    }
  };

  // Handle simulcast configuration for own feeds
  const handleConfigureFeed = async (feedId, simulcast, resolutions) => {
    if (roomManager) {
      try {
        await roomManager.configureFeed(feedId, simulcast, resolutions);
        console.log(`⚙️ Configured feed ${feedId}:`, { simulcast, resolutions });
        
        addNotification({
          type: 'success',
          title: 'Feed Configured',
          message: simulcast ? 'Multiple quality streams enabled' : 'Single stream mode enabled',
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('Failed to configure feed:', error);
        addNotification({
          type: 'warning',
          title: 'Configuration Failed',
          message: 'Failed to update feed settings',
          timestamp: Date.now()
        });
      }
    }
  };

  // Handle subscription quality configuration for other feeds
  const handleConfigureFeedSubscription = async (feedId, resolution) => {
    if (roomManager) {
      try {
        await roomManager.configureFeedSubscription(feedId, resolution);
        console.log(`📺 Configured subscription to feed ${feedId}:`, { resolution });
        
        addNotification({
          type: 'success',
          title: 'Subscription Updated',
          message: `Switched to ${resolution === 'h' ? 'high' : resolution === 'm' ? 'medium' : 'low'} quality`,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('Failed to configure feed subscription:', error);
        addNotification({
          type: 'warning',
          title: 'Configuration Failed',
          message: 'Failed to update video quality',
          timestamp: Date.now()
        });
      }
    }
  };

  const leaveCallAndReset = () => {
    handleLeaveCall();
  };

  // Auto-join logic for URL-based room joins
  useEffect(() => {
    if (joinCallAutomatically && conferenceState.step === "pending") {
      console.log("🔗 Auto-joining call from shared link");
      updateConferenceState({ step: "requesting-camera-access" });
    }
  }, [joinCallAutomatically, conferenceState.step, updateConferenceState]);

  // Automatic stats monitoring lifecycle - with delay to avoid connection issues
  useEffect(() => {
    if (!roomManager || conferenceState.step !== "joined") return;

    const startMonitoringTimer = setTimeout(() => {
      // Start monitoring for local feeds
      localFeeds.forEach(feed => {
        if (feed.feedId && feed.stream) {
          roomManager.startStatsMonitoring(feed.feedId, true);
        }
      });

      // Start monitoring for remote feeds
      remoteFeeds.forEach(feed => {
        if (feed.feedId && feed.stream) {
          roomManager.startStatsMonitoring(feed.feedId, false);
        }
      });
    }, 3000); // Wait 3 seconds after joining before starting stats

    return () => {
      clearTimeout(startMonitoringTimer);
    };
  }, [localFeeds, remoteFeeds, roomManager, conferenceState.step]);

  // Stop all stats monitoring when leaving conference
  useEffect(() => {
    if (conferenceState.step === "pending" && roomManager) {
      roomManager.stopAllStatsMonitoring();
    }
  }, [conferenceState.step, roomManager]);

  // Render based on conference state
  if (conferenceState.step === "pending") {
    return (
      <>
        <Notifications />
        <Prompt onStart={() => updateConferenceState({ step: "requesting-camera-access" })} />
      </>
    );
  }

  if (conferenceState.step === "requesting-camera-access") {
    return (
      <>
        <Notifications />
        <RequestCamera
          onJoin={(stream, audioEnabled, videoEnabled) => joinCall(stream, audioEnabled, videoEnabled)}
          membersInCall={members.filter(m => m.joinedCall).length}
          isLoading={conferenceState.joinRequestState.isLoading}
          error={conferenceState.joinRequestState.error}
        />
      </>
    );
  }

  const allFeeds = [...localFeeds, ...remoteFeeds];
  const totalParticipants = allFeeds.length;
  const isCompact = totalParticipants > 6;

  const getGridClass = (count) => {
    if (count <= 1)  return "h-full grid-cols-1";
    if (count <= 2)  return "h-full grid-cols-2";
    if (count <= 4)  return "h-full grid-cols-2";
    if (count <= 6)  return "h-full grid-cols-3";
    // Compact scrollable grid — no fixed rows, tiles use aspect-video
    if (count <= 12) return "content-start grid-cols-4";
    if (count <= 20) return "content-start grid-cols-5";
    if (count <= 30) return "content-start grid-cols-6";
    return           "content-start grid-cols-7";
  };

  return (
    <div className="h-full flex flex-col">
      {/* Notifications */}
      <Notifications />

      {/* Video Grid */}
      <div className={`flex-1 min-h-0 relative ${isCompact ? "overflow-y-auto" : ""}`}>
        {/* Main video area */}
        <div
          className={`grid p-2 ${isCompact ? "gap-1" : "gap-3 h-full"} ${getGridClass(totalParticipants)}`}
        >
          {/* Render all feeds */}
          {allFeeds.map((feed) => (
            <VideoFeed
              key={`${feed.isLocal ? 'local' : 'remote'}-${feed.feedId}`}
              audioEnabled={feed.audioEnabled}
              videoEnabled={feed.videoEnabled}
              videoStream={feed.stream}
              userName={feed.isLocal ? (feed.feedType === "screenshare" ? "Your Screen" : "You") : getMemberNameByUserId(feed.userId)}
              isLocal={feed.isLocal}
              handRaised={feed.handRaised}
              feedType={feed.feedType}
              isCompact={isCompact}
              feedId={feed.feedId}
              userId={feed.userId}
              isHost={isHost}
              onTakeScreenshot={handleTakeScreenshot}
              onModerateFeed={handleModerateFeed}
              // Simulcast props
              simulcastEnabled={feed.simulcastEnabled || false}
              simulcastResolutions={feed.simulcastResolutions || []}
              subscribedResolution={feed.subscribedResolution || null}
              onConfigureFeed={handleConfigureFeed}
              onConfigureFeedSubscription={handleConfigureFeedSubscription}
            />
          ))}

          {/* Show placeholder if no feeds */}
          {totalParticipants === 0 && (
            <div className="flex items-center justify-center h-full bg-slate-800/50 rounded-xl">
              <div className="text-center text-slate-400">
                <p className="text-lg font-medium">No active feeds</p>
                <p className="text-sm">Join the call to start video</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Control Panel */}
      <div className="flex-shrink-0 bg-gradient-to-r from-slate-900/95 to-slate-800/95 border-t border-slate-700/50 p-6 backdrop-blur-sm">
        <div className="flex justify-center items-center gap-6 max-w-md mx-auto">
          {/* Mute/Unmute Button */}
          <button
            onClick={handleAudioToggle}
            className={`group relative flex items-center justify-center w-14 h-14 rounded-full transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 ${!isAudioEnabled
              ? "bg-red-600 hover:bg-red-700 text-white ring-2 ring-red-500/50"
              : "bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white ring-2 ring-slate-600/50"
              }`}
            title={!isAudioEnabled ? "Unmute" : "Mute"}
          >
            {!isAudioEnabled ? (
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                />
              </svg>
            ) : (
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0-11V3"
                />
              </svg>
            )}
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          </button>

          {/* Video Toggle Button */}
          <button
            onClick={handleVideoToggle}
            className={`group relative flex items-center justify-center w-14 h-14 rounded-full transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 ${!isVideoEnabled
              ? "bg-orange-600 hover:bg-orange-700 text-white ring-2 ring-orange-500/50"
              : "bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white ring-2 ring-slate-600/50"
              }`}
            title={isVideoEnabled ? "Hide Video" : "Show Video"}
          >
            {isVideoEnabled ? (
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            ) : (
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18.364 18.364L5.636 5.636"
                />
              </svg>
            )}
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          </button>

          {/* Screen Share Button */}
          <button
            onClick={isScreenSharing ? handleStopScreenShare : handleScreenShare}
            className={`group relative flex items-center justify-center w-14 h-14 rounded-full transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 ${isScreenSharing
              ? "bg-blue-600 hover:bg-blue-700 text-white ring-2 ring-blue-500/50"
              : "bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white ring-2 ring-slate-600/50"
              }`}
            title={isScreenSharing ? "Stop Screen Share" : "Share Screen"}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
              {isScreenSharing && (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18.364 18.364L5.636 5.636"
                />
              )}
            </svg>
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          </button>

          {/* Hand Raise Button */}
          {primaryLocalFeed && primaryLocalFeed.feedId && (
            <button
              onClick={async () => {
                if (!primaryLocalFeed || !primaryLocalFeed.feedId || !roomManager) return;

                try {
                  if (primaryLocalFeed.handRaised) {
                    roomManager.lowerHand(primaryLocalFeed.feedId);
                    updateLocalFeed(primaryLocalFeed.feedId, { handRaised: false });
                  } else {
                    roomManager.raiseHand(primaryLocalFeed.feedId);
                    updateLocalFeed(primaryLocalFeed.feedId, { handRaised: true });
                  }
                } catch (error) {
                  console.error("Failed to toggle hand:", error);
                }
              }}
              className={`group relative flex items-center justify-center w-14 h-14 rounded-full transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 ${primaryLocalFeed.handRaised
                ? "bg-yellow-600 hover:bg-yellow-700 text-white ring-2 ring-yellow-500/50"
                : "bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white ring-2 ring-slate-600/50"
                }`}
              title={primaryLocalFeed.handRaised ? "Lower Hand" : "Raise Hand"}
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 113 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3M4 15.5v2a7.5 7.5 0 0015 0v-2"
                />
              </svg>
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </button>
          )}

          {/* Reaction Button */}
          <button
            onClick={() => {
              const reactions = ["😊", "👍", "❤️", "😂", "👏"];
              const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];

              if (roomManager) {
                roomManager.sendReaction(randomReaction);
              }

              // Also add locally for immediate feedback
              addReaction({
                emoji: randomReaction,
                userId: user?.id,
                feedId: primaryLocalFeed?.feedId,
                timestamp: Date.now()
              });
            }}
            className="group relative flex items-center justify-center w-14 h-14 rounded-full bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white ring-2 ring-slate-600/50 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
            title="Send Reaction"
          >
            <span className="text-xl">😊</span>
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          </button>

          {/* Leave Call Button */}
          <button
            onClick={leaveCallAndReset}
            className="group relative flex items-center justify-center w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 text-white transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 ring-2 ring-red-500/50"
            title="Leave Call"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          </button>
        </div>
      </div>
    </div>
  );
}
