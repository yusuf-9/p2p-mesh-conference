import { useEffect } from "react";
import { Routes, Route, useParams, Navigate } from "react-router-dom";
import useStatsStore from "./store/statsStore";
import BackButton from "./components/common/BackButton";
import RoomList from "./components/RoomList";
import SessionList from "./components/SessionList";
import ParticipantAccordion from "./components/ParticipantAccordion";
import HandleStats from "./components/HandleStats";

function RoomsPage() {
  const loadRooms = useStatsStore((s) => s.loadRooms);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  return (
    <>
      <h2>Rooms</h2>
      <RoomList />
    </>
  );
}

function SessionsPage() {
  const { roomId } = useParams();
  const loadSessions = useStatsStore((s) => s.loadSessions);

  useEffect(() => {
    loadSessions(roomId);
  }, [roomId, loadSessions]);

  return (
    <>
      <h2>Sessions</h2>
      <SessionList roomId={roomId} />
    </>
  );
}

function ParticipantsPage() {
  const { roomId, sessionId } = useParams();
  const loadHandles = useStatsStore((s) => s.loadHandles);

  useEffect(() => {
    loadHandles(sessionId);
  }, [sessionId, loadHandles]);

  return (
    <>
      <h2>Participants</h2>
      <ParticipantAccordion roomId={roomId} sessionId={sessionId} />
    </>
  );
}

function HandleStatsPage() {
  const { roomId, sessionId, handleId } = useParams();

  useEffect(() => {
    useStatsStore.getState().loadHandleStats(roomId, sessionId, handleId);
  }, [roomId, sessionId, handleId]);

  return (
    <>
      <h2>Handle Stats</h2>
      <HandleStats />
    </>
  );
}

export default function App() {
  useEffect(() => {
    useStatsStore.getState().loadRooms();
  }, []);

  return (
    <div className="stats-container">
      <h1>Conference Stats Viewer</h1>
      <BackButton />
      <Routes>
        <Route path="/" element={<RoomsPage />} />
        <Route path="/room/:roomId" element={<SessionsPage />} />
        <Route path="/room/:roomId/session/:sessionId" element={<ParticipantsPage />} />
        <Route path="/room/:roomId/session/:sessionId/handle/:handleId" element={<HandleStatsPage />} />
      </Routes>
    </div>
  );
}