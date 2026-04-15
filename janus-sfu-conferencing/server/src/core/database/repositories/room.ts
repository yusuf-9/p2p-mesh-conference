import { rooms, users, mediaRooms, roomHostRelation } from "../schema.js";
import { eq, or, and } from "drizzle-orm";
import DatabaseService from "../index.js";

export default class RoomRepository {
  private dbService: DatabaseService;

  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
  }

  public async getById(id: string) {
    const room = await this.dbService.getDb().select().from(rooms).where(eq(rooms.id, id));
    return room?.[0] ?? null;
  }

  public async create(name: string, description: string | null, type?: "one_to_one" | "group") {
    const newRoom = await this.dbService
      .getDb()
      .insert(rooms)
      .values({
        name,
        description,
        type: type || "group",
        hostId: null,
      })
      .returning({
        id: rooms.id,
        name: rooms.name,
        description: rooms.description,
        type: rooms.type,
        hostId: rooms.hostId,
        createdAt: rooms.createdAt,
        updatedAt: rooms.updatedAt,
      });
    return newRoom[0];
  }

  public async update(id: string, updateData: { name?: string; description?: string }) {
    const updatedRoom = await this.dbService.getDb().update(rooms).set(updateData).where(eq(rooms.id, id)).returning({
      id: rooms.id,
      name: rooms.name,
      description: rooms.description,
      type: rooms.type,
      hostId: rooms.hostId,
      createdAt: rooms.createdAt,
      updatedAt: rooms.updatedAt,
    });
    return updatedRoom?.[0] ?? null;
  }

  public async updateHostId(id: string, hostId: string | null) {
    await this.dbService.getDb().update(rooms).set({ hostId }).where(eq(rooms.id, id));
  }

  public async delete(id: string) {
    await this.dbService.getDb().delete(rooms).where(eq(rooms.id, id));
  }

  public async isUserRoomHost(roomId: string, userId: string): Promise<boolean> {
    // Check if user is the direct host (rooms.hostId) OR is in the roomHostRelation table
    const room = await this.dbService.getDb()
      .select({
        directHost: rooms.hostId,
      })
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);

    if (!room[0]) {
      return false;
    }

    // Check if user is the direct host
    if (room[0].directHost === userId) {
      return true;
    }

    // Check if user is in the roomHostRelation table
    const hostRelation = await this.dbService.getDb()
      .select()
      .from(roomHostRelation)
      .where(and(
        eq(roomHostRelation.roomId, roomId),
        eq(roomHostRelation.hostId, userId)
      ))
      .limit(1);

    return hostRelation.length > 0;
  }

  public async getUserCountInRoom(roomId: string): Promise<number> {
    const userCount = await this.dbService.getDb()
      .select({ count: users.id })
      .from(users)
      .where(eq(users.roomId, roomId));
    
    return userCount.length;
  }
}
