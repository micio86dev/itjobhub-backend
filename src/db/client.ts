import { Client } from 'cassandra-driver';
import { CassandraORM } from './query-builder';

class DatabaseClient {
  private client: Client;
  private _db: CassandraORM | null = null;

  constructor() {
    this.client = new Client({
      contactPoints: [process.env.CASSANDRA_HOST || '127.0.0.1'],
      localDataCenter: process.env.CASSANDRA_DC || 'datacenter1',
      keyspace: process.env.CASSANDRA_KEYSPACE || 'itjobhub',
      credentials: process.env.CASSANDRA_USER && process.env.CASSANDRA_PASSWORD
        ? {
            username: process.env.CASSANDRA_USER,
            password: process.env.CASSANDRA_PASSWORD
          }
        : undefined
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      this._db = new CassandraORM(this.client);
      console.log('✅ Connected to Cassandra');
    } catch (error) {
      console.error('❌ Failed to connect to Cassandra:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.client.shutdown();
    this._db = null;
    console.log('✅ Disconnected from Cassandra');
  }

  get db(): CassandraORM {
    if (!this._db) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this._db;
  }

  async initializeSchema(): Promise<void> {
    if (!this._db) {
      throw new Error('Database not connected. Call connect() first.');
    }
    await this._db.createTables();
    console.log('✅ Database schema initialized');
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.execute('SELECT now() FROM system.local');
      return true;
    } catch {
      return false;
    }
  }
}

export const dbClient = new DatabaseClient();
export { CassandraORM } from './query-builder';