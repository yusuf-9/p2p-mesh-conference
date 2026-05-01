import { config } from "dotenv";
import swaggerJSDoc from "swagger-jsdoc";

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface JwtConfig {
  superAdminSecret: string;
  userSecret: string;
  expiresIn: string;
}

export interface ServerConfig {
  port: number;
  nodeEnv: string;
  corsOrigin: string;
  serverId?: string;
  baseUrl: string;
}

export interface AppConfig {
  maxRooms: number;
  maxParticipantsPerRoom: number;
  logLevel: string;
  debug: boolean;
}

export interface SfuConfig {
  uri: string;
}

export interface TurnConfig {
  serverUrl: string;
  serverPort: string;
  secret: string;
}

export default class Config {
  public readonly database: DatabaseConfig;
  public readonly jwt: JwtConfig;
  public readonly server: ServerConfig;
  public readonly app: AppConfig;
  public readonly sfu: SfuConfig;
  public readonly turn: TurnConfig;
  public readonly swagger: ReturnType<typeof swaggerJSDoc>;

  constructor() {
    config();
    this.database = this.validateDatabaseConfig();
    this.jwt = this.validateJwtConfig();
    this.server = this.validateServerConfig();
    this.app = this.validateAppConfig();
    this.swagger = this.validateSwaggerConfig();
    this.sfu = this.validateSfuConfig();
    this.turn = this.validateTurnConfig();
  }

  private validateDatabaseConfig(): DatabaseConfig {
    const host = process.env.POSTGRES_HOST;
    const port = process.env.POSTGRES_PORT;
    const database = process.env.POSTGRES_DB;
    const user = process.env.POSTGRES_USER;
    const password = process.env.POSTGRES_PASSWORD;

    if (!host) {
      throw new Error("POSTGRES_HOST environment variable is required");
    }
    if (!port) {
      throw new Error("POSTGRES_PORT environment variable is required");
    }
    if (!database) {
      throw new Error("POSTGRES_DB environment variable is required");
    }
    if (!user) {
      throw new Error("POSTGRES_USER environment variable is required");
    }
    if (!password) {
      throw new Error("POSTGRES_PASSWORD environment variable is required");
    }

    return {
      host,
      port: parseInt(port, 10),
      database,
      user,
      password,
    };
  }

  public validateSfuConfig(): SfuConfig {
    const sfuWebsocketUri = process.env.SFU_WS_URI

    if (!sfuWebsocketUri) {
      throw new Error("SFU_WS_URI environment variable is required");
    }

    return {
      uri: sfuWebsocketUri
    }
  }

  private validateTurnConfig(): TurnConfig {
    const serverUrl = process.env.TURN_SERVER_URL || "localhost";
    const serverPort = process.env.TURN_SERVER_PORT || "3478";
    const secret = process.env.TURN_SECRET;

    if (!secret) {
      throw new Error("TURN_SECRET environment variable is required");
    }

    return {
      serverUrl,
      serverPort,
      secret
    };
  }

  private validateJwtConfig(): JwtConfig {
    const superAdminSecret = process.env.JWT_SUPER_ADMIN_SECRET;
    const userSecret = process.env.JWT_USER_SECRET;
    const expiresIn = process.env.JWT_EXPIRES_IN || "24h";

    if (!superAdminSecret) {
      throw new Error("JWT_SUPER_ADMIN_SECRET environment variable is required");
    }
    if (!userSecret) {
      throw new Error("JWT_USER_SECRET environment variable is required");
    }

    return {
      superAdminSecret,
      userSecret,
      expiresIn,
    };
  }

  private validateServerConfig(): ServerConfig {
    const port = process.env.SERVER_PORT || "3000";
    const nodeEnv = process.env.NODE_ENV || "development";
    const corsOrigin = process.env.CORS_ORIGIN || "*";
    const serverId = process.env.SERVER_ID;
    const baseUrl = process.env.API_BASE_URL || "http://localhost:3000";

    console.log({ env: process.env })

    return {
      port: parseInt(port, 10),
      nodeEnv,
      corsOrigin,
      serverId,
      baseUrl,
    };
  }

  private validateAppConfig(): AppConfig {
    const maxRooms = process.env.MAX_ROOMS || "1000";
    const maxParticipantsPerRoom = process.env.MAX_PARTICIPANTS_PER_ROOM || "100";
    const logLevel = process.env.LOG_LEVEL || "info";
    const debug = process.env.DEBUG === "true";


    return {
      maxRooms: parseInt(maxRooms, 10),
      maxParticipantsPerRoom: parseInt(maxParticipantsPerRoom, 10),
      logLevel,
      debug,
    };
  }

