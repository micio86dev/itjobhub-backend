
import { describe, it, expect, beforeAll } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { setupDatabase } from "../src/config/database";
import { loginUser, createAuthHeaders, AuthTokens } from './helpers/auth';
import { app } from '../src/app';
import { prisma } from '../src/config/database';

const api = treaty(app);

describe('Match Score Algorithm Tests', () => {
    let jobSeekerTokens: AuthTokens;
    let adminTokens: AuthTokens;
    let testJobId: string;
    let testCompanyId: string;
    let testUserId: string;

    beforeAll(async () => {
        await setupDatabase();

        // Login as admin to create company/job
        adminTokens = await loginUser(app, 'admin');

        // Create a dedicated job seeker for this test with specific skills/profile
        const uniqueEmail = `match_tester_${Date.now()}@test.com`;
        const registerResponse = await api.auth.register.post({
            email: uniqueEmail,
            password: 'password123',
            firstName: 'Match',
            lastName: 'Tester'
        });

        if (registerResponse.data && 'data' in registerResponse.data && 'token' in registerResponse.data.data) {
            jobSeekerTokens = {
                token: registerResponse.data.data.token,
                refreshToken: "dummy" // We don't need refresh token for this test mostly
            };
            testUserId = registerResponse.data.data.user.id;
        }

        // Update User Profile for the test
        // Seniority: Senior (to match job)
        // Skills: React, Node.js (Job will have React, Node.js, Python)
        // Location: Milan
        await app.handle(
            new Request('http://localhost/users/me/profile', {
                method: 'PUT',
                headers: createAuthHeaders(jobSeekerTokens),
                body: JSON.stringify({
                    seniority: 'senior',
                    skills: ['React', 'Node.js'],
                    location: 'Milan',
                    bio: 'Test Bio'
                })
            })
        );

        // Create Company
        const compRes = await app.handle(
            new Request('http://localhost/companies', {
                method: 'POST',
                headers: createAuthHeaders(adminTokens),
                body: JSON.stringify({
                    name: `Match Company ${Date.now()}`,
                    description: "Test",
                    website: "http://test.com"
                })
            })
        );
        const compData = await compRes.json();
        testCompanyId = compData.data.id;

        // Create Job
        // Seniority: Senior
        // Skills: React, Node.js, Python
        // Remote: true
        const jobRes = await app.handle(
            new Request('http://localhost/jobs', {
                method: 'POST',
                headers: createAuthHeaders(adminTokens),
                body: JSON.stringify({
                    title: "Senior Fullstack Dev",
                    description: "Test Description",
                    company_id: testCompanyId,
                    location: "Remote",
                    remote: true,
                    type: "full-time",
                    salary_min: 50000,
                    salary_max: 80000,
                    skills: ['React', 'Node.js', 'Python'],
                    experience_level: 'senior',
                    link: `https://test.com/job/${Date.now()}`
                })
            })
        );
        const jobData = await jobRes.json();
        testJobId = jobData.data.id;
    });

    it('should calculate match score with new weights', async () => {
        const response = await app.handle(
            new Request(`http://localhost/jobs/${testJobId}/match`, {
                headers: createAuthHeaders(jobSeekerTokens)
            })
        );

        const data = await response.json();
        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data).toBeDefined();

        const { score, factors, details } = data.data;

        console.log('Match Factors:', factors);
        console.log('Final Score:', score);

        // Validations based on plan:

        // 1. Skills Match: User has 2/3 skills (React, Node) of (React, Node, Python)
        // 2/3 * 100 = 66.66%
        expect(factors.skillsMatch).toBeGreaterThan(66);
        expect(factors.skillsMatch).toBeLessThan(67);

        // 2. Seniority Match: Senior vs Senior -> 100%
        expect(factors.seniorityMatch).toBe(100);

        // 3. Location Match: Job is Remote -> 100%
        expect(factors.locationMatch).toBe(100);

        // 4. Trust Score: Default 80. Logic: if > 80 (100) else if >= 60 (70). 
        // So 80 falls into >= 60 category -> 70.
        // Wait, current logic: const trust = job.company?.trustScore || 80;
        // if (trust > 80) ... else if (trust >= 60) ...
        // 80 is NOT > 80. It is >= 60. So 70.
        expect(factors.trustScore).toBe(70);

        // 5. Timeliness: Just created -> 100%
        expect(factors.timeliness).toBe(100);

        // 6. Competition: 0 views -> 100%
        expect(factors.competition).toBe(100);

        // 7. App Rate: 0/0 -> 0 ratio -> 100%
        expect(factors.applicationRate).toBe(100);

        // Calculate expected weighted score
        // Skills: 66.666 * 0.42 = 28.00
        // Seniority: 100 * 0.20 = 20.00
        // Location: 100 * 0.14 = 14.00
        // Trust: 70 * 0.09 = 6.30
        // Timeliness: 100 * 0.08 = 8.00
        // Competition: 100 * 0.04 = 4.00
        // App Rate: 100 * 0.03 = 3.00

        // Total: 28 + 20 + 14 + 6.3 + 8 + 4 + 3 = 83.3

        expect(score).toBe(83);
    });
});
