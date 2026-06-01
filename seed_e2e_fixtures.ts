/**
 * Seeds a small, deterministic dataset (companies + jobs + news) so the
 * Playwright e2e suite has content to exercise — job cards, listings, filters,
 * news articles, etc. Idempotent: fixture rows carry a `source`/marker and are
 * wiped + recreated on each run. Safe to re-run.
 *
 *   bun run seed_e2e_fixtures.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FIXTURE_SOURCE = "e2e-fixture";

const SKILLS = [
  ["TypeScript", "React", "Node.js"],
  ["Python", "Django", "PostgreSQL"],
  ["Go", "Kubernetes", "Docker"],
  ["Java", "Spring", "AWS"],
  ["Vue", "Nuxt", "GraphQL"],
];

const SENIORITIES = ["junior", "mid", "senior"];
const EMPLOYMENT = ["full_time", "part_time", "contract"];
const CITIES = ["Milan", "Rome", "Turin", "Bologna", "Naples"];

async function main() {
  console.log("🌱 Seeding e2e fixtures...");

  // ── Clean previous fixtures (scoped to the marker) ──
  await prisma.job.deleteMany({ where: { source: FIXTURE_SOURCE } });
  await prisma.company.deleteMany({ where: { description: FIXTURE_SOURCE } });
  await prisma.news.deleteMany({ where: { category: FIXTURE_SOURCE } });

  // ── Companies ──
  const companies = [];
  for (let i = 0; i < 4; i++) {
    const c = await prisma.company.create({
      data: {
        name: `E2E Company ${i + 1}`,
        description: FIXTURE_SOURCE,
        trustScore: 70 + i * 5,
        totalRatings: 10 + i,
      },
    });
    companies.push(c);
  }
  console.log(`✅ ${companies.length} companies`);

  // ── Jobs ──
  let jobCount = 0;
  for (let i = 0; i < 12; i++) {
    const company = companies[i % companies.length];
    await prisma.job.create({
      data: {
        title: `E2E Software Engineer ${i + 1}`,
        description:
          "We are looking for a talented engineer to join our team. " +
          "This is a fixture job created for end-to-end testing.",
        company: { connect: { id: company.id } },
        location: CITIES[i % CITIES.length],
        city: CITIES[i % CITIES.length],
        country: "Italy",
        salary_min: 30000 + i * 2000,
        salary_max: 50000 + i * 2000,
        seniority: SENIORITIES[i % SENIORITIES.length],
        employment_type: EMPLOYMENT[i % EMPLOYMENT.length],
        remote: i % 2 === 0,
        is_remote: i % 2 === 0,
        skills: SKILLS[i % SKILLS.length],
        technical_skills: SKILLS[i % SKILLS.length],
        language: "en",
        status: "active",
        source: FIXTURE_SOURCE,
        link: `https://example.com/e2e-job-${i + 1}`,
        published_at: new Date(),
      },
    });
    jobCount++;
  }
  console.log(`✅ ${jobCount} jobs`);

  // ── News ──
  let newsCount = 0;
  for (let i = 0; i < 5; i++) {
    await prisma.news.create({
      data: {
        title: `E2E News Article ${i + 1}`,
        slug: `e2e-news-article-${i + 1}`,
        summary: `Summary of fixture news article ${i + 1}.`,
        content: `# E2E News ${i + 1}\n\nThis is fixture content for end-to-end testing.`,
        category: FIXTURE_SOURCE,
        language: "en",
        is_published: true,
        published_at: new Date(),
      },
    });
    newsCount++;
  }
  console.log(`✅ ${newsCount} news articles`);

  console.log("🎉 e2e fixtures seeded.");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding fixtures:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
