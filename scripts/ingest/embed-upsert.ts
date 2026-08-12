/**
 * Steps 8-9: chunk + embed + upsert.
 *
 * Chunking is a no-op at the current data size: review snippets are 1-3
 * sentences, so each review is already an appropriately-sized chunk. If review
 * text ever grows to full paragraphs, split here before embedding.
 *
 * Vector IDs are the Review primary key, so re-running this script overwrites
 * rather than duplicating.
 *
 * Usage:
 *   npx tsx scripts/ingest/embed-upsert.ts                     # all reviews -> default namespace
 *   npx tsx scripts/ingest/embed-upsert.ts web-research        # only independently-sourced
 *
 * Passing a source writes into a Pinecone namespace of the same name, so the
 * authored and independent corpora stay isolated and can be evaluated
 * separately. See prisma/seed-data-independent.ts for why that matters.
 */
import "dotenv/config";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { embed, getPineconeIndex, type ReviewVectorMetadata } from "../../src/lib/pinecone";

const BATCH_SIZE = 50;

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const source = process.argv[2];
  const namespace = source || undefined;

  const reviews = await prisma.review.findMany({
    where: source ? { source } : undefined,
    include: { restaurant: true },
  });
  if (source) console.log(`filtering to source="${source}" -> namespace "${namespace}"`);
  console.log(`found ${reviews.length} reviews to embed`);

  if (reviews.length === 0) {
    console.log("nothing to do - did you run `prisma db seed`?");
    return;
  }

  const base = getPineconeIndex();
  const index = namespace ? base.namespace(namespace) : base;
  let upserted = 0;

  for (let i = 0; i < reviews.length; i += BATCH_SIZE) {
    const batch = reviews.slice(i, i + BATCH_SIZE);
    const vectors = await embed(batch.map((r) => r.content));

    await index.upsert({
      records: batch.map((review, n) => ({
        id: review.id,
        values: vectors[n],
        metadata: {
          restaurantSlug: review.restaurant.slug,
          restaurantName: review.restaurant.name,
          neighborhood: review.restaurant.neighborhood,
          source: review.source,
          content: review.content,
        } satisfies ReviewVectorMetadata,
      })),
    });

    upserted += batch.length;
    console.log(`upserted ${upserted}/${reviews.length}`);
  }

  const stats = await index.describeIndexStats();
  console.log(`done. index now reports ${stats.totalRecordCount} records`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
