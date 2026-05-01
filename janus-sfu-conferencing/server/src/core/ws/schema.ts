import { z } from "zod";
import { EVENTS } from "./constants.js";

// Database entity schemas (matching the actual database schema)
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

// RTCIceCandidate schema
export const RTCIceCandidateSchema = z.any();

// Standardized Publisher schema (matches StandardizedPublisher from database/types.ts)
export const StandardizedPublisherSchema = z.object({
  id: z.number(),
  feedType: z.enum(["camera", "screenshare"]),
  userId: z.string(),
  audio: z.boolean(),
  video: z.boolean(),
  talking: z.boolean(),
  publisher: z.boolean(),
  handRaised: z.boolean(),
  simulcastEnabled: z.boolean(),
  simulcastResolutions: z.array(z.enum(["h", "m", "l"])).nullable(),
});

// Client-to-Server message schemas
export const ClientToServerMessageSchemas = {
  PING: z.object({
    type: z.literal(EVENTS.PING),
  }),

  SEND_MESSAGE: z.object({
    type: z.literal(EVENTS.SEND_MESSAGE),
    data: z.string().min(1, "Message cannot be empty").max(1000, "Message too long"),
  }),

  DISCONNECT: z.object({
    type: z.literal(EVENTS.DISCONNECT),
  }),

  JOIN_CONFERENCE_AS_PUBLISHER: z.object({
    type: z.literal(EVENTS.JOIN_CONFERENCE_AS_PUBLISHER),
    data: z.object({
      feedType: z.enum(["camera", "screenshare"]).default("camera"),
      audio: z.boolean().default(true),
      video: z.boolean().default(true),
      simulcast: z.boolean().default(false).optional(),
      resolutions: z.array(z.enum(["h", "m", "l"])).optional(),
    }).optional(),
  }),

  SEND_OFFER_FOR_PUBLISHING: z.object({
    type: z.literal(EVENTS.SEND_OFFER_FOR_PUBLISHING),
    data: z.object({
      feedId: z.number(),
      jsep: z.any(),
    }),
  }),

  SEND_ICE_CANDIDATES: z.object({
    type: z.literal(EVENTS.SEND_ICE_CANDIDATES),
    data: z.object({
      type: z.enum(["publisher", "subscriber"]),
      feedId: z.number(),
      candidates: z.array(RTCIceCandidateSchema),
    }),
  }),

  SEND_ICE_CANDIDATE_COMPLETED: z.object({
    type: z.literal(EVENTS.SEND_ICE_CANDIDATE_COMPLETED),
    data: z.object({
      type: z.enum(["publisher", "subscriber"]),
      feedId: z.number(),
    }),
  }),

  SUBSCRIBE_TO_USER_FEED: z.object({
    type: z.literal(EVENTS.SUBSCRIBE_TO_USER_FEED),
    data: z.object({
      feedId: z.number(),
      resolution: z.enum(["h", "m", "l"]).optional(),
    })
  }),

  SEND_ANSWER_FOR_SUBSCRIBING: z.object({
    type: z.literal(EVENTS.SEND_ANSWER_FOR_SUBSCRIBING),
    data: z.object({
      feedId: z.number(),
      jsep: z.any(),
    }),
  }),

  TOGGLE_MEDIA_STREAM: z.object({
    type: z.literal(EVENTS.TOGGLE_MEDIA_STREAM),
    data: z.object({
      video: z.boolean(),
      audio: z.boolean(),
      feedId: z.number()
    }),
  }),

  UNPUBLISH_FEED: z.object({
    type: z.literal(EVENTS.UNPUBLISH_FEED),
    data: z.object({
      feedId: z.number()
    }),
  }),

  GET_PUBLISHER_LIST: z.object({
    type: z.literal(EVENTS.GET_PUBLISHER_LIST),
  }),

  LEAVE_CONFERENCE: z.object({
    type: z.literal(EVENTS.LEAVE_CONFERENCE),
  }),

  SEND_SCREENSHOT_NOTIFICATION: z.object({
    type: z.literal(EVENTS.SEND_SCREENSHOT_NOTIFICATION),
  }),

  SEND_REACTION: z.object({
    type: z.literal(EVENTS.SEND_REACTION),
    data: z.string().min(1, "Reaction cannot be empty").max(50, "Reaction too long"),
  }),

  RAISE_HAND: z.object({
    type: z.literal(EVENTS.RAISE_HAND),
    data: z.object({
      feedId: z.number(),
    }),
  }),

  LOWER_HAND: z.object({
    type: z.literal(EVENTS.LOWER_HAND),
    data: z.object({
      feedId: z.number(),
    }),
  }),

  MODERATE_FEED: z.object({
    type: z.literal(EVENTS.MODERATE_FEED),
    data: z.object({
      feedId: z.number(),
    }),
  }),

  CONFIGURE_FEED: z.object({
    type: z.literal(EVENTS.CONFIGURE_FEED),
    data: z.object({
      feedId: z.number(),
      simulcast: z.boolean(),
      resolutions: z.array(z.enum(["h", "m", "l"])).optional(),
    }),
  }),

  CONFIGURE_FEED_SUBSCRIPTION: z.object({
    type: z.literal(EVENTS.CONFIGURE_FEED_SUBSCRIPTION),
    data: z.object({
      feedId: z.number(),
      resolution: z.enum(["h", "m", "l"]),
    }),
  }),
} as const;

