import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isImported, markImported, recordMiss } from "@/lib/crawl-limits";
import { getCrawlJob } from "@/lib/crawler";
import { embedCrawledReviews, importCrawlJob } from "@/lib/import-crawl";
import { getLogger } from "@/lib/logger";

const log = getLogger("api/crawl/[jobId]");

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/crawl/[jobId]">) {
  const { jobId } = await ctx.params;

  const job = await getCrawlJob(jobId);

  if (job.status === "queued" || job.status === "running") {
    return NextResponse.json({ jobId, status: job.status, progress: job.progress });
  }

  if (job.status === "failed") {
    if (job.neighborhood) recordMiss(job.neighborhood);
    log.warn("crawl job failed", { jobId, neighborhood: job.neighborhood ?? "" });
    return NextResponse.json({ jobId, status: job.status, errors: job.errors ?? [] });
  }

  if (isImported(jobId)) {
    return NextResponse.json({
      jobId,
      status: job.status,
      imported: true,
      restaurants: job.restaurants?.length ?? 0,
    });
  }

  // Claimed before the await so two concurrent polls cannot both import.
  markImported(jobId);
  const imported = await importCrawlJob(job);
  await embedCrawledReviews();
  log.info("crawl imported and embedded", { jobId, restaurants: imported.length });

  return NextResponse.json({
    jobId,
    status: job.status,
    imported: true,
    restaurants: imported.length,
    sourceStatus: job.sourceStatus ?? {},
  });
}
