import { AuthenticatedWebSocket, VideoCallOfferPayload, VideoCallAnswerPayload, VideoCallIceCandidatePayload, ScreenShareOfferPayload, ScreenShareAnswerPayload, ScreenShareIceCandidatePayload, RTCSessionDescription, RTCIceCandidate } from "./types.js";
import { EVENTS } from "./constants.js";
import { WebSocket } from "ws";
import DatabaseService from "../database/index.js";

/**
 * P2P Mesh Relay Handlers
 * These handlers implement the P2P relay pattern for WebRTC signaling
 * Following StreamLocal pattern with to/from targeting
 */
export class P2PMeshHandlers {
  constructor(
    private dbService: DatabaseService,
    private wsConnections: Map<string, AuthenticatedWebSocket>,
    private broadcastToRoom: (roomId: string, type: string, data: unknown, excludeUserId?: string, onlyUsersInCall?: boolean) => Promise<void>
  ) {}

  /**
   * Handle user joining call
   */
  async handleJoinCall(ws: AuthenticatedWebSocket, data: { roomId: string; streamId: string; audio: boolean; video: boolean }): Promise<void> {
    console.log(`📞 User ${ws.userId} joining call in room ${data.roomId}`);
    
    if (ws.roomId !== data.roomId) {
      throw new Error("Room ID mismatch");
    }

    // Update the user's joinedCall status
    await this.dbService.userRepository.updateUser(ws.userId!, { joinedCall: true });
    
    // Create media handle for this user's camera stream
    const newMediaHandle = await this.dbService.mediaHandleRepository.createMediaHandle({
      userId: ws.userId!,
      roomId: data.roomId,
      handleId: data.streamId,
      type: "p2p_mesh",
      feedType: "camera",
      audioEnabled: data.audio,
      videoEnabled: data.video,
      handRaised: false
    });

    // Get all media handles in the room (including this user)
    const existingMediaHandles = await this.dbService.mediaHandleRepository.getMediaHandlesInRoom(data.roomId);
    
    // Convert to P2P mesh participants format
    const existingParticipants = existingMediaHandles.map(handle => ({
      id: handle.id,
      userId: handle.userId,
      roomId: handle.roomId,
      handleId: handle.handleId,
      type: handle.type as any,
      feedType: handle.feedType as any,
      audioEnabled: handle.audioEnabled,
      videoEnabled: handle.videoEnabled,
      handRaised: handle.handRaised,
      createdAt: handle.createdAt.toISOString()
    }));

    // Send joined confirmation with existing participants to joining user
    ws.send(JSON.stringify({
      type: EVENTS.JOINED_CALL,
      data: {
        mediaHandles: existingParticipants
      }
    }));

    // Get this user's media handles to broadcast to others
    const userMediaHandles = await this.dbService.mediaHandleRepository.getMediaHandlesByUserAndRoom(ws.userId!, data.roomId);
    const userParticipants = userMediaHandles.map(handle => ({
      id: handle.id,
      userId: handle.userId,
      roomId: handle.roomId,
      handleId: handle.handleId,
      type: handle.type as any,
      feedType: handle.feedType as any,
      audioEnabled: handle.audioEnabled,
      videoEnabled: handle.videoEnabled,
      handRaised: handle.handRaised,
      createdAt: handle.createdAt.toISOString()
    }));

    // Broadcast to users in call that this user joined
    await this.broadcastToRoom(
      data.roomId,
      EVENTS.USER_JOINED_CALL,
      {
        userId: ws.userId!,
        mediaHandles: userParticipants
      },
      ws.userId,
      true // only to users in call
    );

    console.log(`📢 User ${ws.userId} joined call notification sent to users in call in room ${data.roomId}`);
  }