// Union type for all Client-to-Server messages
export const ClientToServerMessageSchema = z.discriminatedUnion("type", [
  ClientToServerMessageSchemas.PING,
  ClientToServerMessageSchemas.SEND_MESSAGE,
  ClientToServerMessageSchemas.DISCONNECT,
  ClientToServerMessageSchemas.JOIN_CONFERENCE_AS_PUBLISHER,
  ClientToServerMessageSchemas.LEAVE_CONFERENCE,
  ClientToServerMessageSchemas.SEND_OFFER_FOR_PUBLISHING,
  ClientToServerMessageSchemas.SUBSCRIBE_TO_USER_FEED,
  ClientToServerMessageSchemas.SEND_ANSWER_FOR_SUBSCRIBING,
  ClientToServerMessageSchemas.SEND_ICE_CANDIDATES,
  ClientToServerMessageSchemas.SEND_ICE_CANDIDATE_COMPLETED,
  ClientToServerMessageSchemas.TOGGLE_MEDIA_STREAM,
  ClientToServerMessageSchemas.UNPUBLISH_FEED,
  ClientToServerMessageSchemas.GET_PUBLISHER_LIST,
  ClientToServerMessageSchemas.SEND_SCREENSHOT_NOTIFICATION,
  ClientToServerMessageSchemas.SEND_REACTION,
  ClientToServerMessageSchemas.RAISE_HAND,
  ClientToServerMessageSchemas.LOWER_HAND,
  ClientToServerMessageSchemas.MODERATE_FEED,
  ClientToServerMessageSchemas.CONFIGURE_FEED,
  ClientToServerMessageSchemas.CONFIGURE_FEED_SUBSCRIPTION,
]);

