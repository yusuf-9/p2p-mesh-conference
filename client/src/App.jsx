import { useState, useEffect } from "react";
import { RoomForm } from "./components/RoomForm";
import Room from "./modules/room";

function App() {
  const [roomData, setRoomData] = useState(null);
  
  // Parse URL parameters for direct room joining
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room_id');
    const apiKey = urlParams.get('api_key');
    
    if (roomId && apiKey) {
      // Generate random username for URL-based joins
      const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
      const guestUsername = `Guest_${randomSuffix}`;
      
      // Auto-join with URL parameters
      const autoJoinData = {
        roomId,
        userName: guestUsername,
        apiKey,
        mode: 'join',
        joinCallAutomatically: true
      };
      
      setRoomData(autoJoinData);
      console.log("🔗 Auto-joining room from URL:", { roomId, username: guestUsername });
    }
  }, []);

  const handleRoomJoin = (data) => {
    setRoomData(data);
  };

  if (!roomData) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="container mx-auto px-4 h-full">
          <div className="flex justify-center items-center min-h-screen">
            <div className="w-full max-w-md bg-gray-800 rounded-lg shadow-lg p-6">
              <h1 className="text-2xl font-bold text-center mb-6">Join Video Chat</h1>
              <RoomForm onSubmit={handleRoomJoin} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 flex flex-col items-center justify-center">
      <Room roomParams={roomData} />
    </div>
  );
}

export default App
