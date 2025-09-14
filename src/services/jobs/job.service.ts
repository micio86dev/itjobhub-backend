import { dbClient } from "../../config/database";
import { types } from "../../db";

export interface JobCreateInput {
  title: string;
  description: string;
  company_id: string;
  requirements?: string[];
  benefits?: string[];
  location?: string;
  salary_min?: number;
  salary_max?: number;
  remote?: boolean;
  employment_type: 'full-time' | 'part-time' | 'contract' | 'internship';
  experience_level: 'junior' | 'mid' | 'senior' | 'lead';
  skills?: string[];
}

export interface JobUpdateInput {
  title?: string;
  description?: string;
  requirements?: string[];
  benefits?: string[];
  location?: string;
  salary_min?: number;
  salary_max?: number;
  remote?: boolean;
  employment_type?: 'full-time' | 'part-time' | 'contract' | 'internship';
  experience_level?: 'junior' | 'mid' | 'senior' | 'lead';
  skills?: Set<string>;
  status?: 'active' | 'closed' | 'draft';
}

export interface JobImportInput {
  title: string;
  description: string;
  company: {
    name: string;
    description?: string;
    website?: string;
    logo_url?: string;
  };
  location?: string;
  salary_min?: number;
  salary_max?: number;
  employment_type: 'full-time' | 'part-time' | 'contract' | 'internship';
  experience_level: 'junior' | 'mid' | 'senior' | 'lead';
  skills?: string[];
  remote?: boolean;
}

/**
 * Create a new job
 * @param data - Job data
 * @returns Created job
 */
export const createJob = async (data: JobCreateInput) => {
  const companyUuid = types.Uuid.fromString(data.company_id);

  return await prismajobs.create({
    company_id: companyUuid,
    title: data.title,
    description: data.description,
    requirements: data.requirements || [],
    benefits: data.benefits || [],
    salary_min: data.salary_min,
    salary_max: data.salary_max,
    location: data.location,
    remote: data.remote || false,
    employment_type: data.employment_type,
    experience_level: data.experience_level,
    skills: data.skills ? new Set(data.skills) : new Set()
  });
};

/**
 * Get all jobs with pagination
 * @param limit - Number of items per page
 * @param filters - Optional filters
 * @returns Jobs with count info
 */
export const getJobs = async (limit: number = 50, filters?: {
  company_id?: string;
  location?: string;
  experience_level?: string;
  remote?: boolean;
  status?: string;
}) => {
  const where: any = {
    status: 'active'
  };

  // Apply basic filters (Cassandra has limited filtering)
  if (filters) {
    if (filters.company_id) {
      where.company_id = types.Uuid.fromString(filters.company_id);
    }
    if (filters.location) {
      where.location = filters.location;
    }
    if (filters.experience_level) {
      where.experience_level = filters.experience_level;
    }
    if (filters.remote !== undefined) {
      where.remote = filters.remote;
    }
    if (filters.status) {
      where.status = filters.status;
    }
  }

  const jobs = await prismajobs.findMany({
    where,
    limit,
    allowFiltering: true
  });

  const total = await prismajobs.count({ where });

  return {
    jobs,
    total,
    limit
  };
};

/**
 * Get job by ID
 * @param id - Job ID
 * @returns Job details
 */
export const getJobById = async (id: string) => {
  const jobUuid = types.Uuid.fromString(id);
  return await prismajobs.findUnique({
    id: jobUuid
  });
};

/**
 * Update job
 * @param id - Job ID
 * @param data - Update data
 * @returns Updated job
 */
export const updateJob = async (id: string, data: JobUpdateInput) => {
  const jobUuid = types.Uuid.fromString(id);
  return await prismajobs.update({
    where: { id: jobUuid },
    data
  });
};

/**
 * Delete job
 * @param id - Job ID
 * @returns Deletion result
 */
export const deleteJob = async (id: string) => {
  const jobUuid = types.Uuid.fromString(id);
  return await prismajobs.delete({
    where: { id: jobUuid }
  });
};

/**
 * Find or create company by name
 * @param companyData - Company data
 * @returns Company
 */
export const findOrCreateCompany = async (companyData: {
  name: string;
  description?: string;
  website?: string;
  logo_url?: string;
}) => {
  // First, try to find existing company by name (using allowFiltering for non-key search)
  const companies = await prismacompanies.findMany({
    where: { name: companyData.name },
    limit: 1,
    allowFiltering: true
  });

  let company = companies.length > 0 ? companies[0] : null;

  // If company doesn't exist, create it
  if (!company) {
    company = await prismacompanies.create({
      name: companyData.name,
      description: companyData.description || `Jobs at ${companyData.name}`,
      website: companyData.website,
      logo_url: companyData.logo_url
    });
  }

  return company;
};

/**
 * Import a single job with company relation
 * @param data - Job import data
 * @returns Created job with company
 */
export const importJob = async (data: JobImportInput) => {
  // Find or create the company
  const company = await findOrCreateCompany(data.company);

  // Create the job with the company relation
  return await prismajobs.create({
    title: data.title,
    description: data.description,
    company_id: company.id,
    location: data.location,
    salary_min: data.salary_min,
    salary_max: data.salary_max,
    employment_type: data.employment_type,
    experience_level: data.experience_level,
    skills: data.skills ? new Set(data.skills) : new Set(),
    remote: data.remote || false
  });
};

/**
 * Batch import jobs with company relations
 * @param jobs - Array of job import data
 * @returns Import results with success/error details
 */
export const batchImportJobs = async (jobs: JobImportInput[]) => {
  const results: {
    successful: Array<{
      job: any;
      companyName: string;
    }>;
    failed: Array<{
      jobData: JobImportInput;
      error: string;
    }>;
    companiesCreated: Set<string>;
    summary: {
      totalJobs: number;
      successfulJobs: number;
      failedJobs: number;
      companiesCreated: number;
    };
  } = {
    successful: [],
    failed: [],
    companiesCreated: new Set<string>(),
    summary: {
      totalJobs: jobs.length,
      successfulJobs: 0,
      failedJobs: 0,
      companiesCreated: 0
    }
  };

  for (const jobData of jobs) {
    try {
      // Track if we're creating a new company
      const existingCompanies = await prismacompanies.findMany({
        where: { name: jobData.company.name },
        limit: 1,
        allowFiltering: true
      });

      if (existingCompanies.length === 0) {
        results.companiesCreated.add(jobData.company.name);
      }

      const importedJob = await importJob(jobData);
      results.successful.push({
        job: importedJob,
        companyName: jobData.company.name
      });
      results.summary.successfulJobs++;
    } catch (error) {
      results.failed.push({
        jobData,
        error: error instanceof Error ? error.message : String(error)
      });
      results.summary.failedJobs++;
    }
  }

  results.summary.companiesCreated = results.companiesCreated.size;

  return results;
};