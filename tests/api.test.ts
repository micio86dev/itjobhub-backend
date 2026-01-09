
import { describe, it, expect, beforeAll } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { setupDatabase } from "../src/config/database";
import { testUsers, testCompany, testJob, testComment, testProfile } from './helpers/test-data';
import { loginUser, createAuthHeaders, AuthTokens } from './helpers/auth';

import { app } from '../src/app';

const api = treaty(app);

import { prisma } from '../src/config/database';

describe('IT Job Hub API Tests', () => {
  let adminTokens: AuthTokens;
  let companyTokens: AuthTokens;
  let jobSeekerTokens: AuthTokens;
  let testCompanyId: string;
  let testJobId: string;
  let testCommentId: string;

  beforeAll(async () => {
    // Setup database
    await setupDatabase();

    // Clean database
    try {
      await prisma.refreshToken.deleteMany({});
      await prisma.userProfile.deleteMany({});
      await prisma.like.deleteMany({});
      await prisma.comment.deleteMany({});
      await prisma.job.deleteMany({});
      await prisma.company.deleteMany({});
      await prisma.user.deleteMany({});
    } catch (error) {
      console.warn("Failed to clean database:", error);
    }

    // Setup test users and get auth tokens
    try {
      adminTokens = await loginUser(app, 'admin');
      companyTokens = await loginUser(app, 'company');
      jobSeekerTokens = await loginUser(app, 'jobSeeker');
    } catch (error) {
      console.error('Failed to setup test users:', error);
      throw error;
    }
  });

  describe('Health Check', () => {
    it('should return API status', async () => {
      const response = await app.handle(new Request('http://localhost/'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe("IT Job Hub API is running!");
      expect(data.timestamp).toBeDefined();
    });
  });

  describe('Authentication Routes', () => {
    it('should register a new user', async () => {
      const newUser = {
        email: `newuser_${Date.now()}@test.com`,
        password: 'password123',
        firstName: 'New',
        lastName: 'User'
      };

      const response = await api.auth.register.post(newUser);

      expect(response.data?.status).toBe(201);
      expect(response.data?.success).toBe(true);
      if (response.data && 'data' in response.data && 'user' in response.data.data) {
        expect(response.data.data.user.email).toBe(newUser.email);
        expect(response.data.data.token).toBeDefined();
      } else {
        throw new Error('Response data mismatch');
      }
    });

    it('should login existing user', async () => {
      const response = await api.auth.login.post({
        email: testUsers.admin.email,
        password: testUsers.admin.password
      });

      expect(response.data?.status).toBe(200);
      expect(response.data?.success).toBe(true);
      if (response.data && 'data' in response.data && 'user' in response.data.data) {
        expect(response.data.data.user.email).toBe(testUsers.admin.email);
        expect(response.data.data.token).toBeDefined();
      }
    });

    it('should fail login with invalid credentials', async () => {
      const response = await api.auth.login.post({
        email: 'invalid@test.com',
        password: 'wrongpassword'
      });

      expect(response.error?.status).toBe(401);
      if (response.error && typeof response.error.value === 'object' && response.error.value && 'message' in response.error.value) {
        expect((response.error.value as any).message).toBe("Invalid credentials");
      }
    });

    it('should logout user', async () => {
      const response = await api.auth.logout.post();

      expect(response.data?.status).toBe(200);
      expect(response.data?.success).toBe(true);
      expect(response.data?.message).toBe("Logged out successfully");
    });
  });

  describe('User Routes', () => {
    it('should get current user profile', async () => {
      const response = await app
        .handle(
          new Request('http://localhost/users/me', {
            headers: createAuthHeaders(jobSeekerTokens)
          })
        );

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.email).toBe(testUsers.jobSeeker.email);
    });

    it('should fail to get profile without auth', async () => {
      const response = await app
        .handle(new Request('http://localhost/users/me'));

      const data = await response.json();
      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });

    it('should update user profile', async () => {
      const response = await app
        .handle(
          new Request('http://localhost/users/me/profile', {
            method: 'PUT',
            headers: createAuthHeaders(jobSeekerTokens),
            body: JSON.stringify(testProfile)
          })
        );

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.skills).toEqual(testProfile.skills);
    });
  });

  describe('Company Routes', () => {
    it('should create a new company (admin only)', async () => {
      const response = await app
        .handle(
          new Request('http://localhost/companies', {
            method: 'POST',
            headers: createAuthHeaders(adminTokens),
            body: JSON.stringify(testCompany)
          })
        );

      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe(testCompany.name);
      testCompanyId = data.data.id;
    });

    it('should fail to create company as non-admin', async () => {
      const response = await app
        .handle(
          new Request('http://localhost/companies', {
            method: 'POST',
            headers: createAuthHeaders(jobSeekerTokens),
            body: JSON.stringify(testCompany)
          })
        );

      const data = await response.json();
      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
    });

    it('should get all companies', async () => {
      const response = await app
        .handle(new Request('http://localhost/companies'));

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data.companies)).toBe(true);
    });

    it('should get company by ID', async () => {
      const response = await app
        .handle(new Request(`http://localhost/companies/${testCompanyId}`));

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(testCompanyId);
    });

    it('should update company (admin only)', async () => {
      const updateData = { name: "Updated Test Company" };
      const response = await app
        .handle(
          new Request(`http://localhost/companies/${testCompanyId}`, {
            method: 'PUT',
            headers: createAuthHeaders(adminTokens),
            body: JSON.stringify(updateData)
          })
        );

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe(updateData.name);
    });
  });

  describe('Job Routes', () => {
    it('should create a new job (company/admin only)', async () => {
      const jobData = {
        ...testJob,
        company_id: testCompanyId,
        salary_min: testJob.salaryMin,
        salary_max: testJob.salaryMax,
        link: `https://example.com/job/${Date.now()}`
      };
      // Remove camelCase keys if they cause validation issues, but usually extra keys are ignored unless strict. 
      // Elysia t.Object isn't strict by default?
      // But company_id WAS missing.

      const response = await app
        .handle(new Request('http://localhost/jobs', {
          method: 'POST',
          headers: createAuthHeaders(adminTokens),
          body: JSON.stringify(jobData)
        })
        );

      const data = await response.json();
      if (response.status !== 201) {
        console.log('Job creation failed body:', JSON.stringify(data, null, 2));
      }
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.title).toBe(testJob.title);
      testJobId = data.data.id;
    });

    it('should fail to create job as job seeker', async () => {
      const jobData = { ...testJob, companyId: testCompanyId };
      const response = await app
        .handle(
          new Request('http://localhost/jobs', {
            method: 'POST',
            headers: createAuthHeaders(jobSeekerTokens),
            body: JSON.stringify(jobData)
          })
        );

      const data = await response.json();
      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
    });

    it('should get all jobs', async () => {
      const response = await app
        .handle(new Request('http://localhost/jobs'));

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data.jobs)).toBe(true);
    });

    it('should get jobs with filters', async () => {
      const response = await app
        .handle(new Request('http://localhost/jobs?remote=true&seniority=SENIOR'));

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data.jobs)).toBe(true);
    });

    it('should get job by ID', async () => {
      const response = await app
        .handle(new Request(`http://localhost/jobs/${testJobId}`));

      const data = await response.json();
      if (response.status !== 200) {
        console.log('Get Job failed:', JSON.stringify(data, null, 2));
      }
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(testJobId);
    });

    it('should update job (authorized users only)', async () => {
      const updateData = { title: "Updated Senior Software Developer" };
      const response = await app
        .handle(
          new Request(`http://localhost/jobs/${testJobId}`, {
            method: 'PUT',
            headers: createAuthHeaders(adminTokens),
            body: JSON.stringify(updateData)
          })
        );

      const data = await response.json();
      if (response.status !== 200) {
        console.log('Update Job failed:', JSON.stringify(data, null, 2));
      }
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.title).toBe(updateData.title);
    });

    it('should import a job (admin only)', async () => {
      const importData = {
        title: "Imported Job",
        description: "This is an imported job",
        company: {
          name: "Imported Company",
          description: "An imported company"
        },
        location: "New York",
        skills: ["Python", "Django"],
        remote: false
      };

      const response = await app
        .handle(
          new Request('http://localhost/jobs/import', {
            method: 'POST',
            headers: createAuthHeaders(adminTokens),
            body: JSON.stringify(importData)
          })
        );

      const data = await response.json();
      if (response.status !== 201) {
        console.log('Import Job failed:', JSON.stringify(data, null, 2));
      }
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.title).toBe(importData.title);
    });

    it('should batch import jobs (admin only)', async () => {
      const batchData = {
        jobs: [
          {
            title: "Batch Job 1",
            description: "First batch job",
            company: {
              name: "Batch Company 1",
              description: "First batch company"
            }
          },
          {
            title: "Batch Job 2",
            description: "Second batch job",
            company: {
              name: "Batch Company 2",
              description: "Second batch company"
            }
          }
        ]
      };

      const response = await app
        .handle(
          new Request('http://localhost/jobs/import/batch', {
            method: 'POST',
            headers: createAuthHeaders(adminTokens),
            body: JSON.stringify(batchData)
          })
        );

      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.summary.totalJobs).toBe(2);
    });
  });

  describe('Comment Routes', () => {
    it('should create a comment on a job', async () => {
      const commentData = { ...testComment, jobId: testJobId };
      const response = await app
        .handle(
          new Request('http://localhost/comments', {
            method: 'POST',
            headers: createAuthHeaders(jobSeekerTokens),
            body: JSON.stringify(commentData)
          })
        );

      const data = await response.json();
      if (response.status !== 201) {
        console.log('Comment creation failed body:', JSON.stringify(data, null, 2));
      }
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.content).toBe(testComment.content);
      testCommentId = data.data.id;
    });

    it('should fail to create comment without auth', async () => {
      const commentData = { ...testComment, jobId: testJobId };
      const response = await app
        .handle(
          new Request('http://localhost/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(commentData)
          })
        );

      const data = await response.json();
      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });

    it('should get comments for a job', async () => {
      const response = await app
        .handle(new Request(`http://localhost/comments/job/${testJobId}`));

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data.comments)).toBe(true);
    });

    it('should update comment (author only)', async () => {
      const updateData = { content: "Updated comment content" };
      const response = await app
        .handle(
          new Request(`http://localhost/comments/${testCommentId}`, {
            method: 'PUT',
            headers: createAuthHeaders(jobSeekerTokens),
            body: JSON.stringify(updateData)
          })
        );

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.content).toBe(updateData.content);
    });

    it('should fail to update comment as different user', async () => {
      const updateData = { content: "Trying to update someone else's comment" };
      const response = await app
        .handle(
          new Request(`http://localhost/comments/${testCommentId}`, {
            method: 'PUT',
            headers: createAuthHeaders(companyTokens),
            body: JSON.stringify(updateData)
          })
        );

      const data = await response.json();
      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
    });
  });

  describe('Like Routes', () => {
    it('should like a job', async () => {
      const likeData = { jobId: testJobId };
      const response = await app
        .handle(
          new Request('http://localhost/likes', {
            method: 'POST',
            headers: createAuthHeaders(jobSeekerTokens),
            body: JSON.stringify(likeData)
          })
        );

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.jobId).toBe(testJobId);
    });

    it('should fail to like same job twice', async () => {
      const likeData = { jobId: testJobId };
      const response = await app
        .handle(
          new Request('http://localhost/likes', {
            method: 'POST',
            headers: createAuthHeaders(jobSeekerTokens),
            body: JSON.stringify(likeData)
          })
        );

      const data = await response.json();
      expect(response.status).toBe(409);
      expect(data.success).toBe(false);
    });

    it('should get like count for job', async () => {
      const response = await app
        .handle(new Request(`http://localhost/likes/count?jobId=${testJobId}`));

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.count).toBeGreaterThanOrEqual(1);
    });

    it('should check if user has liked job', async () => {
      const response = await app
        .handle(
          new Request(`http://localhost/likes/has-liked?jobId=${testJobId}`, {
            headers: createAuthHeaders(jobSeekerTokens)
          })
        );

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.liked).toBe(true);
    });

    it('should unlike a job', async () => {
      const response = await app
        .handle(
          new Request(`http://localhost/likes?jobId=${testJobId}`, {
            method: 'DELETE',
            headers: createAuthHeaders(jobSeekerTokens)
          })
        );

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should like a comment', async () => {
      const likeData = { commentId: testCommentId };
      const response = await app
        .handle(
          new Request('http://localhost/likes', {
            method: 'POST',
            headers: createAuthHeaders(companyTokens),
            body: JSON.stringify(likeData)
          })
        );

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.commentId).toBe(testCommentId);
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for non-existent job', async () => {
      const response = await app
        .handle(new Request('http://localhost/jobs/000000000000000000000000'));

      const data = await response.json();
      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });

    it('should handle 404 for non-existent company', async () => {
      const response = await app
        .handle(new Request('http://localhost/companies/000000000000000000000000'));

      const data = await response.json();
      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });

    it('should handle validation errors', async () => {
      const invalidJobData = { title: "" }; // Missing required fields
      const response = await app
        .handle(
          new Request('http://localhost/jobs', {
            method: 'POST',
            headers: createAuthHeaders(adminTokens),
            body: JSON.stringify(invalidJobData)
          })
        );

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Cleanup', () => {
    it('should delete test comment', async () => {
      const response = await app
        .handle(
          new Request(`http://localhost/comments/${testCommentId}`, {
            method: 'DELETE',
            headers: createAuthHeaders(jobSeekerTokens)
          })
        );

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should delete test job', async () => {
      const response = await app
        .handle(
          new Request(`http://localhost/jobs/${testJobId}`, {
            method: 'DELETE',
            headers: createAuthHeaders(adminTokens)
          })
        );

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should delete test company', async () => {
      const response = await app
        .handle(
          new Request(`http://localhost/companies/${testCompanyId}`, {
            method: 'DELETE',
            headers: createAuthHeaders(adminTokens)
          })
        );

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });
});