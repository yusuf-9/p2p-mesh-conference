import { z } from "zod";
import { EVENTS } from "./constants.js";

// Database entity schemas 
export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  roomId: z.string(),
  connected: z.boolean(),
  joinedCall: z.boolean(),
});

export const MessageSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  userId: z.string(),
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// P2P Mesh Participant (from media handles)
export const P2PMeshParticipantSchema = z.object({
  id: z.string(),
  userId: z.string(),
  roomId: z.string(),
  handleId: z.string(),
  type: z.literal("p2p_mesh"),
  feedType: z.enum(["camera", "screenshare"]),
  audioEnabled: z.boolean(),
  videoEnabled: z.boolean(),
  handRaised: z.boolean(),
  createdAt: z.string(),
});

// WebRTC Schemas
export const RTCSessionDescriptionSchema = z.object({
  type: z.enum(["offer", "answer", "pranswer", "rollback"]),
  sdp: z.string(),
});

export const RTCIceCandidateSchema = z.object({
  candidate: z.string(),
  sdpMLineIndex: z.number().nullable(),
  sdpMid: z.string().nullable(),
  usernameFragment: z.string().optional(),
});

// Stream metadata
export const StreamMetadataSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: z.enum(["video-call", "screen-share"]),
});

// ============================================================================
// Client-to-Server Message Schemas (P2P Relay Pattern)
// ============================================================================

export const ClientToServerMessageSchemas = {
  // Basic Communication
  PING: z.object({
    type: z.literal(EVENTS.PING),
  }),

  SEND_MESSAGE: z.object({
    type: z.literal(EVENTS.SEND_MESSAGE),
    data: z.object({
      roomId: z.string(),
      content: z.string().min(1, "Message cannot be empty").max(1000, "Message too long"),
    }),
  }),

  DISCONNECT: z.object({
    type: z.literal(EVENTS.DISCONNECT),
  }),

  // Room Management
  JOIN_ROOM: z.object({
    type: z.literal(EVENTS.JOIN_ROOM),
    data: z.object({
      roomId: z.string(),
      userId: z.string(),
    }),
  }),

  LEAVE_ROOM: z.object({
    type: z.literal(EVENTS.LEAVE_ROOM),
    data: z.object({
      roomId: z.string(),
    }),
  }),

  // Call Management
  JOIN_CALL: z.object({
    type: z.literal(EVENTS.JOIN_CALL),
    data: z.object({
      roomId: z.string(),
      streamId: z.string(),
      audio: z.boolean(),
      video: z.boolean(),
    }),
  }),

  LEAVE_CALL: z.object({
    type: z.literal(EVENTS.LEAVE_CALL),
    data: z.object({
      roomId: z.string(),
    }),
  }),

  // WebRTC Signaling for Video Calls (P2P Relay)
  SEND_WEBRTC_OFFER_FOR_VIDEO_CALL: z.object({
    type: z.literal(EVENTS.SEND_WEBRTC_OFFER_FOR_VIDEO_CALL),
    data: z.object({
      to: z.string(), // Target user ID
      roomId: z.string(),
      offer: RTCSessionDescriptionSchema,
    }),
  }),

  SEND_WEBRTC_ANSWER_FOR_VIDEO_CALL: z.object({
    type: z.literal(EVENTS.SEND_WEBRTC_ANSWER_FOR_VIDEO_CALL),
    data: z.object({
      to: z.string(), // Target user ID
      roomId: z.string(),
      answer: RTCSessionDescriptionSchema,
    }),
  }),

  SEND_WEBRTC_ICE_CANDIDATE_FOR_VIDEO_CALL: z.object({
    type: z.literal(EVENTS.SEND_WEBRTC_ICE_CANDIDATE_FOR_VIDEO_CALL),
    data: z.object({
      to: z.string(), // Target user ID
      roomId: z.string(),
      candidate: RTCIceCandidateSchema,
    }),
  }),

  // Screen Sharing
  START_SCREEN_SHARE: z.object({
    type: z.literal(EVENTS.START_SCREEN_SHARE),
    data: z.object({
      roomId: z.string(),
      streamId: z.string(),
      audio: z.boolean(),
      video: z.boolean(),
    }),
  }),

  STOP_SCREEN_SHARE: z.object({
    type: z.literal(EVENTS.STOP_SCREEN_SHARE),
    data: z.object({
      roomId: z.string(),
      streamId: z.string(),
    }),
  }),

  // WebRTC Signaling for Screen Sharing
  SEND_WEBRTC_OFFER_FOR_SCREEN_SHARE: z.object({
    type: z.literal(EVENTS.SEND_WEBRTC_OFFER_FOR_SCREEN_SHARE),
    data: z.object({
      to: z.string(),
      roomId: z.string(), 
      offer: RTCSessionDescriptionSchema,
    }),
  }),

  SEND_WEBRTC_ANSWER_FOR_SCREEN_SHARE: z.object({
    type: z.literal(EVENTS.SEND_WEBRTC_ANSWER_FOR_SCREEN_SHARE),
    data: z.object({
      to: z.string(),
      roomId: z.string(),
      answer: RTCSessionDescriptionSchema,
    }),
  }),

  SEND_WEBRTC_ICE_CANDIDATE_FOR_SCREEN_SHARE: z.object({
    type: z.literal(EVENTS.SEND_WEBRTC_ICE_CANDIDATE_FOR_SCREEN_SHARE),
    data: z.object({
      to: z.string(),
      roomId: z.string(),
      candidate: RTCIceCandidateSchema,
    }),
  }),

  // Media Stream Controls
  TOGGLE_STREAM: z.object({
    type: z.literal(EVENTS.TOGGLE_STREAM),
    data: z.object({
      roomId: z.string(),
      streamId: z.string(),
      audio: z.boolean(),
      video: z.boolean(),
    }),
  }),

  // Interactions
  SEND_REACTION: z.object({
    type: z.literal(EVENTS.SEND_REACTION),
    data: z.object({
      roomId: z.string(),
      reaction: z.string(),
    }),
  }),

  RAISE_HAND: z.object({
    type: z.literal(EVENTS.RAISE_HAND),
    data: z.object({
      roomId: z.string(),
    }),
  }),

  LOWER_HAND: z.object({
    type: z.literal(EVENTS.LOWER_HAND),
    data: z.object({
      roomId: z.string(),
    }),
  }),

  SEND_SCREENSHOT_NOTIFICATION: z.object({
    type: z.literal(EVENTS.SEND_SCREENSHOT_NOTIFICATION),
    data: z.object({
      roomId: z.string(),
    }),
  }),
} as const;

