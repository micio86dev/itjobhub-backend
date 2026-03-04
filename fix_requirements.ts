/**
 * fix_requirements.ts
 *
 * Fixes inconsistent `requirements` field in the Job collection.
 * Some documents have requirements stored as an object
 * { education, years_of_experience, soft_skills } instead of String[].
 *
 * Run: bun run fix_requirements.ts
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const uri = process.env.DATABASE_URL;
if (!uri) {
    console.error('DATABASE_URL not found in .env');
    process.exit(1);
}

const client = new MongoClient(uri);

async function fix() {
    try {
        await client.connect();
        const db = client.db();
        const jobs = db.collection('jobs');

        // Find all documents where requirements is NOT an array (object, null stored as object, etc.)
        const cursor = jobs.find({
            requirements: {
                $exists: true,
                $not: { $type: 'array' },
            },
        });

        const badDocs = await cursor.toArray();
        console.log(`Found ${badDocs.length} jobs with invalid requirements field.`);

        if (badDocs.length === 0) {
            console.log('Nothing to fix.');
            return;
        }

        let fixed = 0;
        for (const doc of badDocs) {
            const req = doc.requirements;
            let newValue: string[] = [];

            // If it's an object with soft_skills, extract them
            if (req && typeof req === 'object' && !Array.isArray(req)) {
                const softSkills = req.soft_skills;
                if (Array.isArray(softSkills)) {
                    newValue = softSkills.filter((s: unknown) => typeof s === 'string');
                }
            }

            await jobs.updateOne(
                { _id: doc._id },
                { $set: { requirements: newValue } }
            );
            fixed++;
        }

        console.log(`Fixed ${fixed} documents. requirements is now String[] for all.`);
    } catch (err) {
        console.error('Migration error:', err);
        process.exit(1);
    } finally {
        await client.close();
    }
}

fix();
