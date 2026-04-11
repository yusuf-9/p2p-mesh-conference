import { v4 as uuidv4, validate } from "uuid";
import WebSocket from "ws";

import { retryPromiseIfFails } from "../../utils/index.js";
import AuthService from "../auth/index.js";
import DatabaseService from "../database/index.js";
import {
  SfuHandleCreationSuccessResponse,
  SfuRoomExistsResponse,
  SfuRoomCreationSuccessResponse,
  SfuSessionCreationSuccessResponse,
  JanusEvent,
  VideoroomEvent,
  VideoroomJoinedEvent,
  SfuPublisherListSuccessResponse,
  SfuHandleDetachedEvent,
} from "./types.js";
import { JanusEventUnionSchema, VideoroomJoinedEventSchema } from "./schemas.js";
import { MediaHandle, MediaHandleType, MediaRoom, MediaSession, StandardizedPublisher } from "../database/types.js";
import SfuManager from "../sfu-manager/index.js";
import { MediaStreamToggleData, RTCIceCandidateData } from "../ws/schema.js";
import { mediaHandleTypeEnum } from "../database/schema.js";
import { EVENTS } from "../ws/constants.js";

export default class SfuClient {
  private authService: AuthService;
  private dbService: DatabaseService;
  private sfuConfig: {
    name: string;
    uri: string;
  };
  private ws: WebSocket | null = null;
  private pendingTransactions: Map<string, any> = new Map();
  private handleSfuEvent: SfuManager["handleSfuEvent"];
  private emitSfuResponse: SfuManager["emitSfuResponse"];
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private sessionKeepAlives: Map<number, NodeJS.Timeout> = new Map();
  private activeSessions: Set<number> = new Set();

  constructor(
    authService: AuthService,
    dbService: DatabaseService,
    sfuConfig: {
      name: string;
      uri: string;
    },
    handleSfuEvent: SfuManager["handleSfuEvent"],
    emitSfuResponse: SfuManager["emitSfuResponse"]
  ) {
    this.authService = authService;
    this.dbService = dbService;
    this.sfuConfig = sfuConfig;
    this.handleSfuEvent = handleSfuEvent;
    this.emitSfuResponse = emitSfuResponse;
  }

  /**
   * Transforms raw SFU publisher data into standardized publisher objects
   * Returns: { id, feedType, userId, audio, video, talking, publisher }
   */
  private async standardizePublisher(rawPublisher: any): Promise<StandardizedPublisher | null> {
    try {
      if (!rawPublisher?.id) {
        console.warn("Publisher missing id, skipping");
        return null;
      }

      const handle = await this.dbService.mediaRoomRepository.getPubHandleByFeedId(rawPublisher.id);
      if (!handle || !handle.userId) {
        console.warn(`No media handle found for publisher ${rawPublisher.id}`);
        return null;
      }

      return {
        id: rawPublisher.id,
        feedType: handle.feedType || "camera",
        userId: handle.userId,
        audio: handle.audioEnabled,
        video: handle.videoEnabled,
        talking: rawPublisher.talking || false,
        publisher: rawPublisher.publisher !== false, // Default to true unless explicitly false
        handRaised: handle.handRaised || false,
        simulcastEnabled: handle.simulcastEnabled,
        simulcastResolutions: handle.simulcastResolutions ? JSON.parse(handle.simulcastResolutions) : null,
      };
    } catch (error) {
      console.error(`Error standardizing publisher ${rawPublisher?.id}:`, error);
      return null;
    }
  }

  /**
   * Transforms an array of raw SFU publishers into standardized publisher objects
   */
  private async standardizePublishers(rawPublishers: any[]): Promise<StandardizedPublisher[]> {
    const standardizedPublishers = await Promise.all(
      rawPublishers.map(publisher => this.standardizePublisher(publisher))
    );

    // Filter out null results
    return standardizedPublishers.filter(publisher => publisher !== null) as StandardizedPublisher[];
  }

