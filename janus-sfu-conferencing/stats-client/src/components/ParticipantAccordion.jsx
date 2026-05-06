import { useState } from "react";
import useStatsStore from "../store/statsStore";

export default function ParticipantAccordion() {
  const handles = useStatsStore((s) => s.handles);
  const loading = useStatsStore((s) => s.loadingHandles);
  const selectHandle = useStatsStore((s) => s.selectHandle);

  const [expandedUserId, setExpandedUserId] = useState(null);

  if (loading) return <div className="loading">Loading participants...</div>;
  if (!handles.length) return <div className="empty">No participants found.</div>;

  // Group handles by userId
  const participantsMap = {};
  handles.forEach((h) => {
    const uid = h.userId || "unknown";
    if (!participantsMap[uid]) {
      participantsMap[uid] = {
        userId: uid,
        userName: h.userName || "Unknown User",
        handles: [],
      };
    }
    participantsMap[uid].handles.push(h);
  });

  const participants = Object.values(participantsMap);

  return (
    <div className="participant-accordion">
      {participants.map((p) => {
        const isExpanded = expandedUserId === p.userId;
        return (
          <div key={p.userId} className="accordion-item">
            <div
              className="accordion-header"
              onClick={() => setExpandedUserId(isExpanded ? null : p.userId)}
            >
              <span className="participant-name">{p.userName}</span>
              <span className="handle-count">({p.handles.length} handles)</span>
              <span className="accordion-toggle">{isExpanded ? "−" : "+"}</span>
            </div>
            {isExpanded && (
              <div className="accordion-content">
                {p.handles.map((h) => (
                  <div
                    key={h.id}
                    className="handle-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      selectHandle(h.id);
                    }}
                  >
                    <span className="handle-type">{h.feedType || "camera"}</span>
                    <span className="handle-role">{h.type}</span>
                    {h.feedId && <span className="feed-id">Feed: {h.feedId}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
