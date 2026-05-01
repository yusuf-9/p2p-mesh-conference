import { EVENTS } from '../constants';
import useStore from '../../../store';
import { PeerMetrics } from '@peermetrics/sdk';

class RoomManager {
  constructor() {
    // ============================================================================
    // 🎚️ SIMULCAST TOGGLE - Easy Testing Configuration
    // ============================================================================
    // Comment/uncomment ONE of the lines below to disable/enable simulcast:

    this.ENABLE_SIMULCAST = true;   // ← SIMULCAST ENABLED (comment this to disable)
    // this.ENABLE_SIMULCAST = false;  // ← SIMULCAST DISABLED (uncomment this to disable)

    // ============================================================================

    this.webSocket = null;
    this.pendingMessages = new Map(); // Track pending messages by temp ID
    this.simulcastMonitors = new Map(); // Track simulcast monitoring intervals
    this.videoTransceiver = null; // Store reference to video transceiver for simulcast control
    this.simulcastDebugMode = false; // Enable/disable detailed simulcast logging

    this.peerMetrics = null;
    this.peerMetricsReady = null;
    this.forceRelayIce = window.location.search.includes('forceRelayIce');
    console.log('🔌 Relay ICE:', this.forceRelayIce);
    this.iceServers = null;
  }

  async initializePeerMetrics(userId, conferenceId) {
    if (this.peerMetrics) return;
    this.peerMetrics = new PeerMetrics({
      apiKey: import.meta.env.VITE_PEERMETRICS_API_KEY,
      userId: String(userId),
      conferenceId: String(conferenceId),
      apiRoot: import.meta.env.VITE_PEERMETRICS_API_ROOT || 'http://localhost:8081/v1',
    });
    this.peerMetricsReady = this.peerMetrics.initialize();
    return this.peerMetricsReady;
  }

  async _addPeerMetricsConnection(pc, peerId) {
    try {
      await this.peerMetricsReady;
      await this.peerMetrics?.addConnection({ pc, peerId });
    } catch (e) {
      console.warn('[peermetrics] addConnection failed:', e);
    }
  }

