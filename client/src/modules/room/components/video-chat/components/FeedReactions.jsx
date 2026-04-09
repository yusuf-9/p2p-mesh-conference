import { useEffect } from "react";
import useStore from "../../../../../store";

const FeedReaction = ({ reaction, onRemove }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onRemove(reaction.id);
    }, 3000); // Remove after 3 seconds

    return () => clearTimeout(timer);
  }, [reaction.id, onRemove]);

  return (
    <div
      className="absolute top-2 left-2 z-20 pointer-events-none animate-fade-bounce text-4xl"
      style={{
        animation: "fadeAndBounce 3s ease-out forwards"
      }}
    >
      {reaction.emoji}
    </div>
  );
};

const FeedReactions = ({ feedId }) => {
  const { reactions, removeReaction } = useStore();
  
  // Filter reactions for this specific feed
  const feedReactions = reactions.filter(reaction => reaction.feedId === feedId);

  return (
    <>
      {feedReactions.map((reaction) => (
        <FeedReaction
          key={reaction.id}
          reaction={reaction}
          onRemove={removeReaction}
        />
      ))}
      
      <style jsx>{`
        @keyframes fadeAndBounce {
          0% {
            transform: scale(0.5);
            opacity: 0;
          }
          15% {
            transform: scale(1.2);
            opacity: 1;
          }
          30% {
            transform: scale(1);
            opacity: 1;
          }
          85% {
            transform: scale(1);
            opacity: 1;
          }
          100% {
            transform: scale(0.8);
            opacity: 0;
          }
        }
        
        .animate-fade-bounce {
          animation: fadeAndBounce 3s ease-out forwards;
        }
      `}</style>
    </>
  );
};

export default FeedReactions;