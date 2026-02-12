import { prisma as dbClient } from "../../config/database";
import { Prisma } from '@prisma/client';
import logger from "../../utils/logger";

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
  location_geo?: {
    type: string;
    coordinates: number[];
  };
  published_at?: Date | string;
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


export const getJobs = async (page: number = 1, limit: number = 50, filters?: {
  company_id?: string;
  location?: string;
  experience_level?: string;
  employment_type?: string;
  remote?: boolean;
  status?: string;
  q?: string;
  skills?: string[];
  seniority?: string;
  languages?: string[];
  lat?: number;
  lng?: number;
  radius_km?: number;
  dateRange?: string; // Add this
  looseSeniority?: boolean;
  workModes?: string[];
  salaryMin?: number;
  salaryMax?: number;
}, userId?: string) => {
  const skip = (page - 1) * limit;
  const where: Prisma.JobWhereInput = {};
  const andConditions: Prisma.JobWhereInput[] = [];

  if (filters) {
    if (filters.status) {
      andConditions.push({ status: filters.status });
    }

    if (filters.company_id) {
      andConditions.push({ company_id: filters.company_id });
    }

    if (filters.location && (!filters.lat || !filters.lng)) {
      // Improved location fallback: Job contains Filter OR Filter contains Job
      // to handle "Munich" vs "Munich, Germany" bidirectional matching.
      andConditions.push({
        OR: [
          { location: { contains: filters.location, mode: 'insensitive' } },
          { location_raw: { contains: filters.location, mode: 'insensitive' } },
          { formatted_address_verified: { contains: filters.location, mode: 'insensitive' } }
        ]
      });
    }

    if (filters.employment_type) {
      // Map common frontend availability values to backend employment_type values if needed, 
      // or just rely on the frontend sending correct values.
      // The availability mapping in the frontend seems to be: 
      // full-time, part-time, contract, freelance, internship
      // Backend text is usually: Full-time, Part-time, Contract, etc.
      // Let's use a flexible contains or case-insensitive match
      andConditions.push({ employment_type: { contains: filters.employment_type, mode: 'insensitive' } });
    }

    if (filters.experience_level) {
      andConditions.push({ experience_level: filters.experience_level });
    }

    if (filters.seniority) {
      if (filters.looseSeniority) {
        andConditions.push({
          OR: [
            { seniority: { equals: filters.seniority, mode: "insensitive" } },
            { seniority: null },
            { seniority: { equals: "Unknown", mode: "insensitive" } },
            { seniority: { equals: "", mode: "insensitive" } }
          ]
        });
      } else {
        andConditions.push({ seniority: { equals: filters.seniority, mode: "insensitive" } });
      }
    }

    if (filters.remote !== undefined) {
      andConditions.push({
        OR: [
          { remote: filters.remote },
          { is_remote: filters.remote }
        ]
      });
    }

    if (filters.workModes && filters.workModes.length > 0) {
      const wantsRemote = filters.workModes.includes('remote');
      const wantsOnsite = filters.workModes.includes('onsite') || filters.workModes.includes('hybrid');

      if (wantsRemote && !wantsOnsite) {
        // User wants ONLY remote
        andConditions.push({
          OR: [
            { remote: true },
            { is_remote: true }
          ]
        });
      } else if (wantsOnsite && !wantsRemote) {
        // User wants ONLY onsite/hybrid (non-remote)
        andConditions.push({
          OR: [
            { remote: false },
            { is_remote: false }
          ]
        });
      }
      // If user wants BOTH, we don't add any filter (show all)
    }

    if (filters.dateRange) {
      const now = new Date();
      const fromDate = new Date(now.getTime());

      switch (filters.dateRange) {
        case 'today':
          // Start of today in local server time - better to use UTC if DB is UTC
          fromDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          fromDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          fromDate.setMonth(now.getMonth() - 1);
          break;
        case '3months':
          fromDate.setMonth(now.getMonth() - 3);
          break;
      }

      if (fromDate) {
        andConditions.push({
          OR: [
            { published_at: { gte: fromDate } },
            { created_at: { gte: fromDate } }
          ]
        });
      }
    }

    if (filters.languages && filters.languages.length > 0) {
      // Normalize languages
      const langMapping: { [key: string]: string } = {
        'italian': 'it', 'italiano': 'it',
        'english': 'en', 'inglese': 'en',
        'spanish': 'es', 'spagnolo': 'es',
        'french': 'fr', 'francese': 'fr',
        'german': 'de', 'tedesco': 'de',
        'portuguese': 'pt', 'portoghese': 'pt',
        'russian': 'ru', 'russo': 'ru',
        'chinese': 'zh', 'cinese': 'zh',
        'japanese': 'ja', 'giapponese': 'ja',
        'arabic': 'ar', 'arabo': 'ar',
        'dutch': 'nl', 'olandese': 'nl',
        'swedish': 'sv', 'svedese': 'sv'
      };

      const normalizedLangs = new Set<string>();
      filters.languages.forEach(l => {
        const lower = l.toLowerCase();
        normalizedLangs.add(lower);
        if (langMapping[lower]) {
          normalizedLangs.add(langMapping[lower]);
        }
        Object.entries(langMapping).forEach(([full, code]) => {
          if (code === lower) normalizedLangs.add(full);
        });
      });

      andConditions.push({ language: { in: Array.from(normalizedLangs) } });
    }

    if (filters.q) {
      const qVariations = [
        filters.q,
        filters.q.toLowerCase(),
        filters.q.toUpperCase(),
        filters.q.charAt(0).toUpperCase() + filters.q.slice(1).toLowerCase()
      ];

      andConditions.push({
        OR: [
          { title: { contains: filters.q, mode: 'insensitive' } },
          { description: { contains: filters.q, mode: 'insensitive' } },
          { location: { contains: filters.q, mode: 'insensitive' } },
          { skills: { hasSome: qVariations } },
          { technical_skills: { hasSome: qVariations } }
        ]
      });
    }

    if (filters.skills) {
      const expandedSkills = new Set<string>();
      filters.skills.forEach(skill => {
        expandedSkills.add(skill);
        expandedSkills.add(skill.toLowerCase());
        expandedSkills.add(skill.toUpperCase());
        expandedSkills.add(skill.charAt(0).toUpperCase() + skill.slice(1).toLowerCase());
      });

      const skillsList = Array.from(expandedSkills);
      andConditions.push({
        OR: [
          { skills: { hasSome: skillsList } },
          { technical_skills: { hasSome: skillsList } }
        ]
      });
    }

    // Salary range filtering
    // If salaryMin is set, filter jobs where salary_max >= salaryMin (job's max is at least user's min)
    if (filters.salaryMin !== undefined) {
      andConditions.push({
        salary_max: { gte: filters.salaryMin }
      });
    }
    // If salaryMax is set, filter jobs where salary_min <= salaryMax (job's min is at most user's max)
    if (filters.salaryMax !== undefined) {
      andConditions.push({
        salary_min: { lte: filters.salaryMax }
      });
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
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
  const results = await Promise.all([
    dbClient.job.findMany({
      where,
      skip: filters?.lat && filters?.lng ? undefined : skip,
      take: filters?.lat && filters?.lng ? undefined : limit,
      include: {
        company: true
      },
      orderBy: {
        created_at: 'desc'
      }
    }),
    dbClient.job.count({ where })
  ]);
  const jobsRaw = results[0];
  let total = results[1];


  // Aggregate likes, dislikes, views and clicks for these jobs
  const jobIds = jobsRaw.map(j => j.id);
  const [reactionCounts, interactionCounts, userReactions, userFavorites] = await Promise.all([
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
    dbClient.interaction.groupBy({
      by: ['trackable_id', 'type'],
      where: {
        trackable_type: 'job',
        trackable_id: { in: jobIds }
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
  const viewCountMap = new Map<string, number>();
  const clickCountMap = new Map<string, number>();

  reactionCounts.forEach(r => {
    if (r.type === 'LIKE' || !r.type) {
      const current = likeCountMap.get(r.likeable_id) || 0;
      likeCountMap.set(r.likeable_id, current + r._count._all);
    } else if (r.type === 'DISLIKE') {
      const current = dislikeCountMap.get(r.likeable_id) || 0;
      dislikeCountMap.set(r.likeable_id, current + r._count._all);
    }
  });

  interactionCounts.forEach(i => {
    if (i.type === 'VIEW') {
      const current = viewCountMap.get(i.trackable_id) || 0;
      viewCountMap.set(i.trackable_id, current + i._count._all);
    } else if (i.type === 'APPLY') {
      const current = clickCountMap.get(i.trackable_id) || 0;
      clickCountMap.set(i.trackable_id, current + i._count._all);
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

  // Fetch comment counts for all jobs in batch
  const commentCounts = await dbClient.comment.groupBy({
    by: ['commentable_id'],
    where: {
      commentable_type: 'job',
      commentable_id: { in: jobIds }
    },
    _count: {
      _all: true
    }
  });

  const commentCountMap = new Map<string, number>();
  commentCounts.forEach(c => {
    commentCountMap.set(c.commentable_id, c._count._all);
  });

  let jobs = jobsRaw.map(job => {
    // Normalize employment_type to availability
    let availability = 'not_specified';
    if (job.employment_type) {
      const et = job.employment_type.toLowerCase();
      if (et.includes('full') || et.includes('tempo pieno')) availability = 'full_time';
      else if (et.includes('part') || et.includes('part-time')) availability = 'part_time';
      else if (et.includes('hybrid') || et.includes('ibrido')) availability = 'hybrid';
      else if (et.includes('contract') || et.includes('contratto')) availability = 'contract';
      else if (et.includes('freelance') || et.includes('partita iva')) availability = 'freelance';
      else if (et.includes('intern') || et.includes('tirocinio') || et.includes('stage')) availability = 'internship';
      else availability = et.replace(/-/g, '_'); // Fallback
    }

    return {
      ...job,
      location: job.location || job.location_raw || job.formatted_address_verified || job.city,
      likes: likeCountMap.get(job.id) || 0,
      dislikes: dislikeCountMap.get(job.id) || 0,
      user_reaction: userReactionMap.get(job.id) || null,
      is_favorite: userFavoriteSet.has(job.id),
      comments_count: commentCountMap.get(job.id) || 0,
      views_count: viewCountMap.get(job.id) || job.views_count || 0,
      clicks_count: clickCountMap.get(job.id) || job.clicks_count || 0,
      availability: availability, // Explicitly map availability
      company: job.company ? {
        id: job.company.id,
        name: job.company.name,
        logo: job.company.logo_url || job.company.logo || null,
        description: job.company.description,
        website: job.company.website,
        trustScore: job.company.trustScore,
        totalRatings: job.company.totalRatings,
        totalLikes: job.company.totalLikes,
        totalDislikes: job.company.totalDislikes,
        created_at: job.company.created_at,
        updated_at: job.company.updated_at
      } : null
    };
  });

  // Apply radius filtering if coordinates provided
  if (filters?.lat !== undefined && filters?.lng !== undefined && filters?.radius_km) {
    jobs = jobs.filter(job => {
      // Check for coordinates
      if (job.location_geo && job.location_geo.coordinates && job.location_geo.coordinates.length >= 2) {
        const [jobLng, jobLat] = job.location_geo.coordinates;
        const distance = getDistance(filters.lat!, filters.lng!, jobLat, jobLng);
        const matchesRadius = distance <= filters.radius_km!;

        // If job has valid coordinates, it MUST be within radius OR match the specific text exactly (optional, but radius is safer)
        if (matchesRadius) return true;

        // Optional: If you want to allow jobs that are "far" but match the text string exactly (e.g. user typed "New York" but selected center is far from this specific "New York" job?)
        // For now, let's assume if it has coords, radius is the authority.
        return false;
      }

      // Fallback: Job has NO coordinates.
      // If we have a text location filter, check if it matches.
      if (filters.location) {
        // Simple case-insensitive inclusion check
        return job.location && job.location.toLowerCase().includes(filters.location.toLowerCase());
      }

      // If no text filter and no coords, we can't verify location relevance, so we drop it
      // (Or should we keep it? Usually if searching by location, we expect location relevance).
      return false;
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
export const getJobById = async (id: string, userId?: string) => {
  if (!id || id === 'undefined') return null;

  try {
    const job = await dbClient.job.findUnique({
      where: { id },
      include: {
        company: true
      }
    });

    if (!job) return null;

    // Get interaction counts for the job
    const [reactionCounts, interactionCounts, commentCount] = await Promise.all([
      dbClient.like.groupBy({
        by: ['type'],
        where: {
          likeable_id: id,
          likeable_type: 'job'
        },
        _count: {
          _all: true
        }
      }),
      dbClient.interaction.groupBy({
        by: ['type'],
        where: {
          trackable_type: 'job',
          trackable_id: id
        },
        _count: {
          _all: true
        }
      }),
      dbClient.comment.count({
        where: {
          commentable_id: id,
          commentable_type: 'job'
        }
      })
    ]);

    let likes = 0;
    let dislikes = 0;
    let views = 0;
    let clicks = 0;

    reactionCounts.forEach(r => {
      // Handle legacy records with null type as LIKE
      if (r.type === 'LIKE' || !r.type) {
        likes += r._count._all;
      } else if (r.type === 'DISLIKE') {
        dislikes += r._count._all;
      }
    });

    interactionCounts.forEach(i => {
      if (i.type === 'VIEW') {
        views += i._count._all;
      } else if (i.type === 'APPLY') {
        clicks += i._count._all;
      }
    });

    // Get user reaction if userId provided
    let user_reaction = null;
    let is_favorite = false;
    if (userId) {
      const [reaction, favorite] = await Promise.all([
        dbClient.like.findFirst({ where: { likeable_id: id, likeable_type: 'job', user_id: userId } }),
        dbClient.favorite.findUnique({ where: { user_id_job_id: { user_id: userId, job_id: id } } })
      ]);
      user_reaction = reaction?.type || null;
      is_favorite = !!favorite;
    }

    // Normalize employment_type to availability
    let availability = 'not_specified';
    if (job.employment_type) {
      const et = job.employment_type.toLowerCase();
      if (et.includes('full') || et.includes('tempo pieno')) availability = 'full_time';
      else if (et.includes('part') || et.includes('part-time')) availability = 'part_time';
      else if (et.includes('hybrid') || et.includes('ibrido')) availability = 'hybrid';
      else if (et.includes('contract') || et.includes('contratto')) availability = 'contract';
      else if (et.includes('freelance') || et.includes('partita iva')) availability = 'freelance';
      else if (et.includes('intern') || et.includes('tirocinio') || et.includes('stage')) availability = 'internship';
      else availability = et.replace(/-/g, '_');
    }

    return {
      ...job,
      location: job.location || job.location_raw || job.formatted_address_verified || job.city,
      likes,
      dislikes,
      user_reaction,
      is_favorite,
      availability,
      comments_count: commentCount || 0,
      views_count: views > 0 ? views : (job.views_count || 0),
      clicks_count: clicks > 0 ? clicks : (job.clicks_count || 0),
      company: job.company ? {
        ...job.company,
        logo: job.company.logo_url || job.company.logo || null
      } : null
    };
  } catch (error) {
    logger.error({ id, error }, `Error fetching job ${id}`);
    return null;
  }
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
  return await dbClient.$transaction(async (tx) => {
    // Delete all related data first to ensure clean deletion
    await tx.favorite.deleteMany({ where: { job_id: jobUuid } });
    await tx.comment.deleteMany({ where: { commentable_id: jobUuid, commentable_type: 'job' } });
    await tx.like.deleteMany({ where: { likeable_id: jobUuid, likeable_type: 'job' } });
    await tx.interaction.deleteMany({ where: { trackable_type: 'job', trackable_id: jobUuid } });

    // Delete the job
    return await tx.job.delete({
      where: { id: jobUuid }
    });
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
      remote: data.remote || false,
      location_geo: data.location_geo,
      link: data.link,
      source: data.source,
      published_at: data.published_at ? new Date(data.published_at) : undefined
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

export const getTopSkills = async (limit: number = 10, year?: number) => {
  const where: Prisma.JobWhereInput = {};

  if (year) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year + 1, 0, 1);

    where.OR = [
      { published_at: { gte: startDate, lt: endDate } },
      { created_at: { gte: startDate, lt: endDate } }
    ];
  }

  const jobsRaw = await dbClient.job.findMany({ // Changed from 'const jobs' to 'const jobsRaw'
    where,
    select: {
      skills: true,
      technical_skills: true
    }
  });

  const skillCounts: Record<string, number> = {};

  const processSkills = (skillsArray: string[] | undefined | null) => {
    if (Array.isArray(skillsArray)) {
      skillsArray.forEach((skill) => {
        if (typeof skill === 'string') {
          const normalizedSkill = skill.trim();
          // Capitalize first letter for consistency
          const formattedSkill = normalizedSkill.charAt(0).toUpperCase() + normalizedSkill.slice(1);
          if (formattedSkill) {
            skillCounts[formattedSkill] = (skillCounts[formattedSkill] || 0) + 1;
          }
        }
      });
    }
  };

  jobsRaw.forEach(job => {
    processSkills(job.skills);
    processSkills(job.technical_skills);
  });

  return Object.entries(skillCounts)
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
};

import { trackInteraction } from "../tracking/tracking.service";

export const trackJobInteraction = async (
  jobId: string,
  type: 'VIEW' | 'APPLY',
  userId?: string,
  fingerprint?: string
) => {
  return await trackInteraction(
    jobId,
    'job',
    type,
    userId,
    fingerprint
  );
};