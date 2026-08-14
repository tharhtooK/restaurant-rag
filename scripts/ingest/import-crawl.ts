/**
 * CLI wrapper around the shared importer.
 *
 *   npx tsx scripts/ingest/import-crawl.ts <jobId>
 *   npx tsx scripts/ingest/import-crawl.ts --from-file fixtures/bushwick.json
 *
 * --from-file reads a recorded payload instead of calling the service. Same
 * code path, different source of the JSON, so a live demo has an escape hatch.
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { crawlJobSchema, getCrawlJob } from "@/lib/crawler";
import { prisma } from "@/lib/db";
import { embedCrawledReviews, importCrawlJob } from "@/lib/import-crawl";

async function loadJob(jobId: string | undefined, fromFile: string | undefined) {
  if (fromFile) {
    return crawlJobSchema.parse(JSON.parse(await readFile(fromFile, "utf8")));
  }
  return getCrawlJob(jobId ?? "");
}

async function main() {
  const args = process.argv.slice(2);
  const fileFlag = args.indexOf("--from-file");
  const fromFile = fileFlag === -1 ? undefined : args[fileFlag + 1];
  const jobId = fileFlag === -1 ? args[0] : undefined;

  if (!jobId && !fromFile) {
    throw new Error("usage: import-crawl.ts <jobId> | --from-file <path>");
  }

  const job = await loadJob(jobId, fromFile);
  console.log(`importing ${job.restaurants?.length ?? 0} restaurants from ${job.neighborhood}`);
  console.log(`crawled at ${job.crawledAt}, sources ${JSON.stringify(job.sourceStatus)}`);

  for (const result of await importCrawlJob(job)) {
    const replaced = result.replaced ? ` (replaced ${result.replaced})` : "";
    console.log(`  ${result.slug}: ${result.reviews} reviews${replaced}`);
  }

  console.log("\nembedding into the \"crawled\" namespace");
  await embedCrawledReviews();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
