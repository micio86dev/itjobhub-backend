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
  location_raw?: string;
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

export const getJobs = async (page: number = 1, limit: number = 50, filters?: {
  company_id?: string;
  location?: string;
  experience_level?: string;
  remote?: boolean;
  status?: string;
  q?: string;
  skills?: string[];
  seniority?: string;
  languages?: string[];
  lat?: number;
  lng?: number;
  radius_km?: number;
}, userId?: string) => {
  const skip = (page - 1) * limit;
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
      where.OR = [
        ...(where.OR || []),
        { remote: filters.remote },
        { is_remote: filters.remote }
      ];
    }

    if (filters.languages && filters.languages.length > 0) {
      // Normalize languages (e.g., "Italian" -> "it", "English" -> "en")
      const langMapping: { [key: string]: string } = {
        'italian': 'it',
        'italiano': 'it',
        'english': 'en',
        'inglese': 'en',
        'spanish': 'es',
        'spagnolo': 'es',
        'french': 'fr',
        'francese': 'fr',
        'german': 'de',
        'tedesco': 'de',
        'portuguese': 'pt',
        'portoghese': 'pt',
        'russian': 'ru',
        'russo': 'ru',
        'chinese': 'zh',
        'cinese': 'zh',
        'japanese': 'ja',
        'giapponese': 'ja',
        'arabic': 'ar',
        'arabo': 'ar',
        'dutch': 'nl',
        'olandese': 'nl',
        'swedish': 'sv',
        'svedese': 'sv'
      };

      const normalizedLangs = new Set<string>();
      filters.languages.forEach(l => {
        const lower = l.toLowerCase();
        normalizedLangs.add(lower);
        if (langMapping[lower]) {
          normalizedLangs.add(langMapping[lower]);
        }
        // Also add the reverse mapping if possible (e.g., if user provides "it", add "italian")
        Object.entries(langMapping).forEach(([full, code]) => {
          if (code === lower) {
            normalizedLangs.add(full);
          }
        });
      });

      where.language = { in: Array.from(normalizedLangs) };
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

    if (filters.skills) {
      where.OR = [
        ...(where.OR || []),
        { skills: { hasSome: filters.skills } },
        { technical_skills: { hasSome: filters.skills } }
      ];
    }
  }

  // Haversine formula to calculate distance between two points in km
  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Get jobs with comment counts
  let [jobsRaw, total] = await Promise.all([
    dbClient.job.findMany({
      where,
      skip: filters?.lat && filters?.lng ? undefined : skip,
      take: filters?.lat && filters?.lng ? undefined : limit,
      include: {
        company: true,
        _count: {
          select: {
            comments: true
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    }),
    dbClient.job.count({ where })
  ]);

  // Aggregate likes and dislikes for these jobs
  const jobIds = jobsRaw.map(j => j.id);
  const [reactionCounts, userReactions, userFavorites] = await Promise.all([
    dbClient.like.groupBy({
      by: ['likeable_id', 'type'],
      where: {
        likeable_type: 'job',
        likeable_id: { in: jobIds }
      },
      _count: {
        _all: true
      }
    }),
    // Fetch user specific reactions if userId is provided
    userId ? dbClient.like.findMany({
      where: {
        user_id: userId,
        likeable_type: 'job',
        likeable_id: { in: jobIds }
      }
    }) : Promise.resolve([]),
    // Fetch user favorites if userId is provided
    userId ? dbClient.favorite.findMany({
      where: {
        user_id: userId,
        job_id: { in: jobIds }
      }
    }) : Promise.resolve([])
  ]);

  // Map counts to jobs
  const likeCountMap = new Map<string, number>();
  const dislikeCountMap = new Map<string, number>();

  reactionCounts.forEach(r => {
    if (r.type === 'LIKE' || !r.type) { // Handle old records without type as LIKE if default applied, but prisma default handles it
      likeCountMap.set(r.likeable_id, r._count._all);
    } else if (r.type === 'DISLIKE') {
      dislikeCountMap.set(r.likeable_id, r._count._all);
    }
  });

  // Map user reactions
  const userReactionMap = new Map<string, string>();
  if (userReactions) {
    userReactions.forEach(r => {
      userReactionMap.set(r.likeable_id, r.type);
    });
  }

  // Map user favorites
  const userFavoriteSet = new Set<string>();
  if (userFavorites) {
    userFavorites.forEach(f => {
      userFavoriteSet.add(f.job_id);
    });
  }

  let jobs = jobsRaw.map(job => ({
    ...job,
    location: job.location || job.location_raw || job.formatted_address_verified || job.city,
    likes: likeCountMap.get(job.id) || 0,
    dislikes: dislikeCountMap.get(job.id) || 0,
    user_reaction: userReactionMap.get(job.id) || null,
    is_favorite: userFavoriteSet.has(job.id),
    comments_count: job._count.comments,
    // Remove Prisma's _count object from response if desired, or keep it.
    // We'll keep it for now but the mapped properties are easier to consume.
  }));

  // Apply radius filtering if coordinates provided
  if (filters?.lat !== undefined && filters?.lng !== undefined && filters?.radius_km) {
    jobs = jobs.filter(job => {
      if (!job.location_geo || !job.location_geo.coordinates || job.location_geo.coordinates.length < 2) {
        return false;
      }
      const [jobLng, jobLat] = job.location_geo.coordinates;
      const distance = getDistance(filters.lat!, filters.lng!, jobLat, jobLng);
      return distance <= filters.radius_km!;
    });
    total = jobs.length;
    // Apply limit after distance filtering
    jobs = jobs.slice(0, limit);
  }

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
      location_raw: data.location_raw,
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