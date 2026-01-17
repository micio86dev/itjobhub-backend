import { beforeAll, afterAll } from 'bun:test';
import { setupDatabase } from '../src/config/database';
import logger from '../src/utils/logger';
import { dbClient } from '../src/config/database';

beforeAll(async () => {
  // Setup test database connection
  logger.info('Setting up test database...');
  await setupDatabase();
  logger.info('Test database setup complete');
});

afterAll(async () => {
  // Clean up database connections
  logger.info('Cleaning up test database...');
  if (dbClient) {
    await dbClient.$disconnect();
  }
  logger.info('Test database cleanup complete');
});