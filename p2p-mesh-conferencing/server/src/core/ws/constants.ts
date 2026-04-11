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

  // P2P WebRTC Signaling - Video Call (Relay Pattern)
  SEND_WEBRTC_OFFER_FOR_VIDEO_CALL: "send-webrtc-offer-for-video-call",
  RECEIVE_WEBRTC_OFFER_FOR_VIDEO_CALL: "receive-webrtc-offer-for-video-call",
  SEND_WEBRTC_ANSWER_FOR_VIDEO_CALL: "send-webrtc-answer-for-video-call", 
  RECEIVE_WEBRTC_ANSWER_FOR_VIDEO_CALL: "receive-webrtc-answer-for-video-call",
  SEND_WEBRTC_ICE_CANDIDATE_FOR_VIDEO_CALL: "send-webrtc-ice-candidate-for-video-call",
  RECEIVE_WEBRTC_ICE_CANDIDATE_FOR_VIDEO_CALL: "receive-webrtc-ice-candidate-for-video-call",

  // Call Management
  JOIN_CALL: "join-call",
  JOINED_CALL: "joined-call",
  LEAVE_CALL: "leave-call",
  USER_JOINED_CALL: "user-joined-call",
  USER_LEFT_CALL: "user-left-call",

  // Media Stream Controls
  TOGGLE_STREAM: "toggle-stream",
  USER_TOGGLED_STREAM: "user-toggled-stream",

  // Screen Sharing (separate from video call)
  SEND_WEBRTC_OFFER_FOR_SCREEN_SHARE: "send-webrtc-offer-for-screen-share",
  RECEIVE_WEBRTC_OFFER_FOR_SCREEN_SHARE: "receive-webrtc-offer-for-screen-share",
  SEND_WEBRTC_ANSWER_FOR_SCREEN_SHARE: "send-webrtc-answer-for-screen-share",
  RECEIVE_WEBRTC_ANSWER_FOR_SCREEN_SHARE: "receive-webrtc-answer-for-screen-share", 
  SEND_WEBRTC_ICE_CANDIDATE_FOR_SCREEN_SHARE: "send-webrtc-ice-candidate-for-screen-share",
  RECEIVE_WEBRTC_ICE_CANDIDATE_FOR_SCREEN_SHARE: "receive-webrtc-ice-candidate-for-screen-share",
  
  START_SCREEN_SHARE: "start-screen-share",
  STOP_SCREEN_SHARE: "stop-screen-share",
  USER_STARTED_SCREEN_SHARE: "user-started-screen-share", 
  USER_STOPPED_SCREEN_SHARE: "user-stopped-screen-share",

  // Interactions
  SEND_REACTION: "send-reaction",
  RECEIVE_REACTION: "receive-reaction",
  RAISE_HAND: "raise-hand",
  LOWER_HAND: "lower-hand",
  USER_RAISED_HAND: "user-raised-hand",
  USER_LOWERED_HAND: "user-lowered-hand",
  SEND_SCREENSHOT_NOTIFICATION: "send-screenshot-notification",
  USER_TOOK_SCREENSHOT: "user-took-screenshot",
} as const;

export const CHANNELS = {
  ROOM_BROADCASTS_CHANNEL: "room-broadcasts-channel",
} as const;