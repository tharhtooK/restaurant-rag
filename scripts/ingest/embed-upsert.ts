/**
 * Steps 8-9: chunk + embed + upsert.
 *
 * The work lives in src/lib/embed-reviews.ts so the /api/crawl route can run the
 * same ingest in-process. This file is the CLI over it.
 *
 * Usage:
 *   npx tsx scripts/ingest/embed-upsert.ts                     # authored corpus -> default namespace
 *   npx tsx scripts/ingest/embed-upsert.ts web-research        # only independently-sourced
 *   npx tsx scripts/ingest/embed-upsert.ts crawled:            # every crawled source -> "crawled"
 *
 * Passing a source writes into a Pinecone namespace of the same name, so the
 * authored and independent corpora stay isolated and can be evaluated
 * separately. See prisma/seed-data-independent.ts for why that matters.
 */
import "dotenv/config";
import { prisma } from "@/lib/db";
import { embedReviews } from "@/lib/embed-reviews";
import { getPineconeIndex } from "@/lib/pinecone";

async function main() {
  const summary = await embedReviews(process.argv[2]);

  if (summary.embedded === 0) {
    console.log("nothing to do - did you run `prisma db seed`?");
    return;
  }

  const base = getPineconeIndex();
  const index = summary.namespace === "__default__" ? base : base.namespace(summary.namespace);
  const stats = await index.describeIndexStats();
  console.log(
    `embedded ${summary.embedded} reviews from source="${summary.source}" ` +
      `into namespace "${summary.namespace}". index now reports ${stats.totalRecordCount} records`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
