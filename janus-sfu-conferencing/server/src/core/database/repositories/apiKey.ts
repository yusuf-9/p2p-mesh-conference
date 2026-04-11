import { apiKeys } from "../schema.js";
import { eq, and } from "drizzle-orm";
import DatabaseService from "../index.js";

export default class ApiKeyRepository {
  private dbService: DatabaseService;

  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
  }

  public async getByAdminId(adminId: string) {
    const adminApiKeys = await this.dbService.getDb().select().from(apiKeys).where(eq(apiKeys.adminId, adminId));
    return adminApiKeys;
  }

  public async getById(id: string, adminId: string) {
    const apiKey = await this.dbService
      .getDb()
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.adminId, adminId)));
    return apiKey?.[0] ?? null;
  }

  public async getByValue(value: string) {
    const apiKey = await this.dbService.getDb().select().from(apiKeys).where(eq(apiKeys.value, value));
    return apiKey?.[0] ?? null;
  }

  public async create(
    adminId: string,
    name: string,
    description: string | null,
    value: string,
    expiresAt: Date | null
  ) {
    const newApiKey = await this.dbService
      .getDb()
      .insert(apiKeys)
      .values({
        adminId,
        name,
        description,
        value,
        isActive: true,
        expiresAt,
      })
      .returning({
        id: apiKeys.id,
        adminId: apiKeys.adminId,
        name: apiKeys.name,
        description: apiKeys.description,
        value: apiKeys.value,
        isActive: apiKeys.isActive,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
        updatedAt: apiKeys.updatedAt,
      });
    return newApiKey[0];
  }

  public async update(id: string, adminId: string, name: string, description: string | null, expiresAt: Date | null) {
    const updatedApiKey = await this.dbService
      .getDb()
      .update(apiKeys)
      .set({
        name,
        description,
        expiresAt,
      })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.adminId, adminId)))
      .returning({
        id: apiKeys.id,
        adminId: apiKeys.adminId,
        name: apiKeys.name,
        description: apiKeys.description,
        value: apiKeys.value,
        isActive: apiKeys.isActive,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
        updatedAt: apiKeys.updatedAt,
      });
    return updatedApiKey?.[0] ?? null;
  }

  public async toggleActive(id: string, adminId: string, newStatus: boolean) {
    const updatedApiKey = await this.dbService
      .getDb()
      .update(apiKeys)
      .set({
        isActive: newStatus,
      })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.adminId, adminId)))
      .returning({
        id: apiKeys.id,
        adminId: apiKeys.adminId,
        name: apiKeys.name,
        description: apiKeys.description,
        value: apiKeys.value,
        isActive: apiKeys.isActive,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
        updatedAt: apiKeys.updatedAt,
      });
    return updatedApiKey?.[0] ?? null;
  }

  public async delete(id: string, adminId: string) {
    await this.dbService
      .getDb()
      .delete(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.adminId, adminId)));
  }
}
