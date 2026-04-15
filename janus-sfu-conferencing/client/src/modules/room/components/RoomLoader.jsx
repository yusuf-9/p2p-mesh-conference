import { useCallback, useEffect } from 'react';
import useStore from '../../../store';
import RoomManager from '../services/RoomManager';

export function RoomLoader({ roomParams }) {
  const {
    setRoom,
    setUser,
    setUserToken,
    setMembers,
    setMessages,
    updateRoomLoadingStatus,
    setRoomManager,
    roomManager
  } = useStore();

  // Initialize room manager if it doesn't exist
  useEffect(() => {
    if (!roomManager) {
      setRoomManager(new RoomManager());
    }
  }, [roomManager, setRoomManager]);

  const createRoom = useCallback(async () => {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/room/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: roomParams.roomName,
        description: `Room created by ${roomParams.userName}`,
        type: roomParams.roomType
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to create room");
    }

    return data.data.id;
  }, [roomParams.roomName, roomParams.userName]);

  const getRoomData = useCallback(async (roomId) => {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/room/${roomId}`, {
      method: "GET",
    });

    const data = await response.json();
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("Room not found. Please check the room ID and try again.");
      }
      throw new Error(data.error || "Failed to fetch room data");
    }

    return data.data;
  }, []);

  const joinRoom = useCallback(async (roomId) => {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/room/${roomId}/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: roomParams.userName }),
    });

    const data = await response.json();
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("Room not found. Please check the room ID and try again.");
      }
      if (response.status === 409) {
        throw new Error(data.error || "Unable to join room. It may be full or have a duplicate name.");
      }
      throw new Error(data.error || "Failed to join room");
    }

    return {
      user: {
        id: data.data.user.id,
        roomId: data.data.user.roomId,
        name: data.data.user.name,
        connected: data.data.user.connected,
        joinedCall: data.data.user.joinedCall || false,
        createdAt: data.data.user.createdAt,
        updatedAt: data.data.user.updatedAt,
        isHost: data.data.isHost,
      },
      token: data.data.token,
      isHost: data.data.isHost
    };
  }, [roomParams.userName]);

  const joinRoomAndConnectToSocket = useCallback(async () => {
    try {
      updateRoomLoadingStatus({
        loading: true,
        error: null,
        step: roomParams.mode === 'create' ? "creating-room" : "joining-room",
      });

      let roomId;
      let roomDataFromServer = null;
      let joinResponse;

      if (roomParams.mode === 'create') {
        // Create room first
        updateRoomLoadingStatus({
          step: "creating-room",
        });
        roomId = await createRoom();

        // Then join the created room
        updateRoomLoadingStatus({
          step: "joining-room",
        });
        joinResponse = await joinRoom(roomId);

        // Fetch room data to get complete room information with messages and members
        roomDataFromServer = await getRoomData(roomId);
      } else {
        // Direct join existing room
        if (!roomParams.roomId) {
          throw new Error("Room ID is required for joining existing room");
        }

        // First join the room to add the user to the room
        joinResponse = await joinRoom(roomParams.roomId);
        roomId = roomParams.roomId;

        // Then fetch fresh room data to get complete information including the current user
        roomDataFromServer = await getRoomData(roomParams.roomId);
      }

      // Set data in store
      const roomData = {
        id: roomDataFromServer.room.id,
        name: roomDataFromServer.room.name,
        description: roomDataFromServer.room.description,
        hostId: roomDataFromServer.room.hostId,
        createdAt: roomDataFromServer.room.createdAt,
        updatedAt: roomDataFromServer.room.updatedAt,
      };

      const members = roomDataFromServer.users?.map((user) => ({
        id: user.id,
        roomId: user.roomId,
        name: user.name,
        connected: user.connected,
        joinedCall: user.joinedCall,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        isHost: user.id === roomDataFromServer.room.hostId,
      })) || [];

      const messages = roomDataFromServer.messages?.map((msg) => ({
        ...msg,
        createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : msg.createdAt,
        updatedAt: msg.updatedAt instanceof Date ? msg.updatedAt.toISOString() : msg.updatedAt,
      })) || [];

      setRoom(roomData);
      setUser(joinResponse.user);
      setUserToken(joinResponse.token);
      setMembers(members);
      setMessages(messages);

      // Now connect to WebSocket
      updateRoomLoadingStatus({
        step: "connecting-to-socket",
      });

      if (joinResponse && joinResponse.user && joinResponse.token) {
        console.log("🔌 Attempting WebSocket connection with:", {
          roomId,
          userId: joinResponse.user.id,
          hasToken: !!joinResponse.token,
        });

        await roomManager.connectToWebSocket(joinResponse.token);
        console.log("✅ WebSocket connection successful");
      } else {
        throw new Error("Missing user token or user data for WebSocket connection");
      }

      updateRoomLoadingStatus({
        step: "connected-to-socket",
        loading: false,
      });
    } catch (error) {
      console.error("❌ Error in joinRoomAndConnectToSocket:", error);
      updateRoomLoadingStatus({
        error: error instanceof Error ? error.message : "An unknown error occurred",
        loading: false,
      });
    }
  }, [roomParams, createRoom, joinRoom, getRoomData, roomManager, setRoom, setUser, setUserToken, setMembers, setMessages, updateRoomLoadingStatus]);

  useEffect(() => {
    if (roomManager) {
      joinRoomAndConnectToSocket();
    }
  }, [roomManager, joinRoomAndConnectToSocket]);

  return null;
}
