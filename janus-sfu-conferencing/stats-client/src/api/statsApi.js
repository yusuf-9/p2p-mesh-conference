const API_URL = import.meta.env.VITE_API_URL;

async function request(path) {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export function fetchRooms() {
  return request('/stats/rooms');
}

export function fetchRoomUsers(roomId) {
  return request(`/stats/rooms/${roomId}/users`);
}

export function fetchUserProcessed(userId) {
  return request(`/stats/users/${userId}/processed`);
}
