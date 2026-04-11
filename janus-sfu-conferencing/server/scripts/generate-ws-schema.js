#!/usr/bin/env node

/**
 * WebSocket Schema Generator
 * Extracts WebSocket event schemas and generates JSON documentation
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// This would typically parse your TypeScript files and extract schema information
// For now, it provides the structure based on your existing code

const wsDocumentation = {
  info: {
    title: "WebSocket API Documentation",
    version: "1.0.0",
    description: "Real-time WebSocket API for media server communication",
    endpoint: "ws://localhost:3000/api/socket"
  },
  
  authentication: {
    headers: {
      "X-API-Key": "Your API key (required)",
      "Authorization": "Bearer <user-token> (required)"
    },
    description: "WebSocket connection requires API key in headers and user token for authentication"
  },

  clientToServerEvents: {
    "ping": {
      description: "Simple ping to test connection",
      schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["ping"] }
        },
        required: ["type"]
      },
      example: {
        type: "ping"
      }
    },
    
    "send-message": {
      description: "Send a text message to the room",
      schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["send-message"] },
          data: { 
            type: "string", 
            minLength: 1, 
            maxLength: 1000,
            description: "Message content (1-1000 characters)"
          }
        },
        required: ["type", "data"]
      },
      example: {
        type: "send-message",
        data: "Hello, room!"
      }
    },

    "join-conference-as-publisher": {
      description: "Join video conference as a publisher",
      schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["join-conference-as-publisher"] },
          data: {
            type: "object",
            properties: {
              feedType: { 
                type: "string", 
                enum: ["camera", "screenshare"],
                description: "Type of feed to publish (defaults to 'camera')"
              },
              audio: { 
                type: "boolean", 
                description: "Initial audio enabled state (defaults to true)"
              },
              video: { 
                type: "boolean", 
                description: "Initial video enabled state (defaults to true)"
              },
              simulcast: { 
                type: "boolean", 
                description: "Enable simulcast for this feed (defaults to false)"
              },
              resolutions: {
                type: "array",
                items: { type: "string", enum: ["h", "m", "l"] },
                description: "Simulcast resolutions to publish (requires simulcast: true)"
              }
            }
          }
        },
        required: ["type"]
      },
      example: {
        type: "join-conference-as-publisher",
        data: {
          feedType: "camera",
          audio: true,
          video: true,
          simulcast: true,
          resolutions: ["h", "m", "l"]
        }
      }
    },

    "subscribe-to-user-feed": {
      description: "Subscribe to another user's video feed",
      schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["subscribe-to-user-feed"] },
          data: { 
            type: "object",
            properties: {
              feedId: {
                type: "number",
                description: "Feed ID to subscribe to"
              },
              resolution: {
                type: "string",
                enum: ["h", "m", "l"],
                description: "Preferred resolution quality (only for simulcast-enabled feeds)"
              }
            },
            required: ["feedId"]
          }
        },
        required: ["type", "data"]
      },
      example: {
        type: "subscribe-to-user-feed",
        data: {
          feedId: 123456,
          resolution: "h"
        }
      }
    },

    "toggle-media-stream": {
      description: "Toggle audio/video streams for a specific feed",
      schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["toggle-media-stream"] },
          data: {
            type: "object",
            properties: {
              feedId: { 
                type: "number", 
                description: "Feed ID to toggle media for" 
              },
              video: { 
                type: "boolean", 
                description: "Video enabled state" 
              },
              audio: { 
                type: "boolean", 
                description: "Audio enabled state" 
              }
            },
            required: ["feedId", "video", "audio"]
          }
        },
        required: ["type", "data"]
      },
      example: {
        type: "toggle-media-stream",
        data: {
          feedId: 123456,
          video: true,
          audio: false
        }
      }
    },

    "send-ice-candidates": {
      description: "Send ICE candidates for WebRTC connection",
      schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["send-ice-candidates"] },
          data: {
            type: "object",
            properties: {
              candidate: { type: "string" },
              sdpMid: { type: "string" },
              sdpMLineIndex: { type: "number" },
              usernameFragment: { type: "string" }
            }
          }
        },
        required: ["type", "data"]
      },
      example: {
        type: "send-ice-candidates",
        data: {
          candidate: "candidate:1 1 UDP 2130706431 192.168.1.100 54400 typ host",
          sdpMid: "0",
          sdpMLineIndex: 0
        }
      }
    },

    "raise-hand": {
      description: "Raise hand for a specific feed",
      schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["raise-hand"] },
          data: {
            type: "object",
            properties: {
              feedId: { 
                type: "number", 
                description: "Feed ID to raise hand for" 
              }
            },
            required: ["feedId"]
          }
        },
        required: ["type", "data"]
      },
      example: {
        type: "raise-hand",
        data: {
          feedId: 123456
        }
      }
    },

    "lower-hand": {
      description: "Lower hand for a specific feed",
      schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["lower-hand"] },
          data: {
            type: "object",
            properties: {
              feedId: { 
                type: "number", 
                description: "Feed ID to lower hand for" 
              }
            },
            required: ["feedId"]
          }
        },
        required: ["type", "data"]
      },
      example: {
        type: "lower-hand",
        data: {
          feedId: 123456
        }
      }
    },

    "moderate-feed": {
      description: "Moderate (unpublish) a specific feed - only available to room hosts",
      schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["moderate-feed"] },
          data: {
            type: "object",
            properties: {
              feedId: { 
                type: "number", 
                description: "Feed ID to moderate" 
              }
            },
            required: ["feedId"]
          }
        },
        required: ["type", "data"]
      },
      example: {
        type: "moderate-feed",
        data: {
          feedId: 123456
        }
      }
    },

    "configure-feed": {
      description: "Configure simulcast settings for an existing feed",
      schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["configure-feed"] },
          data: {
            type: "object",
            properties: {
              feedId: { 
                type: "number", 
                description: "Feed ID to configure" 
              },
              simulcast: { 
                type: "boolean", 
                description: "Enable or disable simulcast for this feed" 
              },
              resolutions: {
                type: "array",
                items: { type: "string", enum: ["h", "m", "l"] },
                description: "Simulcast resolutions to publish (required when simulcast: true)"
              }
            },
            required: ["feedId", "simulcast"]
          }
        },
        required: ["type", "data"]
      },
      example: {
        type: "configure-feed",
        data: {
          feedId: 123456,
          simulcast: true,
          resolutions: ["h", "m", "l"]
        }
      }
    },

    "configure-feed-subscription": {
      description: "Configure resolution preference for a subscribed feed",
      schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["configure-feed-subscription"] },
          data: {
            type: "object",
            properties: {
              feedId: { 
                type: "number", 
                description: "Subscribed feed ID to configure" 
              },
              resolution: {
                type: "string",
                enum: ["h", "m", "l"],
                description: "Preferred resolution quality"
              }
            },
            required: ["feedId", "resolution"]
          }
        },
        required: ["type", "data"]
      },
      example: {
        type: "configure-feed-subscription",
        data: {
          feedId: 123456,
          resolution: "m"
        }
      }
    }
  },

  serverToClientEvents: {
    "connected": {
      description: "Connection confirmation with user data",
      schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["connected"] },
          data: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              roomId: { type: "string" },
              connected: { type: "boolean" },
              joinedCall: { type: "boolean" },
              audioEnabled: { type: "boolean" },
              videoEnabled: { type: "boolean" }
            }
          }
        }
      },
      example: {
        type: "connected",
        data: {
          id: "user-123",
          name: "John Doe",
          roomId: "room-456",
          connected: true,
          joinedCall: false,
          audioEnabled: true,
          videoEnabled: true
        }
      }
    },

    "pong": {
      description: "Response to ping message",
      schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["pong"] }
        }
      },
      example: {
        type: "pong"
      }
    },

    "message-sent": {
      description: "Confirmation that message was sent",
      schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["message-sent"] },
          data: {
            type: "object",
            properties: {
              id: { type: "string" },
              roomId: { type: "string" },
              userId: { type: "string" },
              content: { type: "string" }
            }
          }
        }
      },
      example: {
        type: "message-sent",
        data: {
          id: "msg-789",
          roomId: "room-456",
          userId: "user-123",
          content: "Hello, room!"
        }
      }
    },

    "message-received": {
      description: "Broadcast when a message is received in the room",
      schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["message-received"] },
          data: {
            type: "object",
            properties: {
              id: { type: "string" },
              roomId: { type: "string" },
              userId: { type: "string" },
              content: { type: "string" }
            }
          }
        }
      },
      example: {
        type: "message-received",
        data: {
          id: "msg-790",
          roomId: "room-456", 
          userId: "user-124",
          content: "Hi everyone!"
        }
      }
    },

    "user-connected": {
      description: "Broadcast when a user connects to the room",
      schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["user-connected"] },
          data: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              roomId: { type: "string" },
              connected: { type: "boolean" },
              joinedCall: { type: "boolean" },
              audioEnabled: { type: "boolean" },
              videoEnabled: { type: "boolean" }
            }
          }
        }
      },
      example: {
        type: "user-connected",
        data: {
          id: "user-125",
          name: "Jane Smith",
          roomId: "room-456",
          connected: true,
          joinedCall: false,
          audioEnabled: true,
          videoEnabled: true
        }
      }
    },

    "user-disconnected": {
      description: "Broadcast when a user disconnects from the room", 
      schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["user-disconnected"] },
          data: { type: "string", description: "User ID" }
        }
      },
      example: {
        type: "user-disconnected",
        data: "user-125"
      }
    },

    "error": {
      description: "Error message from server",
      schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["error"] },
          error: { type: "string", description: "Human-readable error message" }
        }
      },
      example: {
        type: "error",
        error: "Message cannot be empty"
      }
    },

    "feed-configured": {
      description: "Confirmation that feed simulcast configuration was updated",
      schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["feed-configured"] },
          data: {
            type: "object",
            properties: {
              feedId: { type: "number", description: "Feed ID that was configured" },
              simulcast: { type: "boolean", description: "Current simulcast state" },
              resolutions: { 
                type: "array", 
                items: { type: "string", enum: ["h", "m", "l"] },
                description: "Current simulcast resolutions (null if simulcast disabled)"
              }
            }
          }
        }
      },
      example: {
        type: "feed-configured",
        data: {
          feedId: 123456,
          simulcast: true,
          resolutions: ["h", "m", "l"]
        }
      }
    },

    "feed-subscription-configured": {
      description: "Confirmation that feed subscription resolution was updated",
      schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["feed-subscription-configured"] },
          data: {
            type: "object",
            properties: {
              feedId: { type: "number", description: "Subscribed feed ID" },
              resolution: { 
                type: "string", 
                enum: ["h", "m", "l"],
                description: "Current resolution preference" 
              }
            }
          }
        }
      },
      example: {
        type: "feed-subscription-configured",
        data: {
          feedId: 123456,
          resolution: "h"
        }
      }
    },

    "publisher-configured-feed": {
      description: "Broadcast when a publisher configures feed simulcast settings",
      schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["publisher-configured-feed"] },
          data: {
            type: "object",
            properties: {
              feedId: { type: "number", description: "Feed ID that was configured" },
              userId: { type: "string", description: "Publisher user ID" },
              simulcast: { type: "boolean", description: "Current simulcast state" },
              resolutions: { 
                type: "array", 
                items: { type: "string", enum: ["h", "m", "l"] },
                description: "Current simulcast resolutions (null if simulcast disabled)"
              }
            }
          }
        }
      },
      example: {
        type: "publisher-configured-feed",
        data: {
          feedId: 123456,
          userId: "user-789",
          simulcast: true,
          resolutions: ["h", "m"]
        }
      }
    },

    "feed-moderated": {
      description: "Notification sent to user whose feed was moderated by a host",
      schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["feed-moderated"] },
          data: {
            type: "object",
            properties: {
              feedId: { 
                type: "number", 
                description: "Feed ID that was moderated" 
              },
              hostId: { 
                type: "string", 
                description: "ID of the host who performed moderation" 
              }
            }
          }
        }
      },
      example: {
        type: "feed-moderated",
        data: {
          feedId: 123456,
          hostId: "host-789"
        }
      }
    },

    "moderation-success": {
      description: "Confirmation sent to host that moderation was successful",
      schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["moderation-success"] },
          data: {
            type: "object",
            properties: {
              feedId: { 
                type: "number", 
                description: "Feed ID that was moderated" 
              }
            }
          }
        }
      },
      example: {
        type: "moderation-success",
        data: {
          feedId: 123456
        }
      }
    },

    "feed-moderated-by-host": {
      description: "Broadcast to other users in room when a feed is moderated by host",
      schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["feed-moderated-by-host"] },
          data: {
            type: "object",
            properties: {
              feedId: { 
                type: "number", 
                description: "Feed ID that was moderated" 
              },
              userId: { 
                type: "string", 
                description: "ID of the user whose feed was moderated" 
              },
              hostId: { 
                type: "string", 
                description: "ID of the host who performed moderation" 
              }
            }
          }
        }
      },
      example: {
        type: "feed-moderated-by-host",
        data: {
          feedId: 123456,
          userId: "user-456", 
          hostId: "host-789"
        }
      }
    }
  },

  errorTypes: {
    validation: [
      "Missing required field: fieldName",
      "Field 'fieldName' expected string, but received number",
      "Field 'fieldName' must be at least X characters long",
      "Field 'fieldName' must be a valid UUID",
      "Invalid JSON format"
    ],
    connection: [
      "User not authenticated",
      "User not found in this room", 
      "Invalid credentials",
      "Connection failed"
    ],
    message: [
      "Unknown message type",
      "User not found",
      "Socket error occurred"
    ]
  },

  dataTypes: {
    User: {
      id: "string",
      name: "string", 
      roomId: "string",
      connected: "boolean",
      joinedCall: "boolean",
      audioEnabled: "boolean",
      videoEnabled: "boolean"
    },
    Message: {
      id: "string",
      roomId: "string",
      userId: "string", 
      content: "string"
    },
    RTCIceCandidateData: {
      candidate: "string (optional)",
      sdpMid: "string (optional)",
      sdpMLineIndex: "number (optional)",
      usernameFragment: "string (optional)"
    },
    StandardizedPublisher: {
      id: "number",
      feedType: "camera | screenshare",
      userId: "string",
      audio: "boolean",
      video: "boolean",
      talking: "boolean",
      publisher: "boolean",
      handRaised: "boolean",
      simulcastEnabled: "boolean",
      simulcastResolutions: "array of 'h'|'m'|'l' (null if simulcast disabled)"
    }
  }
};

// Generate the documentation file
function generateDocumentation() {
  const outputPath = path.join(__dirname, '../public/ws-client/ws-schema.json');
  
  try {
    fs.writeFileSync(outputPath, JSON.stringify(wsDocumentation, null, 2));
    console.log('✅ WebSocket schema documentation generated at:', outputPath);
    console.log('📄 Documentation available at: http://localhost:3000/api/ws-docs');
    console.log('🔗 Schema JSON available at: http://localhost:3000/ws-schema.json');
  } catch (error) {
    console.error('❌ Failed to generate documentation:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateDocumentation();
}

export { wsDocumentation, generateDocumentation }; 