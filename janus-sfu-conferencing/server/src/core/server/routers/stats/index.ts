import express, { Request, Response, NextFunction } from "express";
import { eq, and, count, desc } from "drizzle-orm";
import DatabaseService from "../../../database/index.js";
import { rooms, mediaSessions, mediaRooms, mediaHandles, callStats, users } from "../../../database/schema.js";
import CustomError from "../../../../utility-types/error.js";

export default class StatsRouter {
  private router: express.Router;
  private dbService: DatabaseService;

  constructor(dbService: DatabaseService) {
    this.router = express.Router();
    this.dbService = dbService;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.get("/rooms", this.getRooms.bind(this));
    this.router.get("/rooms/:roomId/sessions", this.getRoomSessions.bind(this));
    this.router.get("/sessions/:sessionId/handles", this.getSessionHandles.bind(this));
    this.router.get("/handles/:handleId/stats", this.getHandleStats.bind(this));
  }

  private async getRooms(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const db = this.dbService.getDb();

      const allRooms = await db.select().from(rooms);

      const roomsWithCounts = await Promise.all(
        allRooms.map(async (room) => {
          const sessions = await db
            .select({ id: mediaSessions.id })
            .from(mediaSessions)
            .where(eq(mediaSessions.roomId, room.id));

          return {
            ...room,
            sessionCount: sessions.length,
          };
        })
      );

      res.json({ rooms: roomsWithCounts });
    } catch (error) {
      next(error);
    }
  }

  private async getRoomSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { roomId } = req.params;

      const db = this.dbService.getDb();

      const sessions = await db
        .select({
          id: mediaSessions.id,
          sessionId: mediaSessions.sessionId,
          active: mediaSessions.active,
          createdAt: mediaSessions.createdAt,
        })
        .from(mediaSessions)
        .where(eq(mediaSessions.roomId, roomId));

      const sessionsWithCounts = await Promise.all(
        sessions.map(async (session) => {
          const handles = await db
            .select({ id: mediaHandles.id })
            .from(mediaRooms)
            .leftJoin(mediaHandles, eq(mediaRooms.id, mediaHandles.mediaRoomId))
            .where(eq(mediaRooms.sessionId, session.id));

          return {
            ...session,
            handleCount: handles.length,
          };
        })
      );

      res.json({ sessions: sessionsWithCounts });
    } catch (error) {
      next(error);
    }
  }

  private async getSessionHandles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params;

      const db = this.dbService.getDb();

      const handles = await db
        .select({
          id: mediaHandles.id,
          handleId: mediaHandles.handleId,
          userId: mediaHandles.userId,
          type: mediaHandles.type,
          feedType: mediaHandles.feedType,
          feedId: mediaHandles.feedId,
          active: mediaHandles.active,
          createdAt: mediaHandles.createdAt,
        })
        .from(mediaHandles)
        .innerJoin(mediaRooms, eq(mediaHandles.mediaRoomId, mediaRooms.id))
        .where(eq(mediaRooms.sessionId, sessionId));

      const handlesWithUser = await Promise.all(
        handles.map(async (handle) => {
          if (handle.userId) {
            const user = await db
              .select({ name: users.name })
              .from(users)
              .where(eq(users.id, handle.userId))
              .limit(1);

            return {
              ...handle,
              userName: user[0]?.name || null,
            };
          }
          return { ...handle, userName: null };
        })
      );

      res.json({ handles: handlesWithUser });
    } catch (error) {
      next(error);
    }
  }

  private async getHandleStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { handleId } = req.params;
      const { type } = req.query;

      const db = this.dbService.getDb();

      const conditions = [eq(callStats.handleId, handleId)];

      if (type && typeof type === "string") {
        conditions.push(eq(callStats.type, type as any));
      }

      const stats = await db
        .select()
        .from(callStats)
        .where(and(...conditions))
        .orderBy(desc(callStats.createdAt));

      res.json({ stats });
    } catch (error) {
      next(error);
    }
  }

  public getRouter(): express.Router {
    return this.router;
  }
}
