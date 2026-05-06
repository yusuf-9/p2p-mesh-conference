const API_URL = import.meta.env.VITE_API_URL

export async function fetchRooms() {
  const res = await fetch(`${API_URL}/stats/rooms`);
  if (!res.ok) throw new Error("Failed to fetch rooms");
  const data = await res.json();
  return data.rooms;
}

export async function fetchRoomSessions(roomId) {
  const res = await fetch(`${API_URL}/stats/rooms/${roomId}/sessions`);
  if (!res.ok) throw new Error("Failed to fetch sessions");
  const data = await res.json();
  return data.sessions;
}

export async function fetchSessionHandles(sessionId) {
  const res = await fetch(`${API_URL}/stats/sessions/${sessionId}/handles`);
  if (!res.ok) throw new Error("Failed to fetch handles");
  const data = await res.json();
  return data.handles;
}

export async function fetchHandleStats(handleId, type = null) {
  const url = new URL(`${API_URL}/stats/handles/${handleId}/stats`);
  if (type) url.searchParams.set("type", type);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Failed to fetch stats");
  const data = await res.json();
  return data.stats;
}

export async function fetchHandleHealthMetrics(handleId) {
  const res = await fetch(`${API_URL}/stats/handles/${handleId}/stats/health`);
  if (!res.ok) throw new Error("Failed to fetch health metrics");
  const data = await res.json();
  return data.chartData;
}
