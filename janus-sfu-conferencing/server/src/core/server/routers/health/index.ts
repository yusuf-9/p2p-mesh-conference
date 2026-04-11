import express, { Request, Response, NextFunction } from "express";
import DatabaseService from "../../../database/index.js";
import CustomError from "../../../../utility-types/error.js";

export default class HealthRouter {
  private router: express.Router;
  private dbService: DatabaseService;
  private serverId: string;

  constructor(dbService: DatabaseService, serverId: string) {
    this.router = express.Router();
    this.dbService = dbService;
    this.serverId = serverId;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // GET /health - Basic health check
    this.router.get("/", this.getHealthCheck.bind(this));

    // GET /health/db - Database health check
    this.router.get("/db", this.getDatabaseHealth.bind(this));

    // GET /health/detailed - Detailed health check
    this.router.get("/detailed", this.getDetailedHealth.bind(this));
  }

  /**
   * @swagger
   * /api/health:
   *   get:
   *     summary: Basic health check
   *     description: Returns basic server health information including server ID, timestamp, uptime, and environment
   *     tags: [Health]
   *     responses:
   *       200:
   *         description: Server is healthy
   *         content:
   *           application/json:
   *             schema:
   *               allOf:
   *                 - $ref: '#/components/schemas/SuccessResponse'
   *                 - type: object
   *                   properties:
   *                     data:
   *                       $ref: '#/components/schemas/HealthData'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  private async getHealthCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const healthData = {
        status: "healthy",
        serverId: this.serverId,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || "development"
      };

      res.status(200).json({
        message: "Health check successful",
        data: healthData
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @swagger
   * /api/health/db:
   *   get:
   *     summary: Database health check
   *     description: Checks the database connection status and returns health information
   *     tags: [Health]
   *     responses:
   *       200:
   *         description: Database is connected and healthy
   *         content:
   *           application/json:
   *             schema:
   *               allOf:
   *                 - $ref: '#/components/schemas/SuccessResponse'
   *                 - type: object
   *                   properties:
   *                     data:
   *                       type: object
   *                       properties:
   *                         status:
   *                           type: string
   *                           example: healthy
   *                         database:
   *                           type: string
   *                           example: connected
   *                         serverId:
   *                           type: string
   *                         timestamp:
   *                           type: string
   *                           format: date-time
   *       500:
   *         description: Database connection failed
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  private async getDatabaseHealth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const isConnected = await this.dbService.testConnection();
      
      if (!isConnected) {
        throw new CustomError(500, "Database connection failed");
      }

      const healthData = {
        status: "healthy",
        database: "connected",
        serverId: this.serverId,
        timestamp: new Date().toISOString()
      };

      res.status(200).json({
        message: "Database health check successful",
        data: healthData
      });
    } catch (error) {
      if (error instanceof CustomError) {
        next(error);
      } else {
        next(new CustomError(500, "Database health check failed"));
      }
    }
  }

  /**
   * @swagger
   * /api/health/detailed:
   *   get:
   *     summary: Detailed health check
   *     description: Returns comprehensive health information including database status, system information, and service health
   *     tags: [Health]
   *     responses:
   *       200:
   *         description: Detailed health information
   *         content:
   *           application/json:
   *             schema:
   *               allOf:
   *                 - $ref: '#/components/schemas/SuccessResponse'
   *                 - type: object
   *                   properties:
   *                     data:
   *                       $ref: '#/components/schemas/DetailedHealthData'
   *       500:
   *         description: One or more services are unhealthy
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  private async getDetailedHealth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const [dbConnected] = await Promise.allSettled([
        this.dbService.testConnection()
      ]);

      const dbStatus = dbConnected.status === "fulfilled" && dbConnected.value;
      const overallStatus = dbStatus ? "healthy" : "unhealthy";

      if (!dbStatus) {
        throw new CustomError(500, "One or more services are unhealthy");
      }

      const healthData = {
        status: overallStatus,
        serverId: this.serverId,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || "development",
        services: {
          database: {
            status: dbStatus ? "connected" : "disconnected",
            host: process.env.POSTGRES_HOST,
            port: process.env.POSTGRES_PORT,
            database: process.env.POSTGRES_DB
          }
        },
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          architecture: process.arch,
          memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100
          }
        }
      };

      res.status(200).json({
        message: "Detailed health check successful",
        data: healthData
      });
    } catch (error) {
      if (error instanceof CustomError) {
        next(error);
      } else {
        next(new CustomError(500, "Detailed health check failed"));
      }
    }
  }

  public getRouter(): express.Router {
    return this.router;
  }
} 