  /**
   * Handle user leaving call
   */
  async handleLeaveCall(ws: AuthenticatedWebSocket, data: { roomId: string }): Promise<void> {
    console.log(`👋 User ${ws.userId} leaving call in room ${data.roomId}`);
    
    if (ws.roomId !== data.roomId) {
      throw new Error("Room ID mismatch");
    }

    // Update the user's joinedCall status
    await this.dbService.userRepository.updateUser(ws.userId!, { joinedCall: false });
    
    // Delete all media handles for this user in this room
    await this.dbService.mediaHandleRepository.deleteMediaHandlesForUser(ws.userId!, data.roomId);

    // Broadcast to users in call that this user left
    await this.broadcastToRoom(
      data.roomId,
      EVENTS.USER_LEFT_CALL,
      {
        userId: ws.userId!
      },
      ws.userId,
      true // only to users in call
    );

    console.log(`📢 User ${ws.userId} left call notification sent to users in call in room ${data.roomId}`);
  }

  // ============================================================================
  // Video Call WebRTC Relay Handlers
  // ============================================================================
  
  /**
   * Handle video call WebRTC offer relay
   */
  async handleVideoCallOffer(ws: AuthenticatedWebSocket, data: { to: string; roomId: string; offer: RTCSessionDescription }): Promise<void> {
    console.log(`📤 User ${ws.userId} sending video call offer to ${data.to} in room ${data.roomId}`);
    
    if (ws.roomId !== data.roomId) {
      throw new Error("Room ID mismatch");
    }

    const targetWs = this.wsConnections.get(data.to);
    if (!targetWs || targetWs.readyState !== WebSocket.OPEN) {
      console.warn(`Target user ${data.to} not connected, offer dropped`);
      return;
    }

    // Relay offer to target peer
    targetWs.send(JSON.stringify({
      type: EVENTS.RECEIVE_WEBRTC_OFFER_FOR_VIDEO_CALL,
      data: {
        from: ws.userId!,
        offer: data.offer
      }
    }));

    console.log(`🔄 Video call offer relayed from ${ws.userId} to ${data.to}`);
  }

  /**
   * Handle video call WebRTC answer relay
   */
  async handleVideoCallAnswer(ws: AuthenticatedWebSocket, data: { to: string; roomId: string; answer: RTCSessionDescription }): Promise<void> {
    console.log(`📥 User ${ws.userId} sending video call answer to ${data.to} in room ${data.roomId}`);
    
    if (ws.roomId !== data.roomId) {
      throw new Error("Room ID mismatch");
    }

    const targetWs = this.wsConnections.get(data.to);
    if (!targetWs || targetWs.readyState !== WebSocket.OPEN) {
      console.warn(`Target user ${data.to} not connected, answer dropped`);
      return;
    }

    // Relay answer to target peer
    targetWs.send(JSON.stringify({
      type: EVENTS.RECEIVE_WEBRTC_ANSWER_FOR_VIDEO_CALL,
      data: {
        from: ws.userId!,
        answer: data.answer
      }
    }));

    console.log(`🔄 Video call answer relayed from ${ws.userId} to ${data.to}`);
  }

  /**
   * Handle video call ICE candidate relay
   */
  async handleVideoCallIceCandidate(ws: AuthenticatedWebSocket, data: { to: string; roomId: string; candidate: RTCIceCandidate }): Promise<void> {
    if (ws.roomId !== data.roomId) {
      throw new Error("Room ID mismatch");
    }

    const targetWs = this.wsConnections.get(data.to);
    if (!targetWs || targetWs.readyState !== WebSocket.OPEN) {
      // Silently ignore if target not connected (ICE candidates can be sent frequently)
      return;
    }

    // Relay ICE candidate to target peer
    targetWs.send(JSON.stringify({
      type: EVENTS.RECEIVE_WEBRTC_ICE_CANDIDATE_FOR_VIDEO_CALL,
      data: {
        from: ws.userId!,
        candidate: data.candidate
      }
    }));
  }

  // ============================================================================
  // Screen Share WebRTC Relay Handlers
  // ============================================================================
  