// ============================================================================
// Server-to-Client Message Schemas
// ============================================================================

export const ServerToClientMessageSchemas = {
  // Basic Communication
  CONNECTED: z.object({
    type: z.literal(EVENTS.CONNECTED),
    data: UserSchema,
  }),

  MESSAGE_SENT: z.object({
    type: z.literal(EVENTS.MESSAGE_SENT),
    data: MessageSchema,
  }),

  ERROR: z.object({
    type: z.literal(EVENTS.ERROR),
    data: z.object({
      message: z.string(),
      details: z.any().optional(),
    }),
  }),

  PONG: z.object({
    type: z.literal(EVENTS.PONG),
    data: z.object({
      timestamp: z.number(),
    }),
  }),

  // Room Events
  JOINED_ROOM: z.object({
    type: z.literal(EVENTS.JOINED_ROOM),
    data: z.object({
      room: z.any(), // Room data
      user: UserSchema,
      participants: z.array(UserSchema),
    }),
  }),

  USER_CONNECTED: z.object({
    type: z.literal(EVENTS.USER_CONNECTED),
    data: z.object({
      userId: z.string(),
    }),
  }),

  USER_JOINED: z.object({
    type: z.literal(EVENTS.USER_JOINED),
    data: UserSchema,
  }),

  USER_LEFT: z.object({
    type: z.literal(EVENTS.USER_LEFT),
    data: z.object({
      userId: z.string(),
    }),
  }),

  USER_DISCONNECTED: z.object({
    type: z.literal(EVENTS.USER_DISCONNECTED),
    data: z.object({
      userId: z.string(),
    }),
  }),

  // Messages
  RECEIVE_MESSAGE: z.object({
    type: z.literal(EVENTS.RECEIVE_MESSAGE),
    data: MessageSchema,
  }),

  // Call Events  
  JOINED_CALL: z.object({
    type: z.literal(EVENTS.JOINED_CALL),
    data: z.object({
      mediaHandles: z.array(P2PMeshParticipantSchema),
    }),
  }),

  USER_JOINED_CALL: z.object({
    type: z.literal(EVENTS.USER_JOINED_CALL),
    data: z.object({
      userId: z.string(),
      mediaHandles: z.array(P2PMeshParticipantSchema),
    }),
  }),

  USER_LEFT_CALL: z.object({
    type: z.literal(EVENTS.USER_LEFT_CALL),
    data: z.object({
      userId: z.string(),
    }),
  }),

  // WebRTC Relay Events
  RECEIVE_WEBRTC_OFFER_FOR_VIDEO_CALL: z.object({
    type: z.literal(EVENTS.RECEIVE_WEBRTC_OFFER_FOR_VIDEO_CALL),
    data: z.object({
      from: z.string(), // Sender user ID
      offer: RTCSessionDescriptionSchema,
    }),
  }),

  RECEIVE_WEBRTC_ANSWER_FOR_VIDEO_CALL: z.object({
    type: z.literal(EVENTS.RECEIVE_WEBRTC_ANSWER_FOR_VIDEO_CALL),
    data: z.object({
      from: z.string(),
      answer: RTCSessionDescriptionSchema,
    }),
  }),

  RECEIVE_WEBRTC_ICE_CANDIDATE_FOR_VIDEO_CALL: z.object({
    type: z.literal(EVENTS.RECEIVE_WEBRTC_ICE_CANDIDATE_FOR_VIDEO_CALL),
    data: z.object({
      from: z.string(),
      candidate: RTCIceCandidateSchema,
    }),
  }),

  // Screen Sharing Events
  USER_STARTED_SCREEN_SHARE: z.object({
    type: z.literal(EVENTS.USER_STARTED_SCREEN_SHARE),
    data: z.object({
      userId: z.string(),
      mediaHandle: P2PMeshParticipantSchema,
    }),
  }),

  USER_STOPPED_SCREEN_SHARE: z.object({
    type: z.literal(EVENTS.USER_STOPPED_SCREEN_SHARE),
    data: z.object({
      userId: z.string(),
      streamId: z.string(),
    }),
  }),

  // Screen Share WebRTC Relay Events
  RECEIVE_WEBRTC_OFFER_FOR_SCREEN_SHARE: z.object({
    type: z.literal(EVENTS.RECEIVE_WEBRTC_OFFER_FOR_SCREEN_SHARE),
    data: z.object({
      from: z.string(),
      offer: RTCSessionDescriptionSchema,
    }),
  }),

  RECEIVE_WEBRTC_ANSWER_FOR_SCREEN_SHARE: z.object({
    type: z.literal(EVENTS.RECEIVE_WEBRTC_ANSWER_FOR_SCREEN_SHARE),
    data: z.object({
      from: z.string(),
      answer: RTCSessionDescriptionSchema,
    }),
  }),

  RECEIVE_WEBRTC_ICE_CANDIDATE_FOR_SCREEN_SHARE: z.object({
    type: z.literal(EVENTS.RECEIVE_WEBRTC_ICE_CANDIDATE_FOR_SCREEN_SHARE),
    data: z.object({
      from: z.string(),
      candidate: RTCIceCandidateSchema,
    }),
  }),

  // Media Stream Control Events
  USER_TOGGLED_STREAM: z.object({
    type: z.literal(EVENTS.USER_TOGGLED_STREAM),
    data: P2PMeshParticipantSchema,
  }),

  // Interaction Events
  RECEIVE_REACTION: z.object({
    type: z.literal(EVENTS.RECEIVE_REACTION),
    data: z.object({
      userId: z.string(),
      reaction: z.string(),
      timestamp: z.number(),
    }),
  }),

  USER_RAISED_HAND: z.object({
    type: z.literal(EVENTS.USER_RAISED_HAND),
    data: z.object({
      userId: z.string(),
    }),
  }),

  USER_LOWERED_HAND: z.object({
    type: z.literal(EVENTS.USER_LOWERED_HAND),
    data: z.object({
      userId: z.string(),
    }),
  }),

  USER_TOOK_SCREENSHOT: z.object({
    type: z.literal(EVENTS.USER_TOOK_SCREENSHOT),
    data: z.object({
      userId: z.string(),
      timestamp: z.number(),
    }),
  }),
} as const;

// ============================================================================
// Type Definitions
// ============================================================================

export type ClientToServerMessage = z.infer<typeof ClientToServerMessageSchemas[keyof typeof ClientToServerMessageSchemas]>;
export type ServerToClientMessage = z.infer<typeof ServerToClientMessageSchemas[keyof typeof ServerToClientMessageSchemas]>;

// Union type for all client messages
export const ClientToServerMessages = z.union([
  ...Object.values(ClientToServerMessageSchemas)
] as const);

// Union type for all server messages  
export const ServerToClientMessages = z.union([
  ...Object.values(ServerToClientMessageSchemas)
] as const);

// Validation helper
export function validateClientMessage(data: unknown): ClientToServerMessage {
  return ClientToServerMessages.parse(data);
}

// PubSub message validation (for room broadcasts)
export const PubSubRoomBroadcastSchema = z.object({
  message: z.object({
    type: z.string(),
    data: z.unknown(),
  }),
  roomId: z.string(), 
  excludeId: z.string().optional(),
  onlyUsersInCall: z.boolean().optional(),
});

export function validatePubSubRoomBroadcast(data: unknown) {
  return PubSubRoomBroadcastSchema.parse(data);
}