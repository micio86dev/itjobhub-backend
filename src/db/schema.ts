export interface TableDefinition {
  name: string;
  columns: Record<string, ColumnDefinition>;
  primaryKey: string | string[];
  clusteringColumns?: string[];
  indexes?: string[];
}

export interface ColumnDefinition {
  type: CassandraDataType;
  required?: boolean;
  default?: any;
}

export type CassandraDataType =
  | 'text'
  | 'varchar'
  | 'ascii'
  | 'int'
  | 'bigint'
  | 'float'
  | 'double'
  | 'boolean'
  | 'timestamp'
  | 'uuid'
  | 'timeuuid'
  | 'blob'
  | 'set<text>'
  | 'list<text>'
  | 'map<text,text>';

export const schema = {
  users: {
    name: 'users',
    columns: {
      id: { type: 'uuid', required: true },
      email: { type: 'text', required: true },
      password: { type: 'text', required: true },
      first_name: { type: 'text', required: true },
      last_name: { type: 'text', required: true },
      role: { type: 'text', default: 'user' },
      created_at: { type: 'timestamp', default: 'now()' },
      updated_at: { type: 'timestamp', default: 'now()' }
    },
    primaryKey: 'id',
    indexes: ['email']
  } as TableDefinition,

  companies: {
    name: 'companies',
    columns: {
      id: { type: 'uuid', required: true },
      name: { type: 'text', required: true },
      description: { type: 'text' },
      website: { type: 'text' },
      industry: { type: 'text' },
      size: { type: 'text' },
      location: { type: 'text' },
      logo_url: { type: 'text' },
      created_at: { type: 'timestamp', default: 'now()' },
      updated_at: { type: 'timestamp', default: 'now()' }
    },
    primaryKey: 'id'
  } as TableDefinition,

  jobs: {
    name: 'jobs',
    columns: {
      id: { type: 'uuid', required: true },
      company_id: { type: 'uuid', required: true },
      title: { type: 'text', required: true },
      description: { type: 'text', required: true },
      requirements: { type: 'list<text>' },
      benefits: { type: 'list<text>' },
      salary_min: { type: 'int' },
      salary_max: { type: 'int' },
      location: { type: 'text' },
      remote: { type: 'boolean', default: false },
      employment_type: { type: 'text', required: true },
      experience_level: { type: 'text', required: true },
      skills: { type: 'set<text>' },
      status: { type: 'text', default: 'active' },
      created_at: { type: 'timestamp', default: 'now()' },
      updated_at: { type: 'timestamp', default: 'now()' },
      expires_at: { type: 'timestamp' }
    },
    primaryKey: 'id',
    indexes: ['company_id', 'status', 'location']
  } as TableDefinition,

  comments: {
    name: 'comments',
    columns: {
      id: { type: 'uuid', required: true },
      job_id: { type: 'uuid', required: true },
      user_id: { type: 'uuid', required: true },
      content: { type: 'text', required: true },
      created_at: { type: 'timestamp', default: 'now()' },
      updated_at: { type: 'timestamp', default: 'now()' }
    },
    primaryKey: ['job_id', 'id'],
    clusteringColumns: ['id']
  } as TableDefinition,

  likes: {
    name: 'likes',
    columns: {
      user_id: { type: 'uuid', required: true },
      job_id: { type: 'uuid', required: true },
      created_at: { type: 'timestamp', default: 'now()' }
    },
    primaryKey: ['user_id', 'job_id']
  } as TableDefinition,

  user_profiles: {
    name: 'user_profiles',
    columns: {
      id: { type: 'uuid', required: true },
      user_id: { type: 'uuid', required: true },
      languages: { type: 'list<text>' },
      skills: { type: 'list<text>' },
      seniority: { type: 'text' },
      availability: { type: 'text' },
      cv_url: { type: 'text' },
      bio: { type: 'text' },
      github: { type: 'text' },
      linkedin: { type: 'text' },
      website: { type: 'text' },
      created_at: { type: 'timestamp', default: 'now()' },
      updated_at: { type: 'timestamp', default: 'now()' }
    },
    primaryKey: 'id',
    indexes: ['user_id']
  } as TableDefinition,

  refresh_tokens: {
    name: 'refresh_tokens',
    columns: {
      refresh_token: { type: 'text', required: true },
      user_id: { type: 'uuid', required: true },
      expires_at: { type: 'timestamp', required: true },
      created_at: { type: 'timestamp', default: 'now()' }
    },
    primaryKey: 'refresh_token',
    indexes: ['user_id']
  } as TableDefinition
} as const;

export type Schema = typeof schema;
export type TableName = keyof Schema;