import { Client, types } from 'cassandra-driver';
import { schema, TableDefinition, TableName, Schema } from './schema';
import { validateData } from './validation';
import { DatabaseModels } from './types';

type InferTableType<T extends TableDefinition> = {
  [K in keyof T['columns']]: T['columns'][K]['required'] extends true
    ? any
    : any | null;
} & { id?: any };

type TableTypes = DatabaseModels;

export interface WhereClause {
  [key: string]: any;
}

export interface OrderBy {
  [key: string]: 'asc' | 'desc';
}

export interface SelectOptions {
  where?: WhereClause;
  orderBy?: OrderBy;
  limit?: number;
  allowFiltering?: boolean;
}

export interface UpdateOptions {
  where: WhereClause;
}

export interface DeleteOptions {
  where: WhereClause;
}

export class QueryBuilder<T extends TableName> {
  constructor(
    private client: Client,
    private tableName: T
  ) {}

  async findMany(options: SelectOptions = {}): Promise<TableTypes[T][]> {
    let query = `SELECT * FROM ${this.tableName}`;
    const params: any[] = [];

    if (options.where && Object.keys(options.where).length > 0) {
      const whereClause = this.buildWhereClause(options.where, params);
      query += ` WHERE ${whereClause}`;
    }

    if (options.orderBy) {
      const orderClause = Object.entries(options.orderBy)
        .map(([key, direction]) => `${key} ${direction.toUpperCase()}`)
        .join(', ');
      query += ` ORDER BY ${orderClause}`;
    }

    if (options.limit) {
      query += ` LIMIT ${options.limit}`;
    }

    if (options.allowFiltering) {
      query += ' ALLOW FILTERING';
    }

    const result = await this.client.execute(query, params);
    return result.rows as unknown as TableTypes[T][];
  }

  async findFirst(options: SelectOptions = {}): Promise<TableTypes[T] | null> {
    const results = await this.findMany({ ...options, limit: 1 });
    return results.length > 0 ? results[0] : null;
  }

  async findUnique(where: WhereClause): Promise<TableTypes[T] | null> {
    return this.findFirst({ where });
  }

  async create(data: Partial<TableTypes[T]>): Promise<TableTypes[T]> {
    const tableDefinition = schema[this.tableName];

    // Validate data before creating
    validateData(this.tableName, data as any, false);

    // Add default values for columns with defaults
    const enrichedData = { ...data } as any;
    for (const [colName, colDef] of Object.entries(tableDefinition.columns)) {
      if (!(colName in enrichedData) && colDef.default !== undefined) {
        if (colDef.default === 'now()') {
          enrichedData[colName as keyof TableTypes[T]] = new Date() as any;
        } else {
          enrichedData[colName as keyof TableTypes[T]] = colDef.default;
        }
      }
    }

    // Generate UUID for id if not provided
    if (!enrichedData.id && 'id' in tableDefinition.columns) {
      enrichedData.id = types.Uuid.random() as any;
    }

    const finalColumns = Object.keys(enrichedData);
    const finalValues = Object.values(enrichedData);
    const finalPlaceholders = finalColumns.map(() => '?').join(', ');

    const query = `INSERT INTO ${this.tableName} (${finalColumns.join(', ')}) VALUES (${finalPlaceholders})`;

    await this.client.execute(query, finalValues);

    // Return the created record
    if (Array.isArray(tableDefinition.primaryKey)) {
      const whereClause: WhereClause = {};
      for (const key of tableDefinition.primaryKey) {
        whereClause[key] = enrichedData[key as keyof TableTypes[T]];
      }
      return (await this.findUnique(whereClause))!;
    } else {
      return (await this.findUnique({ [tableDefinition.primaryKey]: enrichedData[tableDefinition.primaryKey as keyof TableTypes[T]] }))!;
    }
  }

  async update(options: UpdateOptions & { data: Partial<TableTypes[T]> }): Promise<TableTypes[T] | null> {
    // Validate update data
    validateData(this.tableName, options.data as any, true);

    // Add updated_at timestamp if the field exists
    const updateData = { ...options.data } as any;
    if ('updated_at' in schema[this.tableName].columns) {
      updateData.updated_at = new Date();
    }

    const setClause = Object.keys(updateData)
      .map(key => `${key} = ?`)
      .join(', ');

    const params = [...Object.values(updateData)];
    const whereClause = this.buildWhereClause(options.where, params);

    const query = `UPDATE ${this.tableName} SET ${setClause} WHERE ${whereClause}`;

    await this.client.execute(query, params);

    // Return the updated record
    return this.findFirst({ where: options.where });
  }

  async delete(options: DeleteOptions): Promise<void> {
    const params: any[] = [];
    const whereClause = this.buildWhereClause(options.where, params);

    const query = `DELETE FROM ${this.tableName} WHERE ${whereClause}`;

    await this.client.execute(query, params);
  }

  async count(options: { where?: WhereClause } = {}): Promise<number> {
    let query = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    const params: any[] = [];

    if (options.where && Object.keys(options.where).length > 0) {
      const whereClause = this.buildWhereClause(options.where, params);
      query += ` WHERE ${whereClause}`;
    }

    const result = await this.client.execute(query, params);
    return parseInt(result.rows[0].count);
  }

  private buildWhereClause(where: WhereClause, params: any[]): string {
    return Object.entries(where)
      .map(([key, value]) => {
        params.push(value);
        return `${key} = ?`;
      })
      .join(' AND ');
  }
}

export class CassandraORM {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  get users() {
    return new QueryBuilder(this.client, 'users');
  }

  get companies() {
    return new QueryBuilder(this.client, 'companies');
  }

  get jobs() {
    return new QueryBuilder(this.client, 'jobs');
  }

  get comments() {
    return new QueryBuilder(this.client, 'comments');
  }

  get likes() {
    return new QueryBuilder(this.client, 'likes');
  }

  get user_profiles() {
    return new QueryBuilder(this.client, 'user_profiles');
  }

  get refresh_tokens() {
    return new QueryBuilder(this.client, 'refresh_tokens');
  }

  async raw(query: string, params?: any[]): Promise<any> {
    const result = await this.client.execute(query, params);
    return result.rows;
  }

  async createTables(): Promise<void> {
    for (const [tableName, tableDefinition] of Object.entries(schema)) {
      await this.createTable(tableDefinition);
    }
  }

  private async createTable(tableDefinition: TableDefinition): Promise<void> {
    const columns = Object.entries(tableDefinition.columns)
      .map(([name, def]) => `${name} ${def.type}`)
      .join(', ');

    let primaryKey: string;
    if (Array.isArray(tableDefinition.primaryKey)) {
      if (tableDefinition.clusteringColumns) {
        primaryKey = `(${tableDefinition.primaryKey[0]})${tableDefinition.clusteringColumns.length > 0 ? ', ' + tableDefinition.clusteringColumns.join(', ') : ''}`;
      } else {
        primaryKey = tableDefinition.primaryKey.join(', ');
      }
    } else {
      primaryKey = tableDefinition.primaryKey;
    }

    const createTableQuery = `CREATE TABLE IF NOT EXISTS ${tableDefinition.name} (${columns}, PRIMARY KEY (${primaryKey}))`;

    await this.client.execute(createTableQuery);

    // Create indexes
    if (tableDefinition.indexes) {
      for (const indexColumn of tableDefinition.indexes) {
        const indexName = `${tableDefinition.name}_${indexColumn}_idx`;
        const createIndexQuery = `CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableDefinition.name} (${indexColumn})`;
        await this.client.execute(createIndexQuery);
      }
    }
  }
}