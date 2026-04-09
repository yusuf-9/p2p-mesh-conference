import { 
  admins, 
  apiKeys, 
  rooms, 
  users, 
  messages,
  mediaHandles
} from './schema.js';

// Infer types from schema
export type Admin = typeof admins.$inferSelect;
export type NewAdmin = typeof admins.$inferInsert;

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type MediaHandle = typeof mediaHandles.$inferSelect;
export type NewMediaHandle = typeof mediaHandles.$inferInsert;

// P2P Mesh types
export type MediaHandleType = 'p2p_mesh';
export type FeedType = 'camera' | 'screenshare';

// P2P Mesh participant info
export interface P2PMeshParticipant {
  id: string;
  userId: string;
  roomId: string;
  handleId: string;
  type: MediaHandleType;
  feedType: FeedType;
  audioEnabled: boolean;
  videoEnabled: boolean;
  handRaised: boolean;
  createdAt: string;
}

// Common response types
export interface DatabaseResponse<T> {
  data?: T;
  error?: string;
}