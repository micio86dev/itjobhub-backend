import { PrismaClient } from '@prisma/client';
import { dbClient } from './src/db/client';

async function verifyPrisma() {
  console.log('🚀 Starting verification...');

  try {
    // 1. Test Connection
    console.log('Testing connection...');
    await dbClient.$connect();
    console.log('✅ Connected to MongoDB via Prisma!');

    // 2. Create Company
    console.log('\nCreating company...');
    const company = await dbClient.company.create({
      data: {
        name: 'Test Company ' + Date.now(),
        description: 'A test company',
        website: 'https://example.com',
        logo_url: 'https://example.com/logo.png'
      }
    });
    console.log('✅ Company created:', company.id);

    // 3. Create Job
    console.log('\nCreating job...');
    const job = await dbClient.job.create({
      data: {
        company_id: company.id,
        title: 'Senior Developer',
        description: 'We are looking for a senior developer',
        requirements: ['TypeScript', 'Node.js', 'MongoDB'],
        benefits: ['Remote work', 'Competitive salary'],
        salary_min: 80000,
        salary_max: 120000,
        location: 'Remote',
        remote: true,
        employment_type: 'full-time',
        experience_level: 'senior',
        skills: ['TypeScript', 'Node.js', 'MongoDB'],
        status: 'active'
      }
    });
    console.log('✅ Job created:', job.id);

    // 4. Fetch Jobs
    console.log('\nFetching jobs...');
    const jobs = await dbClient.job.findMany({
      take: 5
    });
    console.log(`✅ Fetched ${jobs.length} jobs`);

    // 5. Update Job
    console.log('\nUpdating job...');
    const updatedJob = await dbClient.job.update({
      where: { id: job.id },
      data: {
        title: 'Lead Developer'
      }
    });
    console.log('✅ Job updated:', updatedJob.title);

    // 6. Delete Job
    console.log('\nDeleting job...');
    await dbClient.job.delete({
      where: { id: job.id }
    });
    console.log('✅ Job deleted');

    // 7. Delete Company
    console.log('\nDeleting company...');
    await dbClient.company.delete({
      where: { id: company.id }
    });
    console.log('✅ Company deleted');

    console.log('\n🎉 Verification successful!');
  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  } finally {
    await dbClient.$disconnect();
  }
}

verifyPrisma();
