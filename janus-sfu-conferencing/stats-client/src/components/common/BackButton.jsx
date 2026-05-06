import useStatsStore from "../../store/statsStore";

export default function BackButton() {
  const selectedRoomId = useStatsStore((s) => s.selectedRoomId);
  const selectedSessionId = useStatsStore((s) => s.selectedSessionId);
  const clearSelection = useStatsStore((s) => s.clearSelection);
  const selectRoom = useStatsStore((s) => s.selectRoom);
  const selectSession = useStatsStore((s) => s.selectSession);

  if (!selectedRoomId) return null;

  const handleBack = () => {
    if (selectedSessionId) {
      selectSession(null);
    } else {
      clearSelection();
    }
  };

  return (
    <button className="back-button" onClick={handleBack}>
      ← Back
    </button>
  );
}
