import { NextResponse } from "next/server";
import { z } from "zod";
import { getCoverage } from "@/lib/coverage";
import { isRecentMiss, recordCrawlStarted, remainingCrawlsToday } from "@/lib/crawl-limits";
import { startCrawl } from "@/lib/crawler";
import { getLogger } from "@/lib/logger";

const log = getLogger("api/crawl");

// Small on purpose: a demo crawl should finish in about 90 seconds.
const DEFAULT_LIMIT = 3;

const CrawlRequestSchema = z.object({
  neighborhood: z.string().min(1),
  limit: z.number().int().min(1).max(10).default(DEFAULT_LIMIT),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    log.warn("request body was not valid JSON", {
      reason: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = CrawlRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "neighborhood is required" }, { status: 400 });
  }
  const { neighborhood, limit } = parsed.data;

  const coverage = await getCoverage(neighborhood);
  if (coverage.hasData) {
    log.info("refusing to crawl a covered neighborhood", {
      neighborhood,
      restaurants: coverage.restaurantCount,
    });
    return NextResponse.json(
      { error: `Already have ${coverage.restaurantCount} restaurants in ${neighborhood}`, coverage },
      { status: 409 },
    );
  }

  if (isRecentMiss(neighborhood)) {
    return NextResponse.json(
      { error: `A recent crawl of ${neighborhood} found nothing; not retrying today` },
      { status: 409 },
    );
  }

  if (remainingCrawlsToday() <= 0) {
    log.warn("daily crawl limit reached", { neighborhood });
    return NextResponse.json({ error: "Daily crawl limit reached" }, { status: 429 });
  }

  // In-flight duplicates are the crawler's job: it returns the existing jobId
  // for a neighborhood already queued or running.
  const job = await startCrawl(neighborhood, limit);
  recordCrawlStarted(job.jobId);
  log.info("crawl started", { neighborhood, jobId: job.jobId, limit });

  return NextResponse.json({ jobId: job.jobId, status: job.status }, { status: 202 });
}
