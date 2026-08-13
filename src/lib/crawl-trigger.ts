import { getCoverage, type Coverage } from "@/lib/coverage";
import { isRecentMiss, recordCrawlStarted, remainingCrawlsToday } from "@/lib/crawl-limits";
import { startCrawl } from "@/lib/crawler";
import { getLogger } from "@/lib/logger";

const log = getLogger("crawl-trigger");

// Small on purpose: a demo crawl should finish in about 90 seconds.
export const DEFAULT_CRAWL_LIMIT = 3;

export type CrawlTriggerResult =
  | { started: true; jobId: string; status: string }
  | { started: false; reason: "covered"; coverage: Coverage }
  | { started: false; reason: "recent-miss" }
  | { started: false; reason: "daily-cap" };

/**
 * The single gate between a neighborhood and money being spent. Both the crawl
 * route and the chat route go through here, so a guardrail added once applies
 * to every path.
 */
export async function startCrawlIfEligible(
  neighborhood: string,
  limit: number = DEFAULT_CRAWL_LIMIT,
): Promise<CrawlTriggerResult> {
  const coverage = await getCoverage(neighborhood);
  if (coverage.hasData) {
    log.info("refusing to crawl a covered neighborhood", {
      neighborhood,
      restaurants: coverage.restaurantCount,
    });
    return { started: false, reason: "covered", coverage };
  }

  if (isRecentMiss(neighborhood)) {
    return { started: false, reason: "recent-miss" };
  }

  if (remainingCrawlsToday() <= 0) {
    log.warn("daily crawl limit reached", { neighborhood });
    return { started: false, reason: "daily-cap" };
  }

  // In-flight duplicates are the crawler's job: it returns the existing jobId
  // for a neighborhood already queued or running.
  const job = await startCrawl(neighborhood, limit);
  recordCrawlStarted(job.jobId);
  log.info("crawl started", { neighborhood, jobId: job.jobId, limit });

  return { started: true, jobId: job.jobId, status: job.status };
}
