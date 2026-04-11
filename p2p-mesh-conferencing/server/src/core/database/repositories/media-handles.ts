import { eq, and, ne } from "drizzle-orm";
import { mediaHandles } from "../schema.js";
import DatabaseService from "../index.js";
import { MediaHandle, NewMediaHandle, P2PMeshParticipant, FeedType } from "../types.js";

export default class MediaHandleRepository {
  private dbService: DatabaseService;

  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
  }

  /**
   * Create a new media handle for P2P mesh participant
   */
  async createMediaHandle(data: NewMediaHandle): Promise<MediaHandle> {
    const db = this.dbService.getDb();
    
    const [mediaHandle] = await db
      .insert(mediaHandles)
      .values(data)
      .returning();
    
    return mediaHandle;
  }

  /**
   * Get media handle by user, room ID and feed type
   */
  async getMediaHandleByUserRoomAndFeedType(userId: string, roomId: string, feedType: FeedType): Promise<MediaHandle | null> {
    const db = this.dbService.getDb();
    
    const [mediaHandle] = await db
      .select()
      .from(mediaHandles)
      .where(and(
        eq(mediaHandles.userId, userId),
        eq(mediaHandles.roomId, roomId),
        eq(mediaHandles.feedType, feedType)
      ));
    
    return mediaHandle || null;
  }

  /**
   * Get all media handles by user and room ID
   */
  async getMediaHandlesByUserAndRoom(userId: string, roomId: string): Promise<MediaHandle[]> {
    const db = this.dbService.getDb();
    
    return db
      .select()
      .from(mediaHandles)
      .where(and(
        eq(mediaHandles.userId, userId),
        eq(mediaHandles.roomId, roomId)
      ));
  }

  /**
   * Get all media handles in a room
   */
  async getMediaHandlesInRoom(roomId: string): Promise<MediaHandle[]> {
    const db = this.dbService.getDb();
    
    return db
      .select()
      .from(mediaHandles)
      .where(eq(mediaHandles.roomId, roomId));
  }

  /**
   * Update media states by handle ID (for specific stream)
   */
  async updateMediaStatesByHandleId(handleId: string, audioEnabled: boolean, videoEnabled: boolean): Promise<MediaHandle | null> {
    const db = this.dbService.getDb();
    
    const [updatedHandle] = await db
      .update(mediaHandles)
      .set({ audioEnabled, videoEnabled })
      .where(eq(mediaHandles.handleId, handleId))
      .returning();
    
    return updatedHandle || null;
  }

  /**
   * Get media handles in room excluding specific user
   */
  async getMediaHandlesInRoomExcludingUser(roomId: string, excludeUserId: string): Promise<MediaHandle[]> {
    const db = this.dbService.getDb();
    
    return db
      .select()
      .from(mediaHandles)
      .where(and(
        eq(mediaHandles.roomId, roomId),
        ne(mediaHandles.userId, excludeUserId)
      ));
  }

  /**
   * Update hand raised status
   */
  async updateHandRaisedStatus(userId: string, roomId: string, handRaised: boolean): Promise<void> {
    const db = this.dbService.getDb();
    
    await db
      .update(mediaHandles)
      .set({ handRaised })
      .where(and(
        eq(mediaHandles.userId, userId),
        eq(mediaHandles.roomId, roomId)
      ));
  }

  /**
   * Update feed type (camera/screenshare)
   */
  async updateFeedType(userId: string, roomId: string, feedType: FeedType): Promise<void> {
    const db = this.dbService.getDb();
    
    await db
      .update(mediaHandles)
      .set({ feedType })
      .where(and(
        eq(mediaHandles.userId, userId),
        eq(mediaHandles.roomId, roomId)
      ));
  }

  /**
   * Delete all media handles for user in room (user leaves call)
   */
  async deleteMediaHandlesForUser(userId: string, roomId: string): Promise<void> {
    const db = this.dbService.getDb();
    
    await db
      .delete(mediaHandles)
      .where(and(
        eq(mediaHandles.userId, userId),
        eq(mediaHandles.roomId, roomId)
      ));
  }

  /**
   * Delete specific media handle by handle ID
   */
  async deleteMediaHandleById(handleId: string): Promise<void> {
    const db = this.dbService.getDb();
    
    await db
      .delete(mediaHandles)
      .where(eq(mediaHandles.handleId, handleId));
  }

  /**
   * Get P2P mesh participants with formatted data
   */
  async getP2PMeshParticipants(roomId: string): Promise<P2PMeshParticipant[]> {
    const handles = await this.getMediaHandlesInRoom(roomId);
    
    return handles.map(handle => ({
      id: handle.id,
      userId: handle.userId,
      roomId: handle.roomId,
      handleId: handle.handleId,
      type: handle.type as any,
      feedType: handle.feedType as FeedType,
      audioEnabled: handle.audioEnabled,
      videoEnabled: handle.videoEnabled,
      handRaised: handle.handRaised,
      createdAt: handle.createdAt.toISOString()
    }));
  }

  /**
   * Check if user has media handle in room
   */
  async hasMediaHandle(userId: string, roomId: string): Promise<boolean> {
    const handles = await this.getMediaHandlesByUserAndRoom(userId, roomId);
    return handles.length > 0;
  }

  /**
   * Get media handle by handle ID
   */
  async getMediaHandleById(handleId: string): Promise<MediaHandle | null> {
    const db = this.dbService.getDb();
    
    const [mediaHandle] = await db
      .select()
      .from(mediaHandles)
      .where(eq(mediaHandles.handleId, handleId));
    
    return mediaHandle || null;
  }
}