
import { PrismaClient } from '@prisma/client';
import logger from "../utils/logger";

const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findUnique({
        where: { email: 'seeker@test.com' },
        include: { profile: true }
    });

    if (user) {
        logger.info(`Seeker found: ${user.email}`);
        logger.info(`Languages: ${JSON.stringify(user.profile?.languages)}`);
        logger.info(`Skills: ${JSON.stringify(user.profile?.skills)}`);
        logger.info(`Availability: ${user.profile?.availability}`);
    } else {
        logger.error('Seeker not found');
    }
}

main()
    .catch((e) => logger.error(e))
    .finally(() => prisma.$disconnect());
