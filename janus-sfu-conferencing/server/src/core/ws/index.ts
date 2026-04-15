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
  type RTCIceCandidateData,
  type MediaStreamToggleData,
  ClientToServerMessages,
} from "./schema.js";
import DatabaseService from "../database/index.js";
import PubSubService from "../pubsub/index.js";
import { messages } from "../database/schema.js";
import { CHANNELS, EVENTS } from "./constants.js";
import SfuManager from "../sfu-manager/index.js";
import ConfigService from "../config/index.js";
import { createUserFriendlyErrorMessage } from "./utils.js"

export default class SocketServer {
  private httpServer: http.Server;
  private wss: WebSocketServer;
  private authService: AuthService;
  private dbService: DatabaseService;
  private pubSubService: PubSubService;
  private configService: ConfigService;
  private wsConnections: Map<string, AuthenticatedWebSocket> = new Map(); // userId -> WebSocket
  private sfuManager: SfuManager;

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

    this.initializeServer();
    this.sfuManager = new SfuManager(
      this.authService,
      this.dbService,
      this.pubSubService,
      this.configService,
      this.emitSfuEvent.bind(this),
      this.emitToRoom.bind(this)
    );
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
      // Validate the incoming room broadcast message
      const validatedData = validatePubSubRoomBroadcast(data);

      console.log("📨 Room broadcast received:", {
        roomId: validatedData.roomId,
        messageType: validatedData.message.type,
        excludeId: validatedData.excludeId,
        onlyUsersInCall: validatedData.onlyUsersInCall
      });

      // Get appropriate users based on onlyUsersInCall flag
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
          console.log(`📤 Broadcasting to user ${user.id} (${validatedData.onlyUsersInCall ? 'in call' : 'connected'})`);
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

  public async emitSfuEvent<T extends keyof ServerToClientMessages>(
    userToEmitToId: string,
    eventName: T,
    eventData?: ServerToClientMessages[T] extends { data: infer D } ? D : undefined
  ) {
    console.log(`📤 Emitting SFU event to user ${userToEmitToId}:`, {
      event: eventName,
      data: eventData,
    });

    const ws = this.wsConnections.get(userToEmitToId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      const message: any = { type: eventName };
      if (eventData !== undefined) {
        message.data = eventData;
      }
      ws.send(JSON.stringify(message));
    } else {
      console.log(`⚠️ Cannot emit SFU event - user ${userToEmitToId} not connected`);
    }
  }

  private async handleConnection(ws: AuthenticatedWebSocket, req: http.IncomingMessage): Promise<void> {
    console.log(`✅ WebSocket connected [userId: ${ws.userId}]`);

    try {
      if (!ws.userId || !ws.roomId) {
        throw new Error("User not authenticated");
      }

      // Validate user exists in the room and get user data
      const dbUser = await this.dbService.userRepository.getUserById(ws.userId);
      if (!dbUser || dbUser.roomId !== ws.roomId) {
        throw new Error("User not found in this room");
      }

      // Store connection and mark user as connected
      this.wsConnections.set(ws.userId, ws);
      await this.dbService.userRepository.updateConnectionStatus(ws.userId, true);

      // Set up event listeners with error boundaries
      ws.on("message", data => this.handleMessageWithErrorBoundary(ws, data as any));
      ws.on("close", () => this.handleDisconnect(ws));
      ws.on("error", error => this.handleSocketError(ws, error));

      // Send connection confirmation
      console.log(`📤 Sending connection confirmation to user ${ws.userId}`);
      ws.send(
        JSON.stringify({
          type: EVENTS.CONNECTED,
          data: { ...dbUser, connected: true },
        } as ServerToClientMessages[typeof EVENTS.CONNECTED])
      );

      // Notify other users in the room
      await this.broadcastToRoom(dbUser.roomId, EVENTS.USER_CONNECTED, dbUser, dbUser.id);
    } catch (error) {
      console.error(`❌ Error during user connection:`, error);
      this.sendError(ws, error instanceof Error ? error.message : "Connection failed");
      ws.close();
    }
  }

