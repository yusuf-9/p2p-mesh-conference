import { pgTable, uuid, varchar, text, timestamp, boolean, pgEnum, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enums
export const mediaHandleTypeEnum = pgEnum("media_handle_type", ["publisher", "subscriber", "manager"]);
export const feedTypeEnum = pgEnum("feed_type", ["camera", "screenshare"]);
export const roomTypeEnum = pgEnum("room_type", ["one_to_one", "group"]);
export const transactionTypeEnum = pgEnum("transaction_type", [
  "join_as_publisher",
  "subscribe_to_feed", 
  "send_offer_for_publishing",
  "send_answer_for_subscribing",
  "send_ice_candidates",
  "send_ice_candidate_completed",
  "toggle_media_stream",
  "unpublish_feed",
  "leave_conference",
  "get_publisher_list",
  "configure_feed",
  "configure_feed_subscription",
]);

// Tables
export const admins = pgTable("admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(), // bcrypt hashed
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminId: uuid("admin_id")
    .references(() => admins.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  value: varchar("value", { length: 255 }).notNull().unique(),
  isActive: boolean("is_active").default(true).notNull(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

// We define rooms first without the hostId to avoid circular dependency
export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  apiKeyId: uuid("api_key_id")
    .references(() => apiKeys.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: roomTypeEnum("type").default("group").notNull(),
  hostId: uuid("host_id"), // Will be updated after first user joins
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id")
    .references(() => rooms.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  connected: boolean("connected").default(false).notNull(),
  joinedCall: boolean("joined_call").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

// Now we can safely reference the users table
export const roomHostRelation = pgTable("room_host_relation", {
  roomId: uuid("room_id")
    .references(() => rooms.id, { onDelete: "cascade" })
    .notNull(),
  hostId: uuid("host_id").references(() => users.id, { onDelete: "set null" }),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id")
    .references(() => rooms.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const mediaSessions = pgTable("media_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id")
    .references(() => rooms.id, { onDelete: "cascade" })
    .notNull()
    .unique(), // Make roomId unique to ensure one session per room
  sessionId: varchar("session_id", { length: 255 }).unique().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mediaRooms = pgTable("media_rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .references(() => mediaSessions.id, { onDelete: "cascade" })
    .notNull()
    .unique(), // Make sessionId unique to ensure one media room per session
  sfuRoomId: integer("janus_room_id").unique().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mediaHandles = pgTable("media_handles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").references(() => mediaSessions.id, { onDelete: "cascade" }),
  mediaRoomId: uuid("media_room_id").references(() => mediaRooms.id, { onDelete: "cascade" }),
  handleId: varchar("handle_id", { length: 255 }).unique().notNull(),
  feedId: integer("feed_id"),
  type: mediaHandleTypeEnum("type").notNull(),
  feedType: feedTypeEnum("feed_type").default("camera"),
  audioEnabled: boolean("audio_enabled").default(false).notNull(),
  videoEnabled: boolean("video_enabled").default(false).notNull(),
  handRaised: boolean("hand_raised").default(false).notNull(),
  simulcastEnabled: boolean("simulcast_enabled").default(false).notNull(),
  simulcastResolutions: text("simulcast_resolutions"), // JSON array of resolutions ["h","m","l"] for publishers
  subscribedResolution: varchar("subscribed_resolution", { length: 1 }), // "h"|"m"|"l" for subscribers
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const pendingTransactions = pgTable("pending_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "set null" })
    .notNull(),
  type: transactionTypeEnum("type").notNull(),
  transactionId: varchar("transaction_id", { length: 255 }).unique().notNull(),
  feedId: integer("feed_id"), // Optional feed ID for multi-device support
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const adminRelations = relations(admins, ({ many }) => ({
  apiKeys: many(apiKeys),
}));

export const apiKeyRelations = relations(apiKeys, ({ one, many }) => ({
  admin: one(admins, {
    fields: [apiKeys.adminId],
    references: [admins.id],
  }),
  rooms: many(rooms),
}));

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  apiKey: one(apiKeys, {
    fields: [rooms.apiKeyId],
    references: [apiKeys.id],
  }),
  users: many(users),
  messages: many(messages),
  mediaSession: one(mediaSessions, {
    fields: [rooms.id],
    references: [mediaSessions.roomId],
  }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  room: one(rooms, {
    fields: [users.roomId],
    references: [rooms.id],
  }),
  messages: many(messages),
  mediaHandles: many(mediaHandles),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  room: one(rooms, {
    fields: [messages.roomId],
    references: [rooms.id],
  }),
  user: one(users, {
    fields: [messages.userId],
    references: [users.id],
  }),
}));

export const mediaRoomsRelations = relations(mediaRooms, ({ one, many }) => ({
  mediaSession: one(mediaSessions, {
    fields: [mediaRooms.sessionId],
    references: [mediaSessions.id],
  }),
  mediaHandles: many(mediaHandles),
}));

export const mediaSessionsRelations = relations(mediaSessions, ({ one, many }) => ({
  room: one(rooms, {
    fields: [mediaSessions.roomId],
    references: [rooms.id],
  }),
  mediaRoom: one(mediaRooms, {
    fields: [mediaSessions.id],
    references: [mediaRooms.sessionId],
  }),
}));

export const mediaHandlesRelations = relations(mediaHandles, ({ one }) => ({
  mediaRoom: one(mediaRooms, {
    fields: [mediaHandles.mediaRoomId],
    references: [mediaRooms.id],
  }),
  session: one(mediaSessions, {
    fields: [mediaHandles.sessionId],
    references: [mediaSessions.id],
  }),
  user: one(users, {
    fields: [mediaHandles.userId],
    references: [users.id],
  }),
}));
