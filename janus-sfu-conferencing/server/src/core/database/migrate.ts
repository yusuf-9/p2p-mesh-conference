import { migrate } from 'drizzle-orm/postgres-js/migrator';
import DatabaseService from './index.js';
import ConfigService from '../config/index.js';

async function runMigrations() {
  console.log('Running migrations...');
  
  const configService = new ConfigService();
  const dbService = new DatabaseService(configService);
  
  try {
    await migrate(dbService.getDb(), { migrationsFolder: './src/core/database/migrations' });
    console.log('✅ Migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await dbService.closeConnection();
  }
}

runMigrations(); 