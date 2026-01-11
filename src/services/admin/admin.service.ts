import { dbClient } from "../../config/database";

export const getStatistics = async (month?: number, year?: number) => {
    let startDate: Date;
    let endDate: Date;
    let isFiltered = false;

    if (year !== undefined && month !== undefined) {
        startDate = new Date(year, month - 1, 1);
        endDate = new Date(year, month, 1);
        isFiltered = true;
    } else {
        // Return all-time stats by setting a very old start date and future end date
        startDate = new Date(0); // 1970
        endDate = new Date();
        endDate.setFullYear(endDate.getFullYear() + 10); // Far future
        isFiltered = false; // Important: this tells the counters not to apply the lt/gt filter for totals
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
    ] = await Promise.all([
        dbClient.user.count(isFiltered ? { where: { created_at: { lt: endDate } } } : {}),
        dbClient.user.count({ where: { created_at: { gte: startDate, lt: endDate } } }),
        dbClient.job.count(isFiltered ? { where: { created_at: { lt: endDate } } } : {}),
        dbClient.job.count({ where: { created_at: { gte: startDate, lt: endDate } } }),
        dbClient.company.count(isFiltered ? { where: { created_at: { lt: endDate } } } : {}),
        dbClient.company.count({ where: { created_at: { gte: startDate, lt: endDate } } }),
        dbClient.comment.count(isFiltered ? { where: { created_at: { lt: endDate } } } : {}),
        dbClient.like.count(isFiltered ? { where: { created_at: { lt: endDate } } } : {}),
        dbClient.job.groupBy({
            by: ['seniority'],
            where: isFiltered ? { created_at: { lt: endDate } } : {},
            _count: { _all: true },
        }),
        dbClient.job.groupBy({
            by: ['employment_type'],
            where: isFiltered ? { created_at: { lt: endDate } } : {},
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
            })),
            employmentType: jobsByEmploymentType.map(item => ({
                label: item.employment_type || 'Non Specificato',
                value: item._count._all,
            })),
            trends: trendData
        },
    };
};
