#!/usr/bin/env bun
import { dbClient } from './client';
import { validateData } from './validation';

async function main() {
  try {
    console.log('🚀 Starting Cassandra migration...');

    // Connect to Cassandra
    await dbClient.connect();

    // Initialize schema (create tables and indexes)
    await dbClient.initializeSchema();

    console.log('✅ Migration completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Update your services to use the new ORM');
    console.log('2. Remove Prisma dependencies from package.json');
    console.log('3. Update environment variables');
    console.log('\n🔧 Usage example:');
    console.log(`
import { dbClient } from './db/client';

// Connect to database
await dbClient.connect();

// Use like Prisma
const users = await prismausers.findMany();
const user = await prismausers.create({
  email: 'test@example.com',
  password: 'hashedPassword',
  name: 'John Doe'
});

// Raw queries
const result = await prismaraw('SELECT * FROM users WHERE email = ?', ['test@example.com']);
    `);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await dbClient.disconnect();
  }
}

// Health check function
export async function healthCheck(): Promise<boolean> {
  try {
    await dbClient.connect();
    const isHealthy = await dbClient.healthCheck();
    await dbClient.disconnect();
    return isHealthy;
  } catch {
    return false;
  }
}

// Validation test function
export function testValidation() {
  try {
    // Test user validation
    validateData('users', {
      email: 'invalid-email',
      password: '123',
      name: 'Jo'
    });
  } catch (error: any) {
    console.log('✅ Validation working:', error.message);
  }

  try {
    // Test valid user
    validateData('users', {
      email: 'test@example.com',
      password: 'validPassword123',
      name: 'John Doe',
      role: 'user'
    });
    console.log('✅ Valid data passed validation');
  } catch (error: any) {
    console.log('❌ Valid data failed validation:', error.message);
  }
}

if (import.meta.main) {
  main();
}