  private createSocketErrorBoundary<T extends any[]>(
    ws: AuthenticatedWebSocket,
    handler: (...args: T) => void | Promise<void>
  ) {
    return async (...args: T) => {
      try {
        await handler(...args);
      } catch (error) {
        console.error(`❌ Socket listener error [userId: ${ws.userId}]:`, error);
        const errorMessage = error instanceof Error ? error.message : "Socket error occurred";

        // Only send error to client if WebSocket is still open
        if (ws.readyState === ws.OPEN) {
          this.sendError(ws, errorMessage);
        }
      }
    };
  }

  private async handleMessageWithErrorBoundary(
    ws: AuthenticatedWebSocket,
    data: ReturnType<typeof JSON.stringify>
  ): Promise<void> {
    this.createSocketErrorBoundary(ws, async () => {
      try {
        console.log(`📥 Received message from user ${ws.userId}:`, data.toString());

        // Parse and validate the incoming message
        const rawMessage = JSON.parse(data.toString());
        const validatedMessage = validateClientMessage(rawMessage);

        console.log(`✅ Message validated:`, {
          type: validatedMessage.type,
          userId: ws.userId,
        });

        await this.routeMessage(ws, validatedMessage);
      } catch (error) {
        console.error(`❌ Message handling error [userId: ${ws.userId}]:`, error);

        if (error instanceof ZodError) {
          const userFriendlyError = createUserFriendlyErrorMessage(error);
          throw new Error(userFriendlyError);
        }

        if (error instanceof SyntaxError) {
          throw new Error("Invalid JSON format");
        }

        const errorMessage = error instanceof Error ? error.message : "Failed to parse message";
        throw new Error(errorMessage);
      }
    })();
  }

