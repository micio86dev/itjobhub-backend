import { prisma as dbClient } from "../../config/database";


interface MatchFactors {
    skillsMatch: number;
    seniorityMatch: number;
    locationMatch: number;
    trustScore: number;
    timeliness: number;
    salaryMatch: number;
    competition: number;
    applicationRate: number;
}

export interface MatchBreakdown {
    score: number;
    factors: MatchFactors;
    details: {
        matchedSkills: string[];
        missingSkills: string[];
        seniorityGap: string;
        locationStatus: string;
    };
}

export interface BatchMatchResult {
    [jobId: string]: {
        score: number;
        label: 'excellent' | 'good' | 'fair' | 'low';
    };
}

export const calculateMatchScore = async (userId: string, jobId: string): Promise<MatchBreakdown> => {
    // 1. Fetch Data
    const [profile, job, user] = await Promise.all([
        dbClient.userProfile.findUnique({ where: { user_id: userId } }),
        dbClient.job.findUnique({
            where: { id: jobId },
            include: {
                company: true
            }
        }),
        dbClient.user.findUnique({ where: { id: userId } })
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
    const isJobRemote = job.remote || job.is_remote;
    let locationStatus = 'unknown';

    const userWorkModes = profile.workModes || [];
    const wantsRemote = userWorkModes.includes('remote');
    const wantsHybrid = userWorkModes.includes('hybrid');
    const wantsOnsite = userWorkModes.includes('onsite');
    const hasWorkModePref = userWorkModes.length > 0;

    if (isJobRemote) {
        if (!hasWorkModePref || wantsRemote) {
            factors.locationMatch = 100;
            locationStatus = 'remote_match';
        } else {
            // Job is remote but user DOES NOT want remote
            factors.locationMatch = 0;
            locationStatus = 'remote_mismatch';
        }
    } else {
        // Job is Onsite/Hybrid
        const jobLoc = (job.location || job.location_raw || "").toLowerCase();
        const userLoc = (profile.location || "").toLowerCase();

        // If user ONLY wants remote, this is a mismatch
        if (hasWorkModePref && !wantsOnsite && !wantsHybrid) {
            factors.locationMatch = 0;
            locationStatus = 'remote_only_mismatch';
        } else {
            // User is open to onsite/hybrid
            if (jobLoc && userLoc) {
                if (jobLoc.includes(userLoc) || userLoc.includes(jobLoc)) {
                    factors.locationMatch = 100; // Exact/Close
                    locationStatus = 'exact';
                } else {
                    factors.locationMatch = 0;
                    locationStatus = 'different_location';
                }
            } else {
                factors.locationMatch = 50; // Ambiguous
            }
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
    const applyCount = 0; // TODO: Fetch from interaction table separately if needed
    const ratio = views > 0 ? (applyCount / views) * 100 : 0;

    // Logic inverse: Low ratio = good opportunity
    if (ratio < 15) factors.applicationRate = 100;
    else if (ratio < 30) factors.applicationRate = 60;
    else if (ratio < 50) factors.applicationRate = 30;
    else factors.applicationRate = 0;

    // --- 8. Salary Match (7%) ---
    if (user?.salaryMin && user.salaryMin > 0) {
        // If job has salary info
        if (job.salary_max && job.salary_max >= user.salaryMin) {
            // Job meets minimum salary requirement
            factors.salaryMatch = 100;
        } else if (job.salary_max && job.salary_max > 0) {
            // Job has salary but below minimum - penalize proportionally
            const salaryRatio = job.salary_max / user.salaryMin;
            factors.salaryMatch = Math.round(salaryRatio * 100);
            if (factors.salaryMatch > 100) factors.salaryMatch = 100;
        } else {
            // No salary info in job, keep neutral
            factors.salaryMatch = 50;
        }
    } else {
        // If user has no salary requirement, full credit
        factors.salaryMatch = 100;
    }

    // --- Final Weighted Score ---
    // User requested changes (Jan 2026):
    // Skills: 42% (was 33%)
    // Seniority: 20% (was 23%)
    // Location: 14% (was 14%)
    // Trust: 9% (was 10%)
    // Timeliness: 8% (was 10%)
    // Salary: 7% (new)
    // Competition: 0% (was 5%)
    // AppRatio: 0% (was 5%)

    const weightedScore =
        (factors.skillsMatch * 0.42) +
        (factors.seniorityMatch * 0.20) +
        (factors.locationMatch * 0.14) +
        (factors.trustScore * 0.09) +
        (factors.timeliness * 0.08) +
        (factors.salaryMatch * 0.07);

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

/**
 * Calculate match scores for multiple jobs at once (optimized for homepage/list views)
 * Returns only score and label for efficiency
 */
export const calculateBatchMatchScores = async (userId: string, jobIds: string[]): Promise<BatchMatchResult> => {
    if (!jobIds.length) return {};

    // Fetch profile once
    const profile = await dbClient.userProfile.findUnique({ where: { user_id: userId } });
    if (!profile) return {};

    // Fetch user to get salaryMin
    const user = await dbClient.user.findUnique({ where: { id: userId } });

    // Batch fetch all jobs
    const jobs = await dbClient.job.findMany({
        where: { id: { in: jobIds } },
        include: {
            company: true
        }
    });

    const userSkills = (profile.skills || []).map(s => s.toLowerCase());

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

    const userLevel = normalizeSeniority(profile.seniority);
    const result: BatchMatchResult = {};

    for (const job of jobs) {
        // Skills Match (42%)
        const jobSkills = (job.skills || []).map(s => s.toLowerCase());
        const jobTechSkills = (job.technical_skills || []).map(s => s.toLowerCase());
        const allJobSkills = Array.from(new Set([...jobSkills, ...jobTechSkills]));

        let skillsMatch = 100;
        if (allJobSkills.length > 0) {
            const matched = allJobSkills.filter(s => userSkills.includes(s)).length;
            skillsMatch = (matched / allJobSkills.length) * 100;
        }

        // Seniority Match (20%)
        const jobLevel = normalizeSeniority(job.seniority || job.experience_level);
        let seniorityMatch = 50;
        if (jobLevel !== -1 && userLevel !== -1) {
            const diff = userLevel - jobLevel;
            if (diff === 0) seniorityMatch = 100;
            else if (diff > 0) seniorityMatch = 70;
            else if (diff === -1) seniorityMatch = 30;
            else seniorityMatch = 0;
        } else if (jobLevel === -1 || userLevel === -1) {
            seniorityMatch = 40;
        }

        // Location Match (14%)
        const isJobRemote = job.remote || job.is_remote;
        let locationMatch = 50;

        const userWorkModes = profile.workModes || [];
        const wantsRemote = userWorkModes.includes('remote');
        const wantsHybrid = userWorkModes.includes('hybrid');
        const wantsOnsite = userWorkModes.includes('onsite');
        const hasWorkModePref = userWorkModes.length > 0;

        if (isJobRemote) {
            if (!hasWorkModePref || wantsRemote) {
                locationMatch = 100;
            } else {
                locationMatch = 0;
            }
        } else {
            const jobLoc = (job.location || job.location_raw || "").toLowerCase();
            const userLoc = (profile.location || "").toLowerCase();

            if (hasWorkModePref && !wantsOnsite && !wantsHybrid) {
                locationMatch = 0;
            } else {
                if (jobLoc && userLoc) {
                    locationMatch = (jobLoc.includes(userLoc) || userLoc.includes(jobLoc)) ? 100 : 0;
                }
            }
        }

        // Trust Score (9%)
        const trust = job.company?.trustScore || 80;
        let trustScore = 50;
        if (trust > 80) trustScore = 100;
        else if (trust >= 60) trustScore = 70;
        else if (trust >= 40) trustScore = 50;
        else trustScore = 20;

        // Timeliness (8%)
        const pubDate = new Date(job.published_at || job.created_at || Date.now());
        const hoursSince = (Date.now() - pubDate.getTime()) / (1000 * 60 * 60);
        let timeliness = 0;
        if (hoursSince <= 24) timeliness = 100;
        else if (hoursSince <= 72) timeliness = 70;
        else if (hoursSince <= 168) timeliness = 40;
        else if (hoursSince <= 336) timeliness = 20;

        // Salary Match (7%)
        let salaryMatch = 50;
        if (user?.salaryMin && user.salaryMin > 0) {
            // If job has salary info
            if (job.salary_max && job.salary_max >= user.salaryMin) {
                // Job meets minimum salary requirement
                salaryMatch = 100;
            } else if (job.salary_max && job.salary_max > 0) {
                // Job has salary but below minimum - penalize proportionally
                const ratio = job.salary_max / user.salaryMin;
                salaryMatch = Math.round(ratio * 100);
                if (salaryMatch > 100) salaryMatch = 100;
            }
            // else: no salary info in job, keep neutral at 50
        }
        // If user has no salary requirement, full credit
        else {
            salaryMatch = 100;
        }

        // Final weighted score
        const score = Math.round(
            (skillsMatch * 0.42) +
            (seniorityMatch * 0.20) +
            (locationMatch * 0.14) +
            (trustScore * 0.09) +
            (timeliness * 0.08) +
            (salaryMatch * 0.07)
        );

        const label = score >= 75 ? 'excellent' : score >= 50 ? 'good' : score >= 30 ? 'fair' : 'low';

        result[job.id] = { score, label };
    }

    return result;
};
