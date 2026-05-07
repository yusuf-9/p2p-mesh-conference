import { create } from "zustand";
import * as statsApi from "../api/statsApi";

const useStatsStore = create((set, get) => ({
  // Data
  rooms: [],
  sessions: [],
  handles: [],
  stats: [],

  // Selection
  selectedRoomId: null,
  selectedSessionId: null,
  selectedHandleId: null,

  // Loading states
  loadingRooms: false,
  loadingSessions: false,
  loadingHandles: false,
  loadingStats: false,

  // Actions
  async loadRooms() {
    set({ loadingRooms: true });
    try {
      const rooms = await statsApi.fetchRooms();
      set({ rooms, loadingRooms: false });
    } catch (err) {
      console.error(err);
      set({ loadingRooms: false });
    }
  },

  async loadSessions(roomId) {
    set({ loadingSessions: true });
    try {
      const sessions = await statsApi.fetchRoomSessions(roomId);
      set({ sessions, loadingSessions: false });
    } catch (err) {
      console.error(err);
      set({ loadingSessions: false });
    }
  },

  async selectRoom(roomId) {
    set({ selectedRoomId: roomId, selectedSessionId: null, selectedHandleId: null, sessions: [], handles: [], stats: [] });
    if (!roomId) return;
    await get().loadSessions(roomId);
  },

  async loadHandles(sessionId) {
    set({ loadingHandles: true });
    try {
      const handles = await statsApi.fetchSessionHandles(sessionId);
      set({ handles, loadingHandles: false });
    } catch (err) {
      console.error(err);
      set({ loadingHandles: false });
    }
  },

  async selectSession(sessionId) {
    set({ selectedSessionId: sessionId, selectedHandleId: null, handles: [], stats: [] });
    if (!sessionId) return;
    await get().loadHandles(sessionId);
  },

  async loadHandleStats(roomId, sessionId, handleId) {
    set({ selectedRoomId: roomId, selectedSessionId: sessionId, selectedHandleId: handleId, loadingStats: true });
    try {
      const stats = await statsApi.fetchHandleStats(handleId);
      set({ stats, loadingStats: false });
    } catch (err) {
      console.error(err);
      set({ loadingStats: false });
    }
  },

  async selectHandle(handleId) {
    set({ selectedHandleId: handleId, stats: [] });
    if (!handleId) return;
    await get().loadHandleStats(null, null, handleId);
  },

  clearSelection() {
    set({
      selectedRoomId: null,
      selectedSessionId: null,
      selectedHandleId: null,
      sessions: [],
      handles: [],
      stats: [],
    });
  },
}));

export default useStatsStore;