  private async routeMessage(ws: AuthenticatedWebSocket, message: ClientToServerMessage): Promise<void> {
    console.log(`🔄 Routing message for user ${ws.userId}:`, {
      type: message.type,
    });

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
      case EVENTS.JOIN_CONFERENCE_AS_PUBLISHER:
        this.handleJoinConference(ws, message as ClientToServerMessages[typeof EVENTS.JOIN_CONFERENCE_AS_PUBLISHER]);
        break;
      case EVENTS.SUBSCRIBE_TO_USER_FEED:
        this.handleSubscribeToUserFeed(ws, message.data);
        break;
      case EVENTS.SEND_OFFER_FOR_PUBLISHING:
        this.handleSendOfferForPublishing(ws, message.data);
        break;
      case EVENTS.SEND_ANSWER_FOR_SUBSCRIBING:
        this.handleSendAnswerForSubscribing(ws, message.data);
        break;
      case EVENTS.SEND_ICE_CANDIDATES:
        this.handleSendIceCandidates(ws, message.data);
        break;
      case EVENTS.SEND_ICE_CANDIDATE_COMPLETED:
        this.handleSendIceCandidateCompleted(ws, message.data);
        break;
      case EVENTS.TOGGLE_MEDIA_STREAM:
        this.handleToggleMediaStream(ws, message.data);
        break;
      case EVENTS.UNPUBLISH_FEED:
        this.handleUnpublishFeed(ws, message.data);
        break;
      case EVENTS.GET_PUBLISHER_LIST:
        this.handleGetPublisherList(ws);
        break;
      case EVENTS.LEAVE_CONFERENCE:
        await this.handleLeaveRoom(ws);
        break;
      case EVENTS.SEND_SCREENSHOT_NOTIFICATION:
        await this.handleSendScreenshotNotification(ws);
        break;
      case EVENTS.SEND_REACTION:
        await this.handleSendReaction(ws, message.data);
        break;
      case EVENTS.RAISE_HAND:
        await this.handleRaiseHand(ws, message.data);
        break;
      case EVENTS.LOWER_HAND:
        await this.handleLowerHand(ws, message.data);
        break;
      case EVENTS.MODERATE_FEED:
        await this.handleModerateFeed(ws, message.data);
        break;
      case EVENTS.CONFIGURE_FEED:
        await this.handleConfigureFeed(ws, message.data);
        break;
      case EVENTS.CONFIGURE_FEED_SUBSCRIPTION:
        await this.handleConfigureFeedSubscription(ws, message.data);
        break;
      default:
        this.sendError(ws, "Unknown message type");
    }
  }

  private async handleSendMessage(ws: AuthenticatedWebSocket, message: string): Promise<void> {
    this.createSocketErrorBoundary(ws, async () => {
      // Message is already validated by Zod schema, but let's get user data
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

      await new Promise((res) => setTimeout(res, 1000));

      // Send confirmation to sender
      ws.send(
        JSON.stringify({
          type: EVENTS.MESSAGE_SENT,
          data: savedMessage[0] as unknown,
        } as ServerToClientMessages[typeof EVENTS.MESSAGE_SENT])
      );

      // Broadcast to other users in room
      await this.broadcastToRoom(ws.roomId!, EVENTS.MESSAGE_RECEIVED, savedMessage[0], ws.userId);
    })();
  }

  private handleJoinConference(ws: AuthenticatedWebSocket, message: ClientToServerMessages[typeof EVENTS.JOIN_CONFERENCE_AS_PUBLISHER]): void {
    this.createSocketErrorBoundary(ws, async () => {
      const feedType = message.data?.feedType || "camera";
      const audioEnabled = message.data?.audio ?? true;
      const videoEnabled = message.data?.video ?? true;
      const simulcastEnabled = message.data?.simulcast ?? false;
      const simulcastResolutions = message.data?.resolutions || null;
      
      console.log(`🎥 User ${ws.userId} joining conference in room ${ws.roomId} with feedType: ${feedType}, audio: ${audioEnabled}, video: ${videoEnabled}, simulcast: ${simulcastEnabled}, resolutions: ${simulcastResolutions ? JSON.stringify(simulcastResolutions) : 'none'}`);
      
      // Store simulcast preferences for when the media handle gets created
      // The actual simulcast data will be stored when the SFU creates the handle
      await this.sfuManager.handleJoinConference(ws.userId!, ws.roomId!, feedType, audioEnabled, videoEnabled, simulcastEnabled, simulcastResolutions);
    })();
  }

  private handleSubscribeToUserFeed(ws: AuthenticatedWebSocket, data: ClientToServerMessages[typeof EVENTS.SUBSCRIBE_TO_USER_FEED]["data"]): void {
    this.createSocketErrorBoundary(ws, async () => {
      const feedId = data.feedId;
      const preferredResolution = data.resolution || null;
      
      console.log(`📺 User ${ws.userId} subscribing to feed ${feedId} with resolution preference: ${preferredResolution || 'auto'}`);
      
      // Store the resolution preference for when the subscriber handle gets created
      await this.sfuManager.handleSubscribeToUserFeed(ws.userId!, ws.roomId!, feedId, preferredResolution);
    })();
  }

  private handleSendOfferForPublishing(
    ws: AuthenticatedWebSocket,
    data: ClientToServerMessages[typeof EVENTS.SEND_OFFER_FOR_PUBLISHING]["data"]
  ): void {
    this.createSocketErrorBoundary(ws, async () => {
      console.log(`📤 User ${ws.userId} sending offer for publishing`);
      await this.sfuManager.handleSendOfferForPublishing(ws.userId!, ws.roomId!, data);
    })();
  }

  private handleSendIceCandidates(
    ws: AuthenticatedWebSocket,
    data: ClientToServerMessages[typeof EVENTS.SEND_ICE_CANDIDATES]["data"]
  ): void {
    this.createSocketErrorBoundary(ws, async () => {
      console.log(`🧊 User ${ws.userId} sending ICE candidate`);
      await this.sfuManager.handleSendIceCandidates(ws.userId!, ws.roomId!, data);
    })();
  }

  private handleSendIceCandidateCompleted(
    ws: AuthenticatedWebSocket,
    data: ClientToServerMessages[typeof EVENTS.SEND_ICE_CANDIDATE_COMPLETED]["data"]
  ): void {
    this.createSocketErrorBoundary(ws, async () => {
      console.log(`✅ User ${ws.userId} completed ICE candidate gathering`);
      await this.sfuManager.handleSendIceCandidateCompleted(ws.userId!, ws.roomId!, data);
    })();
  }

  private handleSendAnswerForSubscribing(
    ws: AuthenticatedWebSocket,
    data: ClientToServerMessages[typeof EVENTS.SEND_ANSWER_FOR_SUBSCRIBING]["data"]
  ): void {
    this.createSocketErrorBoundary(ws, async () => {
      console.log(`📥 User ${ws.userId} sending answer for subscribing`);
      await this.sfuManager.handleSendAnswerForSubscribing(ws.userId!, ws.roomId!, data);
    })();
  }

  private handleToggleMediaStream(ws: AuthenticatedWebSocket, data: MediaStreamToggleData): void {
    this.createSocketErrorBoundary(ws, async () => {
      console.log(`🎚️ User ${ws.userId} toggling media stream:`, data);
      await this.sfuManager.handleToggleMediaStream(ws.userId!, ws.roomId!, data);
    })();
  }

  private handleUnpublishFeed(ws: AuthenticatedWebSocket, data: ClientToServerMessages[typeof EVENTS.UNPUBLISH_FEED]["data"]): void {
    this.createSocketErrorBoundary(ws, async () => {
      console.log(`📤 User ${ws.userId} unpublishing feed:`, data);
      await this.sfuManager.handleUnpublishFeed(ws.userId!, ws.roomId!, data);
    })();
  }

  private handleGetPublisherList(ws: AuthenticatedWebSocket): void {
    this.createSocketErrorBoundary(ws, async () => {
      console.log(`📋 User ${ws.userId} requesting publisher list`);
      await this.sfuManager.handleGetPublisherList(ws.userId!, ws.roomId!);
    })();
  }

  private async handleLeaveRoom(ws: AuthenticatedWebSocket): Promise<void> {
    this.createSocketErrorBoundary(ws, async () => {
      console.log(`👋 User ${ws.userId} leaving room ${ws.roomId}`);
      await this.sfuManager.cleanupUserHandles(ws.userId!, ws.roomId!);
    })();
  }

  private async handleSendScreenshotNotification(ws: AuthenticatedWebSocket): Promise<void> {
    this.createSocketErrorBoundary(ws, async () => {
      console.log(`📷 User ${ws.userId} took a screenshot in room ${ws.roomId}`);

      // Check if user is in call
      const user = await this.dbService.userRepository.getUserById(ws.userId!);
      if (!user) {
        throw new Error("User not found");
      }

      if (!user.joinedCall) {
        throw new Error("User must be in call to send screenshot notification");
      }

      ws.send(
        JSON.stringify({
          type: EVENTS.SCREENSHOT_TAKEN,
        } as ServerToClientMessages[typeof EVENTS.SCREENSHOT_TAKEN])
      );

      // Broadcast to other users in call only
      await this.broadcastToRoom(
        ws.roomId!,
        EVENTS.SCREENSHOT_TAKEN_BY_USER,
        {
          userId: ws.userId!,
        },
        ws.userId,
        true // onlyUsersInCall
      );

      console.log(`📢 Screenshot notification broadcasted to users in call in room ${ws.roomId}`);
    })();
  }

  private async handleSendReaction(ws: AuthenticatedWebSocket, reaction: string): Promise<void> {
    this.createSocketErrorBoundary(ws, async () => {
      console.log(`😀 User ${ws.userId} sent reaction "${reaction}" in room ${ws.roomId}`);

      // Check if user is in call
      const user = await this.dbService.userRepository.getUserById(ws.userId!);
      if (!user) {
        throw new Error("User not found");
      }

      if (!user.joinedCall) {
        throw new Error("User must be in call to send reactions");
      }

      ws.send(
        JSON.stringify({
          type: EVENTS.REACTION_SENT,
        } as ServerToClientMessages[typeof EVENTS.REACTION_SENT])
      );

      // Broadcast to other users in call only
      await this.broadcastToRoom(
        ws.roomId!,
        EVENTS.REACTION_RECEIVED,
        {
          userId: ws.userId!,
          reaction: reaction,
        },
        ws.userId,
        true // onlyUsersInCall
      );

      console.log(`📢 Reaction "${reaction}" broadcasted to users in call in room ${ws.roomId}`);
    })();
  }

  private async handleRaiseHand(ws: AuthenticatedWebSocket, data: { feedId: number }): Promise<void> {
    this.createSocketErrorBoundary(ws, async () => {
      console.log(`✋ User ${ws.userId} raised hand for feed ${data.feedId} in room ${ws.roomId}`);

      // Check if user is in call
      const user = await this.dbService.userRepository.getUserById(ws.userId!);
      if (!user) {
        throw new Error("User not found");
      }

      if (!user.joinedCall) {
        throw new Error("User must be in call to raise hand");
      }

      // Verify the feedId belongs to this user
      const mediaHandle = await this.dbService.mediaRoomRepository.getPubHandleByFeedId(data.feedId);
      if (!mediaHandle || mediaHandle.userId !== ws.userId) {
        throw new Error("Feed does not belong to user or feed not found");
      }

      // Update hand raised flag in database
      await this.dbService.mediaRoomRepository.updateHandRaisedStatus(data.feedId, ws.userId!, true);

      // Send confirmation to sender
      ws.send(
        JSON.stringify({
          type: EVENTS.HAND_RAISED,
        } as ServerToClientMessages[typeof EVENTS.HAND_RAISED])
      );

      // Broadcast to other users in call only
      await this.broadcastToRoom(
        ws.roomId!,
        EVENTS.HAND_RAISED_BY_USER,
        {
          userId: ws.userId!,
          feedId: data.feedId,
        },
        ws.userId,
        true // onlyUsersInCall
      );

      console.log(`📢 Hand raised by user ${ws.userId} for feed ${data.feedId} broadcasted to users in call in room ${ws.roomId}`);
    })();
  }

  private async handleLowerHand(ws: AuthenticatedWebSocket, data: { feedId: number }): Promise<void> {
    this.createSocketErrorBoundary(ws, async () => {
      console.log(`👇 User ${ws.userId} lowered hand for feed ${data.feedId} in room ${ws.roomId}`);

      // Check if user is in call
      const user = await this.dbService.userRepository.getUserById(ws.userId!);
      if (!user) {
        throw new Error("User not found");
      }

      if (!user.joinedCall) {
        throw new Error("User must be in call to lower hand");
      }

      // Verify the feedId belongs to this user
      const mediaHandle = await this.dbService.mediaRoomRepository.getPubHandleByFeedId(data.feedId);
      if (!mediaHandle || mediaHandle.userId !== ws.userId) {
        throw new Error("Feed does not belong to user or feed not found");
      }

      // Update hand raised flag in database
      await this.dbService.mediaRoomRepository.updateHandRaisedStatus(data.feedId, ws.userId!, false);

      // Send confirmation to sender
      ws.send(
        JSON.stringify({
          type: EVENTS.HAND_LOWERED,
        } as ServerToClientMessages[typeof EVENTS.HAND_LOWERED])
      );

      // Broadcast to other users in call only
      await this.broadcastToRoom(
        ws.roomId!,
        EVENTS.HAND_LOWERED_BY_USER,
        {
          userId: ws.userId!,
          feedId: data.feedId,
        },
        ws.userId,
        true // onlyUsersInCall
      );

      console.log(`📢 Hand lowered by user ${ws.userId} broadcasted to users in call in room ${ws.roomId}`);
    })();
  }

  private async handleModerateFeed(ws: AuthenticatedWebSocket, data: { feedId: number }): Promise<void> {
    this.createSocketErrorBoundary(ws, async () => {
      console.log(`🔨 User ${ws.userId} attempting to moderate feed ${data.feedId} in room ${ws.roomId}`);

      // Check if user is the room host
      const isHost = await this.dbService.roomRepository.isUserRoomHost(ws.roomId!, ws.userId!);
      if (!isHost) {
        throw new Error("Only room hosts can moderate feeds");
      }

      // Check if user is in call
      const user = await this.dbService.userRepository.getUserById(ws.userId!);
      if (!user) {
        throw new Error("User not found");
      }

      if (!user.joinedCall) {
        throw new Error("User must be in call to moderate feeds");
      }

      // Moderate the feed via SFU Manager
      const result = await this.sfuManager.handleModerateFeed(ws.userId!, ws.roomId!, data.feedId);

      if (!result.success) {
        throw new Error(result.error || "Failed to moderate feed");
      }

      const feedUserId = result.feedUserId!;

      // Send success confirmation to host
      ws.send(
        JSON.stringify({
          type: EVENTS.MODERATION_SUCCESS,
          data: {
            feedId: data.feedId,
          },
        } as ServerToClientMessages[typeof EVENTS.MODERATION_SUCCESS])
      );

      // Send notification to the user whose feed was moderated
      await this.emitSfuEvent(feedUserId, EVENTS.FEED_MODERATED, {
        feedId: data.feedId,
        hostId: ws.userId!,
      });

      // Broadcast to other users in the call that this feed was moderated
      await this.broadcastToRoom(
        ws.roomId!,
        EVENTS.FEED_MODERATED_BY_HOST,
        {
          feedId: data.feedId,
          userId: feedUserId,
          hostId: ws.userId!,
        },
        ws.userId, // exclude host
        true // onlyUsersInCall
      );

      // Also broadcast that the feed was unpublished
      await this.broadcastToRoom(
        ws.roomId!,
        EVENTS.PUBLISHER_UNPUBLISHED_FEED,
        {
          feedId: data.feedId,
          userId: feedUserId,
        },
        feedUserId, // exclude user whose feed was moderated
        true // onlyUsersInCall
      );

      console.log(`📢 Feed ${data.feedId} moderated by host ${ws.userId} - notifications sent to all parties`);
    })();
  }

  private async handleConfigureFeed(ws: AuthenticatedWebSocket, data: ClientToServerMessages[typeof EVENTS.CONFIGURE_FEED]['data']): Promise<void> {
    this.createSocketErrorBoundary(ws, async () => {
      console.log(`🎛️ User ${ws.userId} configuring feed ${data.feedId} - simulcast: ${data.simulcast}, resolutions: ${data.resolutions ? JSON.stringify(data.resolutions) : 'none'}`);

      // Verify the feedId belongs to this user
      const mediaHandle = await this.dbService.mediaRoomRepository.getPubHandleByFeedId(data.feedId);
      if (!mediaHandle || mediaHandle.userId !== ws.userId) {
        throw new Error("Feed does not belong to user or feed not found");
      }

      // Update simulcast configuration in database
      await this.dbService.mediaRoomRepository.updateMediaHandleSimulcast(
        mediaHandle.id,
        data.simulcast,
        data.resolutions || null
      );

      // Send confirmation to user
      ws.send(
        JSON.stringify({
          type: EVENTS.FEED_CONFIGURED,
          data: {
            feedId: data.feedId,
            simulcast: data.simulcast,
            resolutions: data.resolutions || null,
          },
        } as ServerToClientMessages[typeof EVENTS.FEED_CONFIGURED])
      );

      // Broadcast configuration change to other users in call
      await this.broadcastToRoom(
        ws.roomId!,
        EVENTS.PUBLISHER_CONFIGURED_FEED,
        {
          feedId: data.feedId,
          userId: ws.userId!,
          simulcast: data.simulcast,
          resolutions: data.resolutions || null,
        },
        ws.userId,
        true // onlyUsersInCall
      );

      console.log(`📢 Feed ${data.feedId} configuration updated and broadcasted to room`);
    })();
  }

  private async handleConfigureFeedSubscription(ws: AuthenticatedWebSocket, data: ClientToServerMessages[typeof EVENTS.CONFIGURE_FEED_SUBSCRIPTION]['data']): Promise<void> {
    this.createSocketErrorBoundary(ws, async () => {
      console.log(`📺 User ${ws.userId} configuring subscription to feed ${data.feedId} - resolution: ${data.resolution}`);

      // Check if user is in call
      const user = await this.dbService.userRepository.getUserById(ws.userId!);
      if (!user) {
        throw new Error("User not found");
      }

      if (!user.joinedCall) {
        throw new Error("User must be in call to configure feed subscriptions");
      }

      // Use SfuManager to handle the configuration
      await this.sfuManager.handleConfigureFeedSubscription(ws.userId!, ws.roomId!, data);

      // Send confirmation to user
      ws.send(
        JSON.stringify({
          type: EVENTS.FEED_SUBSCRIPTION_CONFIGURED,
          data: {
            feedId: data.feedId,
            resolution: data.resolution,
          },
        } as ServerToClientMessages[typeof EVENTS.FEED_SUBSCRIPTION_CONFIGURED])
      );

      console.log(`📢 Feed subscription ${data.feedId} configured for user ${ws.userId} - resolution: ${data.resolution}`);
    })();
  }

  private async performUserLeave(userId: string, roomId: string): Promise<void> {
    console.log(`🚪 Performing leave room for user ${userId} from room ${roomId}`);

    // Reset user's call state and mark as disconnected
    await this.dbService.userRepository.resetUserCallState(userId, true);
    this.wsConnections.delete(userId);

    // Clean up user's SFU handles if any
    await this.sfuManager.cleanupUserHandles(userId, roomId);

    // Notify other users
    await this.broadcastToRoom(roomId, EVENTS.USER_DISCONNECTED, userId, userId);

    console.log(`🧹 Cleaned up call state and handles for user ${userId}`);
  }

  private handlePing(ws: AuthenticatedWebSocket): void {
    console.log(`🏓 Ping from user ${ws.userId}`);
    ws.send(
      JSON.stringify({
        type: EVENTS.PONG,
      } as ServerToClientMessages[typeof EVENTS.PONG])
    );
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

    // Create properly structured message based on event type
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
      case EVENTS.MEDIA_STREAM_TOGGLED:
        broadcastMessage = {
          type: EVENTS.MEDIA_STREAM_TOGGLED,
          data: data
        } as ServerToClientMessages[typeof EVENTS.MEDIA_STREAM_TOGGLED];
        break;
      case EVENTS.PUBLISHER_UNPUBLISHED_FEED:
        broadcastMessage = {
          type: EVENTS.PUBLISHER_UNPUBLISHED_FEED,
          data: data
        } as ServerToClientMessages[typeof EVENTS.PUBLISHER_UNPUBLISHED_FEED];
        break;
      case EVENTS.USER_LEFT_CONFERENCE:
        broadcastMessage = {
          type: EVENTS.USER_LEFT_CONFERENCE,
          data: data
        } as ServerToClientMessages[typeof EVENTS.USER_LEFT_CONFERENCE];
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
      case EVENTS.USER_JOINED_CALL:
        broadcastMessage = {
          type: EVENTS.USER_JOINED_CALL,
          data: data
        } as ServerToClientMessages[typeof EVENTS.USER_JOINED_CALL];
        break;
      case EVENTS.USER_LEFT_CALL:
        broadcastMessage = {
          type: EVENTS.USER_LEFT_CALL,
          data: data
        } as ServerToClientMessages[typeof EVENTS.USER_LEFT_CALL];
        break;
      case EVENTS.PUBLISHER_JOINED_CONFERENCE:
        broadcastMessage = {
          type: EVENTS.PUBLISHER_JOINED_CONFERENCE,
          data: data
        } as ServerToClientMessages[typeof EVENTS.PUBLISHER_JOINED_CONFERENCE];
        break;
      case EVENTS.PUBLISHER_TOGGLED_MEDIA_STREAM:
        broadcastMessage = {
          type: EVENTS.PUBLISHER_TOGGLED_MEDIA_STREAM,
          data: data
        } as ServerToClientMessages[typeof EVENTS.PUBLISHER_TOGGLED_MEDIA_STREAM];
        break;
      case EVENTS.FEED_MODERATED_BY_HOST:
        broadcastMessage = {
          type: EVENTS.FEED_MODERATED_BY_HOST,
          data: data
        } as ServerToClientMessages[typeof EVENTS.FEED_MODERATED_BY_HOST];
        break;
      case EVENTS.PUBLISHER_CONFIGURED_FEED:
        broadcastMessage = {
          type: EVENTS.PUBLISHER_CONFIGURED_FEED,
          data: data
        } as ServerToClientMessages[typeof EVENTS.PUBLISHER_CONFIGURED_FEED];
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
        ws.send(
          JSON.stringify({
            type: EVENTS.ERROR,
            error: errorMessage,
          } as ServerToClientMessages[typeof EVENTS.ERROR])
        );
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
      // Get credentials from query params
      const url = new URLSearchParams(req.url.split("?")[1]);
      const accessToken = url.get("access_token");

      console.log(`🔑 Handling WebSocket upgrade request:`, {
        url: req.url,
        hasAccessToken: !!accessToken,
      });

      if (typeof accessToken !== "string") {
        throw new Error("Invalid credentials");
      }

      const token = accessToken.replace(/^Bearer\s+/i, "");
      const tokenPayload = this.authService.validateToken(token, "user");

      // Get user using repository
      const user = await this.dbService.userRepository.getUserById(tokenPayload.userId);
      if (!user) {
        throw new Error("User not found");
      }

      console.log(`✅ Upgrade authentication successful for user ${tokenPayload.userId}`);

      // Accept upgrade and setup WebSocket
      this.wss.handleUpgrade(req, socket, head, ws => {
        (ws as AuthenticatedWebSocket).userId = tokenPayload.userId;
        (ws as AuthenticatedWebSocket).roomId = user.roomId;
        this.wss.emit("connection", ws, req);
      });
    } catch (err) {
      console.error(`❌ WebSocket upgrade failed:`, err);
      socket.write(`HTTP/1.1 401 Unauthorized\r\n\r\n`);
      socket.destroy();
    }
  }

  public async start(port: number): Promise<void> {
    this.httpServer.listen(port, () => {
      console.log(`🚀 WebSocket server running at ws://localhost:${port}/api/socket`);
    });
  }

  public async emitToRoom<T extends keyof ServerToClientMessages>(
    roomId: string,
    eventName: T,
    eventData?: ServerToClientMessages[T] extends { data: infer D } ? D : undefined,
    excludeUserId?: string,
    onlyUsersInCall: boolean = false
  ): Promise<void> {
    // Use existing broadcastToRoom method with onlyUsersInCall flag
    await this.broadcastToRoom(roomId, eventName as string, eventData, excludeUserId, onlyUsersInCall);
  }

  public async stop(): Promise<void> {
    console.log(`🛑 Stopping WebSocket server`);
    await this.pubSubService.disconnect();
    this.httpServer.close();
  }
}
