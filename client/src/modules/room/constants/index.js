export const EVENTS = {
  // Room Management
  LEAVE_ROOM: "leave-room",
  
  // Basic Communication
  SEND_MESSAGE: "send-message",
  MESSAGE_SENT: "message-sent",
  RECEIVE_MESSAGE: "receive-message",
  DISCONNECT: "disconnect",
  PING: "ping",
  PONG: "pong",
  ERROR: "error",
  CONNECTED: "connected",

  // User Events (broadcasts)
  USER_CONNECTED: "user-connected",
  USER_JOINED: "user-joined",
  USER_LEFT: "user-left",
  USER_DISCONNECTED: "user-disconnected",

  // OLD SFU EVENTS (keeping as-is for now)
  JOIN_CONFERENCE_AS_PUBLISHER: "join-conference-as-publisher",
  SEND_OFFER_FOR_PUBLISHING: "send-offer-for-publishing",
  SEND_ICE_CANDIDATES: "send-ice-candidates",
  SEND_ICE_CANDIDATE_COMPLETED: "send-ice-candidate-completed",
  GET_PUBLISHER_LIST: "get-publisher-list",
  SUBSCRIBE_TO_USER_FEED: "subscribe-to-user-feed",
  SEND_ANSWER_FOR_SUBSCRIBING: "send-answer-for-subscribing",
  TOGGLE_MEDIA_STREAM: "toggle-media-stream",
  UNPUBLISH_FEED: "unpublish-feed",
  LEAVE_CONFERENCE: "leave-conference",
  SEND_SCREENSHOT_NOTIFICATION: "send-screenshot-notification",
  SEND_REACTION: "send-reaction",
  RAISE_HAND: "raise-hand",
  LOWER_HAND: "lower-hand",
  MODERATE_FEED: "moderate-feed",
  CONFIGURE_FEED: "configure-feed",
  CONFIGURE_FEED_SUBSCRIPTION: "configure-feed-subscription",

  JOINED_CONFERENCE_AS_PUBLISHER: "joined-conference-as-publisher",
  PUBLISHER_WEBRTC_CONNECTION_ESTABLISHED: "publisher-webrtc-connection-established",
  SUBSCRIBER_WEBRTC_CONNECTION_ESTABLISHED: "subscriber-webrtc-connection-established",
  RECEIVE_ANSWER_FOR_PUBLISHING: "receive-answer-for-publishing",
  SUBSCRIBED_TO_USER_FEED: "subscribed-to-user-feed",
  MEDIA_STREAM_TOGGLED: "media-stream-toggled",
  PUBLISHER_LIST: "publisher-list",
  FEED_UNPUBLISHED: "feed-unpublished",
  LEFT_CONFERENCE: "left-conference",
  PUBLISHER_JOINED_CONFERENCE: "publisher-joined-conference",
  SCREENSHOT_TAKEN: "screenshot-taken",
  REACTION_SENT: "reaction-sent",
  HAND_RAISED: "hand-raised",
  HAND_LOWERED: "hand-lowered",
  FEED_MODERATED: "feed-moderated",
  MODERATION_SUCCESS: "moderation-success",
  FEED_CONFIGURED: "feed-configured",
  FEED_SUBSCRIPTION_CONFIGURED: "feed-subscription-configured",

  // Call Events (P2P mesh)
  JOIN_CALL: "join-call",
  JOINED_CALL: "joined-call",
  LEAVE_CALL: "leave-call",
  USER_JOINED_CALL: "user-joined-call",
  USER_LEFT_CALL: "user-left-call",

  // P2P WebRTC Signaling - Video Call (relay pattern)
  SEND_WEBRTC_OFFER_FOR_VIDEO_CALL: "send-webrtc-offer-for-video-call",
  RECEIVE_WEBRTC_OFFER_FOR_VIDEO_CALL: "receive-webrtc-offer-for-video-call",
  SEND_WEBRTC_ANSWER_FOR_VIDEO_CALL: "send-webrtc-answer-for-video-call",
  RECEIVE_WEBRTC_ANSWER_FOR_VIDEO_CALL: "receive-webrtc-answer-for-video-call",
  SEND_WEBRTC_ICE_CANDIDATE_FOR_VIDEO_CALL: "send-webrtc-ice-candidate-for-video-call",
  RECEIVE_WEBRTC_ICE_CANDIDATE_FOR_VIDEO_CALL: "receive-webrtc-ice-candidate-for-video-call",

  // Media stream controls
  TOGGLE_STREAM: "toggle-stream",
  USER_TOGGLED_STREAM: "user-toggled-stream",

  // Screen sharing
  START_SCREEN_SHARE: "start-screen-share",
  STOP_SCREEN_SHARE: "stop-screen-share",
  USER_STARTED_SCREEN_SHARE: "user-started-screen-share",
  USER_STOPPED_SCREEN_SHARE: "user-stopped-screen-share",
  SEND_WEBRTC_OFFER_FOR_SCREEN_SHARE: "send-webrtc-offer-for-screen-share",
  RECEIVE_WEBRTC_OFFER_FOR_SCREEN_SHARE: "receive-webrtc-offer-for-screen-share",
  SEND_WEBRTC_ANSWER_FOR_SCREEN_SHARE: "send-webrtc-answer-for-screen-share",
  RECEIVE_WEBRTC_ANSWER_FOR_SCREEN_SHARE: "receive-webrtc-answer-for-screen-share",
  SEND_WEBRTC_ICE_CANDIDATE_FOR_SCREEN_SHARE: "send-webrtc-ice-candidate-for-screen-share",
  RECEIVE_WEBRTC_ICE_CANDIDATE_FOR_SCREEN_SHARE: "receive-webrtc-ice-candidate-for-screen-share",

  PUBLISHER_TOGGLED_MEDIA_STREAM: "publisher-toggled-media-stream",
  PUBLISHER_UNPUBLISHED_FEED: "publisher-unpublished-feed",
  USER_LEFT_CONFERENCE: "user-left-conference",
  SCREENSHOT_TAKEN_BY_USER: "screenshot-taken-by-user",
  REACTION_RECEIVED: "reaction-received",
  HAND_RAISED_BY_USER: "hand-raised-by-user",
  HAND_LOWERED_BY_USER: "hand-lowered-by-user",
  FEED_MODERATED_BY_HOST: "feed-moderated-by-host",
  PUBLISHER_CONFIGURED_FEED: "publisher-configured-feed",
};

export const CHANNELS = {
  ROOM_BROADCASTS_CHANNEL: "room-broadcasts-channel",
  WS_TO_SFU_ORCHESTRATOR_CHANNEL: "ws-to-sfu-orchestrator-channel",
  SFU_ORCHESTRATOR_TO_WS_CHANNEL: "sfu-orchestrator-to-ws-channel",
};