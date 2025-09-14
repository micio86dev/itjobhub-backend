import { types } from 'cassandra-driver';

export interface User {
  id: types.Uuid;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'user';
  created_at: Date;
  updated_at: Date;
}

export interface Company {
  id: types.Uuid;
  name: string;
  description?: string;
  website?: string;
  industry?: string;
  size?: string;
  location?: string;
  logo_url?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Job {
  id: types.Uuid;
  company_id: types.Uuid;
  title: string;
  description: string;
  requirements?: string[];
  benefits?: string[];
  salary_min?: number;
  salary_max?: number;
  location?: string;
  remote: boolean;
  employment_type: 'full-time' | 'part-time' | 'contract' | 'internship';
  experience_level: 'junior' | 'mid' | 'senior' | 'lead';
  skills?: Set<string>;
  status: 'active' | 'closed' | 'draft';
  created_at: Date;
  updated_at: Date;
  expires_at?: Date;
}

export interface Comment {
  id: types.Uuid;
  job_id: types.Uuid;
  user_id: types.Uuid;
  content: string;
  created_at: Date;
  updated_at: Date;
}

export interface Like {
  user_id: types.Uuid;
  job_id: types.Uuid;
  created_at: Date;
}

export interface UserProfile {
  id: types.Uuid;
  user_id: types.Uuid;
  languages: string[];
  skills: string[];
  seniority?: string;
  availability?: string;
  cv_url?: string;
  bio?: string;
  github?: string;
  linkedin?: string;
  website?: string;
  created_at: Date;
  updated_at: Date;
}

export interface RefreshToken {
  refresh_token: string;
  user_id: types.Uuid;
  expires_at: Date;
  created_at: Date;
}

export type DatabaseModels = {
  users: User;
  companies: Company;
  jobs: Job;
  comments: Comment;
  likes: Like;
  user_profiles: UserProfile;
  refresh_tokens: RefreshToken;
};

export type CreateUser = Omit<User, 'id' | 'created_at' | 'updated_at'> & {
  id?: types.Uuid;
  created_at?: Date;
  updated_at?: Date;
};

export type CreateCompany = Omit<Company, 'id' | 'created_at' | 'updated_at'> & {
  id?: types.Uuid;
  created_at?: Date;
  updated_at?: Date;
};

export type CreateJob = Omit<Job, 'id' | 'created_at' | 'updated_at'> & {
  id?: types.Uuid;
  created_at?: Date;
  updated_at?: Date;
};

export type CreateComment = Omit<Comment, 'id' | 'created_at' | 'updated_at'> & {
  id?: types.Uuid;
  created_at?: Date;
  updated_at?: Date;
};

export type CreateLike = Omit<Like, 'created_at'> & {
  created_at?: Date;
};

export type UpdateUser = Partial<Omit<User, 'id' | 'created_at'>> & {
  updated_at?: Date;
};

export type UpdateCompany = Partial<Omit<Company, 'id' | 'created_at'>> & {
  updated_at?: Date;
};

export type UpdateJob = Partial<Omit<Job, 'id' | 'created_at'>> & {
  updated_at?: Date;
};

export type UpdateComment = Partial<Omit<Comment, 'id' | 'job_id' | 'user_id' | 'created_at'>> & {
  updated_at?: Date;
};

export type CreateUserProfile = Omit<UserProfile, 'id' | 'created_at' | 'updated_at'> & {
  id?: types.Uuid;
  created_at?: Date;
  updated_at?: Date;
};

export type UpdateUserProfile = Partial<Omit<UserProfile, 'id' | 'user_id' | 'created_at'>> & {
  updated_at?: Date;
};