import express, { Request, Response, NextFunction } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import DatabaseService from "../../../database/index.js";
import AuthService from "../../../auth/index.js";
import CustomError from "../../../../utility-types/error.js";
import { ValidationErrorResponseType, ValidationErrorField } from "../../types/index.js";
import { registerSchema, resetPasswordSchema } from "./schemas.js";

export default class SuperAdminRouter {
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
    // Super admin token validation middleware for all routes
    this.router.use(this.validateSuperAdminMiddleware.bind(this));
  }

  private setupRoutes(): void {
    // GET /super-admin/admins - List all admins
    this.router.get("/admins", this.listAdmins.bind(this));

    // POST /super-admin/register - Register new admin
    this.router.post("/register", this.registerAdmin.bind(this));

    // POST /super-admin/reset-password - Reset admin password
    this.router.post("/reset-password", this.resetPassword.bind(this));
  }

  private createValidationError(zodError: z.ZodError): ValidationErrorResponseType {
    const fields: ValidationErrorField[] = zodError.issues.map(issue => ({
      field: issue.path.join(".") || "root",
      message: issue.message,
      code: issue.code,
    }));

    return {
      error: "Validation failed",
      details: {
        type: "validation",
        fields,
      },
    };
  }

  private async validateSuperAdminMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = this.authService.validateSuperAdminAccess(req);
      req.superAdminId = token.userId;
      next();
    } catch (error) {
      next(error);
    }
  }

  /**
   * @swagger
   * /api/super-admin/admins:
   *   get:
   *     summary: List all admin users
   *     description: Retrieves a list of all registered admin users. Requires super admin authentication.
   *     tags: [Super Admin]
   *     security:
   *       - SuperAdminToken: []
   *     responses:
   *       200:
   *         description: List of admin users retrieved successfully
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
   *                         $ref: '#/components/schemas/Admin'
   *       401:
   *         description: Super admin authentication required
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
  private async listAdmins(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Get all admins using database query since getAll doesn't exist
      const db = this.dbService.getDb();
      const { admins } = await import("../../../database/schema.js");
      
      const adminsList = await db
        .select({
          id: admins.id,
          email: admins.email,
          createdAt: admins.createdAt,
          updatedAt: admins.updatedAt,
        })
        .from(admins);

      res.status(200).json({
        message: "Admins retrieved successfully",
        data: adminsList,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @swagger
   * /api/super-admin/register:
   *   post:
   *     summary: Register a new admin user
   *     description: Creates a new admin user with email and password. Requires super admin authentication.
   *     tags: [Super Admin]
   *     security:
   *       - SuperAdminToken: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *                 description: Admin email address
   *                 example: admin@example.com
   *               password:
   *                 type: string
   *                 minLength: 6
   *                 description: Admin password (minimum 6 characters)
   *                 example: securepassword123
   *             required:
   *               - email
   *               - password
   *     responses:
   *       201:
   *         description: Admin registered successfully
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
   *                         admin:
   *                           $ref: '#/components/schemas/Admin'
   *       400:
   *         description: Validation error or admin already exists
   *         content:
   *           application/json:
   *             schema:
   *               oneOf:
   *                 - $ref: '#/components/schemas/ValidationError'
   *                 - $ref: '#/components/schemas/Error'
   *       401:
   *         description: Super admin authentication required
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
  private async registerAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate input with zod
      const validatedData = registerSchema.parse(req.body);
      const { email, password } = validatedData;

      // Check if admin already exists
      const existingAdmin = await this.dbService.adminRepository.getByEmail(email);
      if (existingAdmin) {
        throw new CustomError(400, "Admin with this email already exists");
      }

      // Hash password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Create admin using repository
      const newAdmin = await this.dbService.adminRepository.create(email, hashedPassword);

      res.status(201).json({
        message: "Admin registered successfully",
        data: {
          admin: newAdmin,
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
   * /api/super-admin/reset-password:
   *   post:
   *     summary: Reset admin user password
   *     description: Resets the password for an existing admin user. Requires super admin authentication.
   *     tags: [Super Admin]
   *     security:
   *       - SuperAdminToken: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *                 description: Email of the admin whose password should be reset
   *                 example: admin@example.com
   *               newPassword:
   *                 type: string
   *                 minLength: 6
   *                 description: New password for the admin (minimum 6 characters)
   *                 example: newsecurepassword123
   *             required:
   *               - email
   *               - newPassword
   *     responses:
   *       200:
   *         description: Password reset successfully
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
   *                         admin:
   *                           $ref: '#/components/schemas/Admin'
   *       400:
   *         description: Validation error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ValidationError'
   *       401:
   *         description: Super admin authentication required
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Admin not found
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
  private async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate input with zod
      const validatedData = resetPasswordSchema.parse(req.body);
      const { email, newPassword } = validatedData;

      // Check if admin exists
      const admin = await this.dbService.adminRepository.getByEmail(email);
      if (!admin) {
        throw new CustomError(404, "Admin not found");
      }

      // Hash new password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password using repository
      const updatedAdmin = await this.dbService.adminRepository.updatePassword(admin.id, hashedPassword);

      res.status(200).json({
        message: "Password reset successfully",
        data: {
          admin: updatedAdmin,
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

  public getRouter(): express.Router {
    return this.router;
  }
}
