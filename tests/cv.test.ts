import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { setupDatabase, prisma } from '../src/config/database';
import { app } from '../src/app';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../src/config';

const api = treaty(app);

// Minimal valid PDF buffer (1-page PDF with some text)
const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n' +
  '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>>>>>>>>>endobj\n' +
  '4 0 obj<</Length 44>>\nstream\nBT /F1 12 Tf 100 700 Td (TypeScript Developer) Tj ET\nendstream\nendobj\n' +
  'xref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\n0000000327 00000 n\n' +
  'trailer<</Size 5/Root 1 0 R>>\nstartxref\n424\n%%EOF'
);

const originalFetch = globalThis.fetch;

describe('CV Upload API', () => {
  const testEmail = `cv_test_${Date.now()}@test.com`;
  let authToken: string;
  let userId: string;
  let uploadedCvId: string;
  let testServer: ReturnType<typeof app.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    await setupDatabase();

    // Start in-process server on a random available port
    testServer = app.listen(0);
    const port = testServer.server?.port ?? 0;
    baseUrl = `http://localhost:${port}`;

    // Cleanup any leftover data
    const existing = await prisma.user.findUnique({ where: { email: testEmail } });
    if (existing) {
      await prisma.userCV.deleteMany({ where: { user_id: existing.id } });
      await prisma.userProfile.deleteMany({ where: { user_id: existing.id } });
      await prisma.refreshToken.deleteMany({ where: { user_id: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
    }

    // Register and login
    const regRes = await api.auth.register.post({
      email: testEmail,
      password: 'password123',
      firstName: 'CV',
      lastName: 'Test'
    });
    expect(regRes.status).toBe(201);
    authToken = (regRes.data as { data: { token: string; user: { id: string } } }).data.token;
    userId = (regRes.data as { data: { token: string; user: { id: string } } }).data.user.id;
  });

  afterAll(async () => {
    testServer?.stop();

    // Cleanup DB records
    await prisma.userCV.deleteMany({ where: { user_id: userId } });
    await prisma.userProfile.deleteMany({ where: { user_id: userId } });
    await prisma.refreshToken.deleteMany({ where: { user_id: userId } });
    await prisma.user.deleteMany({ where: { email: testEmail } });

    // Cleanup uploaded files
    try {
      await rm(join(config.upload.uploadPath, 'cvs', userId), { recursive: true, force: true });
    } catch {
      // ignore if dir doesn't exist
    }

    // Restore fetch
    globalThis.fetch = originalFetch;
  });

  it('POST /users/me/cvs - should upload a PDF and return CvRecord', async () => {
    const blob = new Blob([MINIMAL_PDF], { type: 'application/pdf' });
    const file = new File([blob], 'test-cv.pdf', { type: 'application/pdf' });

    const fd = new FormData();
    fd.append('file', file);
    fd.append('language', 'en');

    const res = await fetch(`${baseUrl}/users/me/cvs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: fd
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.language).toBe('en');
    expect(data.data.filename).toBeDefined();
    expect(data.data.url).toBeDefined();
    expect(data.data.id).toBeDefined();
    uploadedCvId = data.data.id;
  });

  it('GET /users/me/cvs - should list uploaded CVs', async () => {
    const res = await fetch(`${baseUrl}/users/me/cvs`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeGreaterThanOrEqual(1);
    expect(data.data[0].language).toBe('en');
  });

  it('should enforce one CV per language - upsert on same language', async () => {
    const blob = new Blob([MINIMAL_PDF], { type: 'application/pdf' });
    const file = new File([blob], 'updated-cv.pdf', { type: 'application/pdf' });

    const fd = new FormData();
    fd.append('file', file);
    fd.append('language', 'en');

    const res = await fetch(`${baseUrl}/users/me/cvs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: fd
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.data.filename).toBe('updated-cv.pdf');

    // Verify still only one CV in DB for language 'en'
    const cvs = await prisma.userCV.findMany({ where: { user_id: userId, language: 'en' } });
    expect(cvs.length).toBe(1);
    uploadedCvId = data.data.id;
  });

  it('POST /users/me/cvs/:id/parse - should return ExtractedProfile structure', async () => {
    const mockProfile = {
      skills: ['TypeScript', 'Node.js'],
      languages: ['English'],
      seniority: 'mid',
      availability: 'full-time',
      workModes: ['remote'],
      salaryMin: 45000,
      bio: 'TypeScript developer.',
      confidence: 0.88
    };

    const savedApiKey = config.groq.apiKey;
    config.groq.apiKey = 'test-groq-key';

    globalThis.fetch = mock(async (url: string, opts?: RequestInit) => {
      if (typeof url === 'string' && url.includes('groq.com')) {
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify(mockProfile) } }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(url, opts);
    }) as unknown as typeof fetch;

    // Use app.handle() so the globalThis.fetch mock intercepts the GROQ call
    const req = new Request(`http://localhost/users/me/cvs/${uploadedCvId}/parse`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const res = await app.handle(req);

    globalThis.fetch = originalFetch;
    config.groq.apiKey = savedApiKey;

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data.skills)).toBe(true);
    expect(Array.isArray(data.data.languages)).toBe(true);
    expect(Array.isArray(data.data.workModes)).toBe(true);
    expect('seniority' in data.data).toBe(true);
  });

  it('DELETE /users/me/cvs/:id - should delete CV file and DB record', async () => {
    const res = await fetch(`${baseUrl}/users/me/cvs/${uploadedCvId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // Verify record is gone from DB
    const cv = await prisma.userCV.findUnique({ where: { id: uploadedCvId } });
    expect(cv).toBeNull();
  });

  it('PUT /users/me/profile - should accept portfolioUrl field', async () => {
    const res = await fetch(`${baseUrl}/users/me/profile`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ portfolioUrl: 'https://myportfolio.dev' })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // Verify it's stored
    const profile = await prisma.userProfile.findUnique({ where: { user_id: userId } });
    expect(profile?.portfolio_url).toBe('https://myportfolio.dev');
  });

  it('should reject files larger than allowed max size', async () => {
    const largeBuffer = Buffer.alloc(6 * 1024 * 1024, 'a');
    const blob = new Blob([largeBuffer], { type: 'application/pdf' });
    const file = new File([blob], 'large.pdf', { type: 'application/pdf' });

    const fd = new FormData();
    fd.append('file', file);
    fd.append('language', 'it');

    const res = await fetch(`${baseUrl}/users/me/cvs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: fd
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('should reject non-PDF files', async () => {
    const blob = new Blob(['not a pdf'], { type: 'text/plain' });
    const file = new File([blob], 'resume.txt', { type: 'text/plain' });

    const fd = new FormData();
    fd.append('file', file);
    fd.append('language', 'it');

    const res = await fetch(`${baseUrl}/users/me/cvs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: fd
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('should return 401 when not authenticated', async () => {
    const res = await fetch(`${baseUrl}/users/me/cvs`);
    expect(res.status).toBe(401);
  });
});
