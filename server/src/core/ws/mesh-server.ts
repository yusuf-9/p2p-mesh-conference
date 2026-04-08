import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { ZodError } from "zod";
import AuthService from "../auth/index.js";
import { AuthenticatedWebSocket, ServerToClientMessages, PubSubMessage, User, Message } from "./types.js";
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
      } as ServerToClientMessages["BASE"]);

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
      } as ServerToClientMessages[typeof EVENTS.CONNECTED]));

      await this.broadcastToRoom(dbUser.roomId, EVENTS.USER_CONNECTED, dbUser, dbUser.id);
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
          await this.handleLeaveRoom(ws);
          break;
        case EVENTS.PING:
          this.handlePing(ws);
          break;
        
        // P2P Signaling Events
        case EVENTS.JOIN_CALL:
          await this.p2pHandlers.handleJoinCall(ws, message.data);
          break;
        case EVENTS.LEAVE_CALL:
          await this.p2pHandlers.handleLeaveCall(ws);
          break;
        case EVENTS.PEER_OFFER:
          await this.p2pHandlers.handlePeerOffer(ws, message.data);
          break;
        case EVENTS.PEER_ANSWER:
          await this.p2pHandlers.handlePeerAnswer(ws, message.data);
          break;
        case EVENTS.PEER_ICE_CANDIDATE:
          await this.p2pHandlers.handlePeerIceCandidate(ws, message.data);
          break;
        case EVENTS.TOGGLE_MEDIA:
          await this.p2pHandlers.handleToggleMedia(ws, message.data);
          break;
        
        // Basic interactions
        case EVENTS.SEND_SCREENSHOT_NOTIFICATION:
          await this.handleSendScreenshotNotification(ws);
          break;
        case EVENTS.SEND_REACTION:
          await this.handleSendReaction(ws, message.data);
          break;
        case EVENTS.RAISE_HAND:
          await this.p2pHandlers.handleRaiseHand(ws, { raised: true });
          break;
        case EVENTS.LOWER_HAND:
          await this.p2pHandlers.handleRaiseHand(ws, { raised: false });
          break;
        
        default:
          this.sendError(ws, "Unknown message type");
      }
    } catch (error) {
      console.error(`❌ Error handling message type ${message.type}:`, error);
      this.sendError(ws, error instanceof Error ? error.message : "Message handling failed");
    }
  }

  private async handleSendMessage(ws: AuthenticatedWebSocket, message: string): Promise<void> {
    const user = await this.dbService.userRepository.getUserById(ws.userId!);
    if (!user) {
      throw new Error("User not found");
    }

    console.log(`📝 Handling message from user ${ws.userId}:`, {
      content: message.trim(),
      roomId: ws.roomId,
    });

    const savedMessage = await this.dbService
      .getDb()
      .insert(messages)
      .values({
        roomId: ws.roomId!,
        userId: ws.userId!,
        content: message.trim(),
      })
      .returning();

    console.log(`💾 Message saved to database:`, {
      messageId: savedMessage[0].id,
      userId: ws.userId,
    });

    ws.send(JSON.stringify({
      type: EVENTS.MESSAGE_SENT,
      data: savedMessage[0] as unknown,
    } as ServerToClientMessages[typeof EVENTS.MESSAGE_SENT]));

    await this.broadcastToRoom(ws.roomId!, EVENTS.MESSAGE_RECEIVED, savedMessage[0], ws.userId);
  }

  private async handleLeaveRoom(ws: AuthenticatedWebSocket): Promise<void> {
    console.log(`👋 User ${ws.userId} leaving room ${ws.roomId}`);
    await this.performUserLeave(ws.userId!, ws.roomId!);
  }

  private async performUserLeave(userId: string, roomId: string): Promise<void> {
    console.log(`🚪 Performing leave room for user ${userId} from room ${roomId}`);

    await this.dbService.userRepository.resetUserCallState(userId, true);
    this.wsConnections.delete(userId);

    await this.broadcastToRoom(roomId, EVENTS.USER_DISCONNECTED, userId, userId);

    console.log(`🧹 Cleaned up call state for user ${userId}`);
  }

  private async handleSendScreenshotNotification(ws: AuthenticatedWebSocket): Promise<void> {
    console.log(`📷 User ${ws.userId} took a screenshot in room ${ws.roomId}`);

    const user = await this.dbService.userRepository.getUserById(ws.userId!);
    if (!user) {
      throw new Error("User not found");
    }

    if (!user.joinedCall) {
      throw new Error("User must be in call to send screenshot notification");
    }

    ws.send(JSON.stringify({
      type: EVENTS.SCREENSHOT_TAKEN,
    } as ServerToClientMessages[typeof EVENTS.SCREENSHOT_TAKEN]));

    await this.broadcastToRoom(
      ws.roomId!,
      EVENTS.SCREENSHOT_TAKEN_BY_USER,
      { userId: ws.userId! },
      ws.userId,
      true
    );

    console.log(`📢 Screenshot notification broadcasted to users in call in room ${ws.roomId}`);
  }

  private async handleSendReaction(ws: AuthenticatedWebSocket, reaction: string): Promise<void> {
    console.log(`😀 User ${ws.userId} sent reaction "${reaction}" in room ${ws.roomId}`);

    const user = await this.dbService.userRepository.getUserById(ws.userId!);
    if (!user) {
      throw new Error("User not found");
    }

    if (!user.joinedCall) {
      throw new Error("User must be in call to send reactions");
    }

    ws.send(JSON.stringify({
      type: EVENTS.REACTION_SENT,
    } as ServerToClientMessages[typeof EVENTS.REACTION_SENT]));

    await this.broadcastToRoom(
      ws.roomId!,
      EVENTS.REACTION_RECEIVED,
      {
        userId: ws.userId!,
        reaction: reaction,
      },
      ws.userId,
      true
    );

    console.log(`📢 Reaction "${reaction}" broadcasted to users in call in room ${ws.roomId}`);
  }

  private handlePing(ws: AuthenticatedWebSocket): void {
    console.log(`🏓 Ping from user ${ws.userId}`);
    ws.send(JSON.stringify({
      type: EVENTS.PONG,
    } as ServerToClientMessages[typeof EVENTS.PONG]));
  }

  private handleSocketError(ws: AuthenticatedWebSocket, error: Error): void {
    console.error(`❌ WebSocket error [userId: ${ws.userId}]:`, error);
    this.handleDisconnect(ws);
  }

  private handleDisconnect(ws: AuthenticatedWebSocket): void {
    console.log(`❌ User ${ws.userId} disconnected`);
    this.performUserLeave(ws.userId!, ws.roomId!).catch(error => {
      console.error(`❌ Error during disconnect cleanup for user ${ws.userId}:`, error);
    });
  }

  private async broadcastToRoom(roomId: string, type: string, data: any, excludeUserId?: string, onlyUsersInCall: boolean = false): Promise<void> {
    console.log(`📢 Broadcasting to room ${roomId}:`, {
      type,
      excludeUserId,
    });

    let broadcastMessage: ServerToClientMessages[keyof ServerToClientMessages];

    switch (type) {
      case EVENTS.USER_CONNECTED:
        broadcastMessage = {
          type: EVENTS.USER_CONNECTED,
          data: data as User,
        } as ServerToClientMessages[typeof EVENTS.USER_CONNECTED];
        break;
      case EVENTS.USER_DISCONNECTED:
        broadcastMessage = {
          type: EVENTS.USER_DISCONNECTED,
          data: data as string,
        } as ServerToClientMessages[typeof EVENTS.USER_DISCONNECTED];
        break;
      case EVENTS.MESSAGE_RECEIVED:
        broadcastMessage = {
          type: EVENTS.MESSAGE_RECEIVED,
          data: data as Message,
        } as ServerToClientMessages[typeof EVENTS.MESSAGE_RECEIVED];
        break;
      case EVENTS.USER_JOINED_ROOM:
        broadcastMessage = {
          type: EVENTS.USER_JOINED_ROOM,
          data: data as User,
        } as ServerToClientMessages[typeof EVENTS.USER_JOINED_ROOM];
        break;
      case EVENTS.USER_LEFT_ROOM:
        broadcastMessage = {
          type: EVENTS.USER_LEFT_ROOM,
          data: data as string,
        } as ServerToClientMessages[typeof EVENTS.USER_LEFT_ROOM];
        break;
      case EVENTS.PEER_JOINED_CALL:
        broadcastMessage = {
          type: EVENTS.PEER_JOINED_CALL,
          data: data
        } as ServerToClientMessages[typeof EVENTS.PEER_JOINED_CALL];
        break;
      case EVENTS.PEER_LEFT_CALL:
        broadcastMessage = {
          type: EVENTS.PEER_LEFT_CALL,
          data: data
        } as ServerToClientMessages[typeof EVENTS.PEER_LEFT_CALL];
        break;
      case EVENTS.PEER_MEDIA_TOGGLED:
        broadcastMessage = {
          type: EVENTS.PEER_MEDIA_TOGGLED,
          data: data
        } as ServerToClientMessages[typeof EVENTS.PEER_MEDIA_TOGGLED];
        break;
      case EVENTS.SCREENSHOT_TAKEN_BY_USER:
        broadcastMessage = {
          type: EVENTS.SCREENSHOT_TAKEN_BY_USER,
          data: data
        } as ServerToClientMessages[typeof EVENTS.SCREENSHOT_TAKEN_BY_USER];
        break;
      case EVENTS.REACTION_RECEIVED:
        broadcastMessage = {
          type: EVENTS.REACTION_RECEIVED,
          data: data
        } as ServerToClientMessages[typeof EVENTS.REACTION_RECEIVED];
        break;
      case EVENTS.HAND_RAISED_BY_USER:
        broadcastMessage = {
          type: EVENTS.HAND_RAISED_BY_USER,
          data: data
        } as ServerToClientMessages[typeof EVENTS.HAND_RAISED_BY_USER];
        break;
      case EVENTS.HAND_LOWERED_BY_USER:
        broadcastMessage = {
          type: EVENTS.HAND_LOWERED_BY_USER,
          data: data
        } as ServerToClientMessages[typeof EVENTS.HAND_LOWERED_BY_USER];
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
    } as PubSubMessage["ROOM_BROADCAST"]);
  }

  private sendError(ws: AuthenticatedWebSocket, errorMessage: string): void {
    try {
      console.error(`❌ Sending error to user ${ws.userId}:`, errorMessage);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: EVENTS.ERROR,
          error: errorMessage,
        } as ServerToClientMessages[typeof EVENTS.ERROR]));
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

  public async emitToRoom<T extends keyof ServerToClientMessages>(
    roomId: string,
    eventName: T,
    eventData?: ServerToClientMessages[T] extends { data: infer D } ? D : undefined,
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