import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { ZodError } from "zod";
import AuthService from "../auth/index.js";
import { AuthenticatedWebSocket, ServerToClientMessage, PubSubRoomBroadcast, User, Message } from "./types.js";
import {
  validateClientMessage,
  validatePubSubRoomBroadcast,
  type ClientToServerMessage,
  ClientToServerMessages,
} from "./schema.js";
import DatabaseService from "../database/index.js";
import PubSubService from "../pubsub/index.js";
import { messages } from "../database/schema.js";
import { CHANNELS, EVENTS } from "./constants.js";
import ConfigService from "../config/index.js";
import { createUserFriendlyErrorMessage } from "./utils.js";
import { P2PMeshHandlers } from "./p2p-handlers.js";

export default class P2PMeshServer {
  private httpServer: http.Server;
  private wss: WebSocketServer;
  private authService: AuthService;
  private dbService: DatabaseService;
  private pubSubService: PubSubService;
  private configService: ConfigService;
  private wsConnections: Map<string, AuthenticatedWebSocket> = new Map();
  private p2pHandlers: P2PMeshHandlers;

  constructor(
    app: express.Application,
    authService: AuthService,
    dbService: DatabaseService,
    pubSubService: PubSubService,
    configService: ConfigService
  ) {
    this.authService = authService;
    this.dbService = dbService;
    this.configService = configService;
    this.pubSubService = pubSubService;
    this.httpServer = http.createServer(app);
    this.wss = new WebSocketServer({ noServer: true });

    this.p2pHandlers = new P2PMeshHandlers(
      this.dbService,
      this.wsConnections,
      this.broadcastToRoom.bind(this)
    );

    this.initializeServer();
  }

  private initializeServer(): void {
    this.setupPubSubHandlers();
    this.httpServer.on("upgrade", this.handleUpgrade.bind(this));
    this.wss.on("connection", this.handleConnection.bind(this));
  }

  private setupPubSubHandlers(): void {
    this.pubSubService.subscribeJSON(CHANNELS.ROOM_BROADCASTS_CHANNEL, this.handleRoomBroadcast.bind(this));
  }

  private async handleRoomBroadcast(data: unknown): Promise<void> {
    try {
      const validatedData = validatePubSubRoomBroadcast(data);

      console.log("📨 Room broadcast received:", {
        roomId: validatedData.roomId,
        messageType: validatedData.message.type,
        excludeId: validatedData.excludeId,
        onlyUsersInCall: validatedData.onlyUsersInCall
      });

      const targetUsers = validatedData.onlyUsersInCall
        ? await this.dbService.userRepository.getUsersInCallInRoom(validatedData.roomId)
        : await this.dbService.userRepository.getConnectedUsersInRoom(validatedData.roomId);

      const message = JSON.stringify({
        type: validatedData.message.type,
        data: validatedData.message.data,
      } as ServerToClientMessage);

      console.log(`📢 Broadcasting to ${validatedData.onlyUsersInCall ? 'users in call' : 'connected users'} in room ${validatedData.roomId}:`, {
        targetCount: targetUsers.length,
        messageType: validatedData.message.type,
      });

      for (const user of targetUsers) {
        if (user.id === validatedData.excludeId) continue;

        const ws = this.wsConnections.get(user.id);
        if (ws && ws.readyState === WebSocket.OPEN) {
          console.log(`📤 Broadcasting to user ${user.id}`);
          ws.send(message);
        }
      }
    } catch (err) {
      if (err instanceof ZodError) {
        console.error("❌ Invalid room broadcast message format:", {
          error: err.message,
          data,
          issues: err.issues,
        });
        return;
      }
      console.error("❌ Error handling room broadcast:", err);
    }
  }

  private async handleConnection(ws: AuthenticatedWebSocket, req: http.IncomingMessage): Promise<void> {
    console.log(`✅ P2P WebSocket connected [userId: ${ws.userId}]`);

    try {
      if (!ws.userId || !ws.roomId) {
        throw new Error("User not authenticated");
      }

      const dbUser = await this.dbService.userRepository.getUserById(ws.userId);
      if (!dbUser || dbUser.roomId !== ws.roomId) {
        throw new Error("User not found in this room");
      }

      this.wsConnections.set(ws.userId, ws);
      await this.dbService.userRepository.updateConnectionStatus(ws.userId, true);

      ws.on("message", data => this.handleMessageWithErrorBoundary(ws, data as any));
      ws.on("close", () => this.handleDisconnect(ws));
      ws.on("error", error => this.handleSocketError(ws, error));

      console.log(`📤 Sending connection confirmation to user ${ws.userId}`);
      ws.send(JSON.stringify({
        type: EVENTS.CONNECTED,
        data: { ...dbUser, connected: true },
      } as ServerToClientMessage));

      // Broadcast to other users that this user connected
      await this.broadcastToRoom(dbUser.roomId, EVENTS.USER_CONNECTED, dbUser.id, dbUser.id);
    } catch (error) {
      console.error(`❌ Error during user connection:`, error);
      this.sendError(ws, error instanceof Error ? error.message : "Connection failed");
      ws.close();
    }
  }

