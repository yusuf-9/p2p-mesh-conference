import { useState } from 'react';

export function RoomForm({ onSubmit }) {
  const [mode, setMode] = useState(() => localStorage.getItem('roomForm_mode') || 'create');
  const [formData, setFormData] = useState(() => ({
    roomName: localStorage.getItem('roomForm_roomName') || '',
    roomId: localStorage.getItem('roomForm_roomId') || '',
    userName: localStorage.getItem('roomForm_userName') || '',
    apiKey: localStorage.getItem('roomForm_apiKey') || '',
    roomType: localStorage.getItem('roomForm_roomType') || 'group'
  }));

  const [errors, setErrors] = useState({
    roomName: '',
    roomId: '',
    userName: '',
    apiKey: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validate
    const newErrors = {
      roomName: '',
      roomId: '',
      userName: '',
      apiKey: ''
    };

    if (mode === 'create' && !formData.roomName.trim()) {
      newErrors.roomName = 'Room name is required';
    }

    if (mode === 'join' && !formData.roomId.trim()) {
      newErrors.roomId = 'Room ID is required';
    }

    if (!formData.userName.trim()) {
      newErrors.userName = 'User name is required';
    }

    if (!formData.apiKey.trim()) {
      newErrors.apiKey = 'API key is required';
    }

    setErrors(newErrors);

    const hasErrors = Object.values(newErrors).some(error => error !== '');
    if (!hasErrors) {
      // Form is valid, handle submission
      onSubmit({
        roomName: mode === 'create' ? formData.roomName : undefined,
        roomId: mode === 'join' ? formData.roomId : undefined,
        userName: formData.userName,
        apiKey: formData.apiKey,
        roomType: mode === 'create' ? formData.roomType : undefined,
        mode
      });
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? (checked ? 'one_to_one' : 'group') : value;
    setFormData((prev) => ({
      ...prev,
      [name]: newValue
    }));
    localStorage.setItem(`roomForm_${name}`, newValue);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Mode Toggle */}
      <div className="flex space-x-2">
        <button
          type="button"
          onClick={() => {
            setMode('create');
            localStorage.setItem('roomForm_mode', 'create');
          }}
          className={`flex-1 py-2 px-4 rounded text-sm font-medium ${
            mode === 'create'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
          }`}
        >
          Create Room
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('join');
            localStorage.setItem('roomForm_mode', 'join');
          }}
          className={`flex-1 py-2 px-4 rounded text-sm font-medium ${
            mode === 'join'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
          }`}
        >
          Join Room
        </button>
      </div>

      {/* Room Name or Room ID */}
      {mode === 'create' ? (
        <div>
          <label htmlFor="roomName" className="block text-sm font-medium text-gray-300 mb-1">
            Room Name
          </label>
          <input
            type="text"
            id="roomName"
            name="roomName"
            value={formData.roomName}
            onChange={handleChange}
            className="w-full bg-gray-700 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter room name"
          />
          {errors.roomName && (
            <p className="text-red-400 text-sm mt-1">{errors.roomName}</p>
          )}
        </div>
      ) : (
        <div>
          <label htmlFor="roomId" className="block text-sm font-medium text-gray-300 mb-1">
            Room ID
          </label>
          <input
            type="text"
            id="roomId"
            name="roomId"
            value={formData.roomId}
            onChange={handleChange}
            className="w-full bg-gray-700 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter room ID"
          />
          {errors.roomId && (
            <p className="text-red-400 text-sm mt-1">{errors.roomId}</p>
          )}
        </div>
      )}

      {/* Room Type Checkbox - Only show for create mode */}
      {mode === 'create' && (
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="roomType"
            name="roomType"
            checked={formData.roomType === 'one_to_one'}
            onChange={handleChange}
            className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
          />
          <label htmlFor="roomType" className="text-sm font-medium text-gray-300">
            One-to-one room (max 2 participants)
          </label>
        </div>
      )}

      <div>
        <label htmlFor="userName" className="block text-sm font-medium text-gray-300 mb-1">
          Your Name
        </label>
        <input
          type="text"
          id="userName"
          name="userName"
          value={formData.userName}
          onChange={handleChange}
          className="w-full bg-gray-700 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter your name"
        />
        {errors.userName && (
          <p className="text-red-400 text-sm mt-1">{errors.userName}</p>
        )}
      </div>

      {/* API Key */}
      <div>
        <label htmlFor="apiKey" className="block text-sm font-medium text-gray-300 mb-1">
          API Key
        </label>
        <input
          type="text"
          id="apiKey"
          name="apiKey"
          value={formData.apiKey}
          onChange={handleChange}
          className="w-full bg-gray-700 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter API key"
        />
        {errors.apiKey && (
          <p className="text-red-400 text-sm mt-1">{errors.apiKey}</p>
        )}
      </div>

      <button 
        type="submit"
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {mode === 'create' ? 'Create & Join Room' : 'Join Room'}
      </button>
    </form>
  );
}