// Server-to-Client message schemas
export const ServerToClientMessageSchemas = {
  CONNECTED: z.object({
    type: z.literal(EVENTS.CONNECTED),
    data: UserSchema,
  }),

  MESSAGE_SENT: z.object({
    type: z.literal(EVENTS.MESSAGE_SENT),
    data: MessageSchema,
  }),

  PONG: z.object({
    type: z.literal(EVENTS.PONG),
  }),

  ERROR: z.object({
    type: z.literal(EVENTS.ERROR),
    error: z.string(),
  }),

  USER_CONNECTED: z.object({
    type: z.literal(EVENTS.USER_CONNECTED),
    data: UserSchema,
  }),

  USER_DISCONNECTED: z.object({
    type: z.literal(EVENTS.USER_DISCONNECTED),
    data: z.string(), // User ID
  }),

  MESSAGE_RECEIVED: z.object({
    type: z.literal(EVENTS.MESSAGE_RECEIVED),
    data: MessageSchema,
  }),

  USER_JOINED_ROOM: z.object({
    type: z.literal(EVENTS.USER_JOINED_ROOM),
    data: UserSchema,
  }),

  USER_LEFT_ROOM: z.object({
    type: z.literal(EVENTS.USER_LEFT_ROOM),
    data: z.string(), // User ID
  }),

  JOINED_CONFERENCE_AS_PUBLISHER: z.object({
    type: z.literal(EVENTS.JOINED_CONFERENCE_AS_PUBLISHER),
    data: z.object({
      room: z.number(),
      feed: StandardizedPublisherSchema,
      publishers: z.array(StandardizedPublisherSchema),
      iceServers: z.object({
        iceServers: z.array(z.object({
          urls: z.union([z.string(), z.array(z.string())]),
          username: z.string().optional(),
          credential: z.string().optional()
        }))
      })
    })
  }),

  PUBLISHER_WEBRTC_CONNECTION_ESTABLISHED: z.object({
    type: z.literal(EVENTS.PUBLISHER_WEBRTC_CONNECTION_ESTABLISHED),
    data: z.object({
      feedId: z.number(),
    }),
  }),

  SUBSCRIBER_WEBRTC_CONNECTION_ESTABLISHED: z.object({
    type: z.literal(EVENTS.SUBSCRIBER_WEBRTC_CONNECTION_ESTABLISHED),
    data: z.object({
      feedId: z.number(),
    }),
  }),

  RECEIVE_ANSWER_FOR_PUBLISHING: z.object({
    type: z.literal(EVENTS.RECEIVE_ANSWER_FOR_PUBLISHING),
    data: z.object({
      configured: z.literal("ok"),
      audio_codec: z.string(),
      video_codec: z.string(),
      streams: z.array(z.any()),
      jsep: z.object({
        type: z.literal("answer"),
        sdp: z.string(),
      }),
    }),
  }),

  PUBLISHER_LIST: z.object({
    type: z.literal(EVENTS.PUBLISHER_LIST),
    data: z.array(StandardizedPublisherSchema),
  }),

  SUBSCRIBED_TO_USER_FEED: z.object({
    type: z.literal(EVENTS.SUBSCRIBED_TO_USER_FEED),
    data: z.object({
      room: z.number(),
      streams: z.array(z.object({
        mid: z.string(),
        type: z.enum(["audio", "video", "data"]),
        feed_id: z.number(),
      })),
      jsep: z.object({
        type: z.literal("offer"),
        sdp: z.string(),
      }),
      iceServers: z.object({
        iceServers: z.array(z.object({
          urls: z.union([z.string(), z.array(z.string())]),
          username: z.string().optional(),
          credential: z.string().optional()
        }))
      }),
      feedId: z.number()
    }),
  }),

  MEDIA_STREAM_TOGGLED: z.object({
    type: z.literal(EVENTS.MEDIA_STREAM_TOGGLED),
    data: z.object({
      video: z.boolean(),
      audio: z.boolean(),
      feedId: z.number(),
    }),
  }),

  PUBLISHER_TOGGLED_MEDIA_STREAM: z.object({
    type: z.literal(EVENTS.PUBLISHER_TOGGLED_MEDIA_STREAM),
    data: z.object({
      video: z.boolean(),
      audio: z.boolean(),
      feedId: z.number(),
      userId: z.string(),
    }),
  }),

  FEED_UNPUBLISHED: z.object({
    type: z.literal(EVENTS.FEED_UNPUBLISHED),
    data: z.object({
      feedId: z.number(),
    }),
  }),

  PUBLISHER_UNPUBLISHED_FEED: z.object({
    type: z.literal(EVENTS.PUBLISHER_UNPUBLISHED_FEED),
    data: z.object({
      feedId: z.number(),
      userId: z.string(),
    }),
  }),

  USER_LEFT_CONFERENCE: z.object({
    type: z.literal(EVENTS.USER_LEFT_CONFERENCE),
    data: z.object({
      userId: z.string(),
    }), // User ID
  }),

  LEFT_CONFERENCE: z.object({
    type: z.literal(EVENTS.LEFT_CONFERENCE),
  }),

  PUBLISHER_JOINED_CONFERENCE: z.object({
    type: z.literal(EVENTS.PUBLISHER_JOINED_CONFERENCE),
    data: z.object({
      publisher: StandardizedPublisherSchema,
    }),
  }),

  SCREENSHOT_TAKEN: z.object({
    type: z.literal(EVENTS.SCREENSHOT_TAKEN),
  }),

  REACTION_SENT: z.object({
    type: z.literal(EVENTS.REACTION_SENT),
  }),

  SCREENSHOT_TAKEN_BY_USER: z.object({
    type: z.literal(EVENTS.SCREENSHOT_TAKEN_BY_USER),
    data: z.object({
      userId: z.string(),
    }),
  }),

  REACTION_RECEIVED: z.object({
    type: z.literal(EVENTS.REACTION_RECEIVED),
    data: z.object({
      userId: z.string(),
      reaction: z.string(),
    }),
  }),

  HAND_RAISED: z.object({
    type: z.literal(EVENTS.HAND_RAISED),
  }),

  HAND_LOWERED: z.object({
    type: z.literal(EVENTS.HAND_LOWERED),
  }),

  HAND_RAISED_BY_USER: z.object({
    type: z.literal(EVENTS.HAND_RAISED_BY_USER),
    data: z.object({
      userId: z.string(),
      feedId: z.number(),
    }),
  }),

  HAND_LOWERED_BY_USER: z.object({
    type: z.literal(EVENTS.HAND_LOWERED_BY_USER),
    data: z.object({
      userId: z.string(),
      feedId: z.number(),
    }),
  }),

  FEED_MODERATED: z.object({
    type: z.literal(EVENTS.FEED_MODERATED),
    data: z.object({
      feedId: z.number(),
      hostId: z.string(),
    }),
  }),

  MODERATION_SUCCESS: z.object({
    type: z.literal(EVENTS.MODERATION_SUCCESS),
    data: z.object({
      feedId: z.number(),
    }),
  }),

  FEED_MODERATED_BY_HOST: z.object({
    type: z.literal(EVENTS.FEED_MODERATED_BY_HOST),
    data: z.object({
      feedId: z.number(),
      userId: z.string(),
      hostId: z.string(),
    }),
  }),

  USER_JOINED_CALL: z.object({
    type: z.literal(EVENTS.USER_JOINED_CALL),
    data: z.object({
      userId: z.string(),
    }),
  }),

  USER_LEFT_CALL: z.object({
    type: z.literal(EVENTS.USER_LEFT_CALL),
    data: z.object({
      userId: z.string(),
    }),
  }),

  FEED_CONFIGURED: z.object({
    type: z.literal(EVENTS.FEED_CONFIGURED),
    data: z.object({
      feedId: z.number(),
      simulcast: z.boolean(),
      resolutions: z.array(z.enum(["h", "m", "l"])).nullable(),
    }),
  }),

  FEED_SUBSCRIPTION_CONFIGURED: z.object({
    type: z.literal(EVENTS.FEED_SUBSCRIPTION_CONFIGURED),
    data: z.object({
      feedId: z.number(),
      resolution: z.enum(["h", "m", "l"]),
    }),
  }),

  PUBLISHER_CONFIGURED_FEED: z.object({
    type: z.literal(EVENTS.PUBLISHER_CONFIGURED_FEED),
    data: z.object({
      feedId: z.number(),
      userId: z.string(),
      simulcast: z.boolean(),
      resolutions: z.array(z.enum(["h", "m", "l"])).nullable(),
    }),
  }),
} as const;

