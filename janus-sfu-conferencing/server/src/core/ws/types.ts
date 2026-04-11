import { WebSocket } from "ws";

// Re-export all types from schema (single source of truth)
export type {
  User,
  Message,
  RTCIceCandidateData,
  MediaStreamToggleData,
  ClientToServerMessage,
  ServerToClientMessage,
  ClientToServerMessages,
  ServerToClientMessages,
  PubSubMessage,
  PubSubRoomBroadcast,
} from "./schema.js";

// Extended WebSocket with authentication data
// This is the only type that's not schema-derived since it extends WebSocket
export interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  roomId?: string;
}
