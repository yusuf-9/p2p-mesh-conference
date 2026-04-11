import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import { rooms } from './schema.js';
import Config from '../config/index.js';
import AdminRepository from './repositories/admin.js';
import ApiKeyRepository from './repositories/apiKey.js';
import RoomRepository from './repositories/room.js';
import UserRepository from './repositories/users.js';
import MediaHandleRepository from './repositories/media-handles.js';
import { retryPromiseIfFails } from '../../utils/index.js';

export default class DatabaseService {
  private client: postgres.Sql;
  private db: ReturnType<typeof drizzle>;
  private config: Config;

  // Repository instances
  public adminRepository: AdminRepository;
  public apiKeyRepository: ApiKeyRepository;
  public roomRepository: RoomRepository;
  public userRepository: UserRepository;
  public mediaHandleRepository: MediaHandleRepository;


  constructor(config: Config) {
    this.config = config;
    const connectionString = config.getConnectionString();

    this.client = postgres(connectionString);
    this.db = drizzle(this.client, { schema });

    // Initialize repositories
    this.adminRepository = new AdminRepository(this);
    this.apiKeyRepository = new ApiKeyRepository(this);
    this.roomRepository = new RoomRepository(this);
    this.userRepository = new UserRepository(this);
    this.mediaHandleRepository = new MediaHandleRepository(this);


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
