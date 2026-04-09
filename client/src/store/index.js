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
  
  // Call State 
  callState: {
    isInCall: false,
    isAudioEnabled: true,
    isVideoEnabled: true,
    joinRequestState: { isLoading: false, error: null },
  },

  // Video Call Streams
  localStreams: [], // Array of local stream objects
  remoteStreams: [], // Array of remote stream objects
  screenShareStream: null, // Local screen share MediaStream (when active)
  
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
  
  
  // Actions for call state
  setCallState: (callState) => set({ callState }),
  updateCallState: (updates) => set((state) => ({
    callState: { ...state.callState, ...updates }
  })),

  // Actions for streams
  setLocalStreams: (streams) => set({ localStreams: streams }),
  setRemoteStreams: (streams) => set({ remoteStreams: streams }),
  
  addLocalStream: (stream) => set((state) => ({
    localStreams: [...state.localStreams, stream]
  })),
  
  addRemoteStream: (stream) => set((state) => ({
    remoteStreams: [...state.remoteStreams, stream]
  })),
  
  updateLocalStream: (streamId, updates) => set((state) => ({
    localStreams: state.localStreams.map(stream => 
      stream.id === streamId ? { ...stream, ...updates } : stream
    )
  })),
  
  updateRemoteStream: (streamId, updates) => set((state) => ({
    remoteStreams: state.remoteStreams.map(stream => 
      stream.id === streamId ? { ...stream, ...updates } : stream
    )
  })),
  
  removeLocalStream: (streamId) => set((state) => ({
    localStreams: state.localStreams.filter(stream => stream.id !== streamId)
  })),
  
  removeRemoteStream: (streamId) => set((state) => ({
    remoteStreams: state.remoteStreams.filter(stream => stream.id !== streamId)
  })),

  clearAllStreams: () => set({
    localStreams: [],
    remoteStreams: [],
    screenShareStream: null,
  }),

  setScreenShareStream: (stream) => set({ screenShareStream: stream }),
  
  
  // Helper functions
  isUserInCall: (userId) => {
    const state = get();
    return state.members.find(m => m.id === userId)?.joinedCall || false;
  },
  
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
    callState: {
      isInCall: false,
      isAudioEnabled: true,
      isVideoEnabled: true,
      joinRequestState: { isLoading: false, error: null },
    },
    localStreams: [],
    remoteStreams: [],
    roomLoadingStatus: {
      loading: false,
      error: null,
      step: "creating-room",
    },
    roomManager: null,
    reactions: [],
    notifications: []
  }),
  
  // Clean up call connections
  cleanupCallConnections: () => set({
    callState: {
      isInCall: false,
      isAudioEnabled: true,
      isVideoEnabled: true,
      joinRequestState: { isLoading: false, error: null },
    },
    localStreams: [],
    remoteStreams: [],
    screenShareStream: null,
  })
}))

export default useStore