import { useState } from "react";
import { generateUUID } from "../../utils";
import useStore from "../../../../store";

function ChatMessage({ message: msg, members, isOwnMessage }) {
  return (
    <div className="group">
      <div className={`flex items-start space-x-3`}>
        <div className="w-9 h-9 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg">
          <span className="text-white text-sm font-semibold">
            {members.find(member => member.id === msg.userId)?.name.substring(0, 2).toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className={`flex items-baseline space-x-2`}>
            <span className="font-semibold text-white text-sm">
              {members.find(member => member.id === msg.userId)?.name}
            </span>
            <span className="text-xs text-slate-400">{new Date(msg.createdAt).toLocaleTimeString()}</span>
            {msg.pending && (
              <div className="animate-spin h-3 w-3">
                <svg
                  className="text-slate-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              </div>
            )}
          </div>
          <div className={`mt-1.5 bg-slate-700/60 backdrop-blur-sm border border-slate-600/50 px-4 py-2.5 text-slate-100 text-sm leading-relaxed shadow-lg transition-all duration-200 group-hover:bg-slate-700/70 ${isOwnMessage
            ? 'rounded-xl rounded-tr-sm'
            : 'rounded-xl rounded-tl-sm'
            }`}>
            {msg.content}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChatMessages() {
  const { messages, user, members, roomManager, addMessage } = useStore();
  const [message, setMessage] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!message.trim() || !roomManager) return;

    const tempMessage = {
      id: generateUUID(),
      userId: user.id,
      content: message,
      roomId: user.roomId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pending: true
    };

    // Add optimistic message to store
    addMessage(tempMessage);

    // Send message via room manager with temp ID for tracking
    roomManager.sendChatMessage(message, tempMessage.id);
    
    setMessage("");
  };

  return (
    <div className="h-full flex flex-col">
      {/* Chat header */}
      <div className="mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-white">Chat</h2>
          <div className="flex-1"></div>
          <div className="text-xs text-slate-400 bg-slate-700/60 backdrop-blur-sm border border-slate-600/50 px-3 py-1.5 rounded-full shadow-sm">
            {messages.length} messages
          </div>
        </div>
      </div>

      {/* Messages container */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800">
        {messages.map(msg => (
          <ChatMessage
            key={msg.id}
            message={msg}
            members={members}
            isOwnMessage={msg.userId === user.id}
          />
        ))}
      </div>

      {/* Message input */}
      <form
        onSubmit={handleSubmit}
        className="mt-4"
      >
        <div className="flex space-x-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Type a message..."
              className="w-full bg-slate-700/60 backdrop-blur-sm border border-slate-600/50 text-white rounded-xl px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-slate-700/70 focus:border-violet-500/50 transition-all placeholder-slate-400 shadow-lg"
            />
            <button
              type="submit"
              disabled={!message.trim()}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 w-8 h-8 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 disabled:from-slate-600 disabled:to-slate-600 rounded-lg flex items-center justify-center transition-all duration-200 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              <svg
                className="w-4 h-4 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}