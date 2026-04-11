import { users } from "../schema.js";
import { and, eq } from "drizzle-orm";
import DatabaseService from "../index.js";
import { User } from "../types.js";

export default class UserRepository {
  private dbService: DatabaseService;

  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
  }

  public async getUserById(id: string) {
    const user = await this.dbService.getDb().select().from(users).where(eq(users.id, id));
    return user?.[0] ?? null;
  }

  public async getUserByRoomId(roomId: string) {
    const usersInRoom = await this.dbService.getDb().select().from(users).where(eq(users.roomId, roomId));
    return usersInRoom ?? [];
  }

  public async getConnectedUsersInRoom(roomId: string) {
    const usersInRoom = await this.dbService
      .getDb()
      .select()
      .from(users)
      .where(and(eq(users.roomId, roomId), eq(users.connected, true)));
    return usersInRoom ?? [];
  }

  public async getUsersInCallInRoom(roomId: string) {
    const usersInCall = await this.dbService
      .getDb()
      .select()
      .from(users)
      .where(and(eq(users.roomId, roomId), eq(users.joinedCall, true), eq(users.connected, true)));
    return usersInCall ?? [];
  }

  public async getUserByNameInRoom(roomId: string, name: string) {
    const user = await this.dbService
      .getDb()
      .select()
      .from(users)
      .where(and(eq(users.roomId, roomId), eq(users.name, name)));
    return user?.[0] ?? null;
  }

  public async getUsersInRoom(roomId: string) {
    const roomUsers = await this.dbService
      .getDb()
      .select({
        id: users.id,
        name: users.name,
        joinedCall: users.joinedCall,
        connected: users.connected,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.roomId, roomId));
    return roomUsers;
  }

  public async create(roomId: string, name: string) {
    const newUser = await this.dbService
      .getDb()
      .insert(users)
      .values({
        roomId,
        name,
      })
      .returning({
        id: users.id,
        roomId: users.roomId,
        name: users.name,
        connected: users.connected,
        joinedCall: users.joinedCall,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });
    return newUser[0];
  }

  public async updateConnectionStatus(userId: string, connected: boolean) {
    await this.dbService
      .getDb()
      .update(users)
      .set({
        connected,
      })
      .where(eq(users.id, userId));
  }

  public async updateUser(userId: string, updates: Partial<User>) {
    const user = await this.dbService
      .getDb()
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning();
    return user[0] ?? null
  }

  public async setUserJoinedCall(userId: string, joinedCall: boolean) {
    await this.dbService
      .getDb()
      .update(users)
      .set({ joinedCall })
      .where(eq(users.id, userId));
  }

  public async resetUserCallState(userId: string, disconnectUser: boolean = false) {
    const updates: any = {
      joinedCall: false,
      handRaised: false,
    };

    // Optionally set connected to false if this is a disconnect operation
    if (disconnectUser) {
      updates.connected = false;
    }

    await this.dbService
      .getDb()
      .update(users)
      .set(updates)
      .where(eq(users.id, userId));
  }

  public async delete(userId: string) {
    await this.dbService.getDb().delete(users).where(eq(users.id, userId));
  }
}
