import express, { Request, Response, NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import DatabaseService from "../../../database/index.js";
import { apiKeys } from "../../../database/schema.js";
import AuthService from "../../../auth/index.js";
import CustomError from "../../../../utility-types/error.js";
import { ValidationErrorResponseType, ValidationErrorField } from "../../types/index.js";
import { createApiKeySchema, updateApiKeySchema, apiKeyParamsSchema } from "./schemas.js";

export default class ApiKeyRouter {
  private router: express.Router;
  private dbService: DatabaseService;
  private authService: AuthService;

  constructor(dbService: DatabaseService, authService: AuthService) {
    this.router = express.Router();
    this.dbService = dbService;
    this.authService = authService;
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Admin token validation middleware for all routes
    this.router.use(this.validateAdminMiddleware.bind(this));
  }

  private async validateAdminMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = this.authService.validateAdminAccess(req);
      req.adminId = token.userId;
      next();
    } catch (error) {
      next(error);
    }
  }

  private setupRoutes(): void {
    // GET /api-keys - List authenticated admin's API keys
    this.router.get("/", this.getMyApiKeys.bind(this));

    // GET /api-keys/:id - Get API key by ID (only if it belongs to authenticated admin)
    this.router.get("/:id", this.getApiKeyById.bind(this));

    // POST /api-keys - Create new API key for authenticated admin
    this.router.post("/", this.createApiKey.bind(this));

    // PUT /api-keys/:id - Update API key (only if it belongs to authenticated admin)
    this.router.put("/:id", this.updateApiKey.bind(this));

    // PUT /api-keys/:id/toggle - Toggle API key active status (only if it belongs to authenticated admin)
    this.router.put("/:id/toggle", this.toggleApiKey.bind(this));

    // DELETE /api-keys/:id - Delete API key (only if it belongs to authenticated admin)
    this.router.delete("/:id", this.deleteApiKey.bind(this));
  }

  private generateApiKey(): string {
    return `ak_${uuidv4().replace(/-/g, "")}`;
  }

  private createValidationError(zodError: z.ZodError): ValidationErrorResponseType {
    const fields: ValidationErrorField[] = zodError.issues.map(issue => ({
      field: issue.path.join('.') || 'root',
      message: issue.message,
      code: issue.code
    }));

    return {
      error: "Validation failed",
      details: {
        type: "validation",
        fields
      }
    };
  }

  /**
   * @swagger
   * /api/api-keys:
   *   get:
   *     summary: List admin's API keys
   *     description: Retrieves all API keys belonging to the authenticated admin user
   *     tags: [API Keys]
   *     security:
   *       - AdminToken: []
   *     responses:
   *       200:
   *         description: API keys retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               allOf:
   *                 - $ref: '#/components/schemas/SuccessResponse'
   *                 - type: object
   *                   properties:
   *                     data:
   *                       type: array
   *                       items:
   *                         $ref: '#/components/schemas/ApiKey'
   *       401:
   *         description: Admin authentication required
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  private async getMyApiKeys(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = req.adminId!; // We know this exists due to middleware

      // Use repository to get API keys by admin ID
      const myApiKeys = await this.dbService.apiKeyRepository.getByAdminId(adminId);

      res.status(200).json({
        message: "API keys retrieved successfully",
        data: myApiKeys,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @swagger
   * /api/api-keys/{id}:
   *   get:
   *     summary: Get API key by ID
   *     description: Retrieves a specific API key by ID. Only returns API key if it belongs to the authenticated admin.
   *     tags: [API Keys]
   *     security:
   *       - AdminToken: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: API key ID
   *     responses:
   *       200:
   *         description: API key retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               allOf:
   *                 - $ref: '#/components/schemas/SuccessResponse'
   *                 - type: object
   *                   properties:
   *                     data:
   *                       $ref: '#/components/schemas/ApiKey'
   *       400:
   *         description: Invalid API key ID format
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ValidationError'
   *       401:
   *         description: Admin authentication required
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       403:
   *         description: API key does not belong to authenticated admin
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: API key not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  private async getApiKeyById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate params with zod
      const validatedParams = apiKeyParamsSchema.parse(req.params);
      const { id } = validatedParams;
      const adminId = req.adminId!; // We know this exists due to middleware

      // Use repository to get API key by ID and admin ID
      const apiKey = await this.dbService.apiKeyRepository.getById(id, adminId);

      if (!apiKey) {
        throw new CustomError(404, "API key not found");
      }

      res.status(200).json({
        message: "API key retrieved successfully",
        data: apiKey,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = this.createValidationError(error);
        res.status(400).json(validationError);
        return;
      }
      next(error);
    }
  }

  /**
   * @swagger
   * /api/api-keys:
   *   post:
   *     summary: Create new API key
   *     description: Creates a new API key for the authenticated admin user
   *     tags: [API Keys]
   *     security:
   *       - AdminToken: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *                 minLength: 1
   *                 maxLength: 255
   *                 description: Name for the API key
   *                 example: Production API Key
   *               expiresAt:
   *                 type: string
   *                 format: date-time
   *                 description: Optional expiration date for the API key
   *                 example: 2024-12-31T23:59:59Z
   *             required:
   *               - name
   *     responses:
   *       201:
   *         description: API key created successfully
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
   *                         apiKey:
   *                           $ref: '#/components/schemas/ApiKey'
   *       400:
   *         description: Validation error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ValidationError'
   *       401:
   *         description: Admin authentication required
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  private async createApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate input with zod
      const validatedData = createApiKeySchema.parse(req.body);
      const { name, expiresAt } = validatedData;
      const adminId = req.adminId!; // We know this exists due to middleware

      // Generate unique API key value
      const apiKeyValue = `ak_${uuidv4().replace(/-/g, "")}`;

      // Use repository to create API key
      const newApiKey = await this.dbService.apiKeyRepository.create(
        adminId,
        name,
        null, // description
        apiKeyValue,
        expiresAt ? new Date(expiresAt) : null
      );

      res.status(201).json({
        message: "API key created successfully",
        data: {
          apiKey: newApiKey,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = this.createValidationError(error);
        res.status(400).json(validationError);
        return;
      }
      next(error);
    }
  }

  /**
   * @swagger
   * /api/api-keys/{id}:
   *   put:
   *     summary: Update API key
   *     description: Updates an existing API key. Only allows updating API keys that belong to the authenticated admin.
   *     tags: [API Keys]
   *     security:
   *       - AdminToken: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: API key ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *                 minLength: 1
   *                 maxLength: 255
   *                 description: New name for the API key
   *                 example: Updated API Key Name
   *               expiresAt:
   *                 type: string
   *                 format: date-time
   *                 nullable: true
   *                 description: New expiration date for the API key
   *                 example: 2024-12-31T23:59:59Z
   *     responses:
   *       200:
   *         description: API key updated successfully
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
   *                         apiKey:
   *                           $ref: '#/components/schemas/ApiKey'
   *       400:
   *         description: Validation error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ValidationError'
   *       401:
   *         description: Admin authentication required
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       403:
   *         description: API key does not belong to authenticated admin
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: API key not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  private async updateApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate params and body with zod
      const validatedParams = apiKeyParamsSchema.parse(req.params);
      const validatedData = updateApiKeySchema.parse(req.body);
      const { id } = validatedParams;
      const { name, expiresAt } = validatedData;
      const adminId = req.adminId!; // We know this exists due to middleware

      // Use repository to update API key
      const updatedApiKey = await this.dbService.apiKeyRepository.update(
        id,
        adminId,
        name,
        null, // description
        expiresAt ? new Date(expiresAt) : null
      );

      if (!updatedApiKey) {
        throw new CustomError(404, "API key not found");
      }

      res.status(200).json({
        message: "API key updated successfully",
        data: {
          apiKey: updatedApiKey,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = this.createValidationError(error);
        res.status(400).json(validationError);
        return;
      }
      next(error);
    }
  }

  /**
   * @swagger
   * /api/api-keys/{id}/toggle:
   *   put:
   *     summary: Toggle API key active status
   *     description: Toggles the active status of an API key (active/inactive). Only allows toggling API keys that belong to the authenticated admin.
   *     tags: [API Keys]
   *     security:
   *       - AdminToken: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: API key ID
   *     responses:
   *       200:
   *         description: API key status toggled successfully
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
   *                         apiKey:
   *                           $ref: '#/components/schemas/ApiKey'
   *       400:
   *         description: Invalid API key ID format
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ValidationError'
   *       401:
   *         description: Admin authentication required
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       403:
   *         description: API key does not belong to authenticated admin
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: API key not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  private async toggleApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate params with zod
      const validatedParams = apiKeyParamsSchema.parse(req.params);
      const { id } = validatedParams;
      const adminId = req.adminId!; // We know this exists due to middleware

      // Get current API key status
      const currentApiKey = await this.dbService.apiKeyRepository.getById(id, adminId);

      if (!currentApiKey) {
        throw new CustomError(404, "API key not found");
      }

      // Use repository to toggle API key status
      const updatedApiKey = await this.dbService.apiKeyRepository.toggleActive(id, adminId, !currentApiKey.isActive);

      res.status(200).json({
        message: "API key status toggled successfully",
        data: {
          apiKey: updatedApiKey,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = this.createValidationError(error);
        res.status(400).json(validationError);
        return;
      }
      next(error);
    }
  }

  /**
   * @swagger
   * /api/api-keys/{id}:
   *   delete:
   *     summary: Delete API key
   *     description: Permanently deletes an API key. Only allows deleting API keys that belong to the authenticated admin.
   *     tags: [API Keys]
   *     security:
   *       - AdminToken: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: API key ID
   *     responses:
   *       200:
   *         description: API key deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *       400:
   *         description: Invalid API key ID format
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ValidationError'
   *       401:
   *         description: Admin authentication required
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       403:
   *         description: API key does not belong to authenticated admin
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: API key not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  private async deleteApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate params with zod
      const validatedParams = apiKeyParamsSchema.parse(req.params);
      const { id } = validatedParams;
      const adminId = req.adminId!; // We know this exists due to middleware

      // Use repository to delete API key
      await this.dbService.apiKeyRepository.delete(id, adminId);

      res.status(200).json({
        message: "API key deleted successfully",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = this.createValidationError(error);
        res.status(400).json(validationError);
        return;
      }
      next(error);
    }
  }

  public getRouter(): express.Router {
    return this.router;
  }
}
