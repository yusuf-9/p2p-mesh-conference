import { WebSocket } from "ws";
import { z } from "zod";
import { 
  ClientToServerMessageSchemas, 
  ServerToClientMessageSchemas,
  ClientToServerMessages,
  ServerToClientMessages,
  UserSchema,
  MessageSchema,
  P2PMeshParticipantSchema,
  StreamMetadataSchema,
  RTCSessionDescriptionSchema,
  RTCIceCandidateSchema,
  PubSubRoomBroadcastSchema
} from "./schema.js";

// ============================================================================
// Core Type Exports (from schema)
// ============================================================================

export type User = z.infer<typeof UserSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type P2PMeshParticipant = z.infer<typeof P2PMeshParticipantSchema>;
export type StreamMetadata = z.infer<typeof StreamMetadataSchema>;

// WebRTC Types
export type RTCSessionDescription = z.infer<typeof RTCSessionDescriptionSchema>;
export type RTCIceCandidate = z.infer<typeof RTCIceCandidateSchema>;

// Message Types
export type ClientToServerMessage = z.infer<typeof ClientToServerMessages>;
export type ServerToClientMessage = z.infer<typeof ServerToClientMessages>;

// PubSub Types
export type PubSubRoomBroadcast = z.infer<typeof PubSubRoomBroadcastSchema>;

// ============================================================================
// P2P Relay Specific Types
// ============================================================================

// P2P Relay payload for WebRTC signaling
export interface P2PRelayPayload {
  to: string;        // Target user ID
  from: string;      // Sender user ID  
  roomId: string;    // Room context
}

// Video Call WebRTC Relay Types
export interface VideoCallOfferPayload extends P2PRelayPayload {
  offer: RTCSessionDescription;
}

export interface VideoCallAnswerPayload extends P2PRelayPayload {
  answer: RTCSessionDescription;
}

export interface VideoCallIceCandidatePayload extends P2PRelayPayload {
  candidate: RTCIceCandidate;
}

// Screen Share WebRTC Relay Types  
export interface ScreenShareOfferPayload extends P2PRelayPayload {
  offer: RTCSessionDescription;
}

export interface ScreenShareAnswerPayload extends P2PRelayPayload {
  answer: RTCSessionDescription;
}

export interface ScreenShareIceCandidatePayload extends P2PRelayPayload {
  candidate: RTCIceCandidate;
}

// Media Control Types
export interface MediaToggleData {
  roomId: string;
  userId: string;
  enabled: boolean;
}

export interface AudioToggleData extends MediaToggleData {}
export interface VideoToggleData extends MediaToggleData {}

// Stream Management Types
export interface VideoCallJoinData {
  roomId: string;
  userId: string;
  streamId: string;
  audio: boolean;
  video: boolean;
}

export interface ScreenShareStartData {
  roomId: string;
  userId: string;
  streamId: string;
}

// Interaction Types
export interface ReactionData {
  roomId: string;
  userId: string;
  reaction: string;
  timestamp: number;
}

export interface HandRaiseData {
  roomId: string;
  userId: string;
  raised: boolean;
}

export interface ScreenshotNotificationData {
  roomId: string;
  userId: string;
  timestamp: number;
}

// ============================================================================
// WebSocket Extension Types
// ============================================================================

// Extended WebSocket with authentication and user context
export interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  roomId?: string;
  // Add connection metadata for P2P mesh tracking
  isInVideoCall?: boolean;
  currentStreams?: Set<string>; // Track active stream IDs
}

// ============================================================================
// Server State Management Types
// ============================================================================

// Room state for P2P mesh management
export interface RoomState {
  id: string;
  participants: Map<string, AuthenticatedWebSocket>; // userId -> WebSocket
  videoCallParticipants: Set<string>; // Users currently in video call
  activeStreams: Map<string, StreamMetadata>; // streamId -> metadata
  mediaHandles: Map<string, P2PMeshParticipant>; // userId -> media handle data
}

// Connection registry for P2P relay
export interface ConnectionRegistry {
  userConnections: Map<string, AuthenticatedWebSocket>; // userId -> WebSocket
  roomConnections: Map<string, Set<string>>; // roomId -> Set of userIds
  socketToUser: Map<WebSocket, string>; // WebSocket -> userId lookup
}

// ============================================================================
// Event Handler Types
// ============================================================================

// Generic event handler signature for P2P events
export type P2PEventHandler<T = any> = (
  ws: AuthenticatedWebSocket,
  data: T
) => Promise<void>;

// Relay event handler signature
export type RelayEventHandler<T extends P2PRelayPayload> = (
  ws: AuthenticatedWebSocket,
  payload: T
) => Promise<void>;

// Broadcast event handler signature  
export type BroadcastEventHandler<T = any> = (
  ws: AuthenticatedWebSocket,
  data: T,
  broadcastFn: (roomId: string, event: string, data: any, excludeUserId?: string) => Promise<void>
) => Promise<void>;

// ============================================================================
// Error Types
// ============================================================================

export interface P2PError extends Error {
  code: 'ROOM_NOT_FOUND' | 'USER_NOT_FOUND' | 'CONNECTION_ERROR' | 'VALIDATION_ERROR' | 'RELAY_ERROR';
  userId?: string;
  roomId?: string;
  details?: any;
}

// ============================================================================
// Legacy Compatibility (for gradual migration)
// ============================================================================

// Keep some legacy types for backward compatibility during migration
export type PubSubMessage = PubSubRoomBroadcast;

// Export schema types for external usage
export type { ClientToServerMessages, ServerToClientMessages };

// Additional type exports for server usage  
// (ServerToClientMessage already defined above)