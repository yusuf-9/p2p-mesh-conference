import { mediaRooms, mediaSessions, mediaHandles, pendingTransactions } from "../schema.js";
import { eq, and } from "drizzle-orm";
import DatabaseService from "../index.js";
import { MediaHandle, MediaHandleType, FeedType, TransactionType, SimulcastResolution, SimulcastResolutions } from "../types.js";

export default class MediaRoomRepository {
  private dbService: DatabaseService;

  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
  }

  public async getMediaRoomById(id: string) {
    const room = await this.dbService.getDb().select().from(mediaRooms).where(eq(mediaRooms.id, id));
    return room?.[0] ?? null;
  }

  public async getMediaRoomBySessionId(sessionId: string) {
    // First get the media session for this room, then get the media room
    const session = await this.dbService
      .getDb()
      .select()
      .from(mediaRooms)
      .where(eq(mediaRooms.sessionId, sessionId))
      .limit(1);
    return session?.[0] ?? null;
  }

  public async createMediaRoom(sessionId: string, sfuRoomId: number) {
    const newMediaRoom = await this.dbService
      .getDb()
      .insert(mediaRooms)
      .values({
        sessionId,
        sfuRoomId,
      })
      .onConflictDoUpdate({
        target: [mediaRooms.sessionId],
        set: {
          sfuRoomId,
        },
      })
      .returning({
        id: mediaRooms.id,
        sessionId: mediaRooms.sessionId,
        sfuRoomId: mediaRooms.sfuRoomId,
        createdAt: mediaRooms.createdAt,
      });
    return newMediaRoom[0];
  }

  public async deleteMediaRoom(id: string) {
    await this.dbService.getDb().delete(mediaRooms).where(eq(mediaRooms.id, id));
  }

  public async getMediaRoomBySfuRoomId(sfuRoomId: number) {
    const room = await this.dbService
      .getDb()
      .select({
        id: mediaRooms.id,
        sessionId: mediaRooms.sessionId,
        sfuRoomId: mediaRooms.sfuRoomId,
        createdAt: mediaRooms.createdAt,
      })
      .from(mediaRooms)
      .where(eq(mediaRooms.sfuRoomId, sfuRoomId))
      .limit(1);
    return room?.[0] ?? null;
  }

  // Media Sessions methods
  public async createMediaSession(roomId: string, sessionId: string) {
    // Check if session already exists for this room
    const existingSession = await this.getMediaSessionByRoomId(roomId);

    if (existingSession) {
      // If updating with a different sessionId, clean up related data first
      if (existingSession.sessionId !== sessionId) {
        await this.deleteMediaSessionRelatedData(existingSession.id);
      }
    }

    const newSession = await this.dbService
      .getDb()
      .insert(mediaSessions)
      .values({
        roomId,
        sessionId,
      })
      .onConflictDoUpdate({
        target: [mediaSessions.roomId],
        set: {
          sessionId,
        },
      })
      .returning();
    return newSession[0];
  }

  public async getMediaSessionById(id: string) {
    const session = await this.dbService.getDb().select().from(mediaSessions).where(eq(mediaSessions.id, id));
    return session?.[0] ?? null;
  }

  public async getMediaSessionBySessionId(sessionId: string) {
    const session = await this.dbService.getDb().select().from(mediaSessions).where(eq(mediaSessions.sessionId, sessionId));
    return session?.[0] ?? null;
  }

  public async getMediaSessionByRoomId(roomId: string) {
    const session = await this.dbService.getDb().select().from(mediaSessions).where(eq(mediaSessions.roomId, roomId));
    return session[0] ?? null;
  }

  public async deleteMediaSessionBySessionId(sessionId: string) {
    await this.dbService.getDb().delete(mediaSessions).where(eq(mediaSessions.sessionId, sessionId));
  }

  public async updateMediaSession(id: string, updates: Partial<{ sessionId: string }>) {
    // First delete all related records manually
    await this.deleteMediaSessionRelatedData(id);

    // Then update the session
    const updatedSession = await this.dbService
      .getDb()
      .update(mediaSessions)
      .set(updates)
      .where(eq(mediaSessions.id, id))
      .returning();

    return updatedSession[0];
  }

  private async deleteMediaSessionRelatedData(sessionId: string) {
    // Delete all media handles for this session
    await this.dbService.getDb().delete(mediaHandles).where(eq(mediaHandles.sessionId, sessionId));

    // Delete all media rooms for this session  
    await this.dbService.getDb().delete(mediaRooms).where(eq(mediaRooms.sessionId, sessionId));
  }

  // Media Handles methods
  public async createMediaHandle(
    userId: string | null,
    sessionId: string,
    handleId: string,
    type: MediaHandleType,
    feedId: number | null,
    feedType: FeedType = "camera",
    audioEnabled: boolean = false,
    videoEnabled: boolean = false,
    simulcastEnabled: boolean = false,
    simulcastResolutions: SimulcastResolutions | null = null,
    subscribedResolution: SimulcastResolution | null = null
  ) {
    const newHandle = await this.dbService
      .getDb()
      .insert(mediaHandles)
      .values({
        type,
        sessionId,
        userId,
        handleId,
        feedId,
        feedType,
        audioEnabled,
        videoEnabled,
        simulcastEnabled,
        simulcastResolutions: simulcastResolutions ? JSON.stringify(simulcastResolutions) : null,
        subscribedResolution,
      })
      .returning();
    return newHandle[0];
  }

  public async getMediaHandleById(id: string) {
    const handle = await this.dbService.getDb().select().from(mediaHandles).where(eq(mediaHandles.id, id));
    return handle?.[0] ?? null;
  }

  public async getMediaHandlesByMediaRoomId(mediaRoomId: string) {
    const handles = await this.dbService
      .getDb()
      .select()
      .from(mediaHandles)
      .where(eq(mediaHandles.mediaRoomId, mediaRoomId));
    return handles;
  }

  public async getHandleByUserAndSession(sessionId: string, userId: string, feedId: number, type: MediaHandleType) {
    const handle = await this.dbService
      .getDb()
      .select()
      .from(mediaHandles)
      .where(
        and(
          eq(mediaHandles.sessionId, sessionId),
          eq(mediaHandles.userId, userId),
          eq(mediaHandles.feedId, Number(feedId)),
          eq(mediaHandles.type, type)
        )
      );
    return handle?.[0] ?? null;
  }

  public async getManagerHandleOfRoom(roomId: string) {
    const result = await this.dbService
      .getDb()
      .select({
        handle: mediaHandles,
        session: mediaSessions,
      })
      .from(mediaHandles)
      .innerJoin(mediaSessions, eq(mediaHandles.sessionId, mediaSessions.id))
      .where(and(eq(mediaSessions.roomId, roomId), eq(mediaHandles.type, "manager")))
      .limit(1);
    return result[0]?.handle ?? null;
  }

  public async getManagerHandleOfSession(sessionId: string) {
    const handle = await this.dbService
      .getDb()
      .select()
      .from(mediaHandles)
      .where(and(eq(mediaHandles.sessionId, sessionId), eq(mediaHandles.type, "manager")))
      .limit(1);
    return handle[0] ?? null;
  }

  public async deleteMediaHandle(id: string) {
    await this.dbService.getDb().delete(mediaHandles).where(eq(mediaHandles.id, id));
  }

  public async getMediaHandleByHandleId(handleId: string) {
    const handles = await this.dbService.getDb().select().from(mediaHandles).where(eq(mediaHandles.handleId, handleId));
    return handles[0] || null;
  }

  public async getUserByMediaHandleHandleId(handleId: string) {
    const handle = await this.dbService.getDb().select().from(mediaHandles).where(eq(mediaHandles.handleId, handleId));
    return handle?.[0]?.userId ?? null;
  }

  public async updateMediaHandle(id: string, handle: Partial<MediaHandle>) {
    await this.dbService.getDb().update(mediaHandles).set(handle).where(eq(mediaHandles.id, id));
  }

  public async updateHandRaisedStatus(feedId: number, userId: string, handRaised: boolean) {
    await this.dbService.getDb()
      .update(mediaHandles)
      .set({ handRaised })
      .where(and(
        eq(mediaHandles.feedId, feedId),
        eq(mediaHandles.userId, userId),
        eq(mediaHandles.type, "publisher")
      ));
  }

  public async deleteMediaHandlesOfUserInSession(sessionId: string, userId: string) {
    await this.dbService.getDb().delete(mediaHandles).where(and(eq(mediaHandles.userId, userId), eq(mediaHandles.sessionId, sessionId)));
  }

  public async getMediaHandlesOfUser(userId: string, sessionId: string) {
    const userHandles = await this.dbService.getDb().select().from(mediaHandles).where(and(eq(mediaHandles.userId, userId), eq(mediaHandles.sessionId, sessionId)))
    return userHandles;
  }

  // Pending Transactions methods
  public async createPendingTransaction(userId: string, type: TransactionType, transactionId: string, feedId?: number) {
    const newTransaction = await this.dbService
      .getDb()
      .insert(pendingTransactions)
      .values({
        userId,
        type,
        transactionId,
        feedId,
      })
      .returning();
    return newTransaction[0];
  }

  public async getPendingTransactionById(id: string) {
    const transaction = await this.dbService
      .getDb()
      .select()
      .from(pendingTransactions)
      .where(eq(pendingTransactions.id, id));
    return transaction?.[0] ?? null;
  }

  public async getPendingTransactionByTransactionId(transactionId: string) {
    const transaction = await this.dbService
      .getDb()
      .select()
      .from(pendingTransactions)
      .where(eq(pendingTransactions.transactionId, transactionId));
    return transaction?.[0] ?? null;
  }

  public async getPendingTransactionsByUserId(userId: string) {
    const transactions = await this.dbService
      .getDb()
      .select()
      .from(pendingTransactions)
      .where(eq(pendingTransactions.userId, userId));
    return transactions;
  }

  public async deletePendingTransaction(id: string) {
    await this.dbService.getDb().delete(pendingTransactions).where(eq(pendingTransactions.id, id));
  }

  public async getPubHandleByFeedId(feedId: number) {
    const pub = await this.dbService.getDb().select().from(mediaHandles).where(and(eq(mediaHandles.feedId, feedId), eq(mediaHandles.type, "publisher")));
    return pub?.[0] ?? null;
  }

  // Simulcast-specific methods
  public async updateMediaHandleSimulcast(
    id: string, 
    simulcastEnabled: boolean, 
    simulcastResolutions: SimulcastResolutions | null = null
  ) {
    const updates: Partial<MediaHandle> = {
      simulcastEnabled,
      simulcastResolutions: simulcastResolutions ? JSON.stringify(simulcastResolutions) : null,
    };
    
    await this.dbService.getDb()
      .update(mediaHandles)
      .set(updates)
      .where(eq(mediaHandles.id, id));
  }

  public async updateSubscriberResolution(
    id: string, 
    subscribedResolution: SimulcastResolution | null
  ) {
    await this.dbService.getDb()
      .update(mediaHandles)
      .set({ subscribedResolution })
      .where(eq(mediaHandles.id, id));
  }

  public async getMediaHandleWithSimulcastData(id: string) {
    const handle = await this.dbService.getDb()
      .select()
      .from(mediaHandles)
      .where(eq(mediaHandles.id, id))
      .limit(1);
    
    const result = handle[0];
    if (!result) return null;

    // Parse simulcast resolutions from JSON if they exist
    return {
      ...result,
      simulcastResolutions: result.simulcastResolutions 
        ? JSON.parse(result.simulcastResolutions) as SimulcastResolutions
        : null
    };
  }

  public async getPublisherHandlesByUserId(userId: string, sessionId: string) {
    const handles = await this.dbService.getDb()
      .select()
      .from(mediaHandles)
      .where(and(
        eq(mediaHandles.userId, userId),
        eq(mediaHandles.sessionId, sessionId),
        eq(mediaHandles.type, "publisher")
      ));
    
    // Parse simulcast resolutions for each handle
    return handles.map(handle => ({
      ...handle,
      simulcastResolutions: handle.simulcastResolutions 
        ? JSON.parse(handle.simulcastResolutions) as SimulcastResolutions
        : null
    }));
  }
}