// Union type for all Server-to-Client messages
export const ServerToClientMessageSchema = z.discriminatedUnion("type", [
  ServerToClientMessageSchemas.CONNECTED,
  ServerToClientMessageSchemas.MESSAGE_SENT,
  ServerToClientMessageSchemas.PONG,
  ServerToClientMessageSchemas.ERROR,
  ServerToClientMessageSchemas.USER_CONNECTED,
  ServerToClientMessageSchemas.USER_DISCONNECTED,
  ServerToClientMessageSchemas.MESSAGE_RECEIVED,
  ServerToClientMessageSchemas.USER_JOINED_ROOM,
  ServerToClientMessageSchemas.USER_LEFT_ROOM,
  ServerToClientMessageSchemas.JOINED_CONFERENCE_AS_PUBLISHER,
  ServerToClientMessageSchemas.PUBLISHER_WEBRTC_CONNECTION_ESTABLISHED,
  ServerToClientMessageSchemas.SUBSCRIBER_WEBRTC_CONNECTION_ESTABLISHED,
  ServerToClientMessageSchemas.RECEIVE_ANSWER_FOR_PUBLISHING,
  ServerToClientMessageSchemas.PUBLISHER_LIST,
  ServerToClientMessageSchemas.SUBSCRIBED_TO_USER_FEED,
  ServerToClientMessageSchemas.MEDIA_STREAM_TOGGLED,
  ServerToClientMessageSchemas.PUBLISHER_TOGGLED_MEDIA_STREAM,
  ServerToClientMessageSchemas.FEED_UNPUBLISHED,
  ServerToClientMessageSchemas.PUBLISHER_UNPUBLISHED_FEED,
  ServerToClientMessageSchemas.USER_LEFT_CONFERENCE,
  ServerToClientMessageSchemas.LEFT_CONFERENCE,
  ServerToClientMessageSchemas.PUBLISHER_JOINED_CONFERENCE,
  ServerToClientMessageSchemas.SCREENSHOT_TAKEN,
  ServerToClientMessageSchemas.REACTION_SENT,
  ServerToClientMessageSchemas.SCREENSHOT_TAKEN_BY_USER,
  ServerToClientMessageSchemas.REACTION_RECEIVED,
  ServerToClientMessageSchemas.HAND_RAISED,
  ServerToClientMessageSchemas.HAND_LOWERED,
  ServerToClientMessageSchemas.HAND_RAISED_BY_USER,
  ServerToClientMessageSchemas.HAND_LOWERED_BY_USER,
  ServerToClientMessageSchemas.FEED_MODERATED,
  ServerToClientMessageSchemas.MODERATION_SUCCESS,
  ServerToClientMessageSchemas.FEED_MODERATED_BY_HOST,
  ServerToClientMessageSchemas.USER_JOINED_CALL,
  ServerToClientMessageSchemas.USER_LEFT_CALL,
  ServerToClientMessageSchemas.FEED_CONFIGURED,
  ServerToClientMessageSchemas.FEED_SUBSCRIPTION_CONFIGURED,
  ServerToClientMessageSchemas.PUBLISHER_CONFIGURED_FEED,
]);

