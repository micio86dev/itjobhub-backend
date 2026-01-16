import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { app } from "../src/app";
import { prisma } from "../src/config/database";

describe("Job Search API", () => {
    let companyId: string;
    let jobId1: string; // Milan
    let jobId2: string; // Rome
    let jobId3: string; // Monza (close to Milan)
    let jobId4: string; // Full-time
    let jobId5: string; // Contract

    beforeAll(async () => {
        // Clean up
        await prisma.job.deleteMany({ where: { title: { startsWith: "TEST_SEARCH_" } } });
        await prisma.company.deleteMany({ where: { name: { startsWith: "TEST_SEARCH_COMPANY" } } });

        // Create Company
        const company = await prisma.company.create({
            data: {
                name: "TEST_SEARCH_COMPANY",
                description: "Test Company",
            }
        });
        companyId = company.id;

        // Create Jobs
        // Job 1: Milan (Text: Milano, Geo: Milan coords)
        const job1 = await prisma.job.create({
            data: {
                title: "TEST_SEARCH_DEV_MILAN",
                description: "Developer in Milan",
                company_id: companyId,
                location: "Milano, Italy",
                city: "Milano",
                location_geo: {
                    type: "Point",
                    coordinates: [9.1900, 45.4642] // Milan
                },
                employment_type: "Full-time",
                seniority: "Senior",
                status: "active",
                link: "https://example.com/job1_" + Date.now()
            }
        });
        jobId1 = job1.id;

        // Job 2: Rome (Text: Roma, Geo: Rome coords)
        const job2 = await prisma.job.create({
            data: {
                title: "TEST_SEARCH_DEV_ROME",
                description: "Developer in Rome",
                company_id: companyId,
                location: "Roma, Italy",
                city: "Roma",
                location_geo: {
                    type: "Point",
                    coordinates: [12.4964, 41.9028] // Rome
                },
                employment_type: "Full-time",
                seniority: "Junior",
                status: "active",
                link: "https://example.com/job2_" + Date.now()
            }
        });
        jobId2 = job2.id;

        // Job 3: Monza (Text: Monza - 15km from Milan)
        const job3 = await prisma.job.create({
            data: {
                title: "TEST_SEARCH_DEV_MONZA",
                description: "Developer in Monza",
                company_id: companyId,
                location: "Monza, Italy",
                city: "Monza",
                location_geo: {
                    type: "Point",
                    coordinates: [9.2748, 45.5845] // Monza (~15km from Milan)
                },
                employment_type: "Part-time",
                seniority: "Mid",
                status: "active",
                link: "https://example.com/job3_" + Date.now()
            }
        });
        jobId3 = job3.id;

        // Job 4: Full-time (Test availability)
        const job4 = await prisma.job.create({
            data: {
                title: "TEST_SEARCH_FULLTIME",
                description: "Full time job",
                company_id: companyId,
                location: "Remote",
                employment_type: "Full-time",
                status: "active",
                link: "https://example.com/job4_" + Date.now()
            }
        });
        jobId4 = job4.id;

        // Job 5: Contract (Test availability)
        const job5 = await prisma.job.create({
            data: {
                title: "TEST_SEARCH_CONTRACT",
                description: "Contract job",
                company_id: companyId,
                location: "Remote",
                employment_type: "Contract",
                status: "active",
                link: "https://example.com/job5_" + Date.now()
            }
        });
        jobId5 = job5.id;
    });

    afterAll(async () => {
        await prisma.job.deleteMany({ where: { title: { startsWith: "TEST_SEARCH_" } } });
        await prisma.company.deleteMany({ where: { name: { startsWith: "TEST_SEARCH_COMPANY" } } });
    });

    it("should filter by exact text city", async () => {
        const response = await app.handle(new Request("http://localhost/jobs?location=Milano"));
        const json = await response.json();
        expect(response.status).toBe(200);
        const titles = json.data.jobs.map((j: any) => j.title);
        expect(titles).toContain("TEST_SEARCH_DEV_MILAN");
        expect(titles).not.toContain("TEST_SEARCH_DEV_ROME");
        // Monza might NOT appear with text search "Milano" unless "Milano" is in its location string
        expect(titles).not.toContain("TEST_SEARCH_DEV_MONZA");
    });

    it("should filter by geo radius (Milan + Monza)", async () => {
        // Search 50km around Milan with query scope to avoid bad DB data crashing the test
        const response = await app.handle(new Request("http://localhost/jobs?lat=45.4642&lng=9.1900&radius_km=50&q=TEST_SEARCH"));
        const json = await response.json();
        expect(response.status).toBe(200);
        const titles = json.data.jobs.map((j: any) => j.title);

        expect(titles).toContain("TEST_SEARCH_DEV_MILAN");
        expect(titles).toContain("TEST_SEARCH_DEV_MONZA"); // Should be included
        expect(titles).not.toContain("TEST_SEARCH_DEV_ROME"); // Too far
    });

    it("should filter by geo radius DOES NOT depend on location name text", async () => {
        // Search 50km around Milan, but also pass "Milano" as text location to verify priority
        // Ideally the backend ignores "Milano" text filter if coords are provided, so it finds Monza too
        const response = await app.handle(new Request("http://localhost/jobs?location=Milano&lat=45.4642&lng=9.1900&radius_km=50&q=TEST_SEARCH"));
        const json = await response.json();
        expect(response.status).toBe(200);
        const titles = json.data.jobs.map((j: any) => j.title);

        expect(titles).toContain("TEST_SEARCH_DEV_MILAN");
        expect(titles).toContain("TEST_SEARCH_DEV_MONZA"); // Should be included even if location text says "Milano" and job is "Monza"
    });

    it("should filter by employment_type (Full-time)", async () => {
        const response = await app.handle(new Request("http://localhost/jobs?employment_type=Full-time"));
        const json = await response.json();
        expect(response.status).toBe(200);
        const titles = json.data.jobs.map((j: any) => j.title);

        expect(titles).toContain("TEST_SEARCH_FULLTIME");
        expect(titles).toContain("TEST_SEARCH_DEV_MILAN"); // Also Full-time
        expect(titles).not.toContain("TEST_SEARCH_CONTRACT");
        expect(titles).not.toContain("TEST_SEARCH_DEV_MONZA"); // Part-time
    });
});
