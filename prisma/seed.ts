import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { restaurants } from "./seed-data";
import { independentReviews } from "./seed-data-independent";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  for (const r of restaurants) {
    const { reviews, ...seedData } = r;
    // Set explicitly rather than leaning on the column default, so changing that
    // default can never silently reclassify the corpus the eval is graded against.
    const restaurantFields = { ...seedData, dataset: "seed", city: "New York", state: "NY" };

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
          source: "authored-for-goldens",
          content: rev.content,
        })),
      });
    }

    console.log(`seeded ${r.slug} (${reviews.length} reviews)`);
  }

  // Independently-sourced reviews, tagged so the eval can retrieve them alone.
  const bySlug = new Map(
    (await prisma.restaurant.findMany({ select: { id: true, slug: true } })).map((r) => [r.slug, r.id]),
  );
  let independent = 0;
  for (const rev of independentReviews) {
    const restaurantId = bySlug.get(rev.slug);
    if (!restaurantId) {
      console.warn(`  skipping independent review for unknown slug: ${rev.slug}`);
      continue;
    }
    await prisma.review.create({
      data: { restaurantId, source: "web-research", content: rev.content },
    });
    independent++;
  }
  console.log(`seeded ${independent} independent reviews across ${new Set(independentReviews.map((r) => r.slug)).size} restaurants`);
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
