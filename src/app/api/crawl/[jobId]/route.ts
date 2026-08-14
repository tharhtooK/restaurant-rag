import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isImported, markImported, recordMiss, releaseImportClaim } from "@/lib/crawl-limits";
import { getCrawlLocation } from "@/lib/crawl-jobs";
import { getCrawlJob } from "@/lib/crawler";
import { describeLocation } from "@/lib/location";
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

  // Claimed before the await so two concurrent polls cannot both import, and
  // given back on failure so a broken import is retried rather than reported as
  // done. Keeping the claim after a throw made the next poll answer
  // imported: true for rows that were never written.
  markImported(jobId);
  const expected = getCrawlLocation(jobId);
  let imported;
  try {
    imported = await importCrawlJob(job, expected);
    // Only after something was actually written: embedding re-reads every
    // crawled review, so running it for a job that imported nothing is pure cost.
    if (imported.length > 0) await embedCrawledReviews();
  } catch (error) {
    releaseImportClaim(jobId);
    log.error("crawl import failed", {
      jobId,
      neighborhood: job.neighborhood ?? "",
      detail: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  // Everything came back from somewhere else - the crawler's New York fallback.
  // Report it as a miss so the location is not retried for 24h, rather than
  // leaving the client polling a job that will never import.
  if (imported.length === 0) {
    const where = expected ? describeLocation(expected) : (job.neighborhood ?? "");
    if (where) recordMiss(where);
    log.warn("crawl found nothing in the requested place", { jobId, requested: where });
    return NextResponse.json({
      jobId,
      status: "failed",
      error: `Couldn't find restaurants in ${where}`,
    });
  }

  log.info("crawl imported and embedded", { jobId, restaurants: imported.length });

  return NextResponse.json({
    jobId,
    status: job.status,
    imported: true,
    restaurants: imported.length,
    sourceStatus: job.sourceStatus ?? {},
  });
}
