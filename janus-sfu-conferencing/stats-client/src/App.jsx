import { useEffect } from "react";
import useStatsStore from "./store/statsStore";
import BackButton from "./components/common/BackButton";
import RoomList from "./components/RoomList";
import SessionList from "./components/SessionList";
import ParticipantAccordion from "./components/ParticipantAccordion";
import HandleStats from "./components/HandleStats";

export default function App() {
  const loadRooms = useStatsStore((s) => s.loadRooms);
  const selectedRoomId = useStatsStore((s) => s.selectedRoomId);
  const selectedSessionId = useStatsStore((s) => s.selectedSessionId);
  const selectedHandleId = useStatsStore((s) => s.selectedHandleId);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  return (
    <div className="stats-container">
      <h1>Conference Stats Viewer</h1>

      <BackButton />

      {!selectedRoomId && (
        <>
          <h2>Rooms</h2>
          <RoomList />
        </>
      )}

      {selectedRoomId && !selectedSessionId && (
        <>
          <h2>Sessions</h2>
          <SessionList />
        </>
      )}

      {selectedSessionId && !selectedHandleId && (
        <>
          <h2>Participants</h2>
          <ParticipantAccordion />
        </>
      )}

      {selectedHandleId && (
        <>
          <h2>Handle Stats</h2>
          <HandleStats />
        </>
      )}
    </div>
  );
}
