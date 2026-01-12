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
    ] = await Promise.all([
        dbClient.user.count(isFiltered ? { where: { created_at: { lt: endDate } } } : undefined),
        dbClient.user.count({ where: { created_at: { gte: startDate, lt: endDate } } }),
        dbClient.job.count(isFiltered ? { where: { created_at: { lt: endDate } } } : undefined),
        dbClient.job.count({ where: { created_at: { gte: startDate, lt: endDate } } }),
        dbClient.company.count(isFiltered ? { where: { created_at: { lt: endDate } } } : undefined),
        dbClient.company.count({ where: { created_at: { gte: startDate, lt: endDate } } }),
        dbClient.comment.count(isFiltered ? { where: { created_at: { lt: endDate } } } : undefined),
        dbClient.like.count(isFiltered ? { where: { created_at: { lt: endDate } } } : undefined),
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
                skillsArray.forEach((skill: any) => {
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
            trends: trendData,
            topSkills,
            locations
        },
    };
};
