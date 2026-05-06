import { create } from 'zustand'

const useStore = create((set, get) => ({
  // Room metadata
  room: null,
  
  // Current user
  user: null,
  userToken: null, // JWT token for authenticated API calls
  
  // Room members/users
  members: [],
  
  // Chat messages
  messages: [],
  
  // Video Conference Feeds
  localFeeds: [],    // User's own feeds (camera/screenshare)
  remoteFeeds: [],   // Other users' feeds
  
  // Conference State 
  conferenceState: {
    step: "pending", // "pending" | "requesting-camera-access" | "joined" | "left"
    joinedConference: false,
    joinRequestState: { isLoading: false, error: null },
  },
  
  // WebRTC Peer Connections
  peers: new Map(), // feedId -> { peerConnection, candidates, iceCompleted, type }
  localPeers: [], // Array of local participant objects
  remotePeers: [], // Array of remote participant objects
  
  // Media session info
  mediaSession: null,
  
  // Media room info
  mediaRoom: null,
  
  // Room loading/connecting state
  roomLoadingStatus: {
    loading: false,
    error: null,
    step: "creating-room", // "creating-room", "joining-room", "connecting-to-socket", "connected-to-socket"
  },
  
  // Room manager service instance
  roomManager: null,
  
  // Reactions
  reactions: [], // Array of { id, emoji, userId, feedId, timestamp }
  
  // Notifications
  notifications: [], // Array of { id, type, title, message, timestamp }
  
  // Actioons for room
  setRoom: (room) => set({ room }),
  
  // Actions for user
  setUser: (user) => set({ user }),
  setUserToken: (userToken) => set({ userToken }),
  
  // Actions for members
  setMembers: (members) => set({ members }),
  addMember: (member) => set((state) => ({
    members: [...state.members, member]
  })),
  removeMember: (memberId) => set((state) => ({
    members: state.members.filter(m => m.id !== memberId)
  })),
  updateMember: (memberId, updates) => set((state) => ({
    members: state.members.map(m => 
      m.id === memberId ? { ...m, ...updates } : m
    )
  })),
  
  // Actions for messages
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message]
  })),
  updateMessage: (messageId, updates) => set((state) => ({
    messages: state.messages.map(m => 
      m.id === messageId ? { ...m, ...updates } : m
    )
  })),
  removeMessagePendingStatus: (tempMessageId, confirmedMessage) => set((state) => ({
    messages: state.messages.map(m => 
      m.id === tempMessageId ? { ...confirmedMessage, pending: false } : m
    )
  })),
  
  // Actions for local feeds
  setLocalFeeds: (feeds) => set({ localFeeds: feeds }),
  addLocalFeed: (feed) => set((state) => ({
    localFeeds: [...state.localFeeds, feed]
  })),
  removeLocalFeed: (feedId) => set((state) => ({
    localFeeds: state.localFeeds.filter(f => f.feedId !== feedId && f.id !== feedId)
  })),
  updateLocalFeed: (feedId, updates) => set((state) => ({
    localFeeds: state.localFeeds.map(f => 
      (f.feedId === feedId || f.id === feedId) ? { ...f, ...updates } : f
    )
  })),
  
  // Actions for remote feeds
  setRemoteFeeds: (feeds) => set({ remoteFeeds: feeds }),
  addRemoteFeed: (feed) => set((state) => ({
    remoteFeeds: [...state.remoteFeeds, feed]
  })),
  removeRemoteFeed: (feedId) => set((state) => ({
    remoteFeeds: state.remoteFeeds.filter(f => f.feedId !== feedId)
  })),
  updateRemoteFeed: (feedId, updates) => set((state) => ({
    remoteFeeds: state.remoteFeeds.map(f => 
      f.feedId === feedId ? { ...f, ...updates } : f
    )
  })),
  
  // Actions for conference state
  setConferenceState: (state) => set({ conferenceState: state }),
  updateConferenceState: (updates) => set((state) => ({
    conferenceState: { ...state.conferenceState, ...updates }
  })),
  
  // Actions for WebRTC peers
  setPeers: (peers) => set({ peers }),
  addPeer: (feedId, peerData) => set((state) => {
    const newPeers = new Map(state.peers);
    newPeers.set(feedId, peerData);
    return { peers: newPeers };
  }),
  removePeer: (feedId) => set((state) => {
    const newPeers = new Map(state.peers);
    newPeers.delete(feedId);
    return { peers: newPeers };
  }),
  updatePeer: (feedId, updates) => set((state) => {
    const newPeers = new Map(state.peers);
    const existingPeer = newPeers.get(feedId);
    if (existingPeer) {
      newPeers.set(feedId, { ...existingPeer, ...updates });
    }
    return { peers: newPeers };
  }),
  
  // Actions for local/remote peers
  setLocalPeers: (peers) => set({ localPeers: peers }),
  addLocalPeer: (peer) => set((state) => ({
    localPeers: [...state.localPeers, peer]
  })),
  removeLocalPeer: (feedId) => set((state) => ({
    localPeers: state.localPeers.filter(p => p.feedId !== feedId)
  })),
  updateLocalPeer: (feedId, updates) => set((state) => ({
    localPeers: state.localPeers.map(p => 
      p.feedId === feedId ? { ...p, ...updates } : p
    )
  })),
  
  setRemotePeers: (peers) => set({ remotePeers: peers }),
  addRemotePeer: (peer) => set((state) => ({
    remotePeers: [...state.remotePeers, peer]
  })),
  removeRemotePeer: (feedId) => set((state) => ({
    remotePeers: state.remotePeers.filter(p => p.feedId !== feedId)
  })),
  updateRemotePeer: (feedId, updates) => set((state) => ({
    remotePeers: state.remotePeers.map(p => 
      p.feedId === feedId ? { ...p, ...updates } : p
    )
  })),
  
  // Combined feed helpers
  getAllFeeds: () => {
    const state = get();
    return [...state.localFeeds, ...state.remoteFeeds];
  },
  getFeedByFeedId: (feedId) => {
    const state = get();
    return [...state.localFeeds, ...state.remoteFeeds].find(f => f.feedId === feedId);
  },
  getFeedsByUserId: (userId) => {
    const state = get();
    return [...state.localFeeds, ...state.remoteFeeds].filter(f => f.userId === userId);
  },
  
  // Actions for media session
  setMediaSession: (mediaSession) => set({ mediaSession }),
  
  // Actions for media room
  setMediaRoom: (mediaRoom) => set({ mediaRoom }),
  
  // Actions for room loading status
  setRoomLoadingStatus: (status) => set({ roomLoadingStatus: status }),
  updateRoomLoadingStatus: (updates) => set((state) => ({
    roomLoadingStatus: { ...state.roomLoadingStatus, ...updates }
  })),
  
  // Actions for room manager
  setRoomManager: (roomManager) => set({ roomManager }),
  
  // Actions for reactions
  addReaction: (reaction) => set((state) => ({
    reactions: [...state.reactions, { ...reaction, id: Date.now() + Math.random() }]
  })),
  removeReaction: (reactionId) => set((state) => ({
    reactions: state.reactions.filter(r => r.id !== reactionId)
  })),
  
  // Actions for notifications
  addNotification: (notification) => set((state) => ({
    notifications: [...state.notifications, { ...notification, id: Date.now() + Math.random() }]
  })),
  removeNotification: (notificationId) => set((state) => ({
    notifications: state.notifications.filter(n => n.id !== notificationId)
  })),
  
  // Reset store
  resetStore: () => set({
    room: null,
    user: null,
    members: [],
    messages: [],
    localFeeds: [],
    remoteFeeds: [],
    conferenceState: {
      step: "pending",
      joinedConference: false,
      joinRequestState: { isLoading: false, error: null },
    },
    peers: new Map(),
    localPeers: [],
    remotePeers: [],
    mediaSession: null,
    mediaRoom: null,
    roomLoadingStatus: {
      loading: false,
      error: null,
      step: "creating-room",
    },
    roomManager: null,
    reactions: [],
    notifications: [],
    streamStats: new Map(),
    statsHistory: new Map(),
    statsVisibility: new Map()
  })
}))

export default useStore
