import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { restaurants } from "./seed-data";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  for (const r of restaurants) {
    const { reviews, ...restaurantFields } = r;

    const restaurant = await prisma.restaurant.upsert({
      where: { slug: r.slug },
      update: restaurantFields,
      create: restaurantFields,
    });

    await prisma.review.deleteMany({ where: { restaurantId: restaurant.id } });
    if (reviews.length > 0) {
      await prisma.review.createMany({
        data: reviews.map((rev) => ({
          restaurantId: restaurant.id,
          source: rev.source,
          content: rev.content,
        })),
      });
    }

    console.log(`seeded ${r.slug} (${reviews.length} reviews)`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
