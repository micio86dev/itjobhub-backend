import { prisma } from "../../config/database";

export interface JobCreateInput {
  title: string;
  description: string;
  companyId: string;
  location?: string;
  salaryMin?: number;
  salaryMax?: number;
  seniority?: string;
  skills?: string[];
  remote?: boolean;
}

export interface JobUpdateInput {
  title?: string;
  description?: string;
  location?: string;
  salaryMin?: number;
  salaryMax?: number;
  seniority?: string;
  skills?: string[];
  remote?: boolean;
  active?: boolean;
}

export interface JobImportInput {
  title: string;
  description: string;
  company: {
    name: string;
    description?: string;
    website?: string;
    logo?: string;
  };
  location?: string;
  salaryMin?: number;
  salaryMax?: number;
  seniority?: string;
  skills?: string[];
  remote?: boolean;
}

/**
 * Create a new job
 * @param data - Job data
 * @returns Created job
 */
export const createJob = async (data: JobCreateInput) => {
  return await prisma.job.create({
    data: {
      ...data,
      skills: data.skills || []
    },
    include: {
      company: true
    }
  });
};

/**
 * Get all jobs with pagination
 * @param page - Page number
 * @param limit - Number of items per page
 * @param filters - Optional filters
 * @returns Jobs with pagination info
 */
export const getJobs = async (page: number = 1, limit: number = 10, filters?: any) => {
  const skip = (page - 1) * limit;
  
  const where: any = {
    active: true
  };
  
  // Apply filters if provided
  if (filters) {
    if (filters.companyId) {
      where.companyId = filters.companyId;
    }
    if (filters.location) {
      where.location = {
        contains: filters.location,
        mode: "insensitive"
      };
    }
    if (filters.seniority) {
      where.seniority = filters.seniority;
    }
    if (filters.skills && filters.skills.length > 0) {
      where.skills = {
        hasSome: filters.skills
      };
    }
    if (filters.remote !== undefined) {
      where.remote = filters.remote;
    }
  }
  
  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where,
      skip,
      take: limit,
      include: {
        company: {
          select: {
            id: true,
            name: true,
            logo: true,
            trustScore: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    }),
    prisma.job.count({ where })
  ]);
  
  return {
    jobs,
    pagination: {
      page,
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
  return await prisma.job.findUnique({
    where: { id },
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
  return await prisma.job.update({
    where: { id },
    data,
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
  return await prisma.job.delete({
    where: { id }
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
  logo?: string;
}) => {
  // First, try to find existing company by name
  let company = await prisma.company.findFirst({
    where: {
      name: {
        equals: companyData.name,
        mode: "insensitive"
      }
    }
  });

  // If company doesn't exist, create it
  if (!company) {
    company = await prisma.company.create({
      data: {
        name: companyData.name,
        description: companyData.description || `Jobs at ${companyData.name}`,
        website: companyData.website,
        logo: companyData.logo
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
  return await prisma.job.create({
    data: {
      title: data.title,
      description: data.description,
      companyId: company.id,
      location: data.location,
      salaryMin: data.salaryMin,
      salaryMax: data.salaryMax,
      seniority: data.seniority,
      skills: data.skills || [],
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
      const existingCompany = await prisma.company.findFirst({
        where: {
          name: {
            equals: jobData.company.name,
            mode: "insensitive"
          }
        }
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