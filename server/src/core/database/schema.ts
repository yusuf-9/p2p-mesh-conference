import { pgTable, uuid, varchar, text, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enums
export const roomTypeEnum = pgEnum("room_type", ["one_to_one", "group"]);
export const mediaHandleTypeEnum = pgEnum("media_handle_type", ["p2p_mesh"]);
export const feedTypeEnum = pgEnum("feed_type", ["camera", "screenshare"]);

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

export const mediaHandles = pgTable("media_handles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  roomId: uuid("room_id")
    .references(() => rooms.id, { onDelete: "cascade" })
    .notNull(),
  handleId: varchar("handle_id", { length: 255 }).unique().notNull(),
  type: mediaHandleTypeEnum("type").default("p2p_mesh").notNull(),
  feedType: feedTypeEnum("feed_type").default("camera").notNull(),
  audioEnabled: boolean("audio_enabled").default(true).notNull(),
  videoEnabled: boolean("video_enabled").default(true).notNull(),
  handRaised: boolean("hand_raised").default(false).notNull(),
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
  mediaHandles: many(mediaHandles),
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

export const mediaHandlesRelations = relations(mediaHandles, ({ one }) => ({
  user: one(users, {
    fields: [mediaHandles.userId],
    references: [users.id],
  }),
  room: one(rooms, {
    fields: [mediaHandles.roomId],
    references: [rooms.id],
  }),
}));
