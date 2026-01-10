
import { describe, it, expect, beforeAll } from 'bun:test';
import { setupDatabase } from "../src/config/database";
import { testUsers, testCompany, testJob, testComment } from './helpers/test-data';
import { loginUser, createAuthHeaders } from './helpers/auth';
import { app } from '../src/app';

describe('Comment Reproduction Tests', () => {
    let jobSeekerHeaders: HeadersInit;
    let adminHeaders: HeadersInit;
    let testCompanyId: string;
    let testJobId: string;

    beforeAll(async () => {
        await setupDatabase();
        // Login
        const jobSeekerTokens = await loginUser(app, 'jobSeeker');
        jobSeekerHeaders = createAuthHeaders(jobSeekerTokens);

        const adminTokens = await loginUser(app, 'admin');
        adminHeaders = createAuthHeaders(adminTokens);

        // Create Company (needed for Job)
        const companyRes = await app.handle(
            new Request('http://localhost/companies', {
                method: 'POST',
                headers: adminHeaders,
                body: JSON.stringify(testCompany)
            })
        );
        const companyData = await companyRes.json();
        if (!companyData.success) {
            // Might already exist
            const all = await app.handle(new Request('http://localhost/companies'));
            const allData = await all.json();
            const found = allData.data.companies.find((c: any) => c.name === testCompany.name);
            if (found) testCompanyId = found.id;
        } else {
            testCompanyId = companyData.data.id;
        }

        // Create Job
        const jobRes = await app.handle(
            new Request('http://localhost/jobs', {
                method: 'POST',
                headers: adminHeaders,
                body: JSON.stringify({
                    ...testJob,
                    company_id: testCompanyId
                })
            })
        );
        const jobData = await jobRes.json();
        // If fails, look for existing
        if (!jobData.success) {
            const allJobs = await app.handle(new Request('http://localhost/jobs'));
            const allJobsData = await allJobs.json();
            const foundJob = allJobsData.data.jobs.find((j: any) => j.title === testJob.title);
            if (foundJob) testJobId = foundJob.id;
        } else {
            testJobId = jobData.data.id;
        }
    });

    it('should create a comment with valid ID', async () => {
        const commentData = {
            content: "Reproduction Test Comment",
            jobId: testJobId
        };
        const response = await app.handle(
            new Request('http://localhost/comments', {
                method: 'POST',
                headers: jobSeekerHeaders,
                body: JSON.stringify(commentData)
            })
        );
        const data = await response.json();

        console.log("Valid Comment Response:", JSON.stringify(data, null, 2));

        expect(response.status).toBe(201);
        expect(data.success).toBe(true);
        expect(data.data.content).toBe(commentData.content);
    });

    it('should fail gracefully with invalid ObjectId', async () => {
        const commentData = {
            content: "Invalid ID Comment",
            jobId: "123" // Invalid Mongo ObjectId
        };
        const response = await app.handle(
            new Request('http://localhost/comments', {
                method: 'POST',
                headers: jobSeekerHeaders,
                body: JSON.stringify(commentData)
            })
        );
        const data = await response.json();

        console.log("Invalid ID Response:", JSON.stringify(data, null, 2));

        // Expect 400 Bad Request
        expect(response.status).toBe(400);
        expect(data.message).toBe("Invalid jobId format");
        expect(data.success).toBe(false);
    });
});
