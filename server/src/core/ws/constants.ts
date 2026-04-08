export const EVENTS = {
  // client -> server
  SEND_MESSAGE: "send-message",
  DISCONNECT: "disconnect",
  PING: "ping",
  
  // P2P Signaling Events (client -> server)
  JOIN_CALL: "join-call",
  LEAVE_CALL: "leave-call",
  PEER_OFFER: "peer-offer",
  PEER_ANSWER: "peer-answer",
  PEER_ICE_CANDIDATE: "peer-ice-candidate",
  TOGGLE_MEDIA: "toggle-media",
  
  // Basic interactions
  SEND_SCREENSHOT_NOTIFICATION: "send-screenshot-notification",
  SEND_REACTION: "send-reaction",
  RAISE_HAND: "raise-hand",
  LOWER_HAND: "lower-hand",

  // server -> client
  CONNECTED: "connected",
  MESSAGE_SENT: "message-sent",
  PONG: "pong",
  ERROR: "error",
  
  // P2P Signaling Events (server -> client)
  CALL_JOINED: "call-joined",
  CALL_LEFT: "call-left",
  PEER_OFFER_RECEIVED: "peer-offer-received",
  PEER_ANSWER_RECEIVED: "peer-answer-received",
  PEER_ICE_CANDIDATE_RECEIVED: "peer-ice-candidate-received",
  MEDIA_TOGGLED: "media-toggled",
  
  // Basic interaction responses
  SCREENSHOT_TAKEN: "screenshot-taken",
  REACTION_SENT: "reaction-sent",
  HAND_RAISED: "hand-raised",
  HAND_LOWERED: "hand-lowered",

  // server -> room (broadcasts)
  USER_CONNECTED: "user-connected",
  USER_DISCONNECTED: "user-disconnected",
  MESSAGE_RECEIVED: "message-received",
  USER_JOINED_ROOM: "user-joined-room",
  USER_LEFT_ROOM: "user-left-room",
  
  // P2P Call Events (broadcasts)
  PEER_JOINED_CALL: "peer-joined-call",
  PEER_LEFT_CALL: "peer-left-call",
  PEER_OFFER_BROADCAST: "peer-offer-broadcast",
  PEER_ANSWER_BROADCAST: "peer-answer-broadcast", 
  PEER_ICE_CANDIDATE_BROADCAST: "peer-ice-candidate-broadcast",
  PEER_MEDIA_TOGGLED: "peer-media-toggled",
  
  // Basic interaction broadcasts
  SCREENSHOT_TAKEN_BY_USER: "screenshot-taken-by-user",
  REACTION_RECEIVED: "reaction-received",
  HAND_RAISED_BY_USER: "hand-raised-by-user",
  HAND_LOWERED_BY_USER: "hand-lowered-by-user",
} as const;

export const CHANNELS = {
  ROOM_BROADCASTS_CHANNEL: "room-broadcasts-channel",
} as const;
