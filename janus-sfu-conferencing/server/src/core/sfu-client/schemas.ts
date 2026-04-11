import { z } from "zod";

// Base Janus event structure
export const JanusEventSchema = z.object({
  janus: z.literal("event"),
  session_id: z.number(),
  transaction: z.string(),
  sender: z.number(),
  plugindata: z.object({
    plugin: z.string(),
    data: z.any(),
  }),
});

// Videoroom joined event
export const VideoroomJoinedEventSchema = JanusEventSchema.extend({
  plugindata: z.object({
    plugin: z.literal("janus.plugin.videoroom"),
    data: z.object({
      videoroom: z.literal("joined"),
      room: z.number(),
      description: z.string(),
      id: z.number(),
      private_id: z.number(),
      publishers: z.array(z.any()),
    }),
  }),
});

// Videoroom publish success event
export const VideoroomPublishSuccessEventSchema = JanusEventSchema.extend({
  plugindata: z.object({
    plugin: z.literal("janus.plugin.videoroom"),
    data: z.object({
      videoroom: z.literal("event"),
      room: z.number(),
      configured: z.literal("ok"),
      audio_codec: z.string().optional(),
      video_codec: z.string().optional(),
      streams: z.array(z.any()),
    }),
  }),
  jsep: z.object({
    type: z.literal("answer"),
    sdp: z.string(),
  }),
});

// Videoroom subscriber attached event
export const VideoroomSubscriberAttachedEventSchema = JanusEventSchema.extend({
  plugindata: z.object({
    plugin: z.literal("janus.plugin.videoroom"),
    data: z.object({
      videoroom: z.literal("attached"),
      room: z.number(),
      streams: z.array(z.object({
        mid: z.string(),
        type: z.enum(["audio", "video", "data"]),
        feed_id: z.number(),
      })),
    }),
  }),
  jsep: z.object({
    type: z.literal("offer"),
    sdp: z.string(),
  }),
});

// Videoroom configured event (for media stream toggle)
export const VideoroomConfiguredEventSchema = JanusEventSchema.extend({
  plugindata: z.object({
    plugin: z.literal("janus.plugin.videoroom"),
    data: z.object({
      videoroom: z.literal("event"),
      room: z.number(),
      configured: z.literal("ok"),
    }),
  }),
});

export const VideoroomHandleDetachedEventSchema = z.object({
  janus: z.literal('detached'),
  session_id: z.number(),
  sender: z.number()
})

export const VideoRoomPublisherJoinedEventSchema = z.object({
  janus: z.literal("event"),
  session_id: z.number(),
  sender: z.number(),
  plugindata: z.object({
    plugin: z.literal("janus.plugin.videoroom"),
    data: z.object({
      videoroom: z.literal("event"),
      room: z.number(),
      publishers: z.array(z.any()),
    }),
  }),
})

export const VideoRoomWebRTCConnectionSuccessEventSchema = z.object({
  janus: z.literal("webrtcup"),
  session_id: z.number(),
  sender: z.number(),
});

// Union type for all videoroom events
export const VideoroomEventSchema = z.union([
  VideoroomJoinedEventSchema,
  VideoroomPublishSuccessEventSchema,
  VideoroomSubscriberAttachedEventSchema,
  VideoroomConfiguredEventSchema,
  VideoroomHandleDetachedEventSchema,
  VideoRoomPublisherJoinedEventSchema,
  // Add more videoroom event schemas here as needed
]);

// Union type for all Janus events
export const JanusEventUnionSchema = z.union([
  VideoroomEventSchema,
  // Add more event schemas here as needed
]);
