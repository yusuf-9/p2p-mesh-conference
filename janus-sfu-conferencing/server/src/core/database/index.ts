import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import { rooms } from './schema.js';
import Config from '../config/index.js';
import RoomRepository from './repositories/room.js';
import UserRepository from './repositories/users.js';
import { retryPromiseIfFails } from '../../utils/index.js';
import TransactionRepository from './repositories/transactions.js';
import MediaRoomRepository from './repositories/media-room.js';

export default class DatabaseService {
  private client: postgres.Sql;
  private db: ReturnType<typeof drizzle>;
  private config: Config;

  // Repository instances
  public roomRepository: RoomRepository;
  public userRepository: UserRepository;
  public transactionRepository: TransactionRepository;
  public mediaRoomRepository: MediaRoomRepository;


  constructor(config: Config) {
    this.config = config;
    const connectionString = config.getConnectionString();

    this.client = postgres(connectionString);
    this.db = drizzle(this.client, { schema });

    // Initialize repositories
    this.roomRepository = new RoomRepository(this);
    this.userRepository = new UserRepository(this);
    this.transactionRepository = new TransactionRepository(this);
    this.mediaRoomRepository = new MediaRoomRepository(this);


  }

  // Explicit connection method that throws on failure
  public async connect(): Promise<void> {
    try {
      // Test the connection by executing a simple PostgreSQL query
      await retryPromiseIfFails(() => this.db.select().from(rooms).limit(1));
      console.log('✅ Database connection established successfully');
    } catch (error) {
      console.error('❌ Failed to connect to database:', error);
      throw new Error(`Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Connection management
  public async testConnection(): Promise<boolean> {
    try {
      await this.client`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  public async closeConnection(): Promise<void> {
    await this.client.end();
  }

  // Get database instance for complex queries
  public getDb() {
    return this.db;
  }
} 
