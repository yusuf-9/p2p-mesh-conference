import express, { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";
import swaggerUi from 'swagger-ui-express';
import DatabaseService from "../database/index.js";
import AdminRouter from "./routers/admin/index.js";
import ApiKeyRouter from "./routers/api-keys/index.js";
import HealthRouter from "./routers/health/index.js";
import SuperAdminRouter from "./routers/super-admin/index.js";
import Config from "../config/index.js";
import AuthService from "../auth/index.js";
import { ErrorResponseType } from "./types/index.js";
import CustomError from "../../utility-types/error.js";
import RoomRouter from "./routers/room/index.js";
import PubSubService from "../pubsub/index.js";

export default class Server {
  private app: express.Application;
  private serverId: string;
  private dbService: DatabaseService;
  private authService: AuthService;
  private pubSubService: PubSubService;
  private config: Config;

  constructor(
    configService: Config,
    dbService: DatabaseService,
    authService: AuthService,
    pubSubService: PubSubService
  ) {
    this.serverId = configService.server.serverId || `server-${uuidv4()}`;
    this.dbService = dbService;
    this.config = configService;
    this.authService = authService;
    this.pubSubService = pubSubService;

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // CORS configuration
    this.app.use(cors({
      origin: this.config.server.corsOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
    }));

    // Parse JSON requests
    this.app.use(express.json());

    // Parse URL-encoded requests
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      if (this.config.app.debug) {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${req.ip}`);
      }
      next();
    });
  }

  private setupRoutes(): void {
    // Serve static files from public directory
    this.app.use(express.static('public'));

    // WebSocket client route
    this.app.get('/api/ws-docs', (req: Request, res: Response) => {
      res.sendFile('ws-client/index.html', { root: 'public' });
    });

    // Load test page route
    this.app.get('/api/load-test', (req: Request, res: Response) => {
      res.sendFile('load-test/index.html', { root: 'public' });
    });

    // Serve React client at /client path
    this.app.use('/client', express.static('public/client'));

    // Catch-all handler for React client routing
    this.app.get('/client/*', (req: Request, res: Response) => {
      res.sendFile('client/index.html', { root: 'public' });
    });

    // Swagger documentation route
    this.app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(this.config.swagger, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Media Server API Documentation',
    }));

    // API spec JSON endpoint
    this.app.get('/api/docs.json', (req: Request, res: Response) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(this.config.swagger);
    });

    // Router setup
    const healthRouter = new HealthRouter(this.dbService, this.serverId);
    const adminRouter = new AdminRouter(this.dbService, this.authService);
    const apiKeyRouter = new ApiKeyRouter(this.dbService, this.authService);
    const superAdminRouter = new SuperAdminRouter(this.dbService, this.authService);
    const roomRouter = new RoomRouter(this.dbService, this.authService, this.pubSubService);

    // Mount routers
    this.app.use("/api/health", healthRouter.getRouter());
    this.app.use("/api/admin", adminRouter.getRouter());
    this.app.use("/api/api-keys", apiKeyRouter.getRouter());
    this.app.use("/api/super-admin", superAdminRouter.getRouter());
    this.app.use("/api/room", roomRouter.getRouter());

    // 404 handler for unmatched routes
    this.app.use("*", (req: Request, res: Response) => {
      res.status(404).json({
        error: "Route not found",
      } as ErrorResponseType);
    });
  }

  private setupErrorHandling(): void {
    // Global error handler
    this.app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
      if (error instanceof CustomError) {
        return res.status(error.statusCode).json({
          error: error.message,
        } as ErrorResponseType);
      }

      res.status(500).json({
        error: "Internal server error",
      });
    });

    process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
      console.error("Shutting down due to unhandled promise rejection", reason);
      this.shutdown();
    });

    process.on("uncaughtException", (error: Error) => {
      console.error("Shutting down due to uncaught exception", error);
      this.shutdown();
    });
  }

  public start(): void {
    this.app.listen(this.config.server.port, () => {
      console.log(`🚀 Server ${this.serverId} is running on port ${this.config.server.port}`);
      console.log(`🌍 Environment: ${this.config.server.nodeEnv}`);
      console.log(`✅ Server started successfully`);
    });

    // Graceful shutdown
    process.on("SIGTERM", () => this.shutdown());
    process.on("SIGINT", () => this.shutdown());
  }

  private async shutdown(): Promise<void> {
    console.log(`🛑 Server ${this.serverId} shutting down...`);
    try {
      await this.dbService.closeConnection();
      console.log("✅ Database connection closed");
    } catch (error) {
      console.error("❌ Error closing database connection:", error);
    }
    console.log("👋 Server shutdown complete");
    process.exit(0);
  }

  public getApp(): express.Application {
    return this.app;
  }
}
