import { create } from "zustand";
import * as statsApi from "../api/statsApi";

const useStatsStore = create((set, get) => ({
  // Data
  rooms: [],
  sessions: [],
  handles: [],
  stats: [],
  healthChartData: [],

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

  async selectRoom(roomId) {
    set({ selectedRoomId: roomId, selectedSessionId: null, selectedHandleId: null, sessions: [], handles: [], stats: [], healthChartData: [] });
    if (!roomId) return;
    set({ loadingSessions: true });
    try {
      const sessions = await statsApi.fetchRoomSessions(roomId);
      set({ sessions, loadingSessions: false });
    } catch (err) {
      console.error(err);
      set({ loadingSessions: false });
    }
  },

  async selectSession(sessionId) {
    set({ selectedSessionId: sessionId, selectedHandleId: null, handles: [], stats: [], healthChartData: [] });
    if (!sessionId) return;
    set({ loadingHandles: true });
    try {
      const handles = await statsApi.fetchSessionHandles(sessionId);
      set({ handles, loadingHandles: false });
    } catch (err) {
      console.error(err);
      set({ loadingHandles: false });
    }
  },

  async selectHandle(handleId) {
    set({ selectedHandleId: handleId, stats: [], healthChartData: [] });
    if (!handleId) return;
    set({ loadingStats: true });
    try {
      const [stats, healthChartData] = await Promise.all([
        statsApi.fetchHandleStats(handleId),
        statsApi.fetchHandleHealthMetrics(handleId),
      ]);
      set({ stats, healthChartData, loadingStats: false });
    } catch (err) {
      console.error(err);
      set({ loadingStats: false });
    }
  },

  clearSelection() {
    set({
      selectedRoomId: null,
      selectedSessionId: null,
      selectedHandleId: null,
      sessions: [],
      handles: [],
      stats: [],
      healthChartData: [],
    });
  },
}));

export default useStatsStore;