  private async handleMessageWithErrorBoundary(
    ws: AuthenticatedWebSocket,
    data: ReturnType<typeof JSON.stringify>
  ): Promise<void> {
    try {
      console.log(`📥 Received P2P message from user ${ws.userId}:`, data.toString());

      const rawMessage = JSON.parse(data.toString());
      const validatedMessage = validateClientMessage(rawMessage);

      console.log(`✅ P2P Message validated:`, {
        type: validatedMessage.type,
        userId: ws.userId,
      });

      await this.routeMessage(ws, validatedMessage);
    } catch (error) {
      console.error(`❌ P2P Message handling error [userId: ${ws.userId}]:`, error);

      if (error instanceof ZodError) {
        const userFriendlyError = createUserFriendlyErrorMessage(error);
        this.sendError(ws, userFriendlyError);
        return;
      }

      if (error instanceof SyntaxError) {
        this.sendError(ws, "Invalid JSON format");
        return;
      }

      const errorMessage = error instanceof Error ? error.message : "Failed to parse message";
      this.sendError(ws, errorMessage);
    }
  }

  private async routeMessage(ws: AuthenticatedWebSocket, message: ClientToServerMessage): Promise<void> {
    console.log(`🔄 Routing P2P message for user ${ws.userId}:`, {
      type: message.type,
    });

    try {
      switch (message.type) {
        case EVENTS.SEND_MESSAGE:
          await this.handleSendMessage(ws, message.data);
          break;
        case EVENTS.DISCONNECT:
          this.handleDisconnect(ws);
          break;
        case EVENTS.PING:
          this.handlePing(ws);
          break;
        
        // Call Management
        case EVENTS.JOIN_CALL:
          await this.p2pHandlers.handleJoinCall(ws, message.data);
          break;
        case EVENTS.LEAVE_CALL:
          await this.p2pHandlers.handleLeaveCall(ws, message.data);
          break;
        
        // Video Call WebRTC Signaling (P2P Relay)
        case EVENTS.SEND_WEBRTC_OFFER_FOR_VIDEO_CALL:
          await this.p2pHandlers.handleVideoCallOffer(ws, message.data);
          break;
        case EVENTS.SEND_WEBRTC_ANSWER_FOR_VIDEO_CALL:
          await this.p2pHandlers.handleVideoCallAnswer(ws, message.data);
          break;
        case EVENTS.SEND_WEBRTC_ICE_CANDIDATE_FOR_VIDEO_CALL:
          await this.p2pHandlers.handleVideoCallIceCandidate(ws, message.data);
          break;
        
        // Screen Sharing Management
        case EVENTS.START_SCREEN_SHARE:
          await this.p2pHandlers.handleStartScreenShare(ws, message.data);
          break;
        case EVENTS.STOP_SCREEN_SHARE:
          await this.p2pHandlers.handleStopScreenShare(ws, message.data);
          break;
        
        // Screen Share WebRTC Signaling (P2P Relay)
        case EVENTS.SEND_WEBRTC_OFFER_FOR_SCREEN_SHARE:
          await this.p2pHandlers.handleScreenShareOffer(ws, message.data);
          break;
        case EVENTS.SEND_WEBRTC_ANSWER_FOR_SCREEN_SHARE:
          await this.p2pHandlers.handleScreenShareAnswer(ws, message.data);
          break;
        case EVENTS.SEND_WEBRTC_ICE_CANDIDATE_FOR_SCREEN_SHARE:
          await this.p2pHandlers.handleScreenShareIceCandidate(ws, message.data);
          break;
        
        // Media Stream Controls
        case EVENTS.TOGGLE_STREAM:
          await this.p2pHandlers.handleToggleStream(ws, message.data);
          break;
        
        // Room Management
        case EVENTS.LEAVE_ROOM:
          await this.handleLeaveRoom(ws, message.data);
          break;
        
        // Interactions
        case EVENTS.SEND_SCREENSHOT_NOTIFICATION:
          await this.handleSendScreenshotNotification(ws, message.data);
          break;
        case EVENTS.SEND_REACTION:
          await this.handleSendReaction(ws, message.data);
          break;
        case EVENTS.RAISE_HAND:
          await this.p2pHandlers.handleRaiseHand(ws, message.data);
          break;
        case EVENTS.LOWER_HAND:
          await this.p2pHandlers.handleLowerHand(ws, message.data);
          break;
        
        default:
          this.sendError(ws, "Unknown message type");
      }
    } catch (error) {
      console.error(`❌ Error handling message type ${message.type}:`, error);
      this.sendError(ws, error instanceof Error ? error.message : "Message handling failed");
    }
  }

