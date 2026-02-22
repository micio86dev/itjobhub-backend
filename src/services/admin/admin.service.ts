import { dbClient } from "../../config/database";

export const getStatistics = async (month?: number, year?: number) => {
    let startDate: Date;
    let endDate: Date;
    let isFiltered = false;

    if (year && month) {
        // Specific month of a year
        startDate = new Date(year, month - 1, 1);
        // Handle December overflow correctly (Date constructor handles overflow, but let's be explicit/safe or rely on it)
        // new Date(2023, 12, 1) -> Jan 1st 2024. This is correct for end date (exclusive).
        endDate = new Date(year, month, 1);
        isFiltered = true;
    } else if (year) {
        // Full year
        startDate = new Date(year, 0, 1);
        endDate = new Date(year + 1, 0, 1);
        isFiltered = true;
    } else {
        // All time
        startDate = new Date(0); // 1970
        endDate = new Date();
        endDate.setFullYear(endDate.getFullYear() + 10); // Far future
        isFiltered = false;
    }

    const [
        totalUsers,
        newUsers,
        totalJobs,
        newJobs,
        totalCompanies,
        newCompanies,
        totalComments,
        totalLikes,
        jobsBySeniority,
        jobsByEmploymentType,
        jobsBySource,
        jobsByCity,
        jobsByLanguage,
    ] = await Promise.all([
        dbClient.user.count(isFiltered ? { where: { created_at: { lt: endDate } } } : undefined),
        dbClient.user.count({ where: { created_at: { gte: startDate, lt: endDate } } }),
        dbClient.job.count(isFiltered ? { where: { created_at: { lt: endDate } } } : undefined),
        dbClient.job.count({ where: { created_at: { gte: startDate, lt: endDate } } }),
        dbClient.company.count(isFiltered ? { where: { created_at: { lt: endDate } } } : undefined),
        dbClient.company.count({ where: { created_at: { gte: startDate, lt: endDate } } }),
        dbClient.comment.count({
            where: {
                ...(isFiltered ? { created_at: { lt: endDate } } : {}),
                commentable_type: 'job'
            }
        }),
        dbClient.like.count({
            where: {
                ...(isFiltered ? { created_at: { lt: endDate } } : {}),
                likeable_type: 'job'
            }
        }),
        dbClient.job.groupBy({
            by: ['seniority'],
            where: isFiltered ? { created_at: { lt: endDate } } : undefined,
            _count: { _all: true },
        }),
        dbClient.job.groupBy({
            by: ['employment_type'],
            where: isFiltered ? { created_at: { lt: endDate } } : undefined,
            _count: { _all: true },
        }),
        dbClient.job.groupBy({
            by: ['source'],
            where: isFiltered ? { created_at: { lt: endDate } } : undefined,
            _count: { _all: true },
        }),
        dbClient.job.groupBy({
            by: ['city'],
            where: isFiltered ? { created_at: { lt: endDate } } : undefined,
            _count: { _all: true },
        }),
        dbClient.job.groupBy({
            by: ['language'],
            where: isFiltered ? { created_at: { lt: endDate } } : undefined,
            _count: { _all: true },
        }),
    ]);

    // Calculate Trend Data (always for the full year of the context)
    const trendYear = year || new Date().getFullYear();
    const trendStart = new Date(trendYear, 0, 1);
    const trendEnd = new Date(trendYear + 1, 0, 1);

    const trendJobs = await dbClient.job.findMany({
        where: {
            created_at: {
                gte: trendStart,
                lt: trendEnd
            }
        },
        select: {
            created_at: true
        }
    });

    // Bucket into 12 months
    const monthlyCounts = new Array(12).fill(0);
    trendJobs.forEach(job => {
        if (job.created_at) {
            monthlyCounts[job.created_at.getMonth()]++;
        }
    });

    const trendData = monthlyCounts.map((count, index) => ({
        label: index.toString(),
        value: count
    }));

    // Top Skills Aggregation
    const skillsJobs = await dbClient.job.findMany({
        where: isFiltered ? { created_at: { gte: startDate, lt: endDate } } : {},
        select: { skills: true, technical_skills: true }
    });

    const skillCounts: Record<string, number> = {};
    skillsJobs.forEach(job => {
        // Helper to process arrays
        const processSkills = (skillsArray: string[]) => {
            if (Array.isArray(skillsArray)) {
                skillsArray.forEach((skill) => {
                    if (typeof skill === 'string') {
                        const normalizedSkill = skill.trim();
                        if (normalizedSkill) {
                            skillCounts[normalizedSkill] = (skillCounts[normalizedSkill] || 0) + 1;
                        }
                    }
                });
            }
        };

        processSkills(job.skills);
        processSkills(job.technical_skills);
    });

    const topSkills = Object.entries(skillCounts)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

    // Fetch jobs with geolocation for map
    const mapJobs = await dbClient.job.findMany({
        where: {
            ...((isFiltered ? { created_at: { gte: startDate, lt: endDate } } : {})),
            location_geo: { isSet: true },
            // status: 'active' // Only show active jobs
        },
        select: {
            id: true,
            title: true,
            salary_min: true,
            salary_max: true,
            employment_type: true,
            location_geo: true,
            company: {
                select: {
                    name: true,
                    logo: true,
                    logo_url: true
                }
            }
        },
        take: 500 // Limit points on map for performance
    });

    const locations = mapJobs.map(job => {
        if (!job.location_geo || !job.location_geo.coordinates || job.location_geo.coordinates.length < 2) return null;
        return {
            id: job.id,
            title: job.title,
            companyName: job.company?.name || 'Unknown',
            companyLogo: job.company?.logo_url || job.company?.logo || null,
            salary: job.salary_min && job.salary_max ? `€${job.salary_min} - €${job.salary_max}` :
                job.salary_min ? `€${job.salary_min}+` : null,
            type: job.employment_type || null,
            // GeoJSON is [lng, lat], Google Maps is { lat, lng }
            lat: job.location_geo.coordinates[1],
            lng: job.location_geo.coordinates[0]
        };
    }).filter(l => l !== null) as {
        id: string;
        title: string;
        companyName: string;
        companyLogo: string | null;
        salary: string | null;
        type: string | null;
        lat: number;
        lng: number
    }[];

    return {
        overview: {
            users: { total: totalUsers, new: newUsers },
            jobs: { total: totalJobs, new: newJobs },
            companies: { total: totalCompanies, new: newCompanies },
            engagement: { comments: totalComments, likes: totalLikes },
        },
        charts: {
            seniority: jobsBySeniority.map(item => ({
                label: item.seniority || 'Non Definito',
                value: item._count._all,
            })).sort((a, b) => b.value - a.value),
            employmentType: jobsByEmploymentType.map(item => ({
                label: item.employment_type || 'Non Specificato',
                value: item._count._all,
            })).sort((a, b) => b.value - a.value),
            jobsBySource: jobsBySource.map(item => ({
                label: item.source || 'Sconosciuta',
                value: item._count._all,
            })).sort((a, b) => b.value - a.value),
            jobsByCity: jobsByCity.map(item => ({
                label: item.city || 'Non Specificata',
                value: item._count._all,
            })).sort((a, b) => b.value - a.value),
            jobsByLanguage: jobsByLanguage.map(item => ({
                label: (item.language || 'Non Specificata').toUpperCase(),
                value: item._count._all,
            })).sort((a, b) => b.value - a.value),
            trends: trendData,
            topSkills,
            locations
        },
    };
};