  private validateSwaggerConfig(): ReturnType<typeof swaggerJSDoc> {
    return swaggerJSDoc({
      definition: {
        openapi: "3.0.0",
        info: {
          title: "Media Server API",
          version: "1.0.0",
          description: `
            Media Server API provides endpoints for managing video conferencing rooms and real-time communication.

            ## 📡 Real-time Communication
            For real-time features like chat, video conferencing, and live updates, see the **[WebSocket API Documentation](/api/ws-docs)**.

            ## Authentication Flow
            1. **Create or join a room** — no API key required
            2. **User token** — returned on join, used for room operations and WebSocket upgrades
          `,
          contact: {
            name: "Media Server API Support",
          },
        },
        servers: [
          {
            url: this.server.baseUrl,
            description: "Development server",
          },
        ],
        components: {
          securitySchemes: {
            UserToken: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "JWT",
              description: "User JWT token returned on room join, required for room-level operations and WebSocket upgrades",
            },
          },
          schemas: {
            Error: {
              type: "object",
              properties: {
                error: {
                  type: "string",
                  description: "Error message",
                },
              },
              required: ["error"],
            },
            ValidationError: {
              type: "object",
              properties: {
                error: {
                  type: "string",
                  example: "Validation failed",
                },
                details: {
                  type: "object",
                  properties: {
                    type: {
                      type: "string",
                      example: "validation",
                    },
                    fields: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          field: {
                            type: "string",
                            description: "Field name that failed validation",
                          },
                          message: {
                            type: "string",
                            description: "Validation error message",
                          },
                          code: {
                            type: "string",
                            description: "Error code",
                          },
                        },
                        required: ["field", "message", "code"],
                      },
                    },
                  },
                  required: ["type", "fields"],
                },
              },
              required: ["error", "details"],
            },
            SuccessResponse: {
              type: "object",
              properties: {
                message: {
                  type: "string",
                  description: "Success message",
                },
                data: {
                  type: "object",
                  description: "Response data",
                },
              },
              required: ["message", "data"],
            },
            HealthData: {
              type: "object",
              properties: {
                status: {
                  type: "string",
                  enum: ["healthy", "unhealthy"],
                },
                serverId: {
                  type: "string",
                },
                timestamp: {
                  type: "string",
                  format: "date-time",
                },
                uptime: {
                  type: "number",
                  description: "Server uptime in seconds",
                },
                environment: {
                  type: "string",
                },
              },
            },
            DetailedHealthData: {
              allOf: [
                { $ref: "#/components/schemas/HealthData" },
                {
                  type: "object",
                  properties: {
                    services: {
                      type: "object",
                      properties: {
                        database: {
                          type: "object",
                          properties: {
                            status: {
                              type: "string",
                              enum: ["connected", "disconnected"],
                            },
                            host: {
                              type: "string",
                            },
                            port: {
                              type: "string",
                            },
                            database: {
                              type: "string",
                            },
                          },
                        },
                      },
                    },
                    system: {
                      type: "object",
                      properties: {
                        nodeVersion: {
                          type: "string",
                        },
                        platform: {
                          type: "string",
                        },
                        architecture: {
                          type: "string",
                        },
                        memory: {
                          type: "object",
                          properties: {
                            used: {
                              type: "number",
                              description: "Used memory in MB",
                            },
                            total: {
                              type: "number",
                              description: "Total memory in MB",
                            },
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
            Room: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  format: "uuid",
                },
                name: {
                  type: "string",
                },
                description: {
                  type: "string",
                  nullable: true,
                },
                type: {
                  type: "string",
                  enum: ["one_to_one", "group"],
                  description: "Room type - either one-to-one (max 2 users) or group (unlimited)",
                },
                createdAt: {
                  type: "string",
                  format: "date-time",
                },
                updatedAt: {
                  type: "string",
                  format: "date-time",
                },
              },
              required: ["id", "name", "type", "createdAt", "updatedAt"],
            },
            User: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  format: "uuid",
                },
                name: {
                  type: "string",
                },
                roomId: {
                  type: "string",
                  format: "uuid",
                },
                createdAt: {
                  type: "string",
                  format: "date-time",
                },
                updatedAt: {
                  type: "string",
                  format: "date-time",
                },
              },
              required: ["id", "name", "roomId", "createdAt", "updatedAt"],
            },
            Message: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  format: "uuid",
                },
                content: {
                  type: "string",
                },
                userId: {
                  type: "string",
                  format: "uuid",
                },
                roomId: {
                  type: "string",
                  format: "uuid",
                },
                createdAt: {
                  type: "string",
                  format: "date-time",
                },
              },
              required: ["id", "content", "userId", "roomId", "createdAt"],
            },
          },
        },
        tags: [
          {
            name: "Health",
            description: "Health check endpoints",
          },
          {
            name: "Rooms",
            description: "Room creation, management, and user operations",
          },
        ],
      },
      apis: ["./src/core/server/routers/**/*.ts", "./src/docs/**/*.yaml"],
    });
  }

  public getConnectionString(): string {
    return `postgresql://${this.database.user}:${this.database.password}@${this.database.host}:${this.database.port}/${this.database.database}`;
  }

  public isDevelopment(): boolean {
    return this.server.nodeEnv === "development";
  }

  public isProduction(): boolean {
    return this.server.nodeEnv === "production";
  }

  public logConfig(): void {
    console.log("🔧 Configuration loaded:");
  }
}
