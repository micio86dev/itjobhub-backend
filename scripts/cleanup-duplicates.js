import { MongoClient } from "mongodb";
import pino from "pino";

const logger = pino();

const uri = "mongodb+srv://itjobhub:BVJOuH3ezi2GRR61@cluster0.ug1ah2i.mongodb.net/itjobhub?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri);

async function run() {
    try {
        await client.connect();
        logger.info("Connected to MongoDB for cleanup...");
        const database = client.db("itjobhub");
        const collection = database.collection("jobs");

        // Also consider grouping by fewer fields if slight variations exist?
        // User asked "Elimina gli annunci duplicati". Usually title + company + location (and maybe date).
        const duplicates = await collection.aggregate([
            {
                $group: {
                    _id: { title: "$title", company: "$company", location: "$location", publishDate: "$publishDate" },
                    uniqueIds: { $push: "$_id" },
                    count: { $sum: 1 }
                }
            },
            {
                $match: { count: { $gt: 1 } }
            }
        ]).toArray();

        logger.info({ duplicateSets: duplicates.length }, "Found duplicates sets based on Title, Company, Location, Date.");

        let deletedCount = 0;
        for (const doc of duplicates) {
            const ids = doc.uniqueIds;
            // Sort by ObjectId desc (newest first). Keep newest.
            ids.sort((a, b) => b.toString().localeCompare(a.toString()));

            const [keep, ...remove] = ids;

            if (remove.length > 0) {
                const res = await collection.deleteMany({ _id: { $in: remove } });
                deletedCount += res.deletedCount;
            }
        }
        logger.info({ deletedCount }, "Deleted duplicate documents.");

    } catch (e) {
        logger.error({ error: e }, "Error during cleanup");
    } finally {
        await client.close();
    }
}
run();
