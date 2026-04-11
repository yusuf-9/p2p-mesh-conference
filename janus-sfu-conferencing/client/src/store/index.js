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
  
  // Stream Statistics
  streamStats: new Map(), // feedId -> current stats object
  statsHistory: new Map(), // feedId -> array of historical stats
  statsVisibility: new Map(), // feedId -> boolean (show/hide stats)
  
  // Actions for room
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
  
  // Actions for stream statistics
  updateStreamStats: (feedId, stats) => set((state) => {
    const newStreamStats = new Map(state.streamStats);
    newStreamStats.set(feedId, stats);
    return { streamStats: newStreamStats };
  }),
  
  addStatsDataPoint: (feedId, stats) => set((state) => {
    const newStatsHistory = new Map(state.statsHistory);
    const history = newStatsHistory.get(feedId) || [];
    const maxHistoryPoints = 30; // Keep last 30 data points
    
    // Add new data point and limit history
    const updatedHistory = [...history, {
      timestamp: stats.timestamp,
      bitrate: stats.video?.bitrate || 0,
      framesPerSecond: stats.video?.framesPerSecond || 0,
      packetLossPercentage: stats.video?.packetLossPercentage || 0,
      jitter: stats.video?.jitter || stats.connectionStats?.roundTripTime || 0,
      frameWidth: stats.video?.frameWidth || 0,
      frameHeight: stats.video?.frameHeight || 0
    }].slice(-maxHistoryPoints);
    
    newStatsHistory.set(feedId, updatedHistory);
    return { statsHistory: newStatsHistory };
  }),
  
  toggleStatsVisibility: (feedId) => set((state) => {
    const newStatsVisibility = new Map(state.statsVisibility);
    const currentVisibility = newStatsVisibility.get(feedId) || false;
    newStatsVisibility.set(feedId, !currentVisibility);
    
    // Store in localStorage for persistence
    try {
      localStorage.setItem(`stats-visibility-${feedId}`, JSON.stringify(!currentVisibility));
    } catch (error) {
      console.warn('Failed to save stats visibility to localStorage:', error);
    }
    
    return { statsVisibility: newStatsVisibility };
  }),
  
  setStatsVisibility: (feedId, visible) => set((state) => {
    const newStatsVisibility = new Map(state.statsVisibility);
    newStatsVisibility.set(feedId, visible);
    
    // Store in localStorage for persistence
    try {
      localStorage.setItem(`stats-visibility-${feedId}`, JSON.stringify(visible));
    } catch (error) {
      console.warn('Failed to save stats visibility to localStorage:', error);
    }
    
    return { statsVisibility: newStatsVisibility };
  }),
  
  loadStatsVisibilityFromStorage: (feedId) => {
    try {
      const saved = localStorage.getItem(`stats-visibility-${feedId}`);
      if (saved !== null) {
        const visibility = JSON.parse(saved);
        set((state) => {
          const newStatsVisibility = new Map(state.statsVisibility);
          newStatsVisibility.set(feedId, visibility);
          return { statsVisibility: newStatsVisibility };
        });
        return visibility;
      }
    } catch (error) {
      console.warn('Failed to load stats visibility from localStorage:', error);
    }
    return null;
  },
  
  clearStreamStats: (feedId) => set((state) => {
    const newStreamStats = new Map(state.streamStats);
    const newStatsHistory = new Map(state.statsHistory);
    const newStatsVisibility = new Map(state.statsVisibility);
    
    newStreamStats.delete(feedId);
    newStatsHistory.delete(feedId);
    newStatsVisibility.delete(feedId);
    
    // Clean up localStorage
    try {
      localStorage.removeItem(`stats-visibility-${feedId}`);
    } catch (error) {
      console.warn('Failed to remove stats visibility from localStorage:', error);
    }
    
    return { 
      streamStats: newStreamStats, 
      statsHistory: newStatsHistory,
      statsVisibility: newStatsVisibility
    };
  }),
  
  clearAllStreamStats: () => set((state) => {
    // Clean up localStorage for all feed stats
    state.statsVisibility.forEach((_, feedId) => {
      try {
        localStorage.removeItem(`stats-visibility-${feedId}`);
      } catch (error) {
        console.warn('Failed to remove stats visibility from localStorage:', error);
      }
    });
    
    return { 
      streamStats: new Map(), 
      statsHistory: new Map(),
      statsVisibility: new Map()
    };
  }),
  
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