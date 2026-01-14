import { prisma as dbClient } from "../../config/database";


interface MatchFactors {
    skillsMatch: number;
    seniorityMatch: number;
    locationMatch: number;
    trustScore: number;
    timeliness: number;
    competition: number;
    applicationRate: number;
}

interface MatchBreakdown {
    score: number;
    factors: MatchFactors;
    details: {
        matchedSkills: string[];
        missingSkills: string[];
        seniorityGap: string;
        locationStatus: string;
    };
}

export const calculateMatchScore = async (userId: string, jobId: string): Promise<MatchBreakdown> => {
    // 1. Fetch Data
    const [profile, job] = await Promise.all([
        dbClient.userProfile.findUnique({ where: { user_id: userId } }),
        dbClient.job.findUnique({
            where: { id: jobId },
            include: {
                company: true,
                _count: {
                    select: {
                        jobViews: { where: { type: 'APPLY' } } // Approximate applications count from 'APPLY' clicks
                    }
                }
            }
        })
    ]);

    if (!profile || !job) {
        throw new Error("Profile or Job not found");
    }

    const factors: MatchFactors = {
        skillsMatch: 0,
        seniorityMatch: 0,
        locationMatch: 0,
        trustScore: 0,
        timeliness: 0,
        competition: 0,
        applicationRate: 0
    };

    // --- 1. Skills Match (35%) ---
    // Formula: (skills_in_comune / skills_richieste) * 100
    const jobSkills = (job.skills || []).map(s => s.toLowerCase());
    const userSkills = (profile.skills || []).map(s => s.toLowerCase());

    // Also consider technical_skills if available
    const jobTechSkills = (job.technical_skills || []).map(s => s.toLowerCase());
    const allJobSkills = Array.from(new Set([...jobSkills, ...jobTechSkills]));

    let matchedSkills: string[] = [];
    let missingSkills: string[] = [];

    if (allJobSkills.length > 0) {
        matchedSkills = allJobSkills.filter(s => userSkills.includes(s));
        missingSkills = allJobSkills.filter(s => !userSkills.includes(s));
        factors.skillsMatch = (matchedSkills.length / allJobSkills.length) * 100;
    } else {
        // If no skills required, assume neutral/good match? Or 100?
        // Let's say 50% if generic, or 100% if truly no skills needed. 
        // Usually there are always skills. Let's give 100% if no requirements.
        factors.skillsMatch = 100;
    }

    // --- 2. Seniority Match (25%) ---
    const normalizeSeniority = (s?: string | null) => {
        if (!s) return -1;
        s = s.toLowerCase();
        if (s.includes('intern') || s.includes('stage')) return 0;
        if (s.includes('junior')) return 1;
        if (s.includes('mid') || s.includes('medior')) return 2;
        if (s.includes('senior')) return 3;
        if (s.includes('lead')) return 4;
        return -1;
    };

    const jobLevel = normalizeSeniority(job.seniority || job.experience_level);
    const userLevel = normalizeSeniority(profile.seniority);
    let seniorityGap = 'unknown';

    if (jobLevel === -1 && userLevel === -1) {
        factors.seniorityMatch = 50; // Both unknown
    } else if (jobLevel === -1 || userLevel === -1) {
        factors.seniorityMatch = 40; // One unknown
    } else {
        const diff = userLevel - jobLevel;
        if (diff === 0) {
            factors.seniorityMatch = 100; // Perfect
            seniorityGap = 'perfect';
        } else if (diff > 0) {
            // User is more senior (Overqualified)
            factors.seniorityMatch = 70;
            seniorityGap = 'overqualified';
        } else if (diff === -1) {
            // User is one step below (Underqualified close)
            factors.seniorityMatch = 30;
            seniorityGap = 'underqualified_close';
        } else {
            // User is too junior
            factors.seniorityMatch = 0;
            seniorityGap = 'underqualified_far';
        }
    }

    // --- 3. Location Match (15%) ---
    const isRemote = job.remote || job.is_remote;
    let locationStatus = 'unknown';

    if (isRemote) {
        factors.locationMatch = 100;
        locationStatus = 'remote';
    } else {
        const jobLoc = (job.location || job.location_raw || "").toLowerCase();
        const userLoc = (profile.location || "").toLowerCase();

        if (jobLoc && userLoc) {
            if (jobLoc.includes(userLoc) || userLoc.includes(jobLoc)) {
                factors.locationMatch = 100; // Exact/Close
                locationStatus = 'exact';
            } else {
                // Simple check: different strings. Ideally we'd check distance or province.
                // For now: 0 if different. 
                // Improvement: Check common Italian regions/provinces if available.
                // If "Milan" vs "Milano", includes() might handle it.
                // If "Rome" vs "Naples", 0.
                factors.locationMatch = 0;
                locationStatus = 'different';
            }
        } else {
            factors.locationMatch = 50; // Ambiguous
        }
    }

    // --- 4. Company Trust Score (10%) ---
    const trust = job.company?.trustScore || 80; // Default 80
    if (trust > 80) factors.trustScore = 100;
    else if (trust >= 60) factors.trustScore = 70;
    else if (trust >= 40) factors.trustScore = 50;
    else factors.trustScore = 20;

    // --- 5. Timeliness (10%) ---
    const pubDate = new Date(job.published_at || job.created_at || Date.now());
    const now = new Date();
    const hoursSince = (now.getTime() - pubDate.getTime()) / (1000 * 60 * 60);

    if (hoursSince <= 24) factors.timeliness = 100;
    else if (hoursSince <= 72) factors.timeliness = 70;
    else if (hoursSince <= 168) factors.timeliness = 40; // 7 days
    else if (hoursSince <= 336) factors.timeliness = 20; // 14 days
    else factors.timeliness = 0;

    // --- 6. Competition (Views) (5%) ---
    // Using fixed weight of 7% approx if we split the optional range
    const views = job.views_count || 0;
    if (views < 30) factors.competition = 100;
    else if (views < 100) factors.competition = 60;
    else if (views < 300) factors.competition = 30;
    else factors.competition = 0;

    // --- 7. Application Rate (5%) ---
    const applyCount = job._count?.jobViews || 0; // Assuming 'APPLY' type count
    const ratio = views > 0 ? (applyCount / views) * 100 : 0;

    // Logic inverse: Low ratio = good opportunity
    if (ratio < 15) factors.applicationRate = 100;
    else if (ratio < 30) factors.applicationRate = 60;
    else if (ratio < 50) factors.applicationRate = 30;
    else factors.applicationRate = 0;

    // --- Final Weighted Score ---
    // User requested changes (Jan 2026):
    // Skills: 42% (was 33%)
    // Seniority: 20% (was 23%)
    // Location: 14% (was 14%)
    // Trust: 9% (was 10%)
    // Timeliness: 8% (was 10%)
    // Competition: 4% (was 5%)
    // AppRatio: 3% (was 5%)

    const weightedScore =
        (factors.skillsMatch * 0.42) +
        (factors.seniorityMatch * 0.20) +
        (factors.locationMatch * 0.14) +
        (factors.trustScore * 0.09) +
        (factors.timeliness * 0.08) +
        (factors.competition * 0.04) +
        (factors.applicationRate * 0.03);

    return {
        score: Math.round(weightedScore),
        factors,
        details: {
            matchedSkills,
            missingSkills,
            seniorityGap,
            locationStatus
        }
    };
};
