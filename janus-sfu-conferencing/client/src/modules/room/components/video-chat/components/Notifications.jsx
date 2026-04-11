import { useEffect } from "react";
import useStore from "../../../../../store";

const Notification = ({ notification, onRemove }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onRemove(notification.id);
    }, 5000); // Remove after 5 seconds

    return () => clearTimeout(timer);
  }, [notification.id, onRemove]);

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'moderation':
        return '🔨';
      case 'screenshot':
        return '📸';
      case 'warning':
        return '⚠️';
      default:
        return 'ℹ️';
    }
  };

  const getNotificationColor = (type) => {
    switch (type) {
      case 'moderation':
        return 'bg-red-600 border-red-500';
      case 'screenshot':
        return 'bg-blue-600 border-blue-500';
      case 'warning':
        return 'bg-yellow-600 border-yellow-500';
      default:
        return 'bg-slate-600 border-slate-500';
    }
  };

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 backdrop-blur-sm shadow-lg animate-slide-in ${getNotificationColor(notification.type)} text-white`}
    >
      <div className="text-xl">{getNotificationIcon(notification.type)}</div>
      <div className="flex-1">
        <div className="font-medium text-sm">{notification.title}</div>
        {notification.message && (
          <div className="text-xs opacity-90 mt-1">{notification.message}</div>
        )}
      </div>
      <button
        onClick={() => onRemove(notification.id)}
        className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

const Notifications = () => {
  const { notifications = [], removeNotification } = useStore();

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {notifications.map((notification) => (
        <Notification
          key={notification.id}
          notification={notification}
          onRemove={removeNotification}
        />
      ))}
      
      <style jsx>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default Notifications;