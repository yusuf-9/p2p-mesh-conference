import { AuthenticatedWebSocket } from "./types.js";
import { EVENTS } from "./constants.js";
import DatabaseService from "../database/index.js";

/**
 * P2P Mesh Signaling Handlers
 * These handlers facilitate WebRTC signaling between peers in a mesh topology
 */
export class P2PMeshHandlers {
  constructor(
    private dbService: DatabaseService,
    private wsConnections: Map<string, AuthenticatedWebSocket>,
    private broadcastToRoom: (roomId: string, type: string, data: any, excludeUserId?: string, onlyUsersInCall?: boolean) => Promise<void>
  ) {}

  /**
   * Handle user joining P2P call
   */
  async handleJoinCall(ws: AuthenticatedWebSocket, data: { audio?: boolean; video?: boolean }): Promise<void> {
    console.log(`🎥 User ${ws.userId} joining P2P call in room ${ws.roomId}`);

    // Mark user as joined in database
    await this.dbService.userRepository.updateCallStatus(ws.userId!, true);

    // Send confirmation to user
    ws.send(JSON.stringify({
      type: EVENTS.CALL_JOINED,
      data: {
        audio: data.audio ?? true,
        video: data.video ?? true
      }
    }));

    // Broadcast to other users that this peer joined
    await this.broadcastToRoom(
      ws.roomId!,
      EVENTS.PEER_JOINED_CALL,
      {
        userId: ws.userId!,
        audio: data.audio ?? true,
        video: data.video ?? true
      },
      ws.userId,
      true // only to users in call
    );

    console.log(`📢 User ${ws.userId} joined call notification sent to room ${ws.roomId}`);
  }

  /**
   * Handle user leaving P2P call
   */
  async handleLeaveCall(ws: AuthenticatedWebSocket): Promise<void> {
    console.log(`👋 User ${ws.userId} leaving P2P call in room ${ws.roomId}`);

    // Mark user as left in database
    await this.dbService.userRepository.updateCallStatus(ws.userId!, false);

    // Send confirmation to user
    ws.send(JSON.stringify({
      type: EVENTS.CALL_LEFT
    }));

    // Broadcast to other users that this peer left
    await this.broadcastToRoom(
      ws.roomId!,
      EVENTS.PEER_LEFT_CALL,
      {
        userId: ws.userId!
      },
      ws.userId,
      true // only to users in call
    );

    console.log(`📢 User ${ws.userId} left call notification sent to room ${ws.roomId}`);
  }

  /**
   * Handle P2P WebRTC offer - relay to target peer
   */
  async handlePeerOffer(ws: AuthenticatedWebSocket, data: { targetUserId: string; offer: RTCSessionDescriptionInit }): Promise<void> {
    console.log(`📤 User ${ws.userId} sending offer to ${data.targetUserId}`);

    const targetWs = this.wsConnections.get(data.targetUserId);
    if (!targetWs || targetWs.readyState !== 1) {
      ws.send(JSON.stringify({
        type: EVENTS.ERROR,
        error: "Target user not connected"
      }));
      return;
    }

    // Relay offer to target peer
    targetWs.send(JSON.stringify({
      type: EVENTS.PEER_OFFER_RECEIVED,
      data: {
        fromUserId: ws.userId!,
        offer: data.offer
      }
    }));

    console.log(`🔄 Offer relayed from ${ws.userId} to ${data.targetUserId}`);
  }

  /**
   * Handle P2P WebRTC answer - relay to target peer
   */
  async handlePeerAnswer(ws: AuthenticatedWebSocket, data: { targetUserId: string; answer: RTCSessionDescriptionInit }): Promise<void> {
    console.log(`📥 User ${ws.userId} sending answer to ${data.targetUserId}`);

    const targetWs = this.wsConnections.get(data.targetUserId);
    if (!targetWs || targetWs.readyState !== 1) {
      ws.send(JSON.stringify({
        type: EVENTS.ERROR,
        error: "Target user not connected"
      }));
      return;
    }

    // Relay answer to target peer
    targetWs.send(JSON.stringify({
      type: EVENTS.PEER_ANSWER_RECEIVED,
      data: {
        fromUserId: ws.userId!,
        answer: data.answer
      }
    }));

    console.log(`🔄 Answer relayed from ${ws.userId} to ${data.targetUserId}`);
  }

  /**
   * Handle P2P ICE candidate - relay to target peer
   */
  async handlePeerIceCandidate(ws: AuthenticatedWebSocket, data: { targetUserId: string; candidate: RTCIceCandidateInit }): Promise<void> {
    console.log(`🧊 User ${ws.userId} sending ICE candidate to ${data.targetUserId}`);

    const targetWs = this.wsConnections.get(data.targetUserId);
    if (!targetWs || targetWs.readyState !== 1) {
      // Silently ignore if target not connected (ICE candidates can be sent frequently)
      return;
    }

    // Relay ICE candidate to target peer
    targetWs.send(JSON.stringify({
      type: EVENTS.PEER_ICE_CANDIDATE_RECEIVED,
      data: {
        fromUserId: ws.userId!,
        candidate: data.candidate
      }
    }));

    console.log(`🔄 ICE candidate relayed from ${ws.userId} to ${data.targetUserId}`);
  }

  /**
   * Handle media toggle (audio/video mute/unmute)
   */
  async handleToggleMedia(ws: AuthenticatedWebSocket, data: { audio?: boolean; video?: boolean }): Promise<void> {
    console.log(`🎚️ User ${ws.userId} toggling media - audio: ${data.audio}, video: ${data.video}`);

    // Send confirmation to user
    ws.send(JSON.stringify({
      type: EVENTS.MEDIA_TOGGLED,
      data: {
        audio: data.audio,
        video: data.video
      }
    }));

    // Broadcast media state change to other users in call
    await this.broadcastToRoom(
      ws.roomId!,
      EVENTS.PEER_MEDIA_TOGGLED,
      {
        userId: ws.userId!,
        audio: data.audio,
        video: data.video
      },
      ws.userId,
      true // only to users in call
    );

    console.log(`📢 Media toggle broadcasted for user ${ws.userId}`);
  }

  /**
   * Handle hand raise/lower
   */
  async handleRaiseHand(ws: AuthenticatedWebSocket, data: { raised: boolean }): Promise<void> {
    console.log(`✋ User ${ws.userId} ${data.raised ? 'raising' : 'lowering'} hand`);

    // Send confirmation to user
    ws.send(JSON.stringify({
      type: data.raised ? EVENTS.HAND_RAISED : EVENTS.HAND_LOWERED
    }));

    // Broadcast to other users in call
    await this.broadcastToRoom(
      ws.roomId!,
      data.raised ? EVENTS.HAND_RAISED_BY_USER : EVENTS.HAND_LOWERED_BY_USER,
      {
        userId: ws.userId!
      },
      ws.userId,
      true // only to users in call
    );

    console.log(`📢 Hand ${data.raised ? 'raise' : 'lower'} broadcasted for user ${ws.userId}`);
  }
}