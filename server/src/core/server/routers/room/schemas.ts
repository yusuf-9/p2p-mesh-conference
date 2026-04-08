import z from "zod";

export const createRoomSchema = z.object({
  name: z.string().min(1, "Room name is required").max(255, "Room name must be less than 255 characters"),
  description: z.string().optional(),
  type: z.enum(["one_to_one", "group"]).optional(),
});

export const updateRoomSchema = z.object({
  name: z.string().min(1, "Room name is required").max(255, "Room name must be less than 255 characters").optional(),
  description: z.string().optional(),
});

export const joinRoomSchema = z.object({
  name: z.string().min(1, "User name is required").max(255, "User name must be less than 255 characters"),
});

export const roomIdParamSchema = z.object({
  roomId: z.string().uuid("Invalid room ID format"),
}); 