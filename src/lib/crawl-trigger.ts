import { getCoverage, type Coverage } from "@/lib/coverage";
import { describeLocation, type Location } from "@/lib/location";
import { isRecentMiss, recordCrawlStarted, remainingCrawlsToday } from "@/lib/crawl-limits";
import { recordCrawlLocation } from "@/lib/crawl-jobs";
import { startCrawl } from "@/lib/crawler";
import { getLogger } from "@/lib/logger";

const log = getLogger("crawl-trigger");

// Small on purpose: a demo crawl should finish in about 90 seconds.
export const DEFAULT_CRAWL_LIMIT = 3;

export type CrawlTriggerResult =
  | { started: true; jobId: string; status: string }
  | { started: false; reason: "covered"; coverage: Coverage }
  | { started: false; reason: "recent-miss" }
  | { started: false; reason: "daily-cap" }
  | { started: false; reason: "unavailable"; detail: string };

/**
 * The single gate between a neighborhood and money being spent. Both the crawl
 * route and the chat route go through here, so a guardrail added once applies
 * to every path.
 */
export async function startCrawlIfEligible(
  location: Location,
  limit: number = DEFAULT_CRAWL_LIMIT,
): Promise<CrawlTriggerResult> {
  const label = describeLocation(location);
  const coverage = await getCoverage(location);
  if (coverage.hasData) {
    log.info("refusing to crawl a covered city", {
      location: label,
      restaurants: coverage.restaurantCount,
    });
    return { started: false, reason: "covered", coverage };
  }

  if (isRecentMiss(label)) {
    return { started: false, reason: "recent-miss" };
  }

  if (remainingCrawlsToday() <= 0) {
    log.warn("daily crawl limit reached", { location: label });
    return { started: false, reason: "daily-cap" };
  }

  // In-flight duplicates are the crawler's job: it returns the existing jobId
  // for a neighborhood already queued or running.
  // The crawler requires a neighborhood, so a city-level crawl sends the city as
  // one. import-crawl drops it again rather than storing a neighborhood named
  // after a city.
  // The crawler is a separate service on a host that sleeps, so treat it being
  // down as an outcome rather than an exception. It used to throw straight
  // through /api/chat and turn a good answer into a 500.
  let job;
  try {
    job = await startCrawl(location.neighborhood ?? location.city, location.city, limit);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    log.error("crawler unreachable", { location: label, detail });
    return { started: false, reason: "unavailable", detail };
  }

  recordCrawlStarted(job.jobId);
  recordCrawlLocation(job.jobId, location);
  log.info("crawl started", { location: label, jobId: job.jobId, limit });

  return { started: true, jobId: job.jobId, status: job.status };
}