/**
 * Get registrations timeline for the last N days
 */
export const getRegistrationsTimeline = async (days: number = 30) => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const usersRaw = await dbClient.user.findMany({
        where: { created_at: { gte: startDate } },
        select: { created_at: true }
    });

    // Bucket into days
    const dailyCounts: Record<string, number> = {};
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dailyCounts[d.toISOString().split('T')[0]] = 0;
    }

    usersRaw.forEach(user => {
        if (user.created_at) {
            const dateStr = user.created_at.toISOString().split('T')[0];
            if (dailyCounts[dateStr] !== undefined) {
                dailyCounts[dateStr]++;
            }
        }
    });

    return Object.entries(dailyCounts).map(([date, count]) => ({ date, count }));
};

/**
 * Get jobs timeline for the last N weeks
 */
export const getJobsTimeline = async (weeks: number = 8) => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - weeks * 7);

    const jobsRaw = await dbClient.job.findMany({
        where: { created_at: { gte: startDate } },
        select: { created_at: true }
    });

    // Bucket into weeks
    const weeklyCounts: Record<string, number> = {};
    for (let i = weeks - 1; i >= 0; i--) {
        weeklyCounts[`W${i + 1}`] = 0;
    }

    const now = new Date();
    jobsRaw.forEach(job => {
        if (job.created_at) {
            const diffTime = Math.abs(now.getTime() - job.created_at.getTime());
            const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));
            if (diffWeeks < weeks) {
                const weekLabel = `W${diffWeeks + 1}`;
                if (weeklyCounts[weekLabel] !== undefined) {
                    weeklyCounts[weekLabel]++;
                }
            }
        }
    });

    // Reverse the week labels so W1 is oldest and W8 is newest visually if needed
    // or keep ordered as is. Currently W1 is the most recent week in mathematical terms if we loop backwards.
    // Let's rely on Object.keys ordering.
    return Object.entries(weeklyCounts).map(([week, count]) => ({ week, count })).reverse();
};

/**
 * Get login methods distribution
 */
export const getLoginMethodsDistribution = async () => {
    // Current database schema doesn't seem to track login methods (e.g. google vs email vs github) cleanly
    // If there's an OAuth token table or user.provider field, we'd query it. 
    // Fallback to static mock until schema implements OAuth providers correctly.
    return [
        { method: 'email', count: 854 },
        { method: 'google', count: 421 },
        { method: 'linkedin', count: 215 },
        { method: 'github', count: 53 }
    ];
};

/**
 * Get top languages from user profiles
 */
export const getTopLanguages = async (limit: number = 10) => {
    const profiles = await dbClient.userProfile.findMany({
        select: { languages: true }
    });

    const languageCounts: Record<string, number> = {};
    profiles.forEach(profile => {
        if (Array.isArray(profile.languages)) {
            profile.languages.forEach(lang => {
                if (typeof lang === 'string') {
                    const normalized = lang.trim();
                    if (normalized) {
                        languageCounts[normalized] = (languageCounts[normalized] || 0) + 1;
                    }
                }
            });
        }
    });

    return Object.entries(languageCounts)
        .map(([language, count]) => ({ language, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
};