  private async handleLeaveRoom(ws: AuthenticatedWebSocket, data: { roomId: string }): Promise<void> {
    console.log(`👋 User ${ws.userId} leaving room ${data.roomId}`);
    
    if (ws.roomId !== data.roomId) {
      throw new Error("Room ID mismatch");
    }
    
    await this.performUserLeave(ws.userId!, data.roomId);
  }

  private async handleSendMessage(ws: AuthenticatedWebSocket, data: { roomId: string; content: string }): Promise<void> {
    if (ws.roomId !== data.roomId) {
      throw new Error("Room ID mismatch");
    }
    
    const user = await this.dbService.userRepository.getUserById(ws.userId!);
    if (!user) {
      throw new Error("User not found");
    }

    console.log(`📝 Handling message from user ${ws.userId}:`, {
      content: data.content.trim(),
      roomId: data.roomId,
    });

    const savedMessage = await this.dbService
      .getDb()
      .insert(messages)
      .values({
        roomId: data.roomId,
        userId: ws.userId!,
        content: data.content.trim(),
      })
      .returning();

    console.log(`💾 Message saved to database:`, {
      messageId: savedMessage[0].id,
      userId: ws.userId,
    });

    // Send confirmation to sender
    ws.send(JSON.stringify({
      type: EVENTS.MESSAGE_SENT,
      data: {
        ...savedMessage[0],
        createdAt: savedMessage[0].createdAt.toISOString(),
        updatedAt: savedMessage[0].updatedAt.toISOString(),
      },
    } as ServerToClientMessage));

    // Broadcast to other users in room (excluding sender)
    await this.broadcastToRoom(data.roomId, EVENTS.RECEIVE_MESSAGE, savedMessage[0], ws.userId);
  }


  private async performUserLeave(userId: string, roomId: string): Promise<void> {
    console.log(`🚪 Performing leave room for user ${userId} from room ${roomId}`);

    await this.dbService.userRepository.resetUserCallState(userId, true);
    await this.dbService.mediaHandleRepository.deleteMediaHandlesForUser(userId, roomId);
    this.wsConnections.delete(userId);

    await this.broadcastToRoom(roomId, EVENTS.USER_LEFT, userId, userId);

    console.log(`🧹 Cleaned up call state for user ${userId}`);
  }

  private async handleSendScreenshotNotification(ws: AuthenticatedWebSocket, data: { roomId: string }): Promise<void> {
    console.log(`📷 User ${ws.userId} took a screenshot in room ${data.roomId}`);
    
    if (ws.roomId !== data.roomId) {
      throw new Error("Room ID mismatch");
    }

    const user = await this.dbService.userRepository.getUserById(ws.userId!);
    if (!user) {
      throw new Error("User not found");
    }

    if (!user.joinedCall) {
      throw new Error("User must be in call to send screenshot notification");
    }

    await this.broadcastToRoom(
      data.roomId,
      EVENTS.USER_TOOK_SCREENSHOT,
      { 
        userId: ws.userId!,
        timestamp: Date.now()
      },
      ws.userId
    );

    console.log(`📢 Screenshot notification broadcasted to room ${data.roomId}`);
  }

  private async handleSendReaction(ws: AuthenticatedWebSocket, data: { roomId: string; reaction: string }): Promise<void> {
    console.log(`😀 User ${ws.userId} sent reaction "${data.reaction}" in room ${data.roomId}`);
    
    if (ws.roomId !== data.roomId) {
      throw new Error("Room ID mismatch");
    }

    const user = await this.dbService.userRepository.getUserById(ws.userId!);
    if (!user) {
      throw new Error("User not found");
    }

    if (!user.joinedCall) {
      throw new Error("User must be in call to send reactions");
    }

    await this.broadcastToRoom(
      data.roomId,
      EVENTS.RECEIVE_REACTION,
      {
        userId: ws.userId!,
        reaction: data.reaction,
        timestamp: Date.now()
      },
      ws.userId
    );

    console.log(`📢 Reaction "${data.reaction}" broadcasted to room ${data.roomId}`);
  }

