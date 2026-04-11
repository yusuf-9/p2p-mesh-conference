# Media Server with Drizzle ORM

This server uses Drizzle ORM for database operations with PostgreSQL, following an OOP service pattern.

## Architecture

The server follows a service-oriented architecture similar to the simple-videoroom implementation:

```
src/
├── core/
│   └── database/
│       ├── index.ts          # DatabaseService class
│       ├── schema.ts         # Database schema definitions
│       ├── types.ts          # TypeScript type definitions
│       ├── migrate.ts        # Migration runner
│       └── migrations/       # Generated migration files
├── index.ts                  # Main server file
```

## Database Service

The `DatabaseService` class provides a clean OOP interface for all database operations:

### Key Features:
- **Connection Management** - Automatic connection handling and cleanup
- **Type Safety** - Full TypeScript support with inferred types
- **Error Handling** - Comprehensive error handling for all operations
- **Method Organization** - Grouped methods by entity (Admin, Room, User, etc.)

### Usage Example:

```typescript
import DatabaseService from './core/database/index.js';

const dbService = new DatabaseService();

// Create a room
const room = await dbService.createRoom('My Room', 'Room description');

// Get all users in a room
const users = await dbService.getUsersByRoomId(room.id);

// Test connection
const isConnected = await dbService.testConnection();
```

## Database Schema

The database includes the following tables:

### Core Tables
- **admins** - System administrators
- **api_keys** - API authentication keys with expiration
- **rooms** - Chat/media rooms with host management
- **users** - Room participants with audio/video settings
- **messages** - Chat messages with edit support

### Media Tables
- **media_rooms** - Janus Gateway room mappings
- **media_sessions** - WebRTC session tracking
- **media_handles** - Publisher/Subscriber handle management

## Available Scripts

```bash
# Generate migrations from schema changes
npm run db:generate

# Run migrations
npm run db:migrate

# Push schema directly to database (development only)
npm run db:push

# Open Drizzle Studio (database GUI)
npm run db:studio
```

## API Endpoints

### Health Checks
- `GET /health` - Server health check
- `GET /health/db` - Database connection health check

### Room Management
- `GET /api/rooms` - List all active rooms
- `POST /api/rooms` - Create a new room
- `GET /api/rooms/:roomId/users` - List users in a room
- `POST /api/rooms/:roomId/users` - Add user to a room
- `GET /api/rooms/:roomId/messages` - Get room messages

### Example Requests

**Create a room:**
```bash
curl -X POST http://localhost:3000/api/rooms \
  -H "Content-Type: application/json" \
  -d '{"name": "My Room", "description": "A test room"}'
```

**Add user to room:**
```bash
curl -X POST http://localhost:3000/api/rooms/{roomId}/users \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe", "audioEnabled": true, "videoEnabled": false}'
```

## Database Service Methods

### Connection Management
- `testConnection()` - Test database connectivity
- `closeConnection()` - Close database connection

### Admin Operations
- `createAdmin(email, hashedPassword)` - Create new admin
- `getAdminByEmail(email)` - Find admin by email

### API Key Operations
- `createApiKey(name, description, value, expiresAt?)` - Create API key
- `getApiKeyByValue(value)` - Validate API key
- `deactivateApiKey(id)` - Deactivate API key

### Room Operations
- `createRoom(name, description?, hostId?, maxParticipants?)` - Create room
- `getRoomById(id)` - Get room by ID
- `getAllRooms()` - Get all active rooms
- `updateRoom(id, updates)` - Update room details
- `deactivateRoom(id)` - Deactivate room

### User Operations
- `createUser(roomId, name, audioEnabled?, videoEnabled?)` - Add user to room
- `getUserById(id)` - Get user by ID
- `getUsersByRoomId(roomId)` - Get room users
- `updateUser(id, updates)` - Update user settings
- `deleteUser(id)` - Remove user

### Message Operations
- `createMessage(roomId, userId, content)` - Send message
- `getMessagesByRoomId(roomId, limit?)` - Get room messages
- `updateMessage(id, content)` - Edit message

### Media Operations
- `createMediaRoom(roomId, janusRoomId?)` - Create media room
- `createMediaSession(roomId, mediaRoomId, sessionId?)` - Create session
- `createMediaHandle(roomId, mediaRoomId, userId, type, handleId?)` - Create handle
- Various getter and management methods for media entities

## Usage

1. **Start the services** (includes PostgreSQL):
   ```bash
   ./start.sh
   ```

2. **Generate and run migrations**:
   ```bash
   npm run db:generate
   npm run db:migrate
   ```

3. **Test the API**:
   ```bash
   curl http://localhost:3000/health/db
   ```

## Development

Use Drizzle Studio for database management:
```bash
npm run db:studio
```

This opens a web interface at `http://localhost:4983` where you can view and edit your database.

## Schema Improvements Made

1. **Added missing timestamps** - All tables now have `created_at` and `updated_at`
2. **Added security features** - API keys have `is_active` and `expires_at` fields
3. **Added proper foreign key constraints** - With CASCADE/SET NULL on delete
4. **Added validation** - Proper data types and constraints
5. **Added Janus integration fields** - For media server integration
6. **Added status tracking** - `is_active` fields for soft deletes 