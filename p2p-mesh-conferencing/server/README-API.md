# Media Server API Documentation

## Overview

The Media Server API provides comprehensive endpoints for managing video conferencing rooms, user authentication, and real-time communication. The API is built with Express.js, TypeScript, and includes full OpenAPI/Swagger documentation.

## API Documentation Access

Once the server is running, you can access the interactive API documentation at:

- **Swagger UI**: `http://localhost:3000/api/docs`
- **OpenAPI JSON**: `http://localhost:3000/api/docs.json`

## Authentication Flow

The API uses a multi-layered authentication system:

### 1. Super Admin Token Generation
```bash
# Generate a super admin token using the script
node scripts/create-super-admin-token.js
```

### 2. Admin User Management
- Use the super admin token to create admin users via `/api/super-admin/register`
- Admin users can login via `/api/admin/login` to get admin access tokens

### 3. API Key Creation
- Admin users create API keys via `/api/api-keys` using their admin access tokens
- API keys are used to access room management endpoints

### 4. Room Operations
- API keys are required for all room-related operations
- Users join rooms and receive user-level access tokens
- User tokens are used for room-level operations and WebSocket connections

### 5. WebSocket Connection
- User tokens are used to upgrade to WebSocket connections at `/api/socket`
- WebSocket connections enable real-time communication features

## Endpoint Categories

### Health Endpoints (`/api/health`)
- No authentication required
- Basic health check, database health, and detailed system information

### Super Admin Endpoints (`/api/super-admin`)
- Requires: Super Admin Token
- Register new admin users
- Reset admin passwords
- List all admin users

### Admin Endpoints (`/api/admin`)
- Admin login (no auth required)
- Change password (requires admin token)
- Get admin rooms (requires admin token)

### API Keys Endpoints (`/api/api-keys`)
- Requires: Admin Token
- Create, read, update, delete API keys
- Toggle API key active status

### Room Endpoints (`/api/room`)
- Various authentication requirements:
  - Create room: API Key
  - Join room: API Key + Room Ownership
  - Get room data: API Key + Room Ownership  
  - Update/Delete room: API Key + Room Ownership + User Token + Host Privileges
  - Leave room: API Key + Room Ownership + User Token

## Authentication Headers

### Super Admin Token
```
Authorization: Bearer <super-admin-jwt-token>
```

### Admin Token
```
Authorization: Bearer <admin-jwt-token>
```

### User Token
```
Authorization: Bearer <user-jwt-token>
```

### API Key
```
x-api-key: <api-key-value>
```

## Example Usage Flow

### 1. Initial Setup
```bash
# 1. Generate super admin token
node scripts/create-super-admin-token.js
# Output: Super admin token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2. Create Admin User
```bash
curl -X POST http://localhost:3000/api/super-admin/register \
  -H "Authorization: Bearer <super-admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "securepassword123"
  }'
```

### 3. Admin Login
```bash
curl -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com", 
    "password": "securepassword123"
  }'
# Returns: admin details and admin JWT token
```

### 4. Create API Key
```bash
curl -X POST http://localhost:3000/api/api-keys \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production API Key"
  }'
# Returns: API key details including the key value
```

### 5. Create Room
```bash
curl -X POST http://localhost:3000/api/room/create \
  -H "x-api-key: <api-key-value>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Weekly Team Meeting",
    "description": "Our weekly standup meeting room"
  }'
# Returns: Room details including room ID
```

### 6. Join Room
```bash
curl -X POST http://localhost:3000/api/room/<room-id>/join \
  -H "x-api-key: <api-key-value>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe"
  }'
# Returns: User details, user JWT token, and host status
```

### 7. WebSocket Connection
```javascript
// Use the user token from step 6 to connect to WebSocket
const ws = new WebSocket('ws://localhost:3000/api/socket', {
  headers: {
    'Authorization': `Bearer <user-token>`,
    'x-api-key': '<api-key-value>'
  }
});
```

## Error Handling

The API returns consistent error responses:

### Standard Error Response
```json
{
  "error": "Error message description"
}
```

### Validation Error Response
```json
{
  "error": "Validation failed",
  "details": {
    "type": "validation",
    "fields": [
      {
        "field": "email",
        "message": "Invalid email format", 
        "code": "invalid_string"
      }
    ]
  }
}
```

## HTTP Status Codes

- `200`: Success
- `201`: Created successfully
- `400`: Bad request / Validation error
- `401`: Authentication required
- `403`: Access denied / Insufficient privileges
- `404`: Resource not found
- `409`: Conflict (e.g., duplicate resource)
- `500`: Internal server error

## Rate Limiting & Security

- API keys can be configured with expiration dates
- API keys can be deactivated without deletion
- JWT tokens have configurable expiration times
- All sensitive operations require proper authentication
- Room access is restricted by API key ownership
- Host-only operations are properly validated

## WebSocket Events

The WebSocket connection supports real-time events for:
- User connections/disconnections
- Room messages
- Video/audio stream management
- Conference management (join/leave)
- Media stream controls

For detailed WebSocket event documentation, see the AsyncAPI documentation (coming soon).

## Development

To extend the API documentation:

1. Add JSDoc comments with `@swagger` annotations to new endpoints
2. Update the OpenAPI schemas in `src/core/config/swagger.ts`
3. Rebuild the project to regenerate documentation
4. Test endpoints using the Swagger UI

## Troubleshooting

### Common Issues

1. **"API key header missing"**: Ensure `x-api-key` header is included
2. **"Invalid access token"**: Check token format and expiration
3. **"Room does not belong to your API key"**: Verify API key ownership
4. **"Only the room host can perform this action"**: Ensure user is room host

### Debugging

- Enable debug mode by setting `DEBUG=true` in environment variables
- Check server logs for detailed error information
- Use Swagger UI to test endpoints interactively
- Verify authentication tokens using JWT debugging tools 