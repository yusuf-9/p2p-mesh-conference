import Config from '../config/index.js'
import DatabaseService from '../database/index.js';
import jwt from 'jsonwebtoken'
import CustomError from '../../utility-types/error.js';
import { Request } from 'express';
import { eq, and } from 'drizzle-orm';
import { apiKeys } from '../database/schema.js';

export type TokenType = 'super-admin' | 'admin' | 'user';

export type TokenPayload = {
    type: TokenType,
    userId: string;
}

export interface TokenOptions {
    expiresIn?: number;
}

export default class AuthService {
    private readonly secretKeys: Record<TokenType, string>;
    private readonly defaultExpiresIn: string;
    private dbService: DatabaseService

    constructor(config: Config, dbService: DatabaseService) {
        this.dbService = dbService;

        this.secretKeys = {
            'super-admin': config.jwt.superAdminSecret,
            'admin': config.jwt.adminSecret,
            'user': config.jwt.userSecret
        };

        this.defaultExpiresIn = config.jwt.expiresIn;
    }

    /**
     * Creates a JWT token with the given payload and token type
     */
    public createToken(payload: TokenPayload, options?: TokenOptions): string {
        try {
            const secretKey = this.secretKeys[payload.type];
            const expiresIn = options?.expiresIn || this.defaultExpiresIn;

            const token = jwt.sign(payload, secretKey, {
                expiresIn: expiresIn as number
            });

            return token;
        } catch (error) {
            console.error('Error creating token:', error);
            throw new Error('Failed to create token');
        }
    }

    /**
     * Validates and decodes a JWT token
     */
    public validateToken(token: string, expectedType: TokenType): TokenPayload {
        try {
            const secretKey = this.secretKeys[expectedType];
            const decoded = jwt.verify(token, secretKey) as {
                type: TokenType,
                userId: string
            };

            // Ensure the token type matches expected type
            if (decoded.type !== expectedType) {
                throw new CustomError(401, 'Access token type mismatch');
            }

            return decoded;
        } catch (error) {
            if (error instanceof jwt.JsonWebTokenError) {
                throw new CustomError(401, 'Invalid access token');
            } else if (error instanceof jwt.TokenExpiredError) {
                throw new CustomError(401, 'Access token expired');
            } else if (error instanceof jwt.NotBeforeError) {
                throw new CustomError(401, 'Access token not active yet');
            } else {
                throw new CustomError(401, 'Access token validation failed');
            }
        }
    }

    /**
     * Gets the token from request headers and validates it exists
     */
    public getTokenFromHeaders(req: Request): string {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new CustomError(401, 'No access token provided');
        }

        return authHeader.split(' ')[1];
    }

    /**
     * Validates that the request has a valid super admin token
     */
    public validateSuperAdminAccess(req: Request): TokenPayload {
        const token = this.getTokenFromHeaders(req);
        return this.validateToken(token, 'super-admin');
    }

    /**
     * Validates that the request has a valid user token
     */
    public validateUserAccess(req: Request): TokenPayload {
        const token = this.getTokenFromHeaders(req);
        return this.validateToken(token, 'user');
    }

    /**
     * Validates that the request has a valid admin token
     */
    public validateAdminAccess(req: Request): TokenPayload {
        const token = this.getTokenFromHeaders(req);
        return this.validateToken(token, 'admin');
    }

    /**
     * Gets the API key from request headers and validates it exists
     */
    public getApiKeyFromHeaders(req: Request): string {
        const apiKey = req.headers['x-api-key'] as string;
        if (!apiKey) {
            throw new CustomError(401, 'API key header missing from request');
        }
        return apiKey;
    }

    /**
     * Validates that the provided API key is valid and active
     */
    public async validateApiKey(req: Request): Promise<string> {
        const apiKey = this.getApiKeyFromHeaders(req);
        const db = this.dbService.getDb();

        const result = await db
            .select()
            .from(apiKeys)
            .where(
                and(
                    eq(apiKeys.value, apiKey),
                    eq(apiKeys.isActive, true)
                )
            );

        if (result.length === 0) {
            throw new CustomError(401, 'Invalid or inactive API key');
        }

        const apiKeyRecord = result[0];

        // Check if API key has expired
        if (apiKeyRecord.expiresAt && new Date() > apiKeyRecord.expiresAt) {
            throw new CustomError(401, 'API key has expired');
        }

        return apiKeyRecord.id;
    }
} 
