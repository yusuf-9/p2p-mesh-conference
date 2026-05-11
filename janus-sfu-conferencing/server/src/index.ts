import DatabaseService from "./core/database/index.js";
import Server from "./core/server/index.js";
import Config from "./core/config/index.js";
import AuthService from "./core/auth/index.js";
import PubSubService from "./core/pubsub/index.js";
import SocketServer from "./core/ws/index.js";
import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  try {
    // Initialize and validate configuration
    const appConfig = new Config();

    // Initialize upload directory for RTC stats
    const uploadDir = appConfig.rtcStats.uploadDir;
    await fs.mkdir(path.resolve(uploadDir), { recursive: true });
    console.log(`📁 RTC stats upload directory ready: ${uploadDir}`);

    // Initialize database service with config
    const dbService = new DatabaseService(appConfig);
    await dbService.connect();

    // Initialize auth service with config
    const authService = new AuthService(appConfig, dbService);

    // Initialize PubSubService
    const pubSubService = new PubSubService();
    await pubSubService.connect()

    // Initialize and start HTTP server
    const server = new Server(appConfig, dbService, authService, pubSubService);

    // Initialize WebSocket server with pub/sub
    const websocketServer = new SocketServer(server.getApp(), authService, dbService, pubSubService, appConfig);
    await websocketServer.start(appConfig.server.port);

    console.log('🚀 Server started successfully');

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('📴 Shutting down server...');
      await websocketServer.stop();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('📴 Shutting down server...');
      await websocketServer.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error("❌ Application failed to start:", error);
    process.exit(1);
  }
}

main();
