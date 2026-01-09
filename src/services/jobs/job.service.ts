import { prisma as dbClient } from "../../config/database";

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
  employment_type?: 'full-time' | 'part-time' | 'contract' | 'internship' | string;
  experience_level?: 'junior' | 'mid' | 'senior' | 'lead' | string;
  skills?: string[];
  technical_skills?: string[];
  link?: string;
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
  employment_type?: string;
  experience_level?: string;
  skills?: string[];
  technical_skills?: string[];
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
  employment_type?: string;
  experience_level?: string;
  skills?: string[];
  technical_skills?: string[];
  remote?: boolean;
  link?: string;
  source?: string;
  language?: string;
}

/**
 * Create a new job
 * @param data - Job data
 * @returns Created job
 */
export const createJob = async (data: JobCreateInput) => {
  const companyUuid = data.company_id;

  return await dbClient.job.create({
    data: {
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
      skills: data.skills ? Array.from(data.skills) : [],
      link: data.link
    },
    include: {
      company: true
    }
  });
};

/**
 * Get all jobs with pagination
 * @param limit - Number of items per page
 * @param filters - Optional filters
 * @returns Jobs with count info
 */
import { Prisma } from '@prisma/client';

export const getJobs = async (limit: number = 50, filters?: {
  company_id?: string;
  location?: string;
  experience_level?: string;
  remote?: boolean;
  status?: string;
  q?: string;
  skills?: string[];
  seniority?: string;
}) => {
  const where: Prisma.JobWhereInput = {};

  if (filters) {
    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.company_id) {
      where.company_id = filters.company_id;
    }

    if (filters.location) {
      where.location = { contains: filters.location, mode: 'insensitive' };
    }

    if (filters.experience_level) {
      where.experience_level = filters.experience_level;
    }

    if (filters.seniority) {
      where.seniority = filters.seniority;
    }

    if (filters.remote !== undefined) {
      where.remote = filters.remote;
    }

    if (filters.q) {
      where.OR = [
        { title: { contains: filters.q, mode: 'insensitive' } },
        { description: { contains: filters.q, mode: 'insensitive' } },
        { location: { contains: filters.q, mode: 'insensitive' } },
        { skills: { has: filters.q } },
        { technical_skills: { has: filters.q } }
      ];
    }

    if (filters.skills && filters.skills.length > 0) {
      where.OR = [
        ...(where.OR || []),
        { skills: { hasSome: filters.skills } },
        { technical_skills: { hasSome: filters.skills } }
      ];
    }
  }

  const [jobs, total] = await Promise.all([
    dbClient.job.findMany({
      where,
      take: limit,
      include: {
        company: true
      },
      orderBy: {
        created_at: 'desc'
      }
    }),
    dbClient.job.count({ where })
  ]);

  return {
    jobs,
    pagination: {
      page: 1, // Simplified for now since routes don't pass page correctly here
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

/**
 * Get job by ID
 * @param id - Job ID
 * @returns Job details
 */
export const getJobById = async (id: string) => {
  const jobUuid = id;
  return await dbClient.job.findUnique({
    where: { id: jobUuid },
    include: {
      company: true
    }
  });
};

/**
 * Update job
 * @param id - Job ID
 * @param data - Update data
 * @returns Updated job
 */
export const updateJob = async (id: string, data: JobUpdateInput) => {
  const jobUuid = id;
  return await dbClient.job.update({
    where: { id: jobUuid },
    data: {
      ...data,
      skills: data.skills ? Array.from(data.skills) : undefined
    },
    include: {
      company: true
    }
  });
};

/**
 * Delete job
 * @param id - Job ID
 * @returns Deletion result
 */
export const deleteJob = async (id: string) => {
  const jobUuid = id;
  return await dbClient.job.delete({
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
  // First, try to find existing company by name
  const company = await dbClient.company.findFirst({
    where: { name: companyData.name }
  });

  // let company = companies.length > 0 ? companies[0] : null; // Removed

  // If company doesn't exist, create it
  if (!company) {
    return await dbClient.company.create({
      data: {
        name: companyData.name,
        description: companyData.description || `Jobs at ${companyData.name}`,
        website: companyData.website,
        logo_url: companyData.logo_url
      }
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
  return await dbClient.job.create({
    data: {
      title: data.title,
      description: data.description,
      company_id: company.id,
      location: data.location,
      salary_min: data.salary_min,
      salary_max: data.salary_max,
      employment_type: data.employment_type,
      experience_level: data.experience_level,
      skills: data.skills ? data.skills : [],
      remote: data.remote || false
    },
    include: {
      company: true
    }
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
      job: import('@prisma/client').Job;
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
      const existingCompany = await dbClient.company.findFirst({
        where: { name: jobData.company.name }
      });

      if (!existingCompany) {
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