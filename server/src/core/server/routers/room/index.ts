import express, { Request, Response, NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import DatabaseService from "../../../database/index.js";
import { rooms, users, messages, apiKeys } from "../../../database/schema.js";
import AuthService from "../../../auth/index.js";
import CustomError from "../../../../utility-types/error.js";
import { ValidationErrorResponseType, ValidationErrorField } from "../../types/index.js";
import { createRoomSchema, updateRoomSchema, joinRoomSchema, roomIdParamSchema } from "./schemas.js";
import PubSubService from "../../../pubsub/index.js";
import { CHANNELS, EVENTS } from "../../../ws/constants.js";
import { PubSubRoomBroadcast } from "../../../ws/types.js";

export default class RoomRouter {
  private router: express.Router;
  private dbService: DatabaseService;
  private authService: AuthService;
  private pubSubService: PubSubService;

  constructor(dbService: DatabaseService, authService: AuthService, pubSubService: PubSubService) {
    this.router = express.Router();
    this.dbService = dbService;
    this.authService = authService;
    this.pubSubService = pubSubService;
    this.applyMiddleware();
    this.setupRoutes();
  }

  private applyMiddleware(): void {
    // Apply API key validation to all routes
    this.router.use(this.validateApiKeyMiddleware.bind(this));
  }

  private setupRoutes(): void {
    // POST /room/create - Create a new room (requires API key)
    this.router.post("/create", this.createRoom.bind(this));

    // PUT /room/:roomId/update - Update room (requires API key + room ownership + user token + host check)
    this.router.put(
      "/:roomId",
      this.validateRoomOwnershipMiddleware.bind(this),
      this.validateUserMiddleware.bind(this),
      this.validateHostMiddleware.bind(this),
      this.updateRoom.bind(this)
    );

    // DELETE /room/:roomId/delete - Delete room (requires API key + room ownership + user token + host check)
    this.router.delete(
      "/:roomId",
      this.validateRoomOwnershipMiddleware.bind(this),
      this.validateUserMiddleware.bind(this),
      this.validateHostMiddleware.bind(this),
      this.deleteRoom.bind(this)
    );

    // POST /room/:roomId/join - Join room (requires API key + room ownership)
    this.router.post("/:roomId/join", this.validateRoomOwnershipMiddleware.bind(this), this.joinRoom.bind(this));

    // POST /room/leave - Leave room (requires API key + user token)
    this.router.post(
      "/:roomId/leave",
      this.validateRoomOwnershipMiddleware.bind(this),
      this.validateUserMiddleware.bind(this),
      this.leaveRoom.bind(this)
    );

    // GET /room/:roomId - Get room data (requires API key + room ownership)
    this.router.get("/:roomId", this.validateRoomOwnershipMiddleware.bind(this), this.getRoomData.bind(this));
  }

  private createValidationError(zodError: z.ZodError): ValidationErrorResponseType {
    const fields: ValidationErrorField[] = zodError.issues.map(issue => ({
      field: issue.path.join(".") || "root",
      message: issue.message,
      code: issue.code,
    }));

    return {
      error: "Validation failed",
      details: {
        type: "validation",
        fields,
      },
    };
  }

  private async validateApiKeyMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const apiKeyId = await this.authService.validateApiKey(req);
      req.apiKeyId = apiKeyId;
      next();
    } catch (error) {
      next(error);
    }
  }

  private async validateUserMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = this.authService.validateUserAccess(req);
      req.userId = token.userId;
      next();
    } catch (error) {
      next(error);
    }
  }

  private async validateRoomOwnershipMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate params with zod
      const validatedParams = roomIdParamSchema.parse(req.params);
      const { roomId } = validatedParams;
      const apiKeyId = req.apiKeyId!;

      // Check if room exists and belongs to the API key
      const room = await this.dbService.roomRepository.getById(roomId);

      if (!room) {
        throw new CustomError(404, "Room not found");
      }

      if (room.apiKeyId !== apiKeyId) {
        throw new CustomError(403, "Room does not belong to your API key");
      }

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = this.createValidationError(error);
        res.status(400).json(validationError);
        return;
      }
      next(error);
    }
  }

  private async validateHostMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate params with zod
      const validatedParams = roomIdParamSchema.parse(req.params);
      const { roomId } = validatedParams;
      const userId = req.userId!;

      // Check if room exists and user is the host
      const room = await this.dbService.roomRepository.getById(roomId);

      if (!room) {
        throw new CustomError(404, "Room not found");
      }

      if (room.hostId !== userId) {
        throw new CustomError(403, "Only the room host can perform this action");
      }

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = this.createValidationError(error);
        res.status(400).json(validationError);
        return;
      }
      next(error);
    }
  }

  /**
   * @swagger
   * /api/room/create:
   *   post:
   *     summary: Create a new room
   *     description: Creates a new video conferencing room. Requires a valid API key.
   *     tags: [Rooms]
   *     security:
   *       - ApiKey: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *                 minLength: 1
   *                 maxLength: 255
   *                 description: Room name
   *                 example: Weekly Team Meeting
   *               description:
   *                 type: string
   *                 description: Optional room description
   *                 example: Our weekly standup meeting room
   *               type:
   *                 type: string
   *                 enum: [one_to_one, group]
   *                 description: Room type (defaults to group)
   *                 example: group
   *             required:
   *               - name
   *     responses:
   *       201:
   *         description: Room created successfully
   *         content:
   *           application/json:
   *             schema:
   *               allOf:
   *                 - $ref: '#/components/schemas/SuccessResponse'
   *                 - type: object
   *                   properties:
   *                     data:
   *                       $ref: '#/components/schemas/Room'
   *       400:
   *         description: Validation error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ValidationError'
   *       401:
   *         description: API key authentication required
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  private async createRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate input with zod
      const validatedData = createRoomSchema.parse(req.body);
      const { name, description, type } = validatedData;
      const apiKeyId = req.apiKeyId!; // We know this exists due to middleware

      // Create new room using repository
      const newRoom = await this.dbService.roomRepository.create(apiKeyId, name, description || null, type);

      res.status(201).json({
        message: "Room created successfully",
        data: newRoom,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = this.createValidationError(error);
        res.status(400).json(validationError);
        return;
      }
      next(error);
    }
  }

  /**
   * @swagger
   * /api/room/{roomId}:
   *   put:
   *     summary: Update room details
   *     description: Updates room name and/or description. Requires API key, room ownership verification, user token, and host privileges.
   *     tags: [Rooms]
   *     security:
   *       - ApiKey: []
   *       - UserToken: []
   *     parameters:
   *       - in: path
   *         name: roomId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Room ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *                 minLength: 1
   *                 maxLength: 255
   *                 description: New room name
   *                 example: Updated Team Meeting
   *               description:
   *                 type: string
   *                 description: New room description
   *                 example: Updated room description
   *     responses:
   *       200:
   *         description: Room updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               allOf:
   *                 - $ref: '#/components/schemas/SuccessResponse'
   *                 - type: object
   *                   properties:
   *                     data:
   *                       $ref: '#/components/schemas/Room'
   *       400:
   *         description: Validation error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ValidationError'
   *       401:
   *         description: Authentication required (API key or user token)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       403:
   *         description: Access denied (room ownership or host privileges required)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Room not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  private async updateRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate params with zod
      const validatedParams = roomIdParamSchema.parse(req.params);
      // Validate input with zod
      const validatedData = updateRoomSchema.parse(req.body);
      const { roomId } = validatedParams;

      // Build update object dynamically
      const updateData: any = {};

      if (validatedData.name !== undefined) {
        updateData.name = validatedData.name;
      }

      if (validatedData.description !== undefined) {
        updateData.description = validatedData.description;
      }

      // Update room using repository
      const updatedRoom = await this.dbService.roomRepository.update(roomId, updateData);

      res.status(200).json({
        message: "Room updated successfully",
        data: updatedRoom,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = this.createValidationError(error);
        res.status(400).json(validationError);
        return;
      }
      next(error);
    }
  }

  /**
   * @swagger
   * /api/room/{roomId}:
   *   delete:
   *     summary: Delete room
   *     description: Permanently deletes a room and all associated data. Requires API key, room ownership verification, user token, and host privileges.
   *     tags: [Rooms]
   *     security:
   *       - ApiKey: []
   *       - UserToken: []
   *     parameters:
   *       - in: path
   *         name: roomId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Room ID
   *     responses:
   *       200:
   *         description: Room deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *       400:
   *         description: Invalid room ID format
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ValidationError'
   *       401:
   *         description: Authentication required (API key or user token)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       403:
   *         description: Access denied (room ownership or host privileges required)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Room not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  private async deleteRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate params with zod
      const validatedParams = roomIdParamSchema.parse(req.params);
      const { roomId } = validatedParams;
      const db = this.dbService.getDb();

      // Delete room (cascade will handle related records)
      await db.delete(rooms).where(eq(rooms.id, roomId));

      res.status(200).json({
        message: "Room deleted successfully",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = this.createValidationError(error);
        res.status(400).json(validationError);
        return;
      }
      next(error);
    }
  }

  /**
   * @swagger
   * /api/room/{roomId}:
   *   get:
   *     summary: Get room data
   *     description: Retrieves comprehensive room information including room details, users, and messages. Requires API key and room ownership verification.
   *     tags: [Rooms]
   *     security:
   *       - ApiKey: []
   *     parameters:
   *       - in: path
   *         name: roomId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Room ID
   *     responses:
   *       200:
   *         description: Room data retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               allOf:
   *                 - $ref: '#/components/schemas/SuccessResponse'
   *                 - type: object
   *                   properties:
   *                     data:
   *                       type: object
   *                       properties:
   *                         room:
   *                           $ref: '#/components/schemas/Room'
   *                         users:
   *                           type: array
   *                           items:
   *                             $ref: '#/components/schemas/User'
   *                         messages:
   *                           type: array
   *                           items:
   *                             $ref: '#/components/schemas/Message'
   *       400:
   *         description: Invalid room ID format
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ValidationError'
   *       401:
   *         description: API key authentication required
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       403:
   *         description: Room does not belong to your API key
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Room not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  private async getRoomData(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate params with zod
      const validatedParams = roomIdParamSchema.parse(req.params);
      const { roomId } = validatedParams;
      // Get room data using repository
      const room = await this.dbService.roomRepository.getById(roomId);

      if (!room) {
        throw new CustomError(404, "Room not found");
      }

      // Get users in room using repository
      const roomUsers = await this.dbService.userRepository.getUsersInRoom(roomId);

      // Get messages in room (keeping direct DB query for now since messages repository wasn't requested)
      const db = this.dbService.getDb();
      const roomMessages = await db.select().from(messages).where(eq(messages.roomId, roomId));

      const { apiKeyId, ...roomData } = room;

      res.status(200).json({
        message: "Room data retrieved successfully",
        data: {
          room: roomData,
          users: roomUsers,
          messages: roomMessages,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = this.createValidationError(error);
        res.status(400).json(validationError);
        return;
      }
      next(error);
    }
  }

  /**
   * @swagger
   * /api/room/{roomId}/join:
   *   post:
   *     summary: Join a room
   *     description: Allows a user to join a room with a specified name. Returns user information and a user-level JWT token for subsequent operations. If the room has no host, the first user becomes the host.
   *     tags: [Rooms]
   *     security:
   *       - ApiKey: []
   *     parameters:
   *       - in: path
   *         name: roomId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Room ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *                 minLength: 1
   *                 maxLength: 255
   *                 description: User display name in the room
   *                 example: John Doe
   *             required:
   *               - name
   *     responses:
   *       201:
   *         description: Successfully joined room
   *         content:
   *           application/json:
   *             schema:
   *               allOf:
   *                 - $ref: '#/components/schemas/SuccessResponse'
   *                 - type: object
   *                   properties:
   *                     data:
   *                       type: object
   *                       properties:
   *                         user:
   *                           $ref: '#/components/schemas/User'
   *                         token:
   *                           type: string
   *                           description: JWT token for user-level operations and WebSocket connection
   *                           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   *                         isHost:
   *                           type: boolean
   *                           description: Whether the user is the room host
   *       400:
   *         description: Validation error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ValidationError'
   *       401:
   *         description: API key authentication required
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       403:
   *         description: Room does not belong to your API key
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Room not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       409:
   *         description: A user with this name already exists in the room
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  private async joinRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate params with zod
      const validatedParams = roomIdParamSchema.parse(req.params);
      // Validate input with zod
      const validatedData = joinRoomSchema.parse(req.body);
      const { roomId } = validatedParams;
      const { name } = validatedData;

      const db = this.dbService.getDb();

      // Get room details to check if it has a host
      const room = await db.select().from(rooms).where(eq(rooms.id, roomId));

      if (!room[0]) {
        throw new CustomError(404, "Room not found");
      }

      // Check room type and user limits
      if (room[0].type === "one_to_one") {
        const userCount = await this.dbService.roomRepository.getUserCountInRoom(roomId);
        if (userCount >= 2) {
          throw new CustomError(409, "This one-to-one room is already full (maximum 2 users)");
        }
      }

      // Create new user (audioEnabled and videoEnabled default to false in schema)
      const newUser = await db
        .insert(users)
        .values({
          roomId: roomId,
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

      // If this is the first user and room has no host, make them the host
      if (!room[0].hostId) {
        await db
          .update(rooms)
          .set({
            hostId: newUser[0].id,
          })
          .where(eq(rooms.id, roomId));
      }

      // Generate user JWT token
      const userToken = this.authService.createToken({
        userId: newUser[0].id,
        type: "user",
      });

      this.pubSubService.publishJSON(CHANNELS.ROOM_BROADCASTS_CHANNEL, {
        message: {
          type: EVENTS.USER_JOINED,
          data: {
            id: newUser[0].id,
            name: newUser[0].name,
            roomId: newUser[0].roomId,
            connected: newUser[0].connected,
            joinedCall: newUser[0].joinedCall,
          },
        },
        roomId,
        excludeId: newUser[0].id,
        onlyUsersInCall: false,
      } as PubSubRoomBroadcast);

      res.status(201).json({
        message: "Successfully joined room",
        data: {
          user: newUser[0],
          token: userToken,
          isHost: !room[0].hostId, // User is host if room had no previous host
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = this.createValidationError(error);
        res.status(400).json(validationError);
        return;
      }
      next(error);
    }
  }

  /**
   * @swagger
   * /api/room/{roomId}/leave:
   *   post:
   *     summary: Leave a room
   *     description: Removes the authenticated user from the specified room. If the user is the host, host privileges are transferred to another connected user or set to null if no users remain.
   *     tags: [Rooms]
   *     security:
   *       - ApiKey: []
   *       - UserToken: []
   *     parameters:
   *       - in: path
   *         name: roomId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Room ID
   *     responses:
   *       200:
   *         description: Successfully left room
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *       400:
   *         description: Invalid room ID format
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ValidationError'
   *       401:
   *         description: Authentication required (API key or user token)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       403:
   *         description: Room does not belong to your API key
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Room not found or user not found in specified room
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  private async leaveRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate params with zod
      const validatedParams = roomIdParamSchema.parse(req.params);
      const { roomId } = validatedParams;
      const userId = req.userId!;
      const db = this.dbService.getDb();

      // Get user info and verify they are in the specified room
      const user = await db
        .select()
        .from(users)
        .where(and(eq(users.id, userId), eq(users.roomId, roomId)));

      if (user.length === 0) {
        throw new CustomError(404, "User not found in specified room");
      }

      // Get room info to check if user is host
      const room = await db.select().from(rooms).where(eq(rooms.id, roomId));

      if (room.length === 0) {
        throw new CustomError(404, "Room not found");
      }

      const isHost = room[0].hostId === userId;

      // Remove user from room
      await db.delete(users).where(eq(users.id, userId));

      // If user was host, handle host reassignment
      if (isHost) {
        // Find another user in the room to make the new host
        const remainingUsers = await db
          .select()
          .from(users)
          .where(and(eq(users.roomId, roomId), eq(users.connected, true)))
          .limit(1);

        // Update room with new host or null if no users remain
        await db
          .update(rooms)
          .set({
            hostId: remainingUsers.length > 0 ? remainingUsers[0].id : null,
          })
          .where(eq(rooms.id, roomId));
      }

      this.pubSubService.publishJSON(CHANNELS.ROOM_BROADCASTS_CHANNEL, {
        message: {
          type: EVENTS.USER_LEFT,
          data: userId,
        },
        roomId,
        excludeId: userId,
      } as PubSubRoomBroadcast);

      res.status(200).json({
        message: "Successfully left room",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = this.createValidationError(error);
        res.status(400).json(validationError);
        return;
      }
      next(error);
    }
  }

  public getRouter(): express.Router {
    return this.router;
  }
}