  async connectToWebSocket(userToken) {
    return new Promise((resolve, reject) => {
      try {
        // Construct WebSocket URL with query parameters for authentication
        const baseUrl = import.meta.env.VITE_WS_URL.replace(/^http/, 'ws');
        const wsUrl = `${baseUrl}/api/socket/?access_token=${encodeURIComponent(userToken)}`;

        console.log("🔌 Connecting to WebSocket:", wsUrl.replace(/access_token=[^&]+/, 'access_token=***'));

        const ws = new WebSocket(wsUrl);

        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error("WebSocket connection timed out after 10 seconds"));
        }, 10000);

        ws.onopen = () => {
          clearTimeout(timeout);
          console.log("✅ WebSocket connected successfully");
          this.webSocket = ws;
          resolve(ws);
        };

        ws.onerror = (error) => {
          clearTimeout(timeout);
          console.error("❌ WebSocket error:", error);
          reject(new Error("Failed to connect to WebSocket"));
        };

        ws.onclose = (event) => {
          clearTimeout(timeout);
          console.log(`🔌 WebSocket closed: ${event.code} - ${event.reason}`);
          this.webSocket = null;
        };

        ws.onmessage = (event) => {
          this.handleWebSocketMessage(event);
        };

      } catch (error) {
        console.error("❌ Error creating WebSocket connection:", error);
        reject(error);
      }
    });
  }

  handleWebSocketMessage(event) {
    try {
      const message = JSON.parse(event.data);
      console.log("📨 WebSocket message received:", message);

      // Handle different message types
      this.routeMessage(message);
    } catch (error) {
      console.error("❌ Failed to parse WebSocket message:", error);
    }
  }

  routeMessage(message) {
    console.log(`🔄 Routing message:`, { type: message.type });

    switch (message.type) {
      // Connection events
      case EVENTS.CONNECTED:
        this.handleConnected(message.data);
        break;
      case EVENTS.ERROR:
        this.handleError(message.data);
        break;
      case EVENTS.PONG:
        this.handlePong(message.data);
        break;

      // Room events
      case EVENTS.USER_CONNECTED:
        this.handleUserConnected(message.data);
        break;
      case EVENTS.USER_DISCONNECTED:
        this.handleUserDisconnected(message.data);
        break;
      case EVENTS.USER_JOINED_ROOM:
        this.handleUserJoinedRoom(message.data);
        break;
      case EVENTS.USER_LEFT_ROOM:
        this.handleUserLeftRoom(message.data);
        break;

      // Chat events
      case EVENTS.MESSAGE_SENT:
        this.handleMessageSent(message.data);
        break;
      case EVENTS.MESSAGE_RECEIVED:
        this.handleMessageReceived(message.data);
        break;

      // Media/Conference events
      case EVENTS.JOINED_CONFERENCE_AS_PUBLISHER:
        this.handleJoinedConferenceAsPublisher(message.data);
        break;
      case EVENTS.PUBLISHER_WEBRTC_CONNECTION_ESTABLISHED:
        this.handlePublisherWebRTCConnectionEstablished(message.data);
        break;
      case EVENTS.SUBSCRIBER_WEBRTC_CONNECTION_ESTABLISHED:
        this.handleSubscriberWebRTCConnectionEstablished(message.data);
        break;
      case EVENTS.RECEIVE_ANSWER_FOR_PUBLISHING:
        this.handleReceiveAnswerForPublishing(message.data);
        break;
      case EVENTS.SUBSCRIBED_TO_USER_FEED:
        this.handleSubscribedToUserFeed(message.data);
        break;
      case EVENTS.PUBLISHER_LIST:
        this.handlePublisherList(message.data);
        break;
      case EVENTS.PUBLISHER_JOINED_CONFERENCE:
        this.handlePublisherJoinedConference(message.data);
        break;
      case EVENTS.USER_JOINED_CALL:
        this.handleUserJoinedCall(message.data);
        break;
      case EVENTS.USER_LEFT_CALL:
        this.handleUserLeftCall(message.data);
        break;
      case EVENTS.MEDIA_STREAM_TOGGLED:
        this.handleMediaStreamToggled(message.data);
        break;
      case EVENTS.PUBLISHER_TOGGLED_MEDIA_STREAM:
        this.handlePublisherToggledMediaStream(message.data);
        break;
      case EVENTS.FEED_UNPUBLISHED:
        this.handleFeedUnpublished(message.data);
        break;
      case EVENTS.PUBLISHER_UNPUBLISHED_FEED:
        this.handlePublisherUnpublishedFeed(message.data);
        break;
      case EVENTS.LEFT_CONFERENCE:
        this.handleLeftConference(message.data);
        break;
      case EVENTS.USER_LEFT_CONFERENCE:
        this.handleUserLeftConference(message.data);
        break;

      // Interaction events
      case EVENTS.SCREENSHOT_TAKEN:
        this.handleScreenshotTaken(message.data);
        break;
      case EVENTS.SCREENSHOT_TAKEN_BY_USER:
        this.handleScreenshotTakenByUser(message.data);
        break;
      case EVENTS.REACTION_SENT:
        this.handleReactionSent(message.data);
        break;
      case EVENTS.REACTION_RECEIVED:
        this.handleReactionReceived(message.data);
        break;
      case EVENTS.HAND_RAISED:
        this.handleHandRaised(message.data);
        break;
      case EVENTS.HAND_RAISED_BY_USER:
        this.handleHandRaisedByUser(message.data);
        break;
      case EVENTS.HAND_LOWERED:
        this.handleHandLowered(message.data);
        break;
      case EVENTS.HAND_LOWERED_BY_USER:
        this.handleHandLoweredByUser(message.data);
        break;

      // Moderation events
      case EVENTS.FEED_MODERATED:
        this.handleFeedModerated(message.data);
        break;
      case EVENTS.FEED_MODERATED_BY_HOST:
        this.handleFeedModeratedByHost(message.data);
        break;
      case EVENTS.MODERATION_SUCCESS:
        this.handleModerationSuccess(message.data);
        break;

      // Simulcast events
      case EVENTS.FEED_CONFIGURED:
        this.handleFeedConfigured(message.data);
        break;
      case EVENTS.FEED_SUBSCRIPTION_CONFIGURED:
        this.handleFeedSubscriptionConfigured(message.data);
        break;
      case EVENTS.PUBLISHER_CONFIGURED_FEED:
        this.handlePublisherConfiguredFeed(message.data);
        break;

      default:
        console.warn(`❓ Unknown message type: ${message.type}`);
    }
  }

  // Connection event handlers
  handleConnected(data) {
    console.log("✅ Connection confirmed by server:", data);
    // Update user connection status in store
    this.updateUserConnectionStatus(data);
  }

  handleError(data) {
    console.error("❌ Server error:", data);
    // Handle server errors
  }

  handlePong(data) {
    console.log("🏓 Pong received:", data);
    // Handle ping/pong for keepalive
  }

  // Room event handlers
  handleUserConnected(data) {
    console.log("👤 User connected:", data);
    // data is UserSchema - update member connection status in store
    this.updateMemberConnectionStatus(data.id, true);
  }

  handleUserDisconnected(data) {
    console.log("👤 User disconnected:", data);
    // data is just the user ID (string)
    this.updateMemberConnectionStatus(data, false);
  }

  handleUserJoinedRoom(data) {
    console.log("🚪 User joined room:", data);
    // data is UserSchema - add new member to store
    this.addMemberToRoom(data);
  }

  handleUserLeftRoom(data) {
    console.log("🚪 User left room:", data);
    // data is just the user ID (string)
    this.removeMemberFromRoom(data);
  }

  // Chat event handlers
  handleMessageSent(data) {
    console.log("📨 Message sent confirmation:", data);
    // Handle message sent confirmation - remove pending status
    this.handleMessageSentConfirmation(data);
  }

  handleMessageReceived(data) {
    console.log("📨 New message received:", data);
    // Add message to store
    this.addMessageToStore(data);
  }

  // Media/Conference event handlers

  handlePublisherWebRTCConnectionEstablished(data) {
    console.log("🔗 Publisher WebRTC connection established:", data);
    // Publisher WebRTC connection is ready
    const store = useStore.getState();
    store.updateConferenceState({ joinRequestState: { isLoading: false, error: null } });
  }

  handleSubscriberWebRTCConnectionEstablished(data) {
    console.log("🔗 Subscriber WebRTC connection established:", data);
    // Subscriber WebRTC connection is ready - stream should be flowing
  }

  handleReceiveAnswerForPublishing(data) {
    console.log("📞 Received answer for publishing:", data);

    // Find the most recent local feed that doesn't have a completed WebRTC connection
    const store = useStore.getState();

    // Look for a feed that has a peer connection but is in "have-local-offer" state
    let targetFeed = null;
    let targetPeerData = null;

    for (const feed of store.localFeeds) {
      if (feed.feedId) {
        const peerData = store.peers.get(feed.feedId);
        if (peerData && peerData.peerConnection && data.jsep) {
          const connectionState = peerData.peerConnection.signalingState;
          console.log(`🔍 Feed ${feed.feedId} (${feed.feedType}) connection state: ${connectionState}`);

          // Look for peer connection in "have-local-offer" state (waiting for answer)
          if (connectionState === "have-local-offer") {
            targetFeed = feed;
            targetPeerData = peerData;
            break;
          }
        }
      }
    }

    // Fallback: use the most recent feed with a feedId if no "have-local-offer" found
    if (!targetFeed) {
      // Get the most recently added feed (last in array)
      const feedsWithId = store.localFeeds.filter(f => f.feedId);
      targetFeed = feedsWithId[feedsWithId.length - 1];
      if (targetFeed) {
        targetPeerData = store.peers.get(targetFeed.feedId);
      }
    }

    if (targetFeed && targetPeerData && targetPeerData.peerConnection && data.jsep) {
      console.log(`🎯 Applying answer to ${targetFeed.feedType} feed (feedId: ${targetFeed.feedId})`);
      targetPeerData.peerConnection.setRemoteDescription(data.jsep)
        .then(() => {
          console.log(`✅ Set remote description for ${targetFeed.feedType} publisher`);
          store.updateConferenceState({ joinRequestState: { isLoading: false, error: null } });
        })
        .catch(error => {
          console.error(`❌ Error setting remote description for ${targetFeed.feedType}:`, error);
          store.updateConferenceState({
            joinRequestState: { isLoading: false, error: error.message }
          });
        });
    } else {
      console.error("No suitable local feed found for answer or missing peer connection data");
    }
  }

  handleSubscribedToUserFeed(data) {
    console.log("📺 Subscribed to user feed:", data);

    // Store iceServers from subscription event (may be refreshed)
    if (data.iceServers) {
      this.iceServers = data.iceServers;
      console.log('📡 Stored ICE servers from subscription:', this.iceServers);
    }

    const store = useStore.getState();
    const feedId = data.feedId;
    const peerData = store.peers.get(`sub-${feedId}`);

    if (peerData && peerData.peerConnection && data.jsep) {
      // Set remote description from server
      peerData.peerConnection.setRemoteDescription(data.jsep)
        .then(() => {
          // Create answer
          return peerData.peerConnection.createAnswer();
        })
        .then(answer => {
          // Set local description
          return peerData.peerConnection.setLocalDescription(answer);
        })
        .then(() => {
          // Send answer to server
          this.sendMessage(EVENTS.SEND_ANSWER_FOR_SUBSCRIBING, {
            feedId,
            jsep: peerData.peerConnection.localDescription
          });
        })
        .catch(error => {
          console.error("❌ Error handling subscription:", error);
        });
    } else {
      console.error("Missing peer connection or jsep for feedId:", feedId);
    }
  }

  handlePublisherList(data) {
    console.log("📋 Publisher list received:", data);
    // Update publishers in store
    this.updatePublishersInStore(data);
  }

  handlePublisherJoinedConference(data) {
    console.log("🎥 Publisher joined conference:", data);

    // Add new publisher to remote feeds
    const publisher = data.publisher;
    if (publisher) {
      const store = useStore.getState();
      const publisherId = publisher.id;
      const publisherUserId = publisher.userId;

      console.log("🔍 Processing publisher:", {
        publisherId,
        publisherUserId,
        currentUserId: store.user?.id,
        publisher
      });

      if (publisherId && publisherUserId) {
        // Check if this is the current user's publisher
        if (publisherUserId !== store.user?.id) {
          console.log("➕ Adding remote publisher:", publisherId);
          // Add userId to publisher object since server doesn't include it
          this.addPublisherToStore({ ...publisher, userId: publisherUserId });
          // Subscribe to the new publisher's feed
          this.subscribeToUserFeed(publisherId);
        } else {
          console.log("⏭️ Skipping own publisher (already handled as local feed):", publisherId);
        }
      } else {
        console.warn("❌ Invalid publisher data:", { publisherId, publisherUserId, publisher });
      }
    } else {
      console.warn("❌ No publishers in PUBLISHER_JOINED_CONFERENCE event:", data);
    }
  }

  handleUserJoinedCall(data) {
    console.log("📞 User joined call:", data);
    // data is { userId: string }
    this.updateMemberCallStatus(data.userId, true);
  }

  handleUserLeftCall(data) {
    console.log("📞 User left call:", data);
    // data is { userId: string }
    this.updateMemberCallStatus(data.userId, false);
  }

  handleMediaStreamToggled(data) {
    console.log("🎵 Media stream toggled:", data);
    // Handle media stream toggle response
  }

  handlePublisherToggledMediaStream(data) {
    console.log("🎵 Publisher toggled media stream:", data);
    // Update publisher media status in store
    this.updatePublisherMediaStatus(data);
  }

  handleFeedUnpublished(data) {
    console.log("📺 Feed unpublished:", data);
    const feedId = data.feedId;
    const store = useStore.getState();

    // Find and remove the local feed
    const localFeed = store.localFeeds.find(f => f.feedId === feedId);
    if (localFeed) {
      // Close the peer connection
      const peerData = store.peers.get(feedId);
      if (peerData && peerData.peerConnection) {
        peerData.peerConnection.close();
        store.removePeer(feedId);
      }

      // Remove the local feed from store
      store.removeLocalFeed(feedId);
      console.log(`🗑️ Removed local ${localFeed.feedType} feed:`, feedId);
    }
  }

  handlePublisherUnpublishedFeed(data) {
    console.log("📺 Publisher unpublished feed:", data);
    // Remove publisher from store
    this.removePublisherFromStore(data.feedId);
  }

  handleLeftConference(data) {
    console.log("🚪 Left conference:", data);

    const store = useStore.getState();

    this.peerMetrics?.endCall();
    this.peerMetrics = null;
    this.peerMetricsReady = null;

    // Clean up simulcast monitoring
    this.cleanupSimulcastMonitoring();

    // Clean up all peer connections
    store.peers.forEach((peerData) => {
      if (peerData.peerConnection) {
        peerData.peerConnection.close();
      }
    });

    // Reset all conference-related state
    store.setPeers(new Map());
    store.setLocalFeeds([]);
    store.setRemoteFeeds([]);
    store.updateConferenceState({
      step: "pending",
      joinedConference: false,
      joinRequestState: { isLoading: false, error: null }
    });

    // Clean up transceiver references
    this.videoTransceiver = null;
  }

  handleUserLeftConference(data) {
    console.log("🚪 User left conference:", data);

    const store = useStore.getState();
    const userId = data.userId;

    // Update user conference status
    this.updateMemberCallStatus(userId, false);

    // Find and remove all feeds belonging to this user
    const userFeeds = store.remoteFeeds.filter(feed => feed.userId === userId);

    userFeeds.forEach(feed => {
      if (feed.feedId) {
        // Close and remove subscriber peer connection
        const subscriberPeerData = store.peers.get(`sub-${feed.feedId}`);
        if (subscriberPeerData && subscriberPeerData.peerConnection) {
          console.log(`🔌 Closing subscriber peer connection for feedId: ${feed.feedId}`);
          subscriberPeerData.peerConnection.close();
          store.removePeer(`sub-${feed.feedId}`);
        }

        // Remove the remote feed
        console.log(`🗑️ Removing remote feed for user ${userId}, feedId: ${feed.feedId}`);
        store.removeRemoteFeed(feed.feedId);
      }
    });

    console.log(`✅ Cleaned up ${userFeeds.length} feeds for user ${userId} who left conference`);
  }

  // Interaction event handlers
  handleScreenshotTaken(data) {
    console.log("📸 Screenshot taken:", data);
    // Handle screenshot notification response
  }

  handleScreenshotTakenByUser(data) {
    console.log("📸 Screenshot taken by user:", data);
    const { addNotification, members } = useStore.getState();

    // Find user name
    const user = members.find(m => m.id === data.userId);
    const userName = user ? user.name : `User ${data.userId}`;

    // Show screenshot notification to all users in the room
    addNotification({
      type: 'screenshot',
      title: 'Screenshot Taken',
      message: `${userName} took a screenshot`,
      timestamp: Date.now()
    });
  }

  handleReactionSent(data) {
    console.log("😀 Reaction sent:", data);
    // Handle reaction sent response
  }

  handleReactionReceived(data) {
    console.log("😀 Reaction received:", data);
    const { addReaction, localFeeds, remoteFeeds } = useStore.getState();

    // Find the primary feed for this user (prefer camera feed over screenshare)
    const allFeeds = [...localFeeds, ...remoteFeeds];
    let userFeed = allFeeds.find(f => f.userId === data.userId && f.feedType === "camera");

    // If no camera feed, use any feed from this user
    if (!userFeed) {
      userFeed = allFeeds.find(f => f.userId === data.userId);
    }

    // Add reaction to store with the found feedId
    addReaction({
      emoji: data.reaction,
      userId: data.userId,
      feedId: userFeed?.feedId || null,
      timestamp: Date.now()
    });
  }

  handleHandRaised(data) {
    console.log("✋ Hand raised:", data);
    // Handle hand raise response
  }

  handleHandRaisedByUser(data) {
    console.log("✋ Hand raised by user:", data);
    // Update member hand raised status
    this.updateMemberHandRaisedStatus(data.userId, true);
  }

  handleHandLowered(data) {
    console.log("👇 Hand lowered:", data);
    // Handle hand lower response
  }

  handleHandLoweredByUser(data) {
    console.log("👇 Hand lowered by user:", data);
    // Update member hand raised status
    this.updateMemberHandRaisedStatus(data.userId, false);
  }

  // Moderation event handlers
  handleFeedModerated(data) {
    console.log("🔧 Feed moderated:", data);
    const { addNotification, localFeeds, removeLocalFeed, removePeer, peers } = useStore.getState();

    // Find and remove the local feed that was moderated
    const moderatedFeed = localFeeds.find(f => f.feedId === data.feedId);
    if (moderatedFeed) {
      // Close the peer connection
      const peerData = peers.get(data.feedId);
      if (peerData && peerData.peerConnection) {
        console.log(`🔌 Closing peer connection for moderated feed: ${data.feedId}`);
        peerData.peerConnection.close();
        removePeer(data.feedId);
      }

      // Remove the local feed from store
      removeLocalFeed(data.feedId);
      console.log(`🗑️ Removed moderated local feed: ${data.feedId} (${moderatedFeed.feedType})`);

      // Show notification that their feed was moderated
      addNotification({
        type: 'moderation',
        title: 'Your Feed Was Moderated',
        message: `Your ${moderatedFeed.feedType} feed has been removed by the host`,
        timestamp: Date.now()
      });

      // Check if user has any remaining local feeds
      const remainingLocalFeeds = localFeeds.filter(f => f.feedId !== data.feedId);
      if (remainingLocalFeeds.length === 0) {
        console.log("🚪 No local feeds remaining after moderation - leaving call");
        // Automatically leave the call
        this.leaveConference();

        // Show notification about leaving call
        addNotification({
          type: 'warning',
          title: 'Removed from Call',
          message: 'You have been removed from the call by the host',
          timestamp: Date.now()
        });
      }
    } else {
      // Fallback notification if feed not found locally
      addNotification({
        type: 'moderation',
        title: 'Your Feed Was Moderated',
        message: 'Your video feed has been moderated by the host',
        timestamp: Date.now()
      });
    }
  }

  handleFeedModeratedByHost(data) {
    console.log("🔧 Feed moderated by host:", data);
    const { addNotification, members } = useStore.getState();

    // Find user name
    const moderatedUser = members.find(m => m.id === data.userId);
    const userName = moderatedUser ? moderatedUser.name : `User ${data.userId}`;

    // Notify room that a feed was moderated (this is just for other users to see)
    addNotification({
      type: 'moderation',
      title: 'Feed Moderated',
      message: `${userName}'s feed was moderated by the host`,
      timestamp: Date.now()
    });
  }

  handleModerationSuccess(data) {
    console.log("✅ Moderation success:", data);
    // Handle moderation success response - notification handled in UI
  }

  // Simulcast event handlers
  handleFeedConfigured(data) {
    console.log("⚙️ Feed configured:", data);
    // data: { feedId: number, simulcast: boolean, resolutions: Array<"h"|"m"|"l"> | null }
    const { feedId, simulcast, resolutions } = data;
    const store = useStore.getState();
    
    // Update local feed with new simulcast configuration
    store.updateLocalFeed(feedId, {
      simulcastEnabled: simulcast,
      simulcastResolutions: resolutions
    });
    
    console.log(`🔄 Updated local feed ${feedId} simulcast config:`, { simulcast, resolutions });
  }

  handleFeedSubscriptionConfigured(data) {
    console.log("📺 Feed subscription configured:", data);
    // data: { feedId: number, resolution: "h"|"m"|"l" }
    const { feedId, resolution } = data;
    
    // Update subscription state - this could be stored in a separate subscription map
    // For now, we'll just log the confirmation
    console.log(`✅ Subscription to feed ${feedId} configured to resolution: ${resolution}`);
  }

  handlePublisherConfiguredFeed(data) {
    console.log("🎥 Publisher configured feed:", data);
    // data: { feedId: number, userId: string, simulcast: boolean, resolutions: Array<"h"|"m"|"l"> | null }
    const { feedId, userId, simulcast, resolutions } = data;
    const store = useStore.getState();
    
    // Update remote feed with new simulcast configuration
    store.updateRemoteFeed(feedId, {
      simulcastEnabled: simulcast,
      simulcastResolutions: resolutions
    });
    
    console.log(`🔄 Updated remote feed ${feedId} (user: ${userId}) simulcast config:`, { simulcast, resolutions });
  }

  // Helper methods to interact with store (these will be implemented later)
  updateUserConnectionStatus(userData) {
    const store = useStore.getState();

    // Update the current user's connected status
    store.setUser({ ...store.user, connected: true });

    // Also update the user in members array
    store.updateMember(userData.id, { connected: true });

    console.log("🔄 Updated user connection status:", userData);
  }

  updateMemberConnectionStatus(userId, connected) {
    const store = useStore.getState();
    store.updateMember(userId, { connected });
    console.log(`🔄 Updated member ${userId} connection status:`, connected);
  }

  addMemberToRoom(memberData) {
    const store = useStore.getState();
    // memberData is UserSchema - add isHost property based on room host
    const memberWithHostFlag = {
      ...memberData,
      isHost: memberData.id === store.room?.hostId
    };
    store.addMember(memberWithHostFlag);
    console.log("🔄 Added member to room:", memberData);
  }

  removeMemberFromRoom(userId) {
    const store = useStore.getState();
    store.removeMember(userId);
    console.log("🔄 Removed member from room:", userId);
  }

  addMessageToStore(messageData) {
    // Ensure dates are ISO strings for consistency
    const normalizedMessage = {
      ...messageData,
      createdAt: messageData.createdAt instanceof Date ? messageData.createdAt.toISOString() : messageData.createdAt,
      updatedAt: messageData.updatedAt instanceof Date ? messageData.updatedAt.toISOString() : messageData.updatedAt
    };
    useStore.getState().addMessage(normalizedMessage);
    console.log("🔄 Adding message to store:", normalizedMessage);
  }

  updatePublishersInStore(publishersData) {
    // Convert StandardizedPublisher schema to feed format for remote feeds only
    const store = useStore.getState();
    const currentUserId = store.user?.id;

    const feeds = publishersData
      .filter(publisher => publisher.userId !== currentUserId) // Exclude self
      .map(publisher => ({
        id: `handle-${publisher.id}`,
        feedId: publisher.id,
        userId: publisher.userId,
        feedType: publisher.feedType,
        audioEnabled: publisher.audio,
        videoEnabled: publisher.video,
        handRaised: publisher.handRaised,
        simulcastEnabled: publisher.simulcastEnabled,
        simulcastResolutions: publisher.simulcastResolutions,
        stream: null, // Will be set when WebRTC connection is established
        isLocal: false, // These are remote publishers
        userName: this.getUserNameById(publisher.userId)
      }));

    store.setRemoteFeeds(feeds);
    console.log("🔄 Updated remote feeds in store:", feeds);
  }

  addPublisherToStore(publisherData) {
    if (!publisherData) {
      console.error("Cannot add publisher: publisherData is null");
      return;
    }

    const feedId = publisherData.feed || publisherData.feedId || publisherData.id;
    const USERID = publisherData.userId || publisherData.display;

    if (!feedId || !USERID) {
      console.error("Cannot add publisher: missing feedId or userId", publisherData);
      return;
    }

    const feed = {
      id: publisherData.id || `handle-${feedId}`,
      feedId,
      userId: USERID,
      feedType: publisherData.feedType || "camera",
      audioEnabled: publisherData.audio !== false, // Use audio property, default to true
      videoEnabled: publisherData.video !== false, // Use video property, default to true
      handRaised: publisherData.handRaised || false,
      simulcastEnabled: publisherData.simulcastEnabled || false,
      simulcastResolutions: publisherData.simulcastResolutions || null,
      stream: null, // Will be set when WebRTC connection establishes
      isLocal: false,
      userName: this.getUserNameById(USERID)
    };

    useStore.getState().addRemoteFeed(feed);
    console.log("🔄 Added remote feed to store:", feed);
  }

  removePublisherFromStore(feedId) {
    useStore.getState().removeRemoteFeed(feedId);
    console.log("🔄 Removed remote feed from store:", feedId);
  }

  updateMemberCallStatus(userId, inCall) {
    const store = useStore.getState();
    store.updateMember(userId, { joinedCall: inCall });
    console.log(`🔄 Updated member ${userId} call status:`, inCall);
  }

  updatePublisherMediaStatus(data) {
    const { feedId, audio, video } = data;

    // Check if it's a local feed or remote feed
    const store = useStore.getState();
    const isLocalFeed = store.localFeeds.some(f => f.feedId === feedId);

    const updates = {
      audioEnabled: audio,
      videoEnabled: video
    };

    if (isLocalFeed) {
      store.updateLocalFeed(feedId, updates);
      console.log("🔄 Updated local feed media status:", { feedId, ...updates });
    } else {
      store.updateRemoteFeed(feedId, updates);
      console.log("🔄 Updated remote feed media status:", { feedId, ...updates });
    }
  }

  updateMemberHandRaisedStatus(userId, handRaised) {
    // Update member status
    useStore.getState().updateMember(userId, { handRaised });

    // Also update any feeds for this user
    const store = useStore.getState();

    // Update local feeds
    store.localFeeds.forEach(feed => {
      if (feed.userId === userId) {
        store.updateLocalFeed(feed.feedId, { handRaised });
      }
    });

    // Update remote feeds
    store.remoteFeeds.forEach(feed => {
      if (feed.userId === userId) {
        store.updateRemoteFeed(feed.feedId, { handRaised });
      }
    });

    console.log(`🔄 Updated user ${userId} hand raised status:`, handRaised);
  }

  handleMessageSentConfirmation(confirmedMessage) {
    // Find the pending message by content
    const tempMessageId = this.pendingMessages.get(confirmedMessage.content.trim());
    if (tempMessageId) {
      // Normalize dates to ISO strings for consistency
      const normalizedMessage = {
        ...confirmedMessage,
        createdAt: confirmedMessage.createdAt instanceof Date ? confirmedMessage.createdAt.toISOString() : confirmedMessage.createdAt,
        updatedAt: confirmedMessage.updatedAt instanceof Date ? confirmedMessage.updatedAt.toISOString() : confirmedMessage.updatedAt,
        pending: false
      };
      // Remove pending status and update with server data
      useStore.getState().removeMessagePendingStatus(tempMessageId, normalizedMessage);
      // Clean up pending messages map
      this.pendingMessages.delete(confirmedMessage.content.trim());
      console.log("✅ Message confirmation processed:", { tempMessageId, normalizedMessage });
    }
  }

  // Helper method to get user name by ID from store
  getUserNameById(userId) {
    const store = useStore.getState();
    const member = store.members.find(m => m.id === userId);
    return member ? member.name : `User ${userId}`;
  }

  // Conference-specific handlers
  handleJoinedConferenceAsPublisher(data) {
    console.log("🎥 Joined conference as publisher:", data);

    const store = useStore.getState();
    this.initializePeerMetrics(store.user?.id, store.room?.id);

    // Set joinedConference to true
    store.updateConferenceState({ joinedConference: true });

    // Extract feed info from new schema format
    const { feed, publishers, iceServers } = data;

    // Store iceServers for use in peer connections
    if (iceServers) {
      this.iceServers = iceServers;
      console.log('📡 Stored ICE servers:', this.iceServers);
    }

    const feedId = feed.id;
    const feedType = feed.feedType;

    // Find the local feed that matches this response based on feedType from server
    let targetLocalFeed;
    if (feedType === "screenshare") {
      targetLocalFeed = store.localFeeds.find(f => f.feedType === "screenshare");
    } else {
      targetLocalFeed = store.localFeeds.find(f => f.feedType === "camera");
    }

    // Fallback to any feed without feedId
    if (!targetLocalFeed) {
      targetLocalFeed = store.localFeeds.find(f => !f.feedId) || store.localFeeds[store.localFeeds.length - 1];
    }

    if (targetLocalFeed) {
      // Create updated feed with actual feedId and server data
      const updatedFeed = {
        ...targetLocalFeed,
        feedId: feedId,
        id: `local-handle-${feedId}`,
        feedType: feedType,
        audioEnabled: feed.audio,
        videoEnabled: feed.video,
        handRaised: feed.handRaised,
        simulcastEnabled: feed.simulcastEnabled,
        simulcastResolutions: feed.simulcastResolutions
      };

      // Update the specific feed in the array
      const updatedFeeds = store.localFeeds.map(feed =>
        feed.id === targetLocalFeed.id ? updatedFeed : feed
      );
      store.setLocalFeeds(updatedFeeds);

      // Create publisher peer connection with the appropriate stream
      const localStream = feedType === "screenshare" ?
        this.tempScreenStream : this.tempLocalStream;

      if (localStream) {
        this.createPublisherPeerConnection(feedId, localStream);

        // Clean up the temporary stream reference
        if (feedType === "screenshare") {
          this.tempScreenStream = null;
        } else {
          this.tempLocalStream = null;
        }
      } else {
        console.error("No local stream available for publisher connection");
      }
    }

    // For screenshare feeds, do NOT subscribe to other publishers
    // Only negotiate the WebRTC connection for publishing
    const isScreenshare = feedType === "screenshare";

    if (!isScreenshare && publishers && publishers.length > 0) {
      // Only subscribe to other publishers for camera feeds
      this.updatePublishersInStore(publishers);

      // Create subscriber connections for each existing publisher
      publishers.forEach(publisher => {
        const publisherId = publisher.id;
        if (publisherId && publisher.userId !== store.user?.id) {
          this.subscribeToUserFeed(publisherId);
        }
      });
    }

    console.log(`🔄 Set up WebRTC connections for ${isScreenshare ? 'screenshare' : 'camera'} conference`);
  }

  // WebSocket message sending methods
  sendMessage(type, data) {
    if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
      const message = { type };
      if (data !== undefined) {
        message.data = data;
      }
      console.log("📤 Sending WebSocket message:", message);
      this.webSocket.send(JSON.stringify(message));
      return true;
    } else {
      console.error("❌ WebSocket not connected, cannot send message:", { type, data });
      return false;
    }
  }

  // Client-to-server message methods
  sendChatMessage(content, tempMessageId) {
    // Store the temp message ID for later confirmation
    if (tempMessageId) {
      this.pendingMessages.set(content.trim(), tempMessageId);
    }
    return this.sendMessage(EVENTS.SEND_MESSAGE, content);
  }

  joinConferenceAsPublisher(options = {}) {
    const { feedType = "camera", audio = true, video = true } = options;
    
    // Always enable simulcast by default with all quality levels
    const payload = { 
      feedType, 
      audio, 
      video,
      simulcast: true,
      resolutions: ["h", "m", "l"]
    };
    
    console.log(`🎥 Joining conference as publisher with simulcast enabled:`, payload);
    return this.sendMessage(EVENTS.JOIN_CONFERENCE_AS_PUBLISHER, payload);
  }

  sendOfferForPublishing(offer) {
    return this.sendMessage(EVENTS.SEND_OFFER_FOR_PUBLISHING, offer);
  }

  sendAnswerForSubscribing(answer) {
    return this.sendMessage(EVENTS.SEND_ANSWER_FOR_SUBSCRIBING, answer);
  }

  sendIceCandidates(candidates) {
    return this.sendMessage(EVENTS.SEND_ICE_CANDIDATES, candidates);
  }

  sendIceCandidateCompleted(feedId) {
    return this.sendMessage(EVENTS.SEND_ICE_CANDIDATE_COMPLETED, { feedId });
  }

  subscribeToUserFeed(feedId) {
    if (!feedId) {
      console.error("Cannot subscribe to feed: feedId is null or undefined");
      return;
    }

    console.log("📡 Subscribing to user feed:", feedId);

    // Create subscriber peer connection first
    this.createSubscriberPeerConnection(feedId);
    // Then send subscription request
    return this.sendMessage(EVENTS.SUBSCRIBE_TO_USER_FEED, {
      feedId: feedId,
    });
  }

  getPublisherList() {
    return this.sendMessage(EVENTS.GET_PUBLISHER_LIST, {});
  }

  toggleMediaStream(feedId, mediaType, enabled) {
    return this.sendMessage(EVENTS.TOGGLE_MEDIA_STREAM, { feedId, mediaType, enabled });
  }

  leaveConference() {
    return this.sendMessage(EVENTS.LEAVE_CONFERENCE);
  }

  sendScreenshotNotification() {
    return this.sendMessage(EVENTS.SEND_SCREENSHOT_NOTIFICATION, {});
  }

  sendReaction(reaction) {
    return this.sendMessage(EVENTS.SEND_REACTION, reaction);
  }

  raiseHand(feedId) {
    return this.sendMessage(EVENTS.RAISE_HAND, { feedId });
  }

  lowerHand(feedId) {
    return this.sendMessage(EVENTS.LOWER_HAND, { feedId });
  }

  moderateFeed(feedId, action) {
    return this.sendMessage(EVENTS.MODERATE_FEED, { feedId, action });
  }

  // Simulcast configuration methods
  async configureFeed(feedId, simulcast, resolutions = null) {
    console.log(`⚙️ Configuring feed ${feedId}:`, { simulcast, resolutions });
    
    // Update WebRTC sender parameters for simulcast layers
    await this.updateSimulcastParameters(feedId, resolutions);
    
    // Payload: { feedId: number, simulcast: boolean, resolutions?: Array<"h"|"m"|"l"> }
    const payload = { feedId, simulcast };
    if (resolutions) {
      payload.resolutions = resolutions;
    }
    return this.sendMessage(EVENTS.CONFIGURE_FEED, payload);
  }

  configureFeedSubscription(feedId, resolution) {
    console.log(`📺 Configuring subscription to feed ${feedId}:`, { resolution });
    // Payload: { feedId: number, resolution: "h"|"m"|"l" }
    return this.sendMessage(EVENTS.CONFIGURE_FEED_SUBSCRIPTION, { feedId, resolution });
  }

  ping() {
    return this.sendMessage(EVENTS.PING, {});
  }

  disconnect() {
    return this.sendMessage(EVENTS.DISCONNECT, {});
  }

  unpublishFeed(feedId) {
    return this.sendMessage(EVENTS.UNPUBLISH_FEED, { feedId });
  }

  // WebRTC Helper Methods
  createPublisherPeerConnection(feedId, localStream) {
    if (!localStream) {
      console.error("No local stream available for publisher");
      return;
    }

    const iceServers = this.iceServers?.iceServers;
    console.log('📡 Creating publisher peer connection with ICE servers:', iceServers);
    const peerConnection = new RTCPeerConnection({
      iceServers,
      iceTransportPolicy: this.forceRelayIce ? 'relay' : 'all',
    });

    // Add local stream tracks (with or without simulcast based on configuration)
    console.log(`🎚️ SIMULCAST MODE: ${this.ENABLE_SIMULCAST ? 'ENABLED' : 'DISABLED'}`);
    this.addTracksWithSimulcast(peerConnection, localStream);

    const store = useStore.getState();

    // Store peer connection with ICE candidate collection
    store.addPeer(feedId, {
      peerConnection,
      candidates: [],
      iceCompleted: false,
      type: 'publisher'
    });

    // Handle ICE candidates (collect in bulk)
    peerConnection.onicecandidate = (event) => {
      const currentStore = useStore.getState();
      const peerData = currentStore.peers.get(feedId);

      if (event.candidate) {
        // Collect candidates
        if (peerData) {
          peerData.candidates.push(event.candidate);
        }
      } else {
        // ICE gathering complete - send all candidates
        if (peerData && !peerData.iceCompleted) {
          peerData.iceCompleted = true;

          // Send candidates in bulk
          this.sendMessage(EVENTS.SEND_ICE_CANDIDATES, {
            feedId,
            type: 'publisher',
            candidates: peerData.candidates
          });

          // Send completion notification
          this.sendMessage(EVENTS.SEND_ICE_CANDIDATE_COMPLETED, {
            feedId,
            type: 'publisher'
          });
        }
      }
    };

    // Create and send offer
    peerConnection.createOffer()
      .then(offer => {
        return peerConnection.setLocalDescription(offer);
      })
      .then(() => {
        this.sendMessage(EVENTS.SEND_OFFER_FOR_PUBLISHING, {
          feedId,
          jsep: peerConnection.localDescription
        });
      })
      .catch(error => {
        console.error("Error creating publisher offer:", error);
      });

    this._addPeerMetricsConnection(peerConnection, `pub-${feedId}`);
    console.log("📡 Created publisher peer connection for feedId:", feedId);
  }

  // Simulcast Helper Methods
  getSimulcastEncodings() {
    return [
      {
        rid: 'high',
        maxBitrate: 1000000,  // 1 Mbps
        scaleResolutionDownBy: 1.0,
        maxFramerate: 30
      },
      {
        rid: 'medium',
        maxBitrate: 500000,   // 500 kbps
        scaleResolutionDownBy: 2.0,
        maxFramerate: 15
      },
      {
        rid: 'low',
        maxBitrate: 200000,   // 200 kbps
        scaleResolutionDownBy: 4.0,
        maxFramerate: 15
      }
    ];
  }

  detectSimulcastSupport() {
    try {
      // Check if addTransceiver is available
      const pc = new RTCPeerConnection();
      const hasAddTransceiver = typeof pc.addTransceiver === 'function';
      pc.close();

      // Basic browser detection
      const userAgent = navigator.userAgent.toLowerCase();
      const isChrome = userAgent.includes('chrome') && !userAgent.includes('edg');
      const isFirefox = userAgent.includes('firefox');
      const isEdge = userAgent.includes('edg');
      const isSafari = userAgent.includes('safari') && !userAgent.includes('chrome');

      // Chrome and Edge have good simulcast support
      if ((isChrome || isEdge) && hasAddTransceiver) {
        return { supported: true, browser: isChrome ? 'chrome' : 'edge' };
      }

      // Firefox has partial simulcast support
      if (isFirefox && hasAddTransceiver) {
        return { supported: true, browser: 'firefox', limited: true };
      }

      // Safari has limited simulcast support
      if (isSafari && hasAddTransceiver) {
        return { supported: false, browser: 'safari', reason: 'Limited simulcast support' };
      }

      return { supported: false, reason: 'No addTransceiver support' };
    } catch (error) {
      console.warn('Error detecting simulcast support:', error);
      return { supported: false, reason: 'Detection failed' };
    }
  }

  addTracksWithSimulcast(peerConnection, localStream) {
    // Check if simulcast is enabled via configuration flag
    if (!this.ENABLE_SIMULCAST) {
      console.log('🚫 Simulcast disabled by configuration - using single stream mode');
      return this.addTracksWithoutSimulcast(peerConnection, localStream);
    }

    const simulcastSupport = this.detectSimulcastSupport();
    console.log('🔍 Simulcast support detection:', simulcastSupport);

    const videoTrack = localStream.getVideoTracks()[0];
    const audioTrack = localStream.getAudioTracks()[0];

    // Add audio track (no simulcast needed)
    if (audioTrack) {
      try {
        peerConnection.addTransceiver(audioTrack, {
          direction: 'sendonly',
          streams: [localStream]
        });
        console.log('✅ Added audio transceiver');
      } catch (error) {
        console.warn('⚠️ Fallback to addTrack for audio:', error);
        peerConnection.addTrack(audioTrack, localStream);
      }
    }

    // Add video track with simulcast if supported
    if (videoTrack) {
      if (simulcastSupport.supported) {
        try {
          const encodings = this.getSimulcastEncodings();

          // Firefox needs special handling
          if (simulcastSupport.browser === 'firefox') {
            // Use only 2 layers for Firefox
            encodings.splice(1, 1); // Remove medium layer
          }

          const videoTransceiver = peerConnection.addTransceiver(videoTrack, {
            direction: 'sendonly',
            streams: [localStream],
            sendEncodings: encodings
          });

          // Store transceiver reference for later control
          this.videoTransceiver = videoTransceiver;

          console.log(`✅ Added video transceiver with ${encodings.length} simulcast layers:`, encodings.map(e => e.rid));
        } catch (error) {
          console.warn('⚠️ Simulcast setup failed, falling back to single stream:', error);
          this.fallbackToSingleStream(peerConnection, videoTrack, localStream);
        }
      } else {
        console.log(`⚠️ Simulcast not supported (${simulcastSupport.reason}), using single stream`);
        this.fallbackToSingleStream(peerConnection, videoTrack, localStream);
      }
    }
  }

  fallbackToSingleStream(peerConnection, videoTrack, localStream) {
    try {
      peerConnection.addTransceiver(videoTrack, {
        direction: 'sendonly',
        streams: [localStream]
      });
      console.log('✅ Added single video stream via addTransceiver');
    } catch (error) {
      console.warn('⚠️ Final fallback to legacy addTrack:', error);
      peerConnection.addTrack(videoTrack, localStream);
    }
  }

  // Simple method for adding tracks without simulcast (for easy testing)
  addTracksWithoutSimulcast(peerConnection, localStream) {
    console.log('📡 Adding tracks in SINGLE STREAM mode (simulcast disabled)');

    const videoTrack = localStream.getVideoTracks()[0];
    const audioTrack = localStream.getAudioTracks()[0];

    // Add audio track
    if (audioTrack) {
      try {
        peerConnection.addTransceiver(audioTrack, {
          direction: 'sendonly',
          streams: [localStream]
        });
        console.log('✅ Added audio transceiver (single stream)');
      } catch (error) {
        console.warn('⚠️ Fallback to addTrack for audio:', error);
        peerConnection.addTrack(audioTrack, localStream);
      }
    }

    // Add video track (single stream only)
    if (videoTrack) {
      try {
        peerConnection.addTransceiver(videoTrack, {
          direction: 'sendonly',
          streams: [localStream]
        });
        console.log('✅ Added video transceiver (single stream)');
      } catch (error) {
        console.warn('⚠️ Fallback to addTrack for video:', error);
        peerConnection.addTrack(videoTrack, localStream);
      }
    }

    console.log('🔄 Single stream setup completed - no simulcast layers');
  }

  // Dynamic simulcast layer control
  async toggleSimulcastLayer(feedId, rid, enabled) {
    const store = useStore.getState();
    const peerData = store.peers.get(feedId);

    if (!peerData || !peerData.peerConnection) {
      console.error(`No peer connection found for feedId: ${feedId}`);
      return false;
    }

    try {
      const senders = peerData.peerConnection.getSenders();
      const videoSender = senders.find(sender =>
        sender.track && sender.track.kind === 'video'
      );

      if (!videoSender) {
        console.error('No video sender found');
        return false;
      }

      const params = videoSender.getParameters();
      const encoding = params.encodings?.find(enc => enc.rid === rid);

      if (encoding) {
        encoding.active = enabled;
        await videoSender.setParameters(params);
        console.log(`✅ Simulcast layer ${rid} ${enabled ? 'enabled' : 'disabled'} for feedId: ${feedId}`);
        return true;
      } else {
        console.warn(`Simulcast layer ${rid} not found for feedId: ${feedId}`);
        return false;
      }
    } catch (error) {
      console.error(`Error toggling simulcast layer ${rid}:`, error);
      return false;
    }
  }

  // Get simulcast statistics
  async getSimulcastStats(feedId) {
    const store = useStore.getState();
    const peerData = store.peers.get(feedId);

    if (!peerData || !peerData.peerConnection) {
      return null;
    }

    try {
      const senders = peerData.peerConnection.getSenders();
      const videoSender = senders.find(sender =>
        sender.track && sender.track.kind === 'video'
      );

      if (!videoSender) {
        return null;
      }

      const stats = await peerData.peerConnection.getStats(videoSender);
      const encodingStats = [];

      stats.forEach(stat => {
        if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
          encodingStats.push({
            rid: stat.rid || 'unknown',
            bytesSent: stat.bytesSent || 0,
            packetsSent: stat.packetsSent || 0,
            frameWidth: stat.frameWidth || 0,
            frameHeight: stat.frameHeight || 0,
            framesPerSecond: stat.framesPerSecond || 0,
            targetBitrate: stat.targetBitrate || 0,
            active: true
          });
        }
      });

      return encodingStats;
    } catch (error) {
      console.error('Error getting simulcast stats:', error);
      return null;
    }
  }

  // Get comprehensive WebRTC statistics for any feed (local or remote)
  async getComprehensiveStats(feedId, isLocal = false) {
    const store = useStore.getState();
    const peerKey = isLocal ? feedId : `sub-${feedId}`;
    const peerData = store.peers.get(peerKey);

    if (!peerData || !peerData.peerConnection) {
      return null;
    }

    try {
      const stats = await peerData.peerConnection.getStats();
      const result = {
        feedId,
        isLocal,
        timestamp: Date.now(),
        video: null,
        audio: null,
        simulcastLayers: [] // Array of individual layer stats
      };

      let lastBytesSent = 0;
      let lastBytesReceived = 0;
      let lastPacketsSent = 0;
      let lastPacketsReceived = 0;

      stats.forEach(stat => {
        // Video statistics
        if (stat.kind === 'video') {
          if (isLocal && stat.type === 'outbound-rtp') {
            // OUTBOUND (Publisher) METRICS - Individual simulcast layers
            const layerStats = {
              rid: stat.rid || 'main',
              // Raw counters for bitrate calculation
              bytesSent: stat.bytesSent || 0,
              packetsSent: stat.packetsSent || 0,
              framesEncoded: stat.framesEncoded || 0,
              framesSent: stat.framesSent || 0,
              
              // Basic video info
              frameWidth: stat.frameWidth || 0,
              frameHeight: stat.frameHeight || 0,
              targetBitrate: stat.targetBitrate || 0,
              
              // CRITICAL: Quality limitation (why quality dropped)
              qualityLimitationReason: stat.qualityLimitationReason || 'none',
              
              // CRITICAL: Retransmissions (network issues)
              retransmittedPacketsSent: stat.retransmittedPacketsSent || 0,
              
              // CRITICAL: Encoder performance
              totalEncodeTime: stat.totalEncodeTime || 0,
              
              // Other outbound metrics
              encoderImplementation: stat.encoderImplementation || 'Unknown',
              codecName: this.extractCodecName(stat),
              active: stat.active !== false,
              
              // NOTE: Sender doesn't know packet loss - estimated from remote-inbound-rtp
              estimatedPacketsLost: 0 // Will be filled from remote-inbound-rtp if available
            };
            
            result.simulcastLayers.push(layerStats);
            
            // Aggregate stats for backward compatibility
            if (!result.video) {
              result.video = { ...layerStats };
            } else {
              // Aggregate multiple layers
              result.video.bytesSent = (result.video.bytesSent || 0) + layerStats.bytesSent;
              result.video.packetsSent = (result.video.packetsSent || 0) + layerStats.packetsSent;
              result.video.framesEncoded = (result.video.framesEncoded || 0) + layerStats.framesEncoded;
              result.video.framesSent = (result.video.framesSent || 0) + layerStats.framesSent;
              result.video.totalEncodeTime = (result.video.totalEncodeTime || 0) + layerStats.totalEncodeTime;
              result.video.retransmittedPacketsSent = (result.video.retransmittedPacketsSent || 0) + layerStats.retransmittedPacketsSent;
              
              // Use highest resolution layer for dimensions
              if (layerStats.frameWidth > (result.video.frameWidth || 0)) {
                result.video.frameWidth = layerStats.frameWidth;
                result.video.frameHeight = layerStats.frameHeight;
              }
            }
            
            lastBytesSent += layerStats.bytesSent;
            lastPacketsSent += layerStats.packetsSent;
            
          } else if (!isLocal && stat.type === 'inbound-rtp') {
            // INBOUND (Subscriber) METRICS
            result.video = {
              ...result.video,
              // Raw counters for bitrate calculation
              bytesReceived: stat.bytesReceived || 0,
              packetsReceived: stat.packetsReceived || 0,
              packetsLost: stat.packetsLost || 0,
              
              // Frame metrics
              framesDecoded: stat.framesDecoded || 0,
              framesDropped: stat.framesDropped || 0,
              framesReceived: stat.framesReceived || 0,
              frameWidth: stat.frameWidth || 0,
              frameHeight: stat.frameHeight || 0,
              
              // CRITICAL: Decode performance
              totalDecodeTime: stat.totalDecodeTime || 0,
              
              // CRITICAL: Freeze metrics (direct UX impact)
              freezeCount: stat.freezeCount || 0,
              totalFreezesDuration: stat.totalFreezesDuration || 0,
              
              // CRITICAL: Jitter buffer (buffering due to network)
              jitterBufferDelay: stat.jitterBufferDelay || 0,
              jitterBufferEmittedCount: stat.jitterBufferEmittedCount || 0,
              
              // Network quality
              jitter: stat.jitter ? stat.jitter * 1000 : 0, // Convert to ms
              
              // Other inbound metrics  
              decoderImplementation: stat.decoderImplementation || 'Unknown',
              codecName: this.extractCodecName(stat)
            };
            
            lastBytesReceived = stat.bytesReceived || 0;
            lastPacketsReceived = stat.packetsReceived || 0;
            
          } else if (isLocal && stat.type === 'remote-inbound-rtp') {
            // REMOTE INBOUND RTP - This gives us the REAL packet loss from receiver perspective
            // Find matching layer and update packet loss
            const matchingLayer = result.simulcastLayers.find(layer => layer.rid === stat.rid);
            if (matchingLayer) {
              matchingLayer.estimatedPacketsLost = stat.packetsLost || 0;
              matchingLayer.roundTripTime = stat.roundTripTime ? stat.roundTripTime * 1000 : 0; // Convert to ms
            }
            
            // Also update aggregate video stats
            if (result.video) {
              result.video.remotePacketsLost = (result.video.remotePacketsLost || 0) + (stat.packetsLost || 0);
              result.video.remoteRoundTripTime = stat.roundTripTime ? stat.roundTripTime * 1000 : 0;
            }
          }
        }

        // Audio statistics  
        if (stat.kind === 'audio') {
          if (isLocal && stat.type === 'outbound-rtp') {
            // Local audio sender stats
            result.audio = {
              bytesSent: stat.bytesSent || 0,
              packetsSent: stat.packetsSent || 0,
              packetsLost: stat.packetsLost || 0,
              codecName: this.extractCodecName(stat),
              retransmittedPacketsSent: stat.retransmittedPacketsSent || 0
            };
          } else if (!isLocal && stat.type === 'inbound-rtp') {
            // Remote audio receiver stats
            result.audio = {
              bytesReceived: stat.bytesReceived || 0,
              packetsReceived: stat.packetsReceived || 0,
              packetsLost: stat.packetsLost || 0,
              codecName: this.extractCodecName(stat),
              jitter: stat.jitter ? stat.jitter * 1000 : 0, // Convert to ms
              audioLevel: stat.audioLevel || 0
            };
          }
        }

        // Connection statistics - CRITICAL for network analysis
        if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
          const rtt = stat.currentRoundTripTime;
          if (rtt !== undefined) {
            result.connectionStats = {
              // CRITICAL: RTT from active candidate pair
              roundTripTime: rtt * 1000, // Convert to ms
              availableOutgoingBitrate: stat.availableOutgoingBitrate || 0,
              availableIncomingBitrate: stat.availableIncomingBitrate || 0,
              
              // Additional connection quality metrics
              totalRoundTripTime: stat.totalRoundTripTime ? stat.totalRoundTripTime * 1000 : 0,
              currentRoundTripTime: rtt * 1000,
              
              // Bytes sent/received at transport level
              bytesSent: stat.bytesSent || 0,
              bytesReceived: stat.bytesReceived || 0,
              
              // Connection type info
              localCandidateType: stat.localCandidateType || 'unknown',
              remoteCandidateType: stat.remoteCandidateType || 'unknown',
              
              // Nomination state
              nominated: stat.nominated || false,
              state: stat.state
            };
          }
        }
      });

      // CALCULATE DERIVED METRICS using correct formulas
      if (result.video) {
        const prevStats = this.previousStats?.get(feedId);
        const timeDiffSeconds = prevStats && prevStats.timestamp ? 
          (result.timestamp - prevStats.timestamp) / 1000 : 0;

        if (timeDiffSeconds > 0 && prevStats) {
          if (isLocal) {
            // OUTBOUND BITRATE CALCULATION
            // Formula: bitrate (bps) = (bytesSent_now - bytesSent_prev) * 8 / time_diff
            const bytesDiff = lastBytesSent - (prevStats.bytesSent || 0);
            result.video.bitrate = Math.round((bytesDiff * 8) / timeDiffSeconds);

            // OUTBOUND FPS CALCULATION  
            // Formula: fps = (framesEncoded_now - framesEncoded_prev) / time_diff
            const framesDiff = (result.video.framesEncoded || 0) - (prevStats.framesEncoded || 0);
            result.video.fps = Math.round(framesDiff / timeDiffSeconds);

            // CALCULATE INDIVIDUAL SIMULCAST LAYER METRICS
            if (result.simulcastLayers.length > 0 && prevStats.layerStats) {
              result.simulcastLayers.forEach(layer => {
                const prevLayer = prevStats.layerStats.find(l => l.rid === layer.rid);
                if (prevLayer) {
                  // Layer bitrate: (bytesSent_now - bytesSent_prev) * 8 / time_diff
                  const layerBytesDiff = layer.bytesSent - prevLayer.bytesSent;
                  layer.bitrate = Math.round((layerBytesDiff * 8) / timeDiffSeconds);

                  // Layer FPS: (framesEncoded_now - framesEncoded_prev) / time_diff
                  const layerFramesDiff = layer.framesEncoded - prevLayer.framesEncoded;
                  layer.fps = Math.round(layerFramesDiff / timeDiffSeconds);

                  // CORRECT Packet Loss: use remote-inbound-rtp data if available
                  if (layer.estimatedPacketsLost > 0) {
                    const totalPacketsAtReceiver = layer.packetsSent + layer.estimatedPacketsLost;
                    layer.packetLossPercentage = (layer.estimatedPacketsLost / totalPacketsAtReceiver) * 100;
                  } else {
                    layer.packetLossPercentage = 0;
                  }

                  // Retransmission rate: retransmitted / total_sent
                  layer.retransmissionRate = layer.packetsSent > 0 ? 
                    (layer.retransmittedPacketsSent / layer.packetsSent) * 100 : 0;

                  // Average encode time per frame
                  layer.avgEncodeTime = layer.framesEncoded > 0 ? 
                    layer.totalEncodeTime / layer.framesEncoded : 0;
                  
                } else {
                  // First measurement - no previous data
                  layer.bitrate = 0;
                  layer.fps = 0;
                  layer.packetLossPercentage = 0;
                  layer.retransmissionRate = 0;
                  layer.avgEncodeTime = 0;
                }
              });
            }

          } else {
            // INBOUND BITRATE CALCULATION
            // Formula: bitrate (bps) = (bytesReceived_now - bytesReceived_prev) * 8 / time_diff
            const bytesDiff = lastBytesReceived - (prevStats.bytesReceived || 0);
            result.video.bitrate = Math.round((bytesDiff * 8) / timeDiffSeconds);

            // INBOUND FPS CALCULATION
            // Formula: fps = (framesDecoded_now - framesDecoded_prev) / time_diff
            const framesDiff = (result.video.framesDecoded || 0) - (prevStats.framesDecoded || 0);
            result.video.fps = Math.round(framesDiff / timeDiffSeconds);

            // CORRECT Packet Loss Calculation for inbound
            // Formula: packet_loss_% = packetsLost / (packetsLost + packetsReceived) * 100
            const totalPackets = result.video.packetsLost + result.video.packetsReceived;
            result.video.packetLossPercentage = totalPackets > 0 ? 
              (result.video.packetsLost / totalPackets) * 100 : 0;

            // Frame drop rate: framesDropped / framesReceived
            result.video.frameDropRate = result.video.framesReceived > 0 ? 
              (result.video.framesDropped / result.video.framesReceived) * 100 : 0;

            // Average decode time per frame
            result.video.avgDecodeTime = result.video.framesDecoded > 0 ? 
              result.video.totalDecodeTime / result.video.framesDecoded : 0;

            // Average jitter buffer delay
            result.video.avgJitterBuffer = result.video.jitterBufferEmittedCount > 0 ? 
              result.video.jitterBufferDelay / result.video.jitterBufferEmittedCount : 0;
          }

        } else {
          // First measurement - no time diff available
          result.video.bitrate = 0;
          result.video.fps = 0;
          result.video.packetLossPercentage = 0;
          
          if (isLocal) {
            result.simulcastLayers.forEach(layer => {
              layer.bitrate = 0;
              layer.fps = 0;
              layer.packetLossPercentage = 0;
              layer.retransmissionRate = 0;
              layer.avgEncodeTime = 0;
            });
          } else {
            result.video.frameDropRate = 0;
            result.video.avgDecodeTime = 0;
            result.video.avgJitterBuffer = 0;
          }
        }

        // Store current stats for next calculation
        if (!this.previousStats) this.previousStats = new Map();
        this.previousStats.set(feedId, {
          timestamp: result.timestamp,
          bytesSent: isLocal ? lastBytesSent : 0,
          bytesReceived: !isLocal ? lastBytesReceived : 0,
          framesEncoded: isLocal ? (result.video.framesEncoded || 0) : 0,
          framesDecoded: !isLocal ? (result.video.framesDecoded || 0) : 0,
          layerStats: isLocal ? result.simulcastLayers.map(l => ({
            rid: l.rid,
            bytesSent: l.bytesSent,
            packetsSent: l.packetsSent,
            framesEncoded: l.framesEncoded
          })) : null
        });
      }

      return result;
    } catch (error) {
      console.error('Error getting comprehensive stats:', error);
      return null;
    }
  }

  // Helper method to extract codec name from stats
  extractCodecName(stat) {
    if (stat.mimeType) {
      const parts = stat.mimeType.split('/');
      return parts[1] ? parts[1].toUpperCase() : 'Unknown';
    }
    return 'Unknown';
  }

  // Start monitoring stats for a specific feed
  startStatsMonitoring(feedId, isLocal = false, interval = 2000) {
    if (!this.statsMonitors) {
      this.statsMonitors = new Map();
    }

    // Don't start if already monitoring
    if (this.statsMonitors.has(feedId)) {
      return;
    }

    // Verify the peer connection exists before starting monitoring
    const store = useStore.getState();
    const peerKey = isLocal ? feedId : `sub-${feedId}`;
    const peerData = store.peers.get(peerKey);

    if (!peerData || !peerData.peerConnection) {
      console.warn(`Cannot start stats monitoring: no peer connection for feedId ${feedId}`);
      return;
    }

    const monitor = setInterval(async () => {
      try {
        const stats = await this.getComprehensiveStats(feedId, isLocal);
        if (stats) {
          // Update store with new stats
          const store = useStore.getState();
          store.updateStreamStats(feedId, stats);
          store.addStatsDataPoint(feedId, stats);
        }
      } catch (error) {
        console.error(`Error monitoring stats for feedId ${feedId}:`, error);
      }
    }, interval);

    this.statsMonitors.set(feedId, {
      intervalId: monitor,
      isLocal,
      interval
    });

    console.log(`📊 Started stats monitoring for feedId: ${feedId} (${isLocal ? 'local' : 'remote'})`);
  }

  // Stop monitoring stats for a specific feed
  stopStatsMonitoring(feedId) {
    if (!this.statsMonitors || !this.statsMonitors.has(feedId)) {
      return false;
    }

    const monitor = this.statsMonitors.get(feedId);
    clearInterval(monitor.intervalId);
    this.statsMonitors.delete(feedId);

    // Clean up previous stats
    if (this.previousStats) {
      this.previousStats.delete(feedId);
    }

    console.log(`🛑 Stopped stats monitoring for feedId: ${feedId}`);
    return true;
  }

  // Stop all stats monitoring
  stopAllStatsMonitoring() {
    if (this.statsMonitors) {
      this.statsMonitors.forEach((monitor, feedId) => {
        clearInterval(monitor.intervalId);
        console.log(`🛑 Stopped stats monitoring for feedId: ${feedId}`);
      });
      this.statsMonitors.clear();
    }

    if (this.previousStats) {
      this.previousStats.clear();
    }
  }

  // Helper method to get current simulcast configuration
  getSimulcastConfiguration(feedId) {
    const store = useStore.getState();
    const peerData = store.peers.get(feedId);

    if (!peerData || !peerData.peerConnection) {
      return null;
    }

    try {
      const senders = peerData.peerConnection.getSenders();
      const videoSender = senders.find(sender =>
        sender.track && sender.track.kind === 'video'
      );

      if (!videoSender) {
        return null;
      }

      const params = videoSender.getParameters();
      return {
        encodings: params.encodings || [],
        transactionId: params.transactionId
      };
    } catch (error) {
      console.error('Error getting simulcast configuration:', error);
      return null;
    }
  }

  createSubscriberPeerConnection(feedId) {
    const iceServers = this.iceServers?.iceServers;
    console.log('📡 Creating subscriber peer connection with ICE servers:', iceServers);
    const peerConnection = new RTCPeerConnection({
      iceServers,
      iceTransportPolicy: this.forceRelayIce ? 'relay' : 'all',
    });

    const store = useStore.getState();

    // Store peer connection
    store.addPeer(`sub-${feedId}`, {
      peerConnection,
      candidates: [],
      iceCompleted: false,
      type: 'subscriber',
      feedId
    });

    // Handle incoming stream - THIS IS CRITICAL!
    peerConnection.ontrack = (event) => {
      console.log("📺 Received remote stream for feedId:", feedId);
      const [remoteStream] = event.streams;

      if (remoteStream) {
        // Update remote feed with the stream
        const currentStore = useStore.getState();
        currentStore.updateRemoteFeed(feedId, { stream: remoteStream });
        console.log("✅ Updated remote feed stream for feedId:", feedId);
      }
    };

    peerConnection.oniceconnectionstatechange = (event) => {
      console.log(`📡 ICE connection state changed for feedId: ${feedId}`, event);
    };

    peerConnection.onsignalingstatechange = (event) => {
      console.log(`📡 Signaling state changed for feedId: ${feedId}`, event);
    };

    peerConnection.onconnectionstatechange = (event) => {
      console.log(`📡 Connection state changed for feedId: ${feedId}`, event);
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      const currentStore = useStore.getState();
      const peerData = currentStore.peers.get(`sub-${feedId}`);

      if (event.candidate) {
        // Collect candidates
        if (peerData) {
          peerData.candidates.push(event.candidate);
        }
      } else {
        // ICE gathering complete - send all candidates
        if (peerData && !peerData.iceCompleted) {
          peerData.iceCompleted = true;

          // Send candidates in bulk
          this.sendMessage(EVENTS.SEND_ICE_CANDIDATES, {
            feedId,
            type: 'subscriber',
            candidates: peerData.candidates
          });

          // Send completion notification
          this.sendMessage(EVENTS.SEND_ICE_CANDIDATE_COMPLETED, {
            feedId,
            type: 'subscriber'
          });
        }
      }
    };

    this._addPeerMetricsConnection(peerConnection, `sub-${feedId}`);
    console.log("📡 Created subscriber peer connection for feedId:", feedId);
    return peerConnection;
  }

  // Helper method to get local stream
  getLocalStream() {
    return this.tempLocalStream || useStore.getState().localFeeds[0]?.stream;
  }

  // Convenience methods for simulcast control
  async enableHighQuality(feedId) {
    return this.toggleSimulcastLayer(feedId, 'high', true);
  }

  async disableHighQuality(feedId) {
    return this.toggleSimulcastLayer(feedId, 'high', false);
  }

  async enableMediumQuality(feedId) {
    return this.toggleSimulcastLayer(feedId, 'medium', true);
  }

  async disableMediumQuality(feedId) {
    return this.toggleSimulcastLayer(feedId, 'medium', false);
  }

  async enableLowQuality(feedId) {
    return this.toggleSimulcastLayer(feedId, 'low', true);
  }

  async disableLowQuality(feedId) {
    return this.toggleSimulcastLayer(feedId, 'low', false);
  }

  // Adaptive quality control based on network conditions
  async adaptQualityToNetwork(feedId, networkCondition = 'auto') {
    try {
      switch (networkCondition) {
        case 'poor':
          await this.toggleSimulcastLayer(feedId, 'high', false);
          await this.toggleSimulcastLayer(feedId, 'medium', false);
          await this.toggleSimulcastLayer(feedId, 'low', true);
          console.log('📉 Adapted to poor network: low quality only');
          break;

        case 'moderate':
          await this.toggleSimulcastLayer(feedId, 'high', false);
          await this.toggleSimulcastLayer(feedId, 'medium', true);
          await this.toggleSimulcastLayer(feedId, 'low', true);
          console.log('📊 Adapted to moderate network: medium + low quality');
          break;

        case 'good':
          await this.toggleSimulcastLayer(feedId, 'high', true);
          await this.toggleSimulcastLayer(feedId, 'medium', true);
          await this.toggleSimulcastLayer(feedId, 'low', true);
          console.log('📈 Adapted to good network: all quality layers');
          break;

        case 'auto':
        default:
          // Let browser/SFU handle quality selection automatically
          console.log('🔄 Using automatic quality adaptation');
          break;
      }
      return true;
    } catch (error) {
      console.error('Error adapting quality to network:', error);
      return false;
    }
  }

  // Monitor simulcast performance
  async monitorSimulcastPerformance(feedId, intervalMs = 5000) {
    const monitorInterval = setInterval(async () => {
      const stats = await this.getSimulcastStats(feedId);
      if (stats && stats.length > 0) {
        console.log(`📊 Simulcast stats for feedId ${feedId}:`, stats);

        // Check for potential issues
        const activeEncodings = stats.filter(s => s.active);
        if (activeEncodings.length === 0) {
          console.warn('⚠️ No active simulcast encodings detected');
        }

        // Check bitrates
        activeEncodings.forEach(encoding => {
          if (encoding.targetBitrate === 0) {
            console.warn(`⚠️ Zero bitrate detected for ${encoding.rid} layer`);
          }
        });
      } else {
        // Feed might have been removed, stop monitoring
        clearInterval(monitorInterval);
        console.log(`📊 Stopped monitoring simulcast for feedId ${feedId}`);
      }
    }, intervalMs);

    // Store interval reference for cleanup
    if (!this.simulcastMonitors) {
      this.simulcastMonitors = new Map();
    }
    this.simulcastMonitors.set(feedId, monitorInterval);

    return monitorInterval;
  }

  // Stop monitoring simulcast for a specific feed
  stopSimulcastMonitoring(feedId) {
    if (this.simulcastMonitors && this.simulcastMonitors.has(feedId)) {
      clearInterval(this.simulcastMonitors.get(feedId));
      this.simulcastMonitors.delete(feedId);
      console.log(`🛑 Stopped simulcast monitoring for feedId: ${feedId}`);
      return true;
    }
    return false;
  }

  // Clean up all simulcast monitoring
  cleanupSimulcastMonitoring() {
    if (this.simulcastMonitors) {
      this.simulcastMonitors.forEach((interval, feedId) => {
        clearInterval(interval);
        console.log(`🛑 Cleaned up simulcast monitoring for feedId: ${feedId}`);
      });
      this.simulcastMonitors.clear();
    }
  }

  // Update simulcast parameters for a specific feed
  async updateSimulcastParameters(feedId, resolutions) {
    try {
      const store = useStore.getState();
      const peerData = store.peers.get(feedId);
      
      if (!peerData || !peerData.peerConnection) {
        console.warn(`No peer connection found for feedId: ${feedId}`);
        return;
      }

      const senders = peerData.peerConnection.getSenders();
      const videoSender = senders.find(sender => 
        sender.track && sender.track.kind === 'video'
      );

      if (!videoSender) {
        console.warn(`No video sender found for feedId: ${feedId}`);
        return;
      }

      const params = videoSender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        console.warn(`No encodings found for feedId: ${feedId}`);
        return;
      }

      // Map resolutions to encoding indices: h=0, m=1, l=2 (high to low)
      const resolutionMap = { 'h': 0, 'm': 1, 'l': 2 };
      
      // Enable/disable encodings based on selected resolutions
      params.encodings.forEach((encoding, index) => {
        const resolution = Object.keys(resolutionMap).find(key => resolutionMap[key] === index);
        if (resolution) {
          encoding.active = resolutions ? resolutions.includes(resolution) : true;
        }
      });

      await videoSender.setParameters(params);
      console.log(`✅ Updated simulcast parameters for feedId ${feedId}:`, {
        resolutions,
        encodings: params.encodings.map((enc, i) => ({ 
          index: i, 
          rid: enc.rid, 
          active: enc.active 
        }))
      });

    } catch (error) {
      console.error(`❌ Failed to update simulcast parameters for feedId ${feedId}:`, error);
    }
  }

  // Debug methods for simulcast troubleshooting
  enableSimulcastDebug() {
    this.simulcastDebugMode = true;
    console.log('🐛 Simulcast debug mode enabled');
  }

  disableSimulcastDebug() {
    this.simulcastDebugMode = false;
    console.log('🐛 Simulcast debug mode disabled');
  }

  async debugSimulcast(feedId) {
    if (!feedId) {
      console.error('❌ debugSimulcast: feedId is required');
      return null;
    }

    console.log(`🔍 === SIMULCAST DEBUG REPORT FOR FEED ${feedId} ===`);

    // 1. Check simulcast support
    const support = this.detectSimulcastSupport();
    console.log('1. Browser Support:', support);

    // 2. Check peer connection
    const store = useStore.getState();
    const peerData = store.peers.get(feedId);
    console.log('2. Peer Connection:', peerData ? 'Found' : 'Not Found');

    if (!peerData || !peerData.peerConnection) {
      console.log('❌ Cannot debug: No peer connection found');
      return null;
    }

    // 3. Check transceivers
    const transceivers = peerData.peerConnection.getTransceivers();
    console.log('3. Transceivers:', transceivers.length);

    transceivers.forEach((transceiver, index) => {
      if (transceiver.sender && transceiver.sender.track && transceiver.sender.track.kind === 'video') {
        console.log(`   Video Transceiver ${index}:`, {
          direction: transceiver.direction,
          currentDirection: transceiver.currentDirection,
          stopped: transceiver.stopped
        });

        // 4. Check encodings
        const params = transceiver.sender.getParameters();
        console.log(`   Encoding Parameters:`, params.encodings || []);
      }
    });

    // 5. Get current stats
    const stats = await this.getSimulcastStats(feedId);
    console.log('4. Current Stats:', stats);

    // 6. Check configuration
    const config = this.getSimulcastConfiguration(feedId);
    console.log('5. Configuration:', config);

    console.log(`🔍 === END DEBUG REPORT FOR FEED ${feedId} ===`);

    return {
      support,
      peerConnection: !!peerData?.peerConnection,
      transceivers: transceivers.length,
      stats,
      config
    };
  }

  // Test simulcast functionality
  async testSimulcast(feedId) {
    console.log(`🧪 Testing simulcast functionality for feedId: ${feedId}`);

    try {
      // Test 1: Check if we can get simulcast configuration
      const config = this.getSimulcastConfiguration(feedId);
      if (!config) {
        throw new Error('Cannot get simulcast configuration');
      }
      console.log('✅ Test 1: Configuration retrieval - PASSED');

      // Test 2: Check if we can get simulcast stats
      const stats = await this.getSimulcastStats(feedId);
      if (!stats) {
        throw new Error('Cannot get simulcast stats');
      }
      console.log('✅ Test 2: Stats retrieval - PASSED');

      // Test 3: Test layer toggling (if supported)
      if (config.encodings && config.encodings.length > 1) {
        const testRid = config.encodings[0].rid;
        if (testRid) {
          // Disable and re-enable the layer
          await this.toggleSimulcastLayer(feedId, testRid, false);
          await new Promise(resolve => setTimeout(resolve, 100));
          await this.toggleSimulcastLayer(feedId, testRid, true);
          console.log('✅ Test 3: Layer toggling - PASSED');
        } else {
          console.log('⚠️ Test 3: Layer toggling - SKIPPED (no RID found)');
        }
      } else {
        console.log('⚠️ Test 3: Layer toggling - SKIPPED (single encoding)');
      }

      console.log('✅ All simulcast tests passed!');
      return true;
    } catch (error) {
      console.error('❌ Simulcast test failed:', error);
      return false;
    }
  }

  // Leave room method
  async leaveRoom(roomId, userToken) {
    try {
      console.log("🚪 Leaving room:", roomId);

      const response = await fetch(`${import.meta.env.VITE_API_URL}/room/${roomId}/leave`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${userToken}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Authentication failed. Please refresh and try again.");
        }
        if (response.status === 403) {
          throw new Error("Access denied. Unable to leave this room.");
        }
        if (response.status === 404) {
          throw new Error("Room or user not found.");
        }
        throw new Error(data.error || "Failed to leave room");
      }

      console.log("✅ Successfully left room");

      // Clean up simulcast monitoring
      this.cleanupSimulcastMonitoring();

      // Clean up stats monitoring
      this.stopAllStatsMonitoring();

      // Close WebSocket connection
      if (this.webSocket) {
        this.webSocket.close();
        this.webSocket = null;
      }

      // Clean up transceiver references
      this.videoTransceiver = null;

      return { success: true, message: data.message };
    } catch (error) {
      console.error("❌ Error leaving room:", error);
      throw error;
    }
  }
}

export default RoomManager;
