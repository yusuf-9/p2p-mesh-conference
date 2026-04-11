# WebSocket API Documentation

This directory contains a custom-built WebSocket documentation system similar to Swagger, but specifically designed for real-time WebSocket events.

## Overview

The WebSocket documentation provides:
- ✅ Interactive testing of WebSocket events
- ✅ Complete schema validation and examples  
- ✅ Error handling documentation
- ✅ Real-time connection testing
- ✅ Swagger-like UI with "Try it out" functionality

## Accessing the Documentation

1. **Start your server:**
   ```bash
   npm start
   ```

2. **Open the documentation:**
   - **WebSocket Docs**: http://localhost:3000/api/ws-docs
   - **REST API Docs**: http://localhost:3000/api/docs (existing Swagger)

## Features

### 🔌 Connection Testing
- Interactive WebSocket connection panel
- Real-time connection status indicator
- Authentication with API keys and tokens
- Connection log with timestamps

### 📝 Event Documentation
The documentation covers all WebSocket events organized into categories:

#### Client → Server Events (Listeners)
- `ping` - Connection health check
- `send-message` - Send chat messages
- `join-conference-as-publisher` - Join video conference
- `subscribe-to-user-feed` - Subscribe to user's video feed
- `toggle-media-stream` - Toggle audio/video
- `send-ice-candidates` - WebRTC ICE candidates
- And more...

#### Server → Client Events (Emitters)  
- `connected` - Connection confirmation
- `pong` - Ping response
- `message-sent` - Message confirmation
- `message-received` - Broadcast messages
- `user-connected` - User join notifications
- `error` - Error messages
- And more...

### 🧪 Interactive Testing
Each event includes:
- **Schema Definition**: Complete JSON schema with validation rules
- **Example Payloads**: Real examples you can copy/paste
- **Try It Out**: Interactive forms to test events
- **Validation Rules**: Clear explanation of requirements
- **Response Logging**: See real-time responses

### 🔍 Schema Information
- **Data Types**: TypeScript interfaces and Zod schemas
- **Validation Rules**: Min/max lengths, required fields, formats
- **Error Messages**: User-friendly error descriptions
- **Field Descriptions**: Detailed explanations

## How to Use

### 1. Connect to WebSocket
1. Fill in your server URL (default: `ws://localhost:3000/api/socket`)
2. Enter your API key
3. Enter your user authentication token
4. Click "Connect"

### 2. Test Events
1. Find the event you want to test
2. Click on the event to expand details
3. Review the schema and validation rules
4. Use the "Try it out" section to send test messages
5. View responses in the connection log

### 3. Integration
Use the documented schemas and examples to integrate WebSocket functionality into your applications.

## Schema Generation

The documentation includes a utility script to generate WebSocket schema information:

```bash
# Generate WebSocket schema JSON
node scripts/generate-ws-schema.js
```

This creates `public/ws-schema.json` with all the event definitions.

## File Structure

```
app/containers/server/
├── public/
│   ├── websocket-docs.html      # Main documentation page
│   └── ws-schema.json           # Generated schema definitions
├── scripts/
│   └── generate-ws-schema.js    # Schema generator utility
├── src/core/ws/
│   ├── index.ts                 # WebSocket server implementation
│   ├── schema.ts                # Zod validation schemas
│   ├── constants.ts             # Event constants
│   └── types.ts                 # TypeScript types
└── README-WEBSOCKET-DOCS.md     # This file
```

## Authentication

WebSocket connections require:
1. **API Key**: Set in `X-API-Key` header during connection upgrade
2. **User Token**: Set in `Authorization: Bearer <token>` header
3. **Room Access**: User must be valid member of a room

The documentation page simulates this authentication process.

## Error Handling

The documentation includes comprehensive error handling information:

### Validation Errors
- Field type mismatches
- Missing required fields
- String length violations
- Invalid UUID formats
- JSON parsing errors

### Connection Errors  
- Authentication failures
- User not found
- Room access denied
- Connection timeouts

### Message Errors
- Unknown event types
- Invalid message structure
- User permission issues

## Customization

The documentation is built as a single HTML file with embedded CSS and JavaScript. You can customize:

### Styling
Edit the CSS in `websocket-docs.html` to match your brand colors and design.

### Events
Update the event documentation by:
1. Modifying `scripts/generate-ws-schema.js`
2. Running the script to regenerate `ws-schema.json`
3. Updating the HTML if needed

### Server Integration
The documentation is served via Express static middleware and a dedicated route in `src/core/server/index.ts`.

## Development

To extend the documentation:

1. **Add New Events**: Update `generate-ws-schema.js` with new event definitions
2. **Update Schemas**: Modify the schema objects to match your Zod validations
3. **Enhance UI**: Edit `websocket-docs.html` for new features
4. **Regenerate**: Run the schema generator script

## Production Considerations

- Consider adding authentication to the documentation endpoint
- Minimize/compress the HTML file for production
- Cache the documentation assets appropriately
- Monitor WebSocket connection limits during testing

## Troubleshooting

### Connection Issues
- Verify server is running on correct port
- Check API key and token validity
- Ensure user has proper room access
- Review browser developer console for errors

### Event Testing Issues  
- Validate JSON format in test payloads
- Check event type spelling
- Verify required fields are provided
- Review connection log for error messages

## Integration Examples

### JavaScript Client
```javascript
const ws = new WebSocket('ws://localhost:3000/api/socket');

ws.onopen = () => {
  // Send ping
  ws.send(JSON.stringify({ type: 'ping' }));
  
  // Send message
  ws.send(JSON.stringify({
    type: 'send-message',
    data: 'Hello, room!'
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};
```

### Error Handling
```javascript
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  if (message.type === 'error') {
    console.error('WebSocket Error:', message.error);
    // Handle specific error types
  }
};
```

This documentation system provides a complete solution for documenting and testing your WebSocket API, making it easy for developers to understand and integrate with your real-time communication features. 