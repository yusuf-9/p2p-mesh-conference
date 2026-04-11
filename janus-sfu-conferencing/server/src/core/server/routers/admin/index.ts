import express, { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import { z } from "zod";
import DatabaseService from "../../../database/index.js";
import AuthService from "../../../auth/index.js";
import CustomError from "../../../../utility-types/error.js";
import { ValidationErrorResponseType, ValidationErrorField } from "../../types/index.js";
import { loginSchema, changePasswordSchema } from "./schemas.js";

export default class AdminRouter {
  private router: express.Router;
  private dbService: DatabaseService;
  private authService: AuthService;

  constructor(dbService: DatabaseService, authService: AuthService) {
    this.router = express.Router();
    this.dbService = dbService;
    this.authService = authService;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // POST /admin/login - Admin login
    this.router.post("/login", this.loginAdmin.bind(this));

    // PUT /admin/change-password - Change password (requires admin token)
    this.router.put("/change-password", this.validateAdminMiddleware.bind(this), this.changePassword.bind(this));

    // GET /admin/rooms - Get all rooms belonging to admin (requires admin token, bypass API key middleware)
    this.router.get("/rooms", this.validateAdminMiddleware.bind(this), this.getAdminRooms.bind(this));
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

  private async validateAdminMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = this.authService.validateAdminAccess(req);
      req.adminId = token.userId;
      next();
    } catch (error) {
      next(error);
    }
  }

  /**
   * @swagger
   * /api/admin/login:
   *   post:
   *     summary: Admin user login
   *     description: Authenticates an admin user with email and password, returns admin information and JWT token
   *     tags: [Admin]
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
   *                 description: Admin password
   *                 example: securepassword123
   *             required:
   *               - email
   *               - password
   *     responses:
   *       200:
   *         description: Login successful
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
   *                         token:
   *                           type: string
   *                           description: JWT token for admin authentication
   *                           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   *       400:
   *         description: Validation error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ValidationError'
   *       401:
   *         description: Invalid email or password
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
  private async loginAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate input with zod
      const validatedData = loginSchema.parse(req.body);
      const { email, password } = validatedData;

      // Find admin by email using repository
      const admin = await this.dbService.adminRepository.getByEmail(email);

      if (!admin) {
        throw new CustomError(401, "Invalid email or password");
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, admin.password);

      if (!isPasswordValid) {
        throw new CustomError(401, "Invalid email or password");
      }

      // Generate JWT token
      const token = this.authService.createToken({
        userId: admin.id,
        type: "admin",
      });

      res.status(200).json({
        message: "Login successful",
        data: {
          admin: {
            id: admin.id,
            email: admin.email,
            createdAt: admin.createdAt,
            updatedAt: admin.updatedAt,
          },
          token,
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
   * /api/admin/change-password:
   *   put:
   *     summary: Change admin password
   *     description: Changes the password for the authenticated admin user. Requires admin token authentication.
   *     tags: [Admin]
   *     security:
   *       - AdminToken: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               currentPassword:
   *                 type: string
   *                 description: Current admin password
   *                 example: oldpassword123
   *               newPassword:
   *                 type: string
   *                 minLength: 6
   *                 description: New password (minimum 6 characters)
   *                 example: newpassword123
   *             required:
   *               - currentPassword
   *               - newPassword
   *     responses:
   *       200:
   *         description: Password changed successfully
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
   *         description: Admin authentication required or current password incorrect
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
  private async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate input with zod
      const validatedData = changePasswordSchema.parse(req.body);
      const { currentPassword, newPassword } = validatedData;
      const adminId = req.adminId!; // We know this exists due to middleware

      // Find admin by ID using repository (but we need to get by ID, let me check the existing code)
      // For now, let's get the admin by ID from the existing user repository pattern
      const admin = await this.dbService.adminRepository.getById(adminId);

      if (!admin) {
        throw new CustomError(404, "Admin not found");
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, admin.password);

      if (!isCurrentPasswordValid) {
        throw new CustomError(401, "Current password is incorrect");
      }

      // Hash new password
      const saltRounds = 10;
      const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password using repository
      const updatedAdmin = await this.dbService.adminRepository.updatePassword(adminId, hashedNewPassword);

      res.status(200).json({
        message: "Password changed successfully",
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

  /**
   * @swagger
   * /api/admin/rooms:
   *   get:
   *     summary: Get admin's rooms
   *     description: Retrieves all rooms belonging to the authenticated admin user. Requires admin token authentication.
   *     tags: [Admin]
   *     security:
   *       - AdminToken: []
   *     responses:
   *       200:
   *         description: Admin rooms retrieved successfully
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
   *                         $ref: '#/components/schemas/Room'
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
  private async getAdminRooms(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = req.adminId!;

      // Use room repository to get admin rooms
      const adminRooms = await this.dbService.roomRepository.getAdminRooms(adminId);

      res.status(200).json({
        message: "Admin rooms retrieved successfully",
        data: adminRooms,
      });
    } catch (error) {
      next(error);
    }
  }

  public getRouter(): express.Router {
    return this.router;
  }
}