  private handlePing(ws: AuthenticatedWebSocket): void {
    console.log(`🏓 Ping from user ${ws.userId}`);
    ws.send(JSON.stringify({
      type: EVENTS.PONG,
    } as ServerToClientMessage));
  }

  private handleSocketError(ws: AuthenticatedWebSocket, error: Error): void {
    console.error(`❌ WebSocket error [userId: ${ws.userId}]:`, error);
    this.handleDisconnect(ws);
  }

  private handleDisconnect(ws: AuthenticatedWebSocket): void {
    console.log(`❌ User ${ws.userId} disconnected`);
    this.performUserDisconnect(ws.userId!, ws.roomId!).catch(error => {
      console.error(`❌ Error during disconnect cleanup for user ${ws.userId}:`, error);
    });
  }

  private async performUserDisconnect(userId: string, roomId: string): Promise<void> {
    console.log(`🔌 Performing disconnect cleanup for user ${userId} from room ${roomId}`);

    await this.dbService.userRepository.resetUserCallState(userId, true);
    await this.dbService.mediaHandleRepository.deleteMediaHandlesForUser(userId, roomId);
    this.wsConnections.delete(userId);

    await this.broadcastToRoom(roomId, EVENTS.USER_DISCONNECTED, userId, userId);

    console.log(`🧹 Cleaned up disconnect state for user ${userId}`);
  }

  private async broadcastToRoom(roomId: string, type: string, data: any, excludeUserId?: string, onlyUsersInCall: boolean = false): Promise<void> {
    console.log(`📢 Broadcasting to room ${roomId}:`, {
      type,
      excludeUserId,
    });

    let broadcastMessage: ServerToClientMessage;

    switch (type) {
      case EVENTS.USER_CONNECTED:
        broadcastMessage = {
          type: EVENTS.USER_CONNECTED,
          data: { userId: data as string },
        } as ServerToClientMessage;
        break;
      case EVENTS.USER_JOINED:
        broadcastMessage = {
          type: EVENTS.USER_JOINED,
          data: data as User,
        } as ServerToClientMessage;
        break;
      case EVENTS.USER_LEFT:
        broadcastMessage = {
          type: EVENTS.USER_LEFT,
          data: { userId: data as string },
        } as ServerToClientMessage;
        break;
      case EVENTS.USER_DISCONNECTED:
        broadcastMessage = {
          type: EVENTS.USER_DISCONNECTED,
          data: { userId: data as string },
        } as ServerToClientMessage;
        break;
      case EVENTS.RECEIVE_MESSAGE:
        broadcastMessage = {
          type: EVENTS.RECEIVE_MESSAGE,
          data: {
            ...(data as any),
            createdAt: (data as any).createdAt instanceof Date ? (data as any).createdAt.toISOString() : (data as any).createdAt,
            updatedAt: (data as any).updatedAt instanceof Date ? (data as any).updatedAt.toISOString() : (data as any).updatedAt,
          },
        } as ServerToClientMessage;
        break;
      case EVENTS.MESSAGE_SENT:
        broadcastMessage = {
          type: EVENTS.MESSAGE_SENT,
          data: {
            ...(data as any),
            createdAt: (data as any).createdAt instanceof Date ? (data as any).createdAt.toISOString() : (data as any).createdAt,
            updatedAt: (data as any).updatedAt instanceof Date ? (data as any).updatedAt.toISOString() : (data as any).updatedAt,
          },
        } as ServerToClientMessage;
        break;
      case EVENTS.USER_JOINED_CALL:
        broadcastMessage = {
          type: EVENTS.USER_JOINED_CALL,
          data: data
        } as ServerToClientMessage;
        break;
      case EVENTS.USER_LEFT_CALL:
        broadcastMessage = {
          type: EVENTS.USER_LEFT_CALL,
          data: data
        } as ServerToClientMessage;
        break;
      case EVENTS.USER_STARTED_SCREEN_SHARE:
        broadcastMessage = {
          type: EVENTS.USER_STARTED_SCREEN_SHARE,
          data: data
        } as ServerToClientMessage;
        break;
      case EVENTS.USER_STOPPED_SCREEN_SHARE:
        broadcastMessage = {
          type: EVENTS.USER_STOPPED_SCREEN_SHARE,
          data: data
        } as ServerToClientMessage;
        break;
      case EVENTS.USER_TOGGLED_STREAM:
        broadcastMessage = {
          type: EVENTS.USER_TOGGLED_STREAM,
          data: data
        } as ServerToClientMessage;
        break;
      case EVENTS.USER_TOOK_SCREENSHOT:
        broadcastMessage = {
          type: EVENTS.USER_TOOK_SCREENSHOT,
          data: data
        } as ServerToClientMessage;
        break;
      case EVENTS.RECEIVE_REACTION:
        broadcastMessage = {
          type: EVENTS.RECEIVE_REACTION,
          data: data
        } as ServerToClientMessage;
        break;
      case EVENTS.USER_RAISED_HAND:
        broadcastMessage = {
          type: EVENTS.USER_RAISED_HAND,
          data: data
        } as ServerToClientMessage;
        break;
      case EVENTS.USER_LOWERED_HAND:
        broadcastMessage = {
          type: EVENTS.USER_LOWERED_HAND,
          data: data
        } as ServerToClientMessage;
        break;

      default:
        console.error(`❌ Unknown broadcast message type: ${type}`);
        return;
    }

    await this.pubSubService.publishJSON(CHANNELS.ROOM_BROADCASTS_CHANNEL, {
      message: broadcastMessage,
      excludeId: excludeUserId,
      roomId,
      onlyUsersInCall,
    } as PubSubRoomBroadcast);
  }