  /**
   * Handle start screen share
   */
  async handleStartScreenShare(ws: AuthenticatedWebSocket, data: { roomId: string; streamId: string; audio: boolean; video: boolean }): Promise<void> {
    console.log(`🖥️ User ${ws.userId} starting screen share in room ${data.roomId}`);
    
    if (ws.roomId !== data.roomId) {
      throw new Error("Room ID mismatch");
    }
    
    // Create media handle for screen share
    const screenShareHandle = await this.dbService.mediaHandleRepository.createMediaHandle({
      userId: ws.userId!,
      roomId: data.roomId,
      handleId: data.streamId,
      type: "p2p_mesh",
      feedType: "screenshare",
      audioEnabled: data.audio,
      videoEnabled: data.video,
      handRaised: false
    });

    // Convert to P2P mesh participant format
    const participant = {
      id: screenShareHandle.id,
      userId: screenShareHandle.userId,
      roomId: screenShareHandle.roomId,
      handleId: screenShareHandle.handleId,
      type: screenShareHandle.type as any,
      feedType: screenShareHandle.feedType as any,
      audioEnabled: screenShareHandle.audioEnabled,
      videoEnabled: screenShareHandle.videoEnabled,
      handRaised: screenShareHandle.handRaised,
      createdAt: screenShareHandle.createdAt.toISOString()
    };

    // Broadcast to users in call that this user started screen share
    await this.broadcastToRoom(
      data.roomId,
      EVENTS.USER_STARTED_SCREEN_SHARE,
      {
        userId: ws.userId!,
        mediaHandle: participant
      },
      ws.userId,
      true // only to users in call
    );

    console.log(`📢 User ${ws.userId} started screen share notification sent to users in call in room ${data.roomId}`);
  }
  
  /**
   * Handle stop screen share
   */
  async handleStopScreenShare(ws: AuthenticatedWebSocket, data: { roomId: string; streamId: string }): Promise<void> {
    console.log(`🛑 User ${ws.userId} stopping screen share in room ${data.roomId}`);
    
    if (ws.roomId !== data.roomId) {
      throw new Error("Room ID mismatch");
    }

    // Delete the specific screen share media handle
    await this.dbService.mediaHandleRepository.deleteMediaHandleById(data.streamId);

    // Broadcast to users in call that this user stopped screen share
    await this.broadcastToRoom(
      data.roomId,
      EVENTS.USER_STOPPED_SCREEN_SHARE,
      {
        userId: ws.userId!,
        streamId: data.streamId
      },
      ws.userId,
      true // only to users in call
    );

    console.log(`📢 User ${ws.userId} stopped screen share notification sent to users in call in room ${data.roomId}`);
  }
  
  /**
   * Handle screen share WebRTC offer relay
   */
  async handleScreenShareOffer(ws: AuthenticatedWebSocket, data: { to: string; roomId: string; offer: RTCSessionDescription }): Promise<void> {
    console.log(`📤 User ${ws.userId} sending screen share offer to ${data.to} in room ${data.roomId}`);
    
    if (ws.roomId !== data.roomId) {
      throw new Error("Room ID mismatch");
    }

    const targetWs = this.wsConnections.get(data.to);
    if (!targetWs || targetWs.readyState !== WebSocket.OPEN) {
      console.warn(`Target user ${data.to} not connected, offer dropped`);
      return;
    }

    // Relay offer to target peer
    targetWs.send(JSON.stringify({
      type: EVENTS.RECEIVE_WEBRTC_OFFER_FOR_SCREEN_SHARE,
      data: {
        from: ws.userId!,
        offer: data.offer
      }
    }));

    console.log(`🔄 Screen share offer relayed from ${ws.userId} to ${data.to}`);
  }
  
  /**
   * Handle screen share WebRTC answer relay
   */
  async handleScreenShareAnswer(ws: AuthenticatedWebSocket, data: { to: string; roomId: string; answer: RTCSessionDescription }): Promise<void> {
    console.log(`📥 User ${ws.userId} sending screen share answer to ${data.to} in room ${data.roomId}`);
    
    if (ws.roomId !== data.roomId) {
      throw new Error("Room ID mismatch");
    }

    const targetWs = this.wsConnections.get(data.to);
    if (!targetWs || targetWs.readyState !== WebSocket.OPEN) {
      console.warn(`Target user ${data.to} not connected, answer dropped`);
      return;
    }

    // Relay answer to target peer
    targetWs.send(JSON.stringify({
      type: EVENTS.RECEIVE_WEBRTC_ANSWER_FOR_SCREEN_SHARE,
      data: {
        from: ws.userId!,
        answer: data.answer
      }
    }));

    console.log(`🔄 Screen share answer relayed from ${ws.userId} to ${data.to}`);
  }
  
