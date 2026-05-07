import { useNavigate, useParams } from "react-router-dom";

export default function BackButton() {
  const navigate = useNavigate();
  const { roomId, sessionId, handleId } = useParams();

  if (!roomId) return null;

  const handleBack = () => {
    if (handleId) {
      navigate(`/room/${roomId}/session/${sessionId}`);
    } else if (sessionId) {
      navigate(`/room/${roomId}`);
    } else {
      navigate("/");
    }
  };

  return (
    <button className="back-button" onClick={handleBack}>
      ← Back
    </button>
  );
}