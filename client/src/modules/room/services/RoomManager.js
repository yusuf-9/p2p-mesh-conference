import { EVENTS } from '../constants';
import useStore from '../../../store';
import P2PMeshManager from './P2PMeshManager';

class RoomManager {
  constructor() {
    this.webSocket = null;
    this.pendingMessages = new Map(); // Track pending messages by temp ID
    this.p2pMeshManager = null;
  }

  async connectToWebSocket(userToken, apiKey) {
    return new Promise((resolve, reject) => {
      try {
        // Construct WebSocket URL with query parameters for authentication
        const baseUrl = import.meta.env.VITE_WS_URL.replace(/^http/, 'ws');
        const wsUrl = `${baseUrl}/api/socket/?api_key=${encodeURIComponent(apiKey)}&access_token=${encodeURIComponent(userToken)}`;

        console.log("🔌 Connecting to WebSocket:", wsUrl.replace(/api_key=[^&]+/, 'api_key=***').replace(/access_token=[^&]+/, 'access_token=***'));

        const ws = new WebSocket(wsUrl);

        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error("WebSocket connection timed out after 10 seconds"));
        }, 10000);

        ws.onopen = () => {
          clearTimeout(timeout);
          console.log("✅ WebSocket connected successfully");
          this.webSocket = ws;
          this.p2pMeshManager = new P2PMeshManager(ws);
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
      case EVENTS.USER_JOINED:
        this.handleUserJoined(message.data);
        break;
      case EVENTS.USER_LEFT:
        this.handleUserLeft(message.data);
        break;

      // Chat events
      case EVENTS.MESSAGE_SENT:
        this.handleMessageSent(message.data);
        break;
      case EVENTS.RECEIVE_MESSAGE:
        this.handleMessageReceived(message.data);
        break;

      // Call events (P2P mesh)
      case EVENTS.JOINED_CALL:
        this.handleJoinedCall(message.data);
        break;
      case EVENTS.USER_JOINED_CALL:
        this.handleUserJoinedCall(message.data);
        break;
      case EVENTS.USER_LEFT_CALL:
        this.handleUserLeftCall(message.data);
        break;

      // WebRTC signaling — delegate to P2PMeshManager
      case EVENTS.RECEIVE_WEBRTC_OFFER_FOR_VIDEO_CALL:
      case EVENTS.RECEIVE_WEBRTC_ANSWER_FOR_VIDEO_CALL:
      case EVENTS.RECEIVE_WEBRTC_ICE_CANDIDATE_FOR_VIDEO_CALL:
      case EVENTS.RECEIVE_WEBRTC_OFFER_FOR_SCREEN_SHARE:
      case EVENTS.RECEIVE_WEBRTC_ANSWER_FOR_SCREEN_SHARE:
      case EVENTS.RECEIVE_WEBRTC_ICE_CANDIDATE_FOR_SCREEN_SHARE:
        if (this.p2pMeshManager) this.p2pMeshManager.handleMessage(message);
        break;

      // Media control events
      case EVENTS.USER_TOGGLED_STREAM:
        this.handleUserToggledStream(message.data);
        break;
      case EVENTS.USER_STARTED_SCREEN_SHARE:
        this.handleUserStartedScreenShare(message.data);
        break;
      case EVENTS.USER_STOPPED_SCREEN_SHARE:
        this.handleUserStoppedScreenShare(message.data);
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
    // data is { userId: string } - update member connection status in store
    this.updateMemberConnectionStatus(data.userId, true);
  }

  handleUserDisconnected(data) {
    console.log("👤 User disconnected:", data);
    this.updateMemberConnectionStatus(data.userId, false);

    if (this.p2pMeshManager) {
      const pc = this.p2pMeshManager.peerConnections.get(data.userId);
      if (pc) {
        pc.close();
        this.p2pMeshManager.peerConnections.delete(data.userId);
        this.p2pMeshManager.isInitiator.delete(data.userId);
      }
      this.p2pMeshManager.closeScreenShareConnection(data.userId);
    }

    // Remove any streams belonging to the disconnected user
    const { remoteStreams, setRemoteStreams } = useStore.getState();
    const filtered = remoteStreams.filter(s => s.userId !== data.userId);
    if (filtered.length !== remoteStreams.length) {
      setRemoteStreams(filtered);
      console.log(`📊 Removed remote streams for disconnected user ${data.userId}`);
    }
  }

  handleUserJoined(data) {
    console.log("🚪 User joined room:", data);
    // data is UserSchema - add new member to store
    this.addMemberToRoom(data);
  }

  handleUserLeft(data) {
    console.log("🚪 User left room:", data);
    // data is { userId: string } - remove member from store
    this.removeMemberFromRoom(data.userId);
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

  // Call event handlers
  handleUserJoinedCall(data) {
    console.log("📞 User joined call:", data);
    this.updateMemberCallStatus(data.userId, true);

    if (data.mediaHandles && Array.isArray(data.mediaHandles)) {
      const { addRemoteStream } = useStore.getState();
      data.mediaHandles.forEach(handle => {
        addRemoteStream({
          id: handle.id,
          userId: handle.userId,
          roomId: handle.roomId,
          handleId: handle.handleId,
          type: handle.type,
          feedType: handle.feedType,
          audioEnabled: handle.audioEnabled,
          videoEnabled: handle.videoEnabled,
          handRaised: handle.handRaised,
          createdAt: handle.createdAt,
          stream: null,
        });
      });
    }

    // If we are currently screen sharing, open a screen share PC to the new user
    if (this.p2pMeshManager?.screenShareStream) {
      this.p2pMeshManager.initiateScreenShareConnection(data.userId);
    }
  }

  handleUserLeftCall(data) {
    console.log("📞 User left call:", data);
    this.updateMemberCallStatus(data.userId, false);

    if (this.p2pMeshManager) {
      const pc = this.p2pMeshManager.peerConnections.get(data.userId);
      if (pc) {
        pc.close();
        this.p2pMeshManager.peerConnections.delete(data.userId);
        this.p2pMeshManager.isInitiator.delete(data.userId);
      }
      this.p2pMeshManager.closeScreenShareConnection(data.userId);
    }

    const { remoteStreams, setRemoteStreams } = useStore.getState();
    setRemoteStreams(remoteStreams.filter(s => s.userId !== data.userId));
    console.log(`📊 Removed remote streams for user ${data.userId}`);
  }

  handleUserToggledStream(data) {
    // data is the full updated mediaHandle participant object
    const { remoteStreams, updateRemoteStream } = useStore.getState();
    const handle = remoteStreams.find(s => s.handleId === data.handleId || s.id === data.id);
    if (handle) {
      updateRemoteStream(handle.id, {
        audioEnabled: data.audioEnabled,
        videoEnabled: data.videoEnabled,
      });
    }
    console.log(`🎛️ Stream toggled for user ${data.userId}: audio=${data.audioEnabled} video=${data.videoEnabled}`);
  }

  handleUserStartedScreenShare(data) {
    // data is { userId, mediaHandle }
    const { addRemoteStream } = useStore.getState();
    addRemoteStream({
      id: data.mediaHandle.id,
      userId: data.mediaHandle.userId,
      roomId: data.mediaHandle.roomId,
      handleId: data.mediaHandle.handleId,
      type: data.mediaHandle.type,
      feedType: 'screenshare',
      audioEnabled: data.mediaHandle.audioEnabled,
      videoEnabled: data.mediaHandle.videoEnabled,
      handRaised: false,
      createdAt: data.mediaHandle.createdAt,
      stream: null, // stream arrives automatically via replaceTrack on the existing video transceiver
    });
    console.log(`🖥️ User ${data.userId} started screen share`);
  }

  handleUserStoppedScreenShare(data) {
    // data is { userId, streamId }
    const { remoteStreams, setRemoteStreams } = useStore.getState();
    setRemoteStreams(remoteStreams.filter(s => !(s.userId === data.userId && s.feedType === 'screenshare')));
    console.log(`🛑 User ${data.userId} stopped screen share`);
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
    const { addReaction } = useStore.getState();

    // Add reaction to store
    addReaction({
      emoji: data.reaction,
      userId: data.userId,
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

  // Helper methods to interact with store
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

  updateMemberCallStatus(userId, inCall) {
    const store = useStore.getState();
    store.updateMember(userId, { joinedCall: inCall });
    console.log(`🔄 Updated member ${userId} call status:`, inCall);
  }

  updateMemberHandRaisedStatus(userId, handRaised) {
    // Update member status
    useStore.getState().updateMember(userId, { handRaised });
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
    
    const { user } = useStore.getState();
    return this.sendMessage(EVENTS.SEND_MESSAGE, {
      roomId: user.roomId,
      content: content
    });
  }


  sendScreenshotNotification() {
    return this.sendMessage(EVENTS.SEND_SCREENSHOT_NOTIFICATION, {});
  }

  sendReaction(reaction) {
    return this.sendMessage(EVENTS.SEND_REACTION, reaction);
  }

  // Call Management
  joinCall(audioEnabled, videoEnabled, localStream) {
    const { user } = useStore.getState();
    const streamId = `${user.id}-${Date.now()}`;

    if (this.p2pMeshManager && localStream) {
      this.p2pMeshManager.setLocalStream(localStream);
    }

    return this.sendMessage(EVENTS.JOIN_CALL, {
      roomId: user.roomId,
      streamId: streamId,
      audio: audioEnabled,
      video: videoEnabled,
    });
  }

  leaveCall() {
    const { user } = useStore.getState();
    this.sendMessage(EVENTS.LEAVE_CALL, { roomId: user.roomId });
    if (this.p2pMeshManager) {
      this.p2pMeshManager.leaveCall();
    }
  }

  toggleAudio() {
    if (!this.p2pMeshManager) return;
    const newEnabled = this.p2pMeshManager.toggleAudio();
    if (newEnabled === null) return;

    const { user, localStreams, updateCallState } = useStore.getState();
    updateCallState({ isAudioEnabled: newEnabled });

    const handle = localStreams.find(s => s.feedType === 'camera');
    if (handle) {
      const { isVideoEnabled } = useStore.getState().callState;
      this.sendMessage(EVENTS.TOGGLE_STREAM, {
        roomId: user.roomId,
        streamId: handle.handleId,
        audio: newEnabled,
        video: isVideoEnabled,
      });
    }
  }

  toggleVideo() {
    if (!this.p2pMeshManager) return;
    const newEnabled = this.p2pMeshManager.toggleVideo();
    if (newEnabled === null) return;

    const { user, localStreams, updateCallState } = useStore.getState();
    updateCallState({ isVideoEnabled: newEnabled });

    const handle = localStreams.find(s => s.feedType === 'camera');
    if (handle) {
      const { isAudioEnabled } = useStore.getState().callState;
      this.sendMessage(EVENTS.TOGGLE_STREAM, {
        roomId: user.roomId,
        streamId: handle.handleId,
        audio: isAudioEnabled,
        video: newEnabled,
      });
    }
  }

  async startScreenShare() {
    if (!this.p2pMeshManager) return;
    const { user, addLocalStream, setScreenShareStream } = useStore.getState();

    const stream = await this.p2pMeshManager.startScreenShare();
    const streamId = `${user.id}-screen-${Date.now()}`;

    // Add a local stream entry for the screen share feed
    addLocalStream({
      id: `local-screen-${Date.now()}`,
      userId: user.id,
      roomId: user.roomId,
      handleId: streamId,
      type: 'p2p_mesh',
      feedType: 'screenshare',
      audioEnabled: false,
      videoEnabled: true,
      handRaised: false,
      createdAt: new Date().toISOString(),
      stream,
    });
    setScreenShareStream(stream);

    this.sendMessage(EVENTS.START_SCREEN_SHARE, {
      roomId: user.roomId,
      streamId,
      audio: false,
      video: true,
    });

    // If the user stops via the browser's native "Stop sharing" button
    stream.getVideoTracks()[0].onended = () => this.stopScreenShare();

    return stream;
  }

  async stopScreenShare() {
    if (!this.p2pMeshManager?.screenShareStream) return;
    const { user, localStreams, setLocalStreams, setScreenShareStream } = useStore.getState();

    const handle = localStreams.find(s => s.feedType === 'screenshare' && s.userId === user.id);

    await this.p2pMeshManager.stopScreenShare();
    setScreenShareStream(null);

    if (handle) {
      setLocalStreams(localStreams.filter(s => s.id !== handle.id));
      this.sendMessage(EVENTS.STOP_SCREEN_SHARE, {
        roomId: user.roomId,
        streamId: handle.handleId,
      });
    }
  }

  raiseHand() {
    return this.sendMessage(EVENTS.RAISE_HAND, {});
  }

  lowerHand() {
    return this.sendMessage(EVENTS.LOWER_HAND, {});
  }

  ping() {
    return this.sendMessage(EVENTS.PING, {});
  }

  disconnect() {
    return this.sendMessage(EVENTS.DISCONNECT, {});
  }

  // Leave room method
  async leaveRoom(roomId, apiKey, userToken) {
    try {
      console.log("🚪 Leaving room:", roomId);

      const response = await fetch(`${import.meta.env.VITE_API_URL}/room/${roomId}/leave`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
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

      // Clean up P2P mesh manager
      if (this.p2pMeshManager) {
        this.p2pMeshManager.cleanup();
        this.p2pMeshManager = null;
      }

      // Close WebSocket connection
      if (this.webSocket) {
        this.webSocket.close();
        this.webSocket = null;
      }

      return { success: true, message: data.message };
    } catch (error) {
      console.error("❌ Error leaving room:", error);
      throw error;
    }
  }

  // Call event handlers
  handleJoinedCall(data) {
    console.log("📞 Successfully joined call:", data);
    const { user, setLocalStreams, setRemoteStreams, updateCallState } = useStore.getState();

    updateCallState({
      isInCall: true,
      joinRequestState: { isLoading: false, error: null },
    });

    const localStreams = [];
    const remoteStreams = [];
    const remoteUserIds = new Set();

    if (data.mediaHandles && Array.isArray(data.mediaHandles)) {
      data.mediaHandles.forEach(handle => {
        const streamObj = {
          id: handle.id,
          userId: handle.userId,
          roomId: handle.roomId,
          handleId: handle.handleId,
          type: handle.type,
          feedType: handle.feedType,
          audioEnabled: handle.audioEnabled,
          videoEnabled: handle.videoEnabled,
          handRaised: handle.handRaised,
          createdAt: handle.createdAt,
          stream: null,
        };

        if (handle.userId === user.id) {
          // Attach the local MediaStream so the feed renders immediately
          if (handle.feedType === 'camera' && this.p2pMeshManager?.localStream) {
            streamObj.stream = this.p2pMeshManager.localStream;
          }
          localStreams.push(streamObj);
        } else {
          remoteStreams.push(streamObj);
          remoteUserIds.add(handle.userId);
        }
      });
    }

    setLocalStreams(localStreams);
    setRemoteStreams(remoteStreams);
    console.log("📊 Streams populated:", { localStreams, remoteStreams });

    // Mark all existing remote users as in-call so MeshTopology shows them
    remoteUserIds.forEach(userId => this.updateMemberCallStatus(userId, true));

    // Initiate peer connections to every user already in the call
    if (this.p2pMeshManager && remoteUserIds.size > 0) {
      this.p2pMeshManager.initiateCallConnections([...remoteUserIds]);
    }
  }
}

export default RoomManager;