// PubSub message schemas
export const PubSubMessageSchemas = {
  ROOM_BROADCAST: z.object({
    message: z.union([
      ServerToClientMessageSchemas.USER_CONNECTED,
      ServerToClientMessageSchemas.USER_LEFT_ROOM,
      ServerToClientMessageSchemas.USER_JOINED_ROOM,
      ServerToClientMessageSchemas.MESSAGE_RECEIVED,
      ServerToClientMessageSchemas.USER_DISCONNECTED,
      ServerToClientMessageSchemas.MEDIA_STREAM_TOGGLED,
      ServerToClientMessageSchemas.PUBLISHER_TOGGLED_MEDIA_STREAM,
      ServerToClientMessageSchemas.PUBLISHER_JOINED_CONFERENCE,
      ServerToClientMessageSchemas.PUBLISHER_UNPUBLISHED_FEED,
      ServerToClientMessageSchemas.USER_LEFT_CONFERENCE,
      ServerToClientMessageSchemas.SCREENSHOT_TAKEN_BY_USER,
      ServerToClientMessageSchemas.REACTION_RECEIVED,
      ServerToClientMessageSchemas.HAND_RAISED_BY_USER,
      ServerToClientMessageSchemas.HAND_LOWERED_BY_USER,
      ServerToClientMessageSchemas.FEED_MODERATED_BY_HOST,
      ServerToClientMessageSchemas.USER_JOINED_CALL,
      ServerToClientMessageSchemas.USER_LEFT_CALL,
      ServerToClientMessageSchemas.PUBLISHER_CONFIGURED_FEED,
    ]),
    excludeId: z.string().optional(),
    roomId: z.string(),
    onlyUsersInCall: z.boolean().optional().default(false),
  }),
} as const;

