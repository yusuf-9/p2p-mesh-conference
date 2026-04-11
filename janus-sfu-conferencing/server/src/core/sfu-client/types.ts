import {
  JanusEventSchema,
  VideoroomEventSchema,
  VideoroomJoinedEventSchema,
  VideoroomPublishSuccessEventSchema,
  VideoroomSubscriberAttachedEventSchema,
  VideoroomConfiguredEventSchema,
  VideoroomHandleDetachedEventSchema,
  VideoRoomPublisherJoinedEventSchema,
  VideoRoomWebRTCConnectionSuccessEventSchema,
} from "./schemas.js";
import { z } from "zod";

export type SfuSessionCreationSuccessResponse = {
  janus: "success";
  transaction: string;
  data: {
    id: number; // session id
  };
};

export type SfuHandleCreationSuccessResponse = {
  janus: "success";
  transaction: string;
  data: {
    id: number; // handle id
  };
};

export type SfuRoomCreationSuccessResponse = {
  janus: "success";
  session_id: number; // session id
  transaction: string;
  sender: number; // handle id
  plugindata: {
    plugin: "janus.plugin.videoroom";
    data: { videoroom: "created"; room: number; permanent: boolean };
  };
};

export type SfuRoomExistsResponse = {
  janus: "success";
  transaction: string;
  sender: number; // handle id
  plugindata: {
    plugin: "janus.plugin.videoroom";
    data: {
      videoroom: "success";
      room: number;
      exists: boolean;
    };
  };
};

export type SfuPublishSuccessResponse = {
  janus: "event";
  session_id: number;
  transaction: string;
  sender: number;
  plugindata: {
    plugin: "janus.plugin.videoroom";
    data: {
      videoroom: "event";
      room: number;
      configured: "ok";
      audio_codec: string;
      video_codec: string;
      streams: any[]; // Type could be more specific based on actual streams structure
    };
  };
  jsep: {
    type: "answer";
    sdp: string;
  };
};

export type SfuPublisherListSuccessResponse = {
  janus: "success";
  session_id: number;
  transaction: string;
  sender: number;
  plugindata: {
    plugin: "janus.plugin.videoroom";
    data: {
      videoroom: "participants";
      room: number;
      participants: any[]
    };
  };
};

export type SfuHandleDetachedEvent = z.infer<typeof VideoroomHandleDetachedEventSchema>

export type JanusEvent = z.infer<typeof JanusEventSchema>;
export type VideoroomJoinedEvent = z.infer<typeof VideoroomJoinedEventSchema>;
export type VideoroomEvent = z.infer<typeof VideoroomEventSchema>;
export type VideoroomPublishSuccessEvent = z.infer<typeof VideoroomPublishSuccessEventSchema>;
export type VideoroomSubscriberAttachedEvent = z.infer<typeof VideoroomSubscriberAttachedEventSchema>;
export type VideoroomConfiguredEvent = z.infer<typeof VideoroomConfiguredEventSchema>;
export type VideoroomPublisherJoinedEvent = z.infer<typeof VideoRoomPublisherJoinedEventSchema>;
export type VideoRoomWebRTCConnectionSuccessEvent = z.infer<typeof VideoRoomWebRTCConnectionSuccessEventSchema>;
