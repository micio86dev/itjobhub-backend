
import { getJobs } from '../src/services/jobs/job.service';
import { prisma } from '../src/config/database';

async function testJobSearch() {
    console.log('--- Starting Job Search Test ---');

    // Case 1: Search by text only "Munich"
    console.log('\n1. Searching for "Munich" (Text only)...');
    const res1 = await getJobs(1, 10, { location: 'Munich' });
    console.log(`Found ${res1.pagination.total} jobs.`);
    res1.jobs.forEach(j => console.log(`   - ${j.title} (${j.location})`));

    // Case 2: Search by text "Germany" (Text only)
    console.log('\n2. Searching for "Germany" (Text only)...');
    const res2 = await getJobs(1, 10, { location: 'Germany' });
    console.log(`Found ${res2.pagination.total} jobs.`);
    res2.jobs.forEach(j => console.log(`   - ${j.title} (${j.location})`));

    // Case 3: Search by Coords (Munich Center) + Text "Munich"
    // Munich Coords: 48.1351, 11.5820
    console.log('\n3. Searching for "Munich" (Coords + Text)...');
    const res3 = await getJobs(1, 10, {
        location: 'Munich',
        lat: 48.1351,
        lng: 11.5820,
        radius_km: 50
    });
    console.log(`Found ${res3.pagination.total} jobs.`);
    res3.jobs.forEach(j => console.log(`   - ${j.title} (${j.location}) [Geo: ${j.location_geo ? 'Yes' : 'No'}]`));

    // Case 4: Search by Coords (Germany/Europe Center?) -> This is tricky as "result for location" usually implies specific point.
    // Let's try searching "San Francisco" which we know has a job with coords.
    console.log('\n4. Searching for "San Francisco" (Coords + Text)...');
    const res4 = await getJobs(1, 10, {
        location: 'San Francisco',
        lat: 37.7749,
        lng: -122.4194,
        radius_km: 50
    });
    console.log(`Found ${res4.pagination.total} jobs.`);
    res4.jobs.forEach(j => console.log(`   - ${j.title} (${j.location}) [Geo: ${j.location_geo ? 'Yes' : 'No'}]`));

}

testJobSearch().catch(console.error).finally(async () => {
    await prisma.$disconnect();
});
