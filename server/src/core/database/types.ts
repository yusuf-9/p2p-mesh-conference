import { 
  admins, 
  apiKeys, 
  rooms, 
  users, 
  messages, 
  mediaRooms, 
  mediaSessions, 
  mediaHandles,
  pendingTransactions
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

export type MediaRoom = typeof mediaRooms.$inferSelect;
export type NewMediaRoom = typeof mediaRooms.$inferInsert;

export type MediaSession = typeof mediaSessions.$inferSelect;
export type NewMediaSession = typeof mediaSessions.$inferInsert;

export type MediaHandle = typeof mediaHandles.$inferSelect;
export type NewMediaHandle = typeof mediaHandles.$inferInsert;

export type PendingTransaction = typeof pendingTransactions.$inferSelect;
export type NewPendingTransaction = typeof pendingTransactions.$inferInsert;

// Media handle types
export type MediaHandleType = 'publisher' | 'subscriber' | 'manager';
export type FeedType = 'camera' | 'screenshare';
export type TransactionType = 'join_as_publisher' | 'subscribe_to_feed' | 'send_offer_for_publishing' | 'send_answer_for_subscribing' | 'send_ice_candidates' | 'send_ice_candidate_completed' | 'toggle_media_stream' | 'leave_conference' | 'get_publisher_list' | 'configure_feed' | 'configure_feed_subscription';

// Simulcast types
export type SimulcastResolution = 'h' | 'm' | 'l';
export type SimulcastResolutions = SimulcastResolution[];

// Standardized Publisher Object
export interface StandardizedPublisher {
  id: number;
  feedType: "camera" | "screenshare";
  userId: string;
  audio: boolean;
  video: boolean;
  talking: boolean;
  publisher: boolean;
  handRaised: boolean;
  simulcastEnabled: boolean;
  simulcastResolutions: SimulcastResolutions | null;
}

// Common response types
export interface DatabaseResponse<T> {
  data?: T;
  error?: string;
}