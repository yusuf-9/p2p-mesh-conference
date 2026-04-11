import DatabaseService from "./core/database/index.js";
import Server from "./core/server/index.js";
import Config from "./core/config/index.js";
import AuthService from "./core/auth/index.js";
import PubSubService from "./core/pubsub/index.js";
import P2PMeshServer from "./core/ws/mesh-server.js";

async function main() {
  try {
    // Initialize and validate configuration
    const appConfig = new Config();

    // Initialize database service with config
    const dbService = new DatabaseService(appConfig);
    await dbService.connect();

    // Initialize auth service with config
    const authService = new AuthService(appConfig, dbService);

    // Initialize in-memory PubSubService 
    const pubSubService = new PubSubService();
    await pubSubService.connect()

    // Initialize and start HTTP server
    const server = new Server(appConfig, dbService, authService, pubSubService);

    // Initialize P2P Mesh WebSocket server
    const p2pMeshServer = new P2PMeshServer(server.getApp(), authService, dbService, pubSubService, appConfig);
    await p2pMeshServer.start(appConfig.server.port);

    console.log('🚀 Server started successfully');

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('📴 Shutting down P2P mesh server...');
      await p2pMeshServer.stop();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('📴 Shutting down P2P mesh server...');
      await p2pMeshServer.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error("❌ Application failed to start:", error);
    process.exit(1);
  }
}

main();
