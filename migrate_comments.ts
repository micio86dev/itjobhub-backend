import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const uri = process.env.MONGODB_URI;
if (!uri) {
    console.error('MONGODB_URI not found in .env');
    process.exit(1);
}

const client = new MongoClient(uri);

async function migrate() {
    try {
        await client.connect();
        const db = client.db();
        const collection = db.collection('comments');

        const cursor = collection.find({ job_id: { $exists: true } });
        const comments = await cursor.toArray();

        console.log(`Found ${comments.length} comments to migrate.`);

        for (const comment of comments) {
            await collection.updateOne(
                { _id: comment._id },
                {
                    $set: {
                        commentable_id: comment.job_id,
                        commentable_type: 'job'
                    },
                    $unset: { job_id: "" }
                }
            );
        }

        console.log('Migration completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await client.close();
    }
}

migrate();