  public async connect() {
    try {
      console.log("Connecting to SFU:", this.sfuConfig.name);
      await this.connectWebSocket();
      console.log("Connected to SFU:", this.sfuConfig.name);
    } catch (error) {
      console.error("Error connecting to SFU:", this.sfuConfig.name, error);
      throw error;
    }
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.sfuConfig.uri.replace('http://', 'ws://').replace('https://', 'wss://');

      this.ws = new WebSocket(wsUrl, 'janus-protocol');

      this.ws.on('open', () => {
        console.log('Connected to Janus WebSocket');
        this.startTransactionCleanup();
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleJanusMessage(message);
        } catch (error) {
          console.error('Error parsing Janus message:', error);
        }
      });

      this.ws.on('close', () => {
        console.log('Janus WebSocket connection closed');
        this.ws = null;

        // Stop all keep-alive intervals since connection is lost
        this.stopAllSessionKeepAlives();

        // Attempt to reconnect after 3 seconds
        this.reconnectTimeout = setTimeout(() => {
          console.log('Attempting to reconnect to Janus...');
          this.connectWebSocket().catch(console.error);
        }, 3000);
      });

      this.ws.on('error', (error) => {
        console.error('Janus WebSocket error:', error);
        reject(error);
      });
    });
  }


  private handleJanusMessage(message: any) {
    console.log('Received from Janus:', JSON.stringify(message, null, 2));

    // Handle transaction responses
    if (message.transaction && this.pendingTransactions.has(message.transaction)) {
      const transaction = this.pendingTransactions.get(message.transaction);
      this.handleTransactionResponse(message, transaction);
      this.pendingTransactions.delete(message.transaction);
      return;
    }

    switch (message.janus) {
      case 'ack':
        console.log('Received ACK from Janus');
        break;

      case 'error':
        console.error('Janus error:', message.error);
        console.error('origin message', message.error);

        // Check if this is a session-not-found error and stop keep-alive
        if (message.error?.code === 458 || message.error?.reason?.includes('session') || message.error?.reason?.includes('Session')) {
          if (message.session_id) {
            console.log(`Session error detected for session ${message.session_id}, stopping keep-alive`);
            this.stopSessionKeepAlive(message.session_id);
          }
        }
        break;

      case 'event':
        this.handleSfuEvent(message);
        break;

      case 'webrtcup':
        this.handleSfuEvent(message);
        break;

      default:
        console.log('Unhandled Janus message type:', message.janus);
    }
  }

  private handleTransactionResponse(message: any, transaction: any) {
    console.log(`Handling response for transaction type: ${transaction.type}`);

    if (transaction.resolve) {
      transaction.resolve(message);
    }
  }

  private startTransactionCleanup() {
    setInterval(() => {
      // Clean up stale transactions (older than 30 seconds)
      const now = Date.now();
      for (const [transactionId, transaction] of this.pendingTransactions) {
        if (now - transaction.timestamp > 30000) {
          console.log(`Cleaning up stale transaction: ${transaction.type}`);
          this.pendingTransactions.delete(transactionId);
        }
      }
    }, 30000);
  }

  private sendKeepAlive(sessionId: number): void {
    const transaction = this.createTransactionId();
    const message = {
      janus: "keepalive",
      session_id: sessionId,
      transaction: transaction
    };

    this.pendingTransactions.set(transaction, {
      type: 'keepalive',
      resolve: (response: any) => {
        if (response.janus === "error") {
          console.log(`Keep-alive failed for session ${sessionId}, stopping interval:`, response.error);
          this.stopSessionKeepAlive(sessionId);
        } else {
          console.log(`Keep-alive successful for session ${sessionId}`);
        }
      },
      reject: () => {
        console.log(`Keep-alive rejected for session ${sessionId}, stopping interval`);
        this.stopSessionKeepAlive(sessionId);
      },
      timestamp: Date.now()
    });

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      console.log(`Sent keep-alive for session ${sessionId}`);
    } else {
      console.log(`WebSocket not connected, stopping keep-alive for session ${sessionId}`);
      this.stopSessionKeepAlive(sessionId);
    }
  }

  private startSessionKeepAlive(sessionId: number): void {
    if (this.sessionKeepAlives.has(sessionId)) {
      return;
    }

    this.activeSessions.add(sessionId);

    const interval = setInterval(() => {
      this.sendKeepAlive(sessionId);
    }, 30000);

    this.sessionKeepAlives.set(sessionId, interval);
    console.log(`Started keep-alive interval for session ${sessionId}`);
  }

  private stopSessionKeepAlive(sessionId: number): void {
    const interval = this.sessionKeepAlives.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.sessionKeepAlives.delete(sessionId);
      this.activeSessions.delete(sessionId);
      console.log(`Stopped keep-alive interval for session ${sessionId}`);
    }
  }

  private stopAllSessionKeepAlives(): void {
    for (const [sessionId, interval] of this.sessionKeepAlives) {
      clearInterval(interval);
      console.log(`Stopped keep-alive interval for session ${sessionId}`);
    }
    this.sessionKeepAlives.clear();
    this.activeSessions.clear();
    console.log('Stopped all session keep-alive intervals');
  }

  public async joinRoomAsPublisher(userId: string, roomId: string, feedType: "camera" | "screenshare" = "camera", audioEnabled: boolean = true, videoEnabled: boolean = true, simulcastEnabled: boolean = false, simulcastResolutions: ("h" | "m" | "l")[] | null = null) {
    try {
      console.log("joining room as publisher")
      let session = await this.getExistingSession(roomId);
      console.log(session ? "session already exists" : "session does not exist")
      if (!session) {
        session = await this.createSession(roomId);
      }

      let managerHandle = await this.getExistingManagerHandle(session);
      console.log(managerHandle ? "manager handle already exists" : "manager handle does not exist")
      if (!managerHandle) {
        managerHandle = await this.createManagerHandleForSession(session);
      }

      let mediaRoom = await this.getExistingMediaRoom(session, managerHandle.handleId);
      console.log(mediaRoom ? "media room already exists" : "media room does not exist")
      if (!mediaRoom) {
        mediaRoom = await this.createRoom(session, managerHandle);
      }

      console.log("creating handle for publisher")
      const handle = await this.createHandle(userId, session, "publisher", feedType, audioEnabled, videoEnabled, simulcastEnabled, simulcastResolutions);
      console.log("created handle for publisher", handle.handleId)
      await this.attachPublisherHandleToRoom(userId, session, handle, mediaRoom);
      console.log("attached publisher handle to room")
    } catch (error) {
      console.error("Error joining room as publisher", error);
      throw error;
    }
  }

  private async getExistingSession(roomId: string) {
    const session = await this.dbService.mediaRoomRepository.getMediaSessionByRoomId(roomId);
    if (!session) {
      return null;
    }

    const sessionExistsInJanus = await this.validateSessionExistenceInSFU(Number(session.sessionId));
    if (!sessionExistsInJanus) {
      return null;
    }

    return session;
  }

  private async getExistingManagerHandle(session: MediaSession) {
    const managerHandle = await this.dbService.mediaRoomRepository.getManagerHandleOfSession(session.id);
    if (!managerHandle) {
      return null;
    }

    const handleExistsInJanus = await this.validateHandleExistenceInSFU(Number(session.sessionId), managerHandle.handleId);
    if (!handleExistsInJanus) {
      return null;
    }

    return managerHandle;
  }

  private async validateHandleExistenceInSFU(sessionId: number, handleId: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        console.log("validating handle existence in SFU");
        const transaction = this.createTransactionId();

        const message = {
          janus: "message",
          session_id: sessionId,
          handle_id: Number(handleId),
          transaction: transaction,
          body: {
            request: "exists",
            room: Number(9999), // dummy room id. Request will fail if handle is invalid
          },
        };

        this.pendingTransactions.set(transaction, {
          type: 'validate_handle',
          resolve: (response: any) => {
            console.log("validate handle response", response)
            if (response.janus === "error") {
              console.log("handle does not exist")
              resolve(false);
            } else {
              console.log("validated handle existence in SFU", response);
              resolve(true);
            }
          },
          reject: () => resolve(false),
          timestamp: Date.now()
        });

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify(message));
          console.log("sent valiate handle existence request")
        } else {
          resolve(false);
        }
      } catch (error) {
        console.error('Error checking handle existence in sfu', error);
        resolve(false);
      }
    });
  }

  private async getExistingMediaRoom(session: MediaSession, handleId: string) {
    const mediaRoom = await this.dbService.mediaRoomRepository.getMediaRoomBySessionId(session.id);
    if (!mediaRoom) {
      return null;
    }

    const roomExists = await this.checkRoomExists(session.sessionId, handleId, mediaRoom.sfuRoomId);
    if (!roomExists) {
      return null;
    }

    return mediaRoom;
  }

  private async checkRoomExists(sessionId: string, handleId: string, roomId: number): Promise<boolean> {
    return new Promise((resolve) => {
      const transaction = this.createTransactionId();

      const message = {
        janus: "message",
        session_id: Number(sessionId),
        handle_id: Number(handleId),
        transaction: transaction,
        body: {
          request: "exists",
          room: Number(roomId),
        },
      };

      this.pendingTransactions.set(transaction, {
        type: 'check_room_exists',
        resolve: (response: any) => {
          resolve(response?.plugindata?.data?.exists === true);
        },
        reject: () => resolve(false),
        timestamp: Date.now()
      });

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(message));
      } else {
        resolve(false);
      }
    });
  }

  private async getExistingHandle(session: MediaSession, userId: string, feedId: number, type: MediaHandleType) {
    const handle = await this.dbService.mediaRoomRepository.getHandleByUserAndSession(session.id, userId, feedId, type);
    if (!handle) {
      return null;
    }

    return handle;
  }

  private async createSession(roomId: string): Promise<MediaSession> {
    return new Promise((resolve, reject) => {
      const transaction = this.createTransactionId();

      const createSessionMessage = {
        janus: "create",
        transaction: transaction
      };

      this.pendingTransactions.set(transaction, {
        type: 'create_session',
        resolve: async (response: any) => {
          if (response.janus !== 'success' || !response.data?.id) {
            reject(new Error('Failed to create session'));
            return;
          }

          console.log("created session", response.data.id)
          const sessionId = response.data.id;
          const mediaSession = await this.dbService.mediaRoomRepository.createMediaSession(roomId, sessionId.toString());

          // Start keep-alive interval for this session
          this.startSessionKeepAlive(sessionId);

          resolve(mediaSession);
        },
        reject,
        timestamp: Date.now()
      });

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(createSessionMessage));
        console.log('Sent create session request to Janus for room:', roomId);
      } else {
        reject(new Error('WebSocket not connected'));
      }
    });
  }

  private async createManagerHandleForSession(session: MediaSession): Promise<MediaHandle> {
    return new Promise((resolve, reject) => {
      const transaction = this.createTransactionId();

      const message = {
        janus: "attach",
        plugin: "janus.plugin.videoroom",
        session_id: Number(session.sessionId),
        transaction: transaction
      };

      this.pendingTransactions.set(transaction, {
        type: 'create_manager_handle',
        resolve: async (response: any) => {
          if (response.janus !== "success") {
            reject(new Error("Failed to create handler"));
            return;
          }

          const handleId = response.data.id;
          const mediaHandle = await this.dbService.mediaRoomRepository.createMediaHandle(
            null,
            session.id,
            handleId.toString(),
            "manager",
            null,
            "camera",
            false,
            false
          );

          resolve(mediaHandle);
        },
        reject,
        timestamp: Date.now()
      });

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(message));
      } else {
        reject(new Error('WebSocket not connected'));
      }
    });
  }

  private async createHandle(userId: string, session: MediaSession, handleType: MediaHandleType, feedType: "camera" | "screenshare" = "camera", audioEnabled: boolean = false, videoEnabled: boolean = false, simulcastEnabled: boolean = false, simulcastResolutions: ("h" | "m" | "l")[] | null = null, subscribedResolution: "h" | "m" | "l" | null = null): Promise<MediaHandle> {
    return new Promise((resolve, reject) => {
      const transaction = this.createTransactionId();

      const message = {
        janus: "attach",
        plugin: "janus.plugin.videoroom",
        session_id: Number(session.sessionId),
        transaction: transaction
      };

      this.pendingTransactions.set(transaction, {
        type: 'create_handle',
        resolve: async (response: any) => {
          if (response.janus !== "success") {
            reject(new Error("Failed to create handler"));
            return;
          }

          const handleId = response.data.id;
          const mediaHandle = await this.dbService.mediaRoomRepository.createMediaHandle(
            userId,
            session.id,
            handleId.toString(),
            handleType,
            null,
            feedType,
            audioEnabled,
            videoEnabled,
            simulcastEnabled,
            simulcastResolutions,
            subscribedResolution
          );

          resolve(mediaHandle);
        },
        reject,
        timestamp: Date.now()
      });

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(message));
      } else {
        reject(new Error('WebSocket not connected'));
      }
    });
  }

  private async createRoom(session: MediaSession, handle: MediaHandle): Promise<MediaRoom> {
    return new Promise((resolve, reject) => {
      const mediaRoomId = this.createNumericalId();
      const transaction = this.createTransactionId();

      const message = {
        janus: "message",
        session_id: Number(session.sessionId),
        handle_id: Number(handle.handleId),
        transaction: transaction,
        body: {
          request: "create",
          room: mediaRoomId,
          publishers: 100
        },
      };

      this.pendingTransactions.set(transaction, {
        type: 'create_room',
        resolve: async (response: any) => {
          if (response.janus === "success" && !Boolean(response.plugindata?.data?.error)) {
            console.log("created room response")
            const mediaRoom = await this.dbService.mediaRoomRepository.createMediaRoom(session.id, mediaRoomId);
            resolve(mediaRoom);
            return;
          }
          console.log("failed to create room", response)
          reject(new Error("failed to create media room in SFU"))
        },
        reject,
        timestamp: Date.now()
      });

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(message));
      } else {
        reject(new Error('WebSocket not connected'));
      }
    });
  }

  private async attachPublisherHandleToRoom(
    userId: string,
    session: MediaSession,
    handle: MediaHandle,
    mediaRoom: MediaRoom
  ) {
    const transaction = this.createTransactionId();
    const publisherId = this.createNumericalId();

    await this.dbService.mediaRoomRepository.createPendingTransaction(userId, "join_as_publisher", transaction, publisherId);

    const message = {
      janus: "message",
      session_id: Number(session.sessionId),
      handle_id: Number(handle.handleId),
      transaction: transaction,
      body: {
        request: "join",
        ptype: "publisher",
        room: Number(mediaRoom.sfuRoomId),
        id: publisherId,
      },
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }

    await this.dbService.mediaRoomRepository.updateMediaHandle(handle.id, {
      feedId: publisherId,
      mediaRoomId: mediaRoom.id,
    });
  }

  public async sendOfferForPublishing(userId: string, roomId: string, { feedId, jsep }: { feedId: number; jsep: any }) {
    const session = await this.getExistingSession(roomId);
    if (!session) {
      throw new Error("Session not found");
    }

    const handle = await this.getExistingHandle(session, userId, feedId, "publisher");
    if (!handle) {
      throw new Error("Handle not found");
    }

    const transaction = this.createTransactionId();

    await this.dbService.mediaRoomRepository.createPendingTransaction(userId, "send_offer_for_publishing", transaction, feedId);

    const message = {
      janus: "message",
      session_id: Number(session.sessionId),
      handle_id: Number(handle.handleId),
      transaction: transaction,
      body: {
        request: "publish",
        audio: true,
        video: true,
        data: false,
      },
      jsep,
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  public async setIceCandidates(
    userId: string,
    roomId: string,
    {
      feedId,
      candidates,
      type,
    }: { feedId: number; candidates: RTCIceCandidateData[]; type: "publisher" | "subscriber" }
  ) {
    const session = await this.getExistingSession(roomId);
    if (!session) {
      throw new Error("Session not found");
    }

    const handle = await this.getExistingHandle(session, userId, feedId, type);
    if (!handle) {
      throw new Error("Handle not found");
    }

    const message = {
      janus: "trickle",
      session_id: Number(session.sessionId),
      handle_id: Number(handle.handleId),
      transaction: this.createTransactionId(),
      candidates,
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  public async setIceCandidateCompleted(
    userId: string,
    roomId: string,
    { feedId, type }: { feedId: number; type: "publisher" | "subscriber" }
  ) {
    const session = await this.getExistingSession(roomId);
    if (!session) {
      throw new Error("Session not found");
    }

    const handle = await this.getExistingHandle(session, userId, feedId, type);
    if (!handle) {
      throw new Error("Handle not found");
    }

    const message = {
      janus: "trickle",
      session_id: Number(session.sessionId),
      handle_id: Number(handle.handleId),
      transaction: this.createTransactionId(),
      candidate: {
        completed: true,
      },
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  public async subscribeToUserFeed(userId: string, roomId: string, feedId: number, preferredResolution: "h" | "m" | "l" | null = null) {
    const session = await this.getExistingSession(roomId);
    if (!session) {
      throw new Error("Session not found");
    }

    const mediaRoom = await this.dbService.mediaRoomRepository.getMediaRoomBySessionId(session.id);
    if (!mediaRoom) {
      throw new Error("Media room not found");
    }

    const handle = await this.createHandle(userId, session, "subscriber", "camera", false, false, false, null, preferredResolution);
    await this.attachSubscriberHandleToRoom(userId, session, handle, mediaRoom, feedId, preferredResolution);
  }

  private async attachSubscriberHandleToRoom(
    userId: string,
    session: MediaSession,
    handle: MediaHandle,
    mediaRoom: MediaRoom,
    feedId: number,
    preferredResolution: "h" | "m" | "l" | null = null
  ) {
    const transaction = this.createTransactionId();

    await this.dbService.mediaRoomRepository.createPendingTransaction(userId, "subscribe_to_feed", transaction, feedId);

    const substreamToSubscribeTo = preferredResolution === "l" ? 0 : preferredResolution === "m" ? 1 : 2;

    const message = {
      janus: "message",
      session_id: Number(session.sessionId),
      handle_id: Number(handle.handleId),
      transaction: transaction,
      body: {
        request: "join",
        ptype: "subscriber",
        room: Number(mediaRoom.sfuRoomId),
        streams: [
          {
            feed: feedId,
            substream: substreamToSubscribeTo
          }
        ],
      },
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }

    await this.dbService.mediaRoomRepository.updateMediaHandle(handle.id, {
      feedId: feedId,
      mediaRoomId: mediaRoom.id,
    });
  }

  public async sendAnswerForSubscribing(userId: string, roomId: string, { feedId, jsep }: { feedId: number; jsep: any }) {
    const session = await this.getExistingSession(roomId);
    if (!session) {
      throw new Error("Session not found");
    }

    const handle = await this.getExistingHandle(session, userId, feedId, "subscriber");
    if (!handle) {
      throw new Error("Subscriber handle not found");
    }

    const message = {
      janus: "message",
      session_id: Number(session.sessionId),
      handle_id: Number(handle.handleId),
      transaction: this.createTransactionId(),
      body: {
        request: "start",
      },
      jsep,
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  public async requestPublisherList(userId: string, roomId: string) {
    const session = await this.getExistingSession(roomId);
    if (!session) {
      throw new Error("Session not found");
    }

    let managerHandle = await this.getExistingManagerHandle(session);

    console.log(managerHandle ? "manager handle already exists" : "manager handle does not exist")

    if (!managerHandle) {
      managerHandle = await this.createManagerHandleForSession(session);
    }

    const mediaRoomAssociatedWithSession = await this.dbService.mediaRoomRepository.getMediaRoomBySessionId(session.id);

    if (!mediaRoomAssociatedWithSession) {
      throw new Error("Manager room does not exist for room: " + roomId);
    }

    return new Promise<void>((resolve, reject) => {
      const transaction = this.createTransactionId();

      const message = {
        janus: "message",
        session_id: Number(session.sessionId),
        handle_id: Number(managerHandle.handleId),
        transaction: transaction,
        body: {
          request: "listparticipants",
          room: mediaRoomAssociatedWithSession.sfuRoomId,
        },
      };

      this.pendingTransactions.set(transaction, {
        type: 'list_participants',
        resolve: async (response: any) => {
          if (response.janus === "success") {
            try {
              // Standardize participants data
              const participants = response.plugindata?.data?.participants || [];
              const standardizedParticipants = await this.standardizePublishers(participants);
              this.emitSfuResponse(userId, EVENTS.PUBLISHER_LIST, standardizedParticipants);
              resolve();
            } catch (error) {
              console.error("Error processing publisher list:", error);
              // Fallback: return empty array if standardization fails
              this.emitSfuResponse(userId, EVENTS.PUBLISHER_LIST, []);
              resolve();
            }
          } else {
            reject(new Error("Failed to request publisher list"));
          }
        },
        reject,
        timestamp: Date.now()
      });

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(message));
      } else {
        reject(new Error('WebSocket not connected'));
      }
    });
  }

  private async validateSessionExistenceInSFU(sessionId: number): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        console.log("validating session existence");
        const transaction = this.createTransactionId();

        const message = {
          janus: "keepalive",
          session_id: sessionId,
          transaction: transaction
        };

        this.pendingTransactions.set(transaction, {
          type: 'validate_session',
          resolve: (response: any) => {
            console.log("validate transaction response", response)
            if (response.janus === "error") {
              console.log("session does not exist in sfu", response);
              // Stop keep-alive for this session since it doesn't exist
              this.stopSessionKeepAlive(sessionId);
              resolve(false);
            } else {
              console.log("validated session existence", response);
              resolve(true);
            }
          },
          reject: () => {
            // Stop keep-alive on validation rejection
            this.stopSessionKeepAlive(sessionId);
            resolve(false);
          },
          timestamp: Date.now()
        });

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify(message));
        } else {
          resolve(false);
        }
      } catch (error) {
        resolve(false);
      }
    });
  }

  public async togglePublisherMedia(userId: string, roomId: string, { feedId, audio, video }: MediaStreamToggleData) {
    const session = await this.getExistingSession(roomId);
    if (!session) {
      throw new Error("Session not found");
    }

    const handle = await this.getExistingHandle(session, userId, feedId, "publisher");
    if (!handle) {
      throw new Error("User is not a publisher");
    }

    const transaction = this.createTransactionId();

    await this.dbService.mediaRoomRepository.createPendingTransaction(userId, "toggle_media_stream", transaction, feedId);

    const message = {
      janus: "message",
      session_id: Number(session.sessionId),
      handle_id: Number(handle.handleId),
      transaction: transaction,
      body: {
        request: "configure",
        audio,
        video
      },
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }

    // Return the audio/video state to be used in the manager
    return { audio, video };
  }

  public async unpublishFeed(userId: string, roomId: string, { feedId }: { feedId: number }): Promise<void> {
    console.log(`📤 User ${userId} unpublishing feed ${feedId} in room ${roomId}`);

    // 1. Get existing session
    const session = await this.getExistingSession(roomId);
    if (!session) {
      throw new Error("Session not found");
    }

    // 2. Get publisher handle by feedId - verify it belongs to the requesting user
    const handle = await this.dbService.mediaRoomRepository.getPubHandleByFeedId(feedId);
    if (!handle) {
      throw new Error("Publisher handle not found");
    }

    if (handle.userId !== userId) {
      throw new Error("Feed does not belong to requesting user");
    }

    // 4. Send unpublish message to Janus
    const message = {
      janus: "message",
      session_id: Number(session.sessionId),
      handle_id: Number(handle.handleId),
      transaction: this.createTransactionId(),
      body: {
        request: "unpublish",
      },
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }

    // 5. Send leave message to Janus
    const leaveMessage = {
      janus: "message",
      session_id: Number(session.sessionId),
      handle_id: Number(handle.handleId),
      transaction: this.createTransactionId(),
      body: {
        request: "leave",
      },
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(leaveMessage));
    }

    // 6. Send detach message to Janus
    const detachMessage = {
      janus: "detach",
      session_id: Number(session.sessionId),
      handle_id: Number(handle.handleId),
      transaction: this.createTransactionId(),
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(detachMessage));
    }

    // 7. Clean up database - remove the specific handle
    await this.dbService.mediaRoomRepository.deleteMediaHandle(handle.id);
    console.log(`🗑️ Deleted handle ${handle.id} from database`);
  }

  public async cleanupUserHandles(userId: string, roomId: string): Promise<void> {
    try {
      console.log(`🧹 Cleaning up handles for user ${userId} in room ${roomId}`);

      const session = await this.getExistingSession(roomId);
      if (!session) {
        console.log(`No session found for room ${roomId}, skipping handle cleanup`);
        return;
      }

      // Get all handles for this user in the media room
      const userHandles = await this.dbService.mediaRoomRepository.getMediaHandlesOfUser(userId, session.id);

      if (!userHandles.length) {
        console.log(`No handles found for user ${userId}`);
        return;
      }

      console.log(`Found ${userHandles.length} handles to cleanup for user ${userId}`);

      // Run SFU cleanup operations in parallel
      await Promise.all([
        this.unpublishUserHandles(session.sessionId, userHandles),
        this.leaveUserHandles(session.sessionId, userHandles),
        this.detachUserHandles(session.sessionId, userHandles),
      ]);

      console.log(`✅ Finished cleanup for user ${userId}`);
    } catch (error) {
      console.error(`Error during handle cleanup for user ${userId}:`, error);
    }
  }

  public async destroySession(roomId: string, sessionId: number) {
    try {
      // Stop keep-alive for this session
      this.stopSessionKeepAlive(sessionId);

      const message = {
        janus: "destroy",
        session_id: sessionId,
        transaction: this.createTransactionId(),
      };

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(message));
      }

      await this.dbService.mediaRoomRepository.deleteMediaSessionBySessionId(sessionId.toString());
    } catch (error) {
      console.error(`Error destroying session ${roomId}:`, error);
    }
  }

  private createTransactionId() {
    return uuidv4();
  }

  private createNumericalId() {
    // create a  number b/w 1000000 and 9999999
    return Math.floor(Math.random() * 9000000) + 1000000;
  }

  private async unpublishUserHandles(sessionId: string, handles: any[]): Promise<void> {
    const publisherHandles = handles.filter(h => h.type === "publisher" && h.feedId);

    if (!publisherHandles.length) {
      return;
    }

    console.log(`📤 Unpublishing ${publisherHandles.length} publisher handles`);

    const unpublishPromises = publisherHandles.map(handle => {
      const message = {
        janus: "message",
        session_id: Number(sessionId),
        handle_id: Number(handle.handleId),
        transaction: this.createTransactionId(),
        body: {
          request: "unpublish",
        },
      };

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(message));
        return Promise.resolve();
      } else {
        console.error(`WebSocket not connected for unpublishing handle ${handle.handleId}`);
        return Promise.resolve();
      }
    });

    await Promise.all(unpublishPromises);
  }

  private async leaveUserHandles(sessionId: string, handles: any[]): Promise<void> {
    console.log(`🚪 Sending leave requests for ${handles.length} handles`);

    const leavePromises = handles.map(handle => {
      const message = {
        janus: "message",
        session_id: Number(sessionId),
        handle_id: Number(handle.handleId),
        transaction: this.createTransactionId(),
        body: {
          request: "leave",
        },
      };

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(message));
        return Promise.resolve();
      } else {
        console.error(`WebSocket not connected for leaving handle ${handle.handleId}`);
        return Promise.resolve();
      }
    });

    await Promise.all(leavePromises);
  }

  public async configureFeedSubscription(userId: string, roomId: string, data: { feedId: number; resolution: "h" | "m" | "l" }) {
    const session = await this.getExistingSession(roomId);
    if (!session) {
      throw new Error("Session not found");
    }

    // Get the subscriber handle for this feed
    const handle = await this.dbService.mediaRoomRepository.getHandleByUserAndSession(
      session.id,
      userId,
      data.feedId,
      "subscriber"
    );
    if (!handle) {
      throw new Error("Subscriber handle not found");
    }

    // Map resolution to substream: h=2, m=1, l=0
    const substream = data.resolution === "h" ? 2 : data.resolution === "m" ? 1 : 0;

    const transaction = this.createTransactionId();
    await this.dbService.mediaRoomRepository.createPendingTransaction(userId, "configure_feed_subscription", transaction, data.feedId);

    const message = {
      janus: "message",
      session_id: Number(session.sessionId),
      handle_id: Number(handle.handleId),
      transaction: transaction,
      body: {
        request: "configure",
        substream: substream
      },
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }

    // Update database with new resolution preference
    await this.dbService.mediaRoomRepository.updateMediaHandle(handle.id, {
      subscribedResolution: data.resolution,
    });

    console.log(`📺 Configured subscription to feed ${data.feedId} with resolution ${data.resolution} (substream ${substream})`);
  }

  private async detachUserHandles(sessionId: string, handles: any[]): Promise<void> {
    console.log(`🔌 Detaching ${handles.length} handles`);

    const detachPromises = handles.map(handle => {
      const message = {
        janus: "detach",
        session_id: Number(sessionId),
        handle_id: Number(handle.handleId),
        transaction: this.createTransactionId(),
      };

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(message));
        return Promise.resolve();
      } else {
        console.error(`WebSocket not connected for detaching handle ${handle.handleId}`);
        return Promise.resolve();
      }
    });

    await Promise.all(detachPromises);
  }
}
