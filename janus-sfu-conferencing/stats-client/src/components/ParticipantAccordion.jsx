import { useState, useEffect } from "react";
import useStatsStore from "../store/statsStore";
import HandleStats from "./HandleStats";
import * as statsApi from "../api/statsApi";

export default function ParticipantAccordion({ sessionId }) {
  const handles = useStatsStore((s) => s.handles);
  const loading = useStatsStore((s) => s.loadingHandles);

  const [expandedUserId, setExpandedUserId] = useState(null);
  const [expandedHandles, setExpandedHandles] = useState({});
  const [handleStatsMap, setHandleStatsMap] = useState({});
  const [loadingHandleIds, setLoadingHandleIds] = useState({});

  useEffect(() => {
    setExpandedHandles({});
    setHandleStatsMap({});
    setLoadingHandleIds({});
  }, [sessionId]);

  const toggleHandleExpand = async (handleId) => {
    const isCurrentlyExpanded = expandedHandles[handleId];
    
    if (!isCurrentlyExpanded && !handleStatsMap[handleId] && !loadingHandleIds[handleId]) {
      setLoadingHandleIds((prev) => ({ ...prev, [handleId]: true }));
      try {
        const stats = await statsApi.fetchHandleStats(handleId);
        setHandleStatsMap((prev) => ({ ...prev, [handleId]: stats }));
      } catch (err) {
        console.error("Failed to load handle stats:", err);
      } finally {
        setLoadingHandleIds((prev) => {
          const next = { ...prev };
          delete next[handleId];
          return next;
        });
      }
    }
    
    setExpandedHandles((prev) => ({
      ...prev,
      [handleId]: !prev[handleId],
    }));
  };

  const expandAllHandles = async (userHandles) => {
    const handlesToLoad = userHandles.filter((h) => !handleStatsMap[h.id] && !loadingHandleIds[h.id]);
    
    const loadingUpdates = {};
    handlesToLoad.forEach((h) => {
      loadingUpdates[h.id] = true;
    });
    setLoadingHandleIds((prev) => ({ ...prev, ...loadingUpdates }));
    
    await Promise.all(
      handlesToLoad.map(async (h) => {
        try {
          const stats = await statsApi.fetchHandleStats(h.id);
          setHandleStatsMap((prev) => ({ ...prev, [h.id]: stats }));
        } catch (err) {
          console.error("Failed to load handle stats:", err);
        }
      })
    );
    
    setLoadingHandleIds((prev) => {
      const next = { ...prev };
      handlesToLoad.forEach((h) => delete next[h.id]);
      return next;
    });
    
    const allExpanded = {};
    userHandles.forEach((h) => {
      allExpanded[h.id] = true;
    });
    setExpandedHandles((prev) => ({ ...prev, ...allExpanded }));
  };

  const collapseAllHandles = () => {
    setExpandedHandles({});
  };

  if (loading) return <div className="loading">Loading participants...</div>;
  if (!handles.length) return <div className="empty">No participants found.</div>;

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
        const userHandles = p.handles;
        const someExpanded = userHandles.some((h) => expandedHandles[h.id]);
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
                <div className="user-handle-controls">
                  <button
                    className="expand-all-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      expandAllHandles(userHandles);
                    }}
                  >
                    Expand All
                  </button>
                  <button
                    className="collapse-all-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      collapseAllHandles();
                    }}
                    disabled={!someExpanded}
                  >
                    Collapse All
                  </button>
                </div>
                {p.handles.map((h) => {
                  const isHandleExpanded = expandedHandles[h.id];
                  const isLoading = loadingHandleIds[h.id];
                  const stats = handleStatsMap[h.id];
                  return (
                    <div key={h.id} className="handle-item-wrapper">
                      <div
                        className="handle-item"
                        onClick={() => toggleHandleExpand(h.id)}
                      >
                        <span className="handle-type">{h.feedType || "camera"}</span>
                        <span className="handle-role">{h.type}</span>
                        {h.feedId && <span className="feed-id">Feed: {h.feedId}</span>}
                        <span className="handle-expand-toggle">
                          {isHandleExpanded ? "−" : "+"}
                        </span>
                      </div>
                      {isHandleExpanded && (
                        <div className="handle-item-stats">
                          {isLoading ? (
                            <div className="loading">Loading stats...</div>
                          ) : stats && stats.length > 0 ? (
                            <HandleStats stats={stats} />
                          ) : (
                            <div className="empty">No stats found for this handle.</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}