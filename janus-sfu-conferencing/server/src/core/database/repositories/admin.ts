import { admins } from "../schema.js";
import { eq } from "drizzle-orm";
import DatabaseService from "../index.js";

export default class AdminRepository {
  private dbService: DatabaseService;

  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
  }

  public async getByEmail(email: string) {
    const admin = await this.dbService.getDb().select().from(admins).where(eq(admins.email, email));
    return admin?.[0] ?? null;
  }

  public async getById(id: string) {
    const admin = await this.dbService.getDb().select().from(admins).where(eq(admins.id, id));
    return admin?.[0] ?? null;
  }

  public async create(email: string, hashedPassword: string) {
    const newAdmin = await this.dbService
      .getDb()
      .insert(admins)
      .values({
        email,
        password: hashedPassword,
      })
      .returning({
        id: admins.id,
        email: admins.email,
        createdAt: admins.createdAt,
        updatedAt: admins.updatedAt,
      });
    return newAdmin[0];
  }

  public async updatePassword(adminId: string, hashedPassword: string) {
    const updatedAdmin = await this.dbService
      .getDb()
      .update(admins)
      .set({
        password: hashedPassword,
      })
      .where(eq(admins.id, adminId))
      .returning({
        id: admins.id,
        email: admins.email,
        createdAt: admins.createdAt,
        updatedAt: admins.updatedAt,
      });
    return updatedAdmin[0];
  }
} 