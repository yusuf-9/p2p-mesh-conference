import express, { Request, Response, NextFunction } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import DatabaseService from "../../../database/index.js";
import Config from "../../../config/index.js";
import { rooms } from "../../../database/schema.js";
import CustomError from "../../../../utility-types/error.js";
import { roomIdParamSchema } from "../room/schemas.js";

const userIdParamSchema = z.object({
  userId: z.string().uuid("Invalid user ID format"),
});

interface ProcessedFileMetadata {
  callStart?: string;
  callEnd?: string;
}

export default class StatsRouter {
  private router: express.Router;
  private dbService: DatabaseService;
  private processedDir: string;

  constructor(dbService: DatabaseService, config: Config) {
    this.router = express.Router();
    this.dbService = dbService;
    this.processedDir = path.resolve(config.rtcStats.processedDir);
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.get("/rooms", this.getRooms.bind(this));
    this.router.get("/rooms/:roomId/users", this.getRoomUsers.bind(this));
    this.router.get("/users/:userId/processed", this.getUserProcessed.bind(this));
  }

  private processedFilePath(userId: string): string {
    return path.join(this.processedDir, `${userId}_processed.json`);
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async readProcessedMetadata(userId: string): Promise<ProcessedFileMetadata | null> {
    const filePath = this.processedFilePath(userId);
    if (!(await this.fileExists(filePath))) {
      return null;
    }

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(content) as { data?: ProcessedFileMetadata };
      return {
        callStart: parsed.data?.callStart,
        callEnd: parsed.data?.callEnd,
      };
    } catch {
      return { callStart: undefined, callEnd: undefined };
    }
  }

  private async getRooms(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const db = this.dbService.getDb();
      const allRooms = await db.select().from(rooms).orderBy(desc(rooms.createdAt));

      const roomsWithCounts = await Promise.all(
        allRooms.map(async (room) => {
          const userCount = await this.dbService.roomRepository.getUserCountInRoom(room.id);
          return {
            id: room.id,
            name: room.name,
            description: room.description,
            type: room.type,
            createdAt: room.createdAt,
            userCount,
          };
        })
      );

      res.json({ rooms: roomsWithCounts });
    } catch (error) {
      next(error);
    }
  }

  private async getRoomUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { roomId } = roomIdParamSchema.parse(req.params);
      const room = await this.dbService.roomRepository.getById(roomId);

      if (!room) {
        throw new CustomError(404, "Room not found");
      }

      const roomUsers = await this.dbService.userRepository.getUsersInRoom(roomId);

      const users = await Promise.all(
        roomUsers.map(async (user) => {
          const metadata = await this.readProcessedMetadata(user.id);
          const hasProcessedStats = metadata !== null;

          return {
            id: user.id,
            name: user.name,
            joinedCall: user.joinedCall,
            connected: user.connected,
            hasProcessedStats,
            callStart: metadata?.callStart ?? null,
            callEnd: metadata?.callEnd ?? null,
          };
        })
      );

      res.json({
        room: {
          id: room.id,
          name: room.name,
        },
        users,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(new CustomError(400, "Invalid room ID format"));
        return;
      }
      next(error);
    }
  }

  private async getUserProcessed(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = userIdParamSchema.parse(req.params);
      const user = await this.dbService.userRepository.getUserById(userId);

      if (!user) {
        throw new CustomError(404, "User not found");
      }

      const filePath = this.processedFilePath(userId);
      if (!(await this.fileExists(filePath))) {
        throw new CustomError(404, "Processed stats not found for user");
      }

      const content = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(content) as { data?: unknown };

      if (!parsed.data) {
        throw new CustomError(500, "Invalid processed stats file format");
      }

      res.json({
        userId,
        data: parsed.data,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(new CustomError(400, "Invalid user ID format"));
        return;
      }
      next(error);
    }
  }

  public getRouter(): express.Router {
    return this.router;
  }
}
