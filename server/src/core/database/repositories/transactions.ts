import { pendingTransactions } from "../schema.js";
import { eq } from "drizzle-orm";
import DatabaseService from "../index.js";
import { NewPendingTransaction, PendingTransaction } from "../types.js";

export default class TransactionRepository {
  private dbService: DatabaseService;

  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
  }

  public async getTransactionById(id: string): Promise<PendingTransaction | null> {
    const transaction = await this.dbService
      .getDb()
      .select()
      .from(pendingTransactions)
      .where(eq(pendingTransactions.id, id));
    return transaction?.[0] ?? null;
  }

  public async getTransactionByTransactionId(transactionId: string): Promise<PendingTransaction | null> {
    const transaction = await this.dbService
      .getDb()
      .select()
      .from(pendingTransactions)
      .where(eq(pendingTransactions.transactionId, transactionId));
    return transaction?.[0] ?? null;
  }

  public async create(transaction: NewPendingTransaction): Promise<PendingTransaction> {
    const newTransaction = await this.dbService
      .getDb()
      .insert(pendingTransactions)
      .values(transaction)
      .returning();
    return newTransaction[0];
  }

  public async delete(id: string): Promise<void> {
    await this.dbService
      .getDb()
      .delete(pendingTransactions)
      .where(eq(pendingTransactions.id, id));
  }

  public async deleteByTransactionId(transactionId: string): Promise<void> {
    await this.dbService
      .getDb()
      .delete(pendingTransactions)
      .where(eq(pendingTransactions.transactionId, transactionId));
  }
}