// Type exports - All types derived from schemas
export type User = z.infer<typeof UserSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type RTCIceCandidateData = z.infer<typeof RTCIceCandidateSchema>;
export type StandardizedPublisher = z.infer<typeof StandardizedPublisherSchema>;
export type MediaStreamToggleData = z.infer<typeof ClientToServerMessageSchemas.TOGGLE_MEDIA_STREAM>["data"];
export type SendOfferForPublishingData = z.infer<typeof ClientToServerMessageSchemas.SEND_OFFER_FOR_PUBLISHING>["data"];

// Base message types
export type ClientToServerMessage = z.infer<typeof ClientToServerMessageSchema>;
export type ServerToClientMessage = z.infer<typeof ServerToClientMessageSchema>;

// Individual client message types - using the actual event constants as keys
export type ClientToServerMessages = {
  BASE: {
    type: string;
    data?: any;
  };
  [EVENTS.PING]: z.infer<typeof ClientToServerMessageSchemas.PING>;
  [EVENTS.SEND_MESSAGE]: z.infer<typeof ClientToServerMessageSchemas.SEND_MESSAGE>;
  [EVENTS.DISCONNECT]: z.infer<typeof ClientToServerMessageSchemas.DISCONNECT>;
  [EVENTS.JOIN_CONFERENCE_AS_PUBLISHER]: z.infer<typeof ClientToServerMessageSchemas.JOIN_CONFERENCE_AS_PUBLISHER>;
  [EVENTS.LEAVE_CONFERENCE]: z.infer<typeof ClientToServerMessageSchemas.LEAVE_CONFERENCE>;
  [EVENTS.SEND_OFFER_FOR_PUBLISHING]: z.infer<typeof ClientToServerMessageSchemas.SEND_OFFER_FOR_PUBLISHING>;
  [EVENTS.SUBSCRIBE_TO_USER_FEED]: z.infer<typeof ClientToServerMessageSchemas.SUBSCRIBE_TO_USER_FEED>;
  [EVENTS.SEND_ANSWER_FOR_SUBSCRIBING]: z.infer<typeof ClientToServerMessageSchemas.SEND_ANSWER_FOR_SUBSCRIBING>;
  [EVENTS.SEND_ICE_CANDIDATES]: z.infer<typeof ClientToServerMessageSchemas.SEND_ICE_CANDIDATES>;
  [EVENTS.SEND_ICE_CANDIDATE_COMPLETED]: z.infer<typeof ClientToServerMessageSchemas.SEND_ICE_CANDIDATE_COMPLETED>;
  [EVENTS.TOGGLE_MEDIA_STREAM]: z.infer<typeof ClientToServerMessageSchemas.TOGGLE_MEDIA_STREAM>;
  [EVENTS.UNPUBLISH_FEED]: z.infer<typeof ClientToServerMessageSchemas.UNPUBLISH_FEED>;
  [EVENTS.GET_PUBLISHER_LIST]: z.infer<typeof ClientToServerMessageSchemas.GET_PUBLISHER_LIST>;
  [EVENTS.LEAVE_CONFERENCE]: z.infer<typeof ClientToServerMessageSchemas.LEAVE_CONFERENCE>;
  [EVENTS.SEND_SCREENSHOT_NOTIFICATION]: z.infer<typeof ClientToServerMessageSchemas.SEND_SCREENSHOT_NOTIFICATION>;
  [EVENTS.SEND_REACTION]: z.infer<typeof ClientToServerMessageSchemas.SEND_REACTION>;
  [EVENTS.RAISE_HAND]: z.infer<typeof ClientToServerMessageSchemas.RAISE_HAND>;
  [EVENTS.LOWER_HAND]: z.infer<typeof ClientToServerMessageSchemas.LOWER_HAND>;
  [EVENTS.MODERATE_FEED]: z.infer<typeof ClientToServerMessageSchemas.MODERATE_FEED>;
  [EVENTS.CONFIGURE_FEED]: z.infer<typeof ClientToServerMessageSchemas.CONFIGURE_FEED>;
  [EVENTS.CONFIGURE_FEED_SUBSCRIPTION]: z.infer<typeof ClientToServerMessageSchemas.CONFIGURE_FEED_SUBSCRIPTION>;
};

