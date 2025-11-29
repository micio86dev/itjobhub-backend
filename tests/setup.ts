import { beforeAll, afterAll } from 'bun:test';
import { setupDatabase } from '../src/config/database';
import { dbClient } from '../src/config/database';

beforeAll(async () => {
  // Setup test database connection
  console.log('Setting up test database...');
  await setupDatabase();
  console.log('Test database setup complete');
});

afterAll(async () => {
  // Clean up database connections
  console.log('Cleaning up test database...');
  if (dbClient) {
    await dbClient.disconnect();
  }
  console.log('Test database cleanup complete');
});