  private sendError(ws: AuthenticatedWebSocket, errorMessage: string): void {
    try {
      console.error(`❌ Sending error to user ${ws.userId}:`, errorMessage);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: EVENTS.ERROR,
          data: {
            message: errorMessage,
          },
        } as ServerToClientMessage));
      }
    } catch (err) {
      console.error("❌ Failed to send error message:", err);
    }
  }

  private async handleUpgrade(req: http.IncomingMessage, socket: any, head: Buffer): Promise<void> {
    if (req.url?.split("?")?.[0] !== "/api/socket/") {
      socket.write(`HTTP/1.1 404 Not Found\r\n\r\n`);
      socket.destroy();
      return;
    }

    try {
      const url = new URLSearchParams(req.url.split("?")[1]);
      const apiKey = url.get("api_key");
      const accessToken = url.get("access_token");

      console.log(`🔑 Handling P2P WebSocket upgrade request:`, {
        url: req.url,
        hasApiKey: !!apiKey,
        hasAccessToken: !!accessToken,
      });

      if (typeof apiKey !== "string" || typeof accessToken !== "string") {
        throw new Error("Invalid credentials");
      }

      const token = accessToken.replace(/^Bearer\s+/i, "");
      await this.authService.validateApiKey({
        headers: {
          "x-api-key": apiKey,
          authorization: `Bearer ${token}`,
        },
      } as any);
      const tokenPayload = this.authService.validateToken(token, "user");

      const user = await this.dbService.userRepository.getUserById(tokenPayload.userId);
      if (!user) {
        throw new Error("User not found");
      }

      console.log(`✅ P2P Upgrade authentication successful for user ${tokenPayload.userId}`);

      this.wss.handleUpgrade(req, socket, head, ws => {
        (ws as AuthenticatedWebSocket).userId = tokenPayload.userId;
        (ws as AuthenticatedWebSocket).roomId = user.roomId;
        this.wss.emit("connection", ws, req);
      });
    } catch (err) {
      console.error(`❌ P2P WebSocket upgrade failed:`, err);
      socket.write(`HTTP/1.1 401 Unauthorized\r\n\r\n`);
      socket.destroy();
    }
  }

  public async start(port: number): Promise<void> {
    this.httpServer.listen(port, () => {
      console.log(`🚀 P2P Mesh WebSocket server running at ws://localhost:${port}/api/socket`);
    });
  }

  public async emitToRoom(
    roomId: string,
    eventName: string,
    eventData?: unknown,
    excludeUserId?: string,
    onlyUsersInCall: boolean = false
  ): Promise<void> {
    await this.broadcastToRoom(roomId, eventName as string, eventData, excludeUserId, onlyUsersInCall);
  }

  public async stop(): Promise<void> {
    console.log(`🛑 Stopping P2P Mesh WebSocket server`);
    await this.pubSubService.disconnect();
    this.httpServer.close();
  }
}