// Individual server message types - using actual event constants as keys
export type ServerToClientMessages = {
  BASE: {
    type: string;
    data?: any;
  };
  [EVENTS.CONNECTED]: z.infer<typeof ServerToClientMessageSchemas.CONNECTED>;
  [EVENTS.MESSAGE_SENT]: z.infer<typeof ServerToClientMessageSchemas.MESSAGE_SENT>;
  [EVENTS.PONG]: z.infer<typeof ServerToClientMessageSchemas.PONG>;
  [EVENTS.ERROR]: z.infer<typeof ServerToClientMessageSchemas.ERROR>;
  [EVENTS.USER_CONNECTED]: z.infer<typeof ServerToClientMessageSchemas.USER_CONNECTED>;
  [EVENTS.USER_DISCONNECTED]: z.infer<typeof ServerToClientMessageSchemas.USER_DISCONNECTED>;
  [EVENTS.MESSAGE_RECEIVED]: z.infer<typeof ServerToClientMessageSchemas.MESSAGE_RECEIVED>;
  [EVENTS.USER_JOINED_ROOM]: z.infer<typeof ServerToClientMessageSchemas.USER_JOINED_ROOM>;
  [EVENTS.USER_LEFT_ROOM]: z.infer<typeof ServerToClientMessageSchemas.USER_LEFT_ROOM>;
  [EVENTS.JOINED_CONFERENCE_AS_PUBLISHER]: z.infer<typeof ServerToClientMessageSchemas.JOINED_CONFERENCE_AS_PUBLISHER>;
  [EVENTS.PUBLISHER_WEBRTC_CONNECTION_ESTABLISHED]: z.infer<typeof ServerToClientMessageSchemas.PUBLISHER_WEBRTC_CONNECTION_ESTABLISHED>;
  [EVENTS.SUBSCRIBER_WEBRTC_CONNECTION_ESTABLISHED]: z.infer<typeof ServerToClientMessageSchemas.SUBSCRIBER_WEBRTC_CONNECTION_ESTABLISHED>;
  [EVENTS.RECEIVE_ANSWER_FOR_PUBLISHING]: z.infer<typeof ServerToClientMessageSchemas.RECEIVE_ANSWER_FOR_PUBLISHING>;
  [EVENTS.PUBLISHER_LIST]: z.infer<typeof ServerToClientMessageSchemas.PUBLISHER_LIST>;
  [EVENTS.SUBSCRIBED_TO_USER_FEED]: z.infer<typeof ServerToClientMessageSchemas.SUBSCRIBED_TO_USER_FEED>;
  [EVENTS.MEDIA_STREAM_TOGGLED]: z.infer<typeof ServerToClientMessageSchemas.MEDIA_STREAM_TOGGLED>;
  [EVENTS.PUBLISHER_TOGGLED_MEDIA_STREAM]: z.infer<typeof ServerToClientMessageSchemas.PUBLISHER_TOGGLED_MEDIA_STREAM>;
  [EVENTS.FEED_UNPUBLISHED]: z.infer<typeof ServerToClientMessageSchemas.FEED_UNPUBLISHED>;
  [EVENTS.PUBLISHER_UNPUBLISHED_FEED]: z.infer<typeof ServerToClientMessageSchemas.PUBLISHER_UNPUBLISHED_FEED>;
  [EVENTS.USER_LEFT_CONFERENCE]: z.infer<typeof ServerToClientMessageSchemas.USER_LEFT_CONFERENCE>;
  [EVENTS.LEFT_CONFERENCE]: z.infer<typeof ServerToClientMessageSchemas.LEFT_CONFERENCE>;
  [EVENTS.PUBLISHER_JOINED_CONFERENCE]: z.infer<typeof ServerToClientMessageSchemas.PUBLISHER_JOINED_CONFERENCE>;
  [EVENTS.SCREENSHOT_TAKEN]: z.infer<typeof ServerToClientMessageSchemas.SCREENSHOT_TAKEN>;
  [EVENTS.REACTION_SENT]: z.infer<typeof ServerToClientMessageSchemas.REACTION_SENT>;
  [EVENTS.REACTION_RECEIVED]: z.infer<typeof ServerToClientMessageSchemas.REACTION_RECEIVED>;
  [EVENTS.SCREENSHOT_TAKEN_BY_USER]: z.infer<typeof ServerToClientMessageSchemas.SCREENSHOT_TAKEN_BY_USER>;
  [EVENTS.HAND_RAISED]: z.infer<typeof ServerToClientMessageSchemas.HAND_RAISED>;
  [EVENTS.HAND_LOWERED]: z.infer<typeof ServerToClientMessageSchemas.HAND_LOWERED>;
  [EVENTS.HAND_RAISED_BY_USER]: z.infer<typeof ServerToClientMessageSchemas.HAND_RAISED_BY_USER>;
  [EVENTS.HAND_LOWERED_BY_USER]: z.infer<typeof ServerToClientMessageSchemas.HAND_LOWERED_BY_USER>;
  [EVENTS.FEED_MODERATED]: z.infer<typeof ServerToClientMessageSchemas.FEED_MODERATED>;
  [EVENTS.MODERATION_SUCCESS]: z.infer<typeof ServerToClientMessageSchemas.MODERATION_SUCCESS>;
  [EVENTS.FEED_MODERATED_BY_HOST]: z.infer<typeof ServerToClientMessageSchemas.FEED_MODERATED_BY_HOST>;
  [EVENTS.USER_JOINED_CALL]: z.infer<typeof ServerToClientMessageSchemas.USER_JOINED_CALL>;
  [EVENTS.USER_LEFT_CALL]: z.infer<typeof ServerToClientMessageSchemas.USER_LEFT_CALL>;
  [EVENTS.FEED_CONFIGURED]: z.infer<typeof ServerToClientMessageSchemas.FEED_CONFIGURED>;
  [EVENTS.FEED_SUBSCRIPTION_CONFIGURED]: z.infer<typeof ServerToClientMessageSchemas.FEED_SUBSCRIPTION_CONFIGURED>;
  [EVENTS.PUBLISHER_CONFIGURED_FEED]: z.infer<typeof ServerToClientMessageSchemas.PUBLISHER_CONFIGURED_FEED>;
};

// PubSub message types
export type PubSubRoomBroadcast = z.infer<typeof PubSubMessageSchemas.ROOM_BROADCAST>;
export type PubSubMessage = {
  ROOM_BROADCAST: PubSubRoomBroadcast;
};

// Validation helper functions
export function validateClientMessage(data: unknown): ClientToServerMessage {
  return ClientToServerMessageSchema.parse(data);
}

export function validatePubSubRoomBroadcast(data: unknown): PubSubRoomBroadcast {
  return PubSubMessageSchemas.ROOM_BROADCAST.parse(data);
}