  /**
   * Handle screen share ICE candidate relay
   */
  async handleScreenShareIceCandidate(ws: AuthenticatedWebSocket, data: { to: string; roomId: string; candidate: RTCIceCandidate }): Promise<void> {
    if (ws.roomId !== data.roomId) {
      throw new Error("Room ID mismatch");
    }

    const targetWs = this.wsConnections.get(data.to);
    if (!targetWs || targetWs.readyState !== WebSocket.OPEN) {
      // Silently ignore if target not connected
      return;
    }

    // Relay ICE candidate to target peer
    targetWs.send(JSON.stringify({
      type: EVENTS.RECEIVE_WEBRTC_ICE_CANDIDATE_FOR_SCREEN_SHARE,
      data: {
        from: ws.userId!,
        candidate: data.candidate
      }
    }));
  }

  // ============================================================================
  // Media Control Handlers
  // ============================================================================
  
  /**
   * Handle stream toggle (audio/video for specific stream)
   */
  async handleToggleStream(ws: AuthenticatedWebSocket, data: { roomId: string; streamId: string; audio: boolean; video: boolean }): Promise<void> {
    console.log(`🎛️ User ${ws.userId} toggling stream ${data.streamId} (audio: ${data.audio}, video: ${data.video}) in room ${data.roomId}`);
    
    if (ws.roomId !== data.roomId) {
      throw new Error("Room ID mismatch");
    }

    // Update the specific media handle
    const updatedHandle = await this.dbService.mediaHandleRepository.updateMediaStatesByHandleId(data.streamId, data.audio, data.video);
    
    if (!updatedHandle) {
      throw new Error("Media handle not found");
    }

    // Convert to P2P mesh participant format
    const participant = {
      id: updatedHandle.id,
      userId: updatedHandle.userId,
      roomId: updatedHandle.roomId,
      handleId: updatedHandle.handleId,
      type: updatedHandle.type as any,
      feedType: updatedHandle.feedType as any,
      audioEnabled: updatedHandle.audioEnabled,
      videoEnabled: updatedHandle.videoEnabled,
      handRaised: updatedHandle.handRaised,
      createdAt: updatedHandle.createdAt.toISOString()
    };

    // Broadcast stream toggle to users in call
    await this.broadcastToRoom(
      data.roomId,
      EVENTS.USER_TOGGLED_STREAM,
      participant,
      ws.userId,
      true // only to users in call
    );

    console.log(`📢 Stream toggle broadcasted for user ${ws.userId}, stream ${data.streamId}`);
  }
  
  // ============================================================================
  // Interaction Handlers
  // ============================================================================
  
  /**
   * Handle hand raise
   */
  async handleRaiseHand(ws: AuthenticatedWebSocket, data: { roomId: string }): Promise<void> {
    console.log(`✋ User ${ws.userId} raising hand in room ${data.roomId}`);
    
    if (ws.roomId !== data.roomId) {
      throw new Error("Room ID mismatch");
    }

    // Broadcast to other users
    await this.broadcastToRoom(
      data.roomId,
      EVENTS.USER_RAISED_HAND,
      {
        userId: ws.userId!
      },
      ws.userId
    );

    console.log(`📢 Hand raise broadcasted for user ${ws.userId}`);
  }
  
  /**
   * Handle hand lower
   */
  async handleLowerHand(ws: AuthenticatedWebSocket, data: { roomId: string }): Promise<void> {
    console.log(`✋ User ${ws.userId} lowering hand in room ${data.roomId}`);
    
    if (ws.roomId !== data.roomId) {
      throw new Error("Room ID mismatch");
    }

    // Broadcast to other users
    await this.broadcastToRoom(
      data.roomId,
      EVENTS.USER_LOWERED_HAND,
      {
        userId: ws.userId!
      },
      ws.userId
    );

    console.log(`📢 Hand lower broadcasted for user ${ws.userId}`);
  }
}