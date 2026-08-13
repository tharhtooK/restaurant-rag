/**
 * Spending guardrails for the crawl endpoint. Every crawl costs Google Places
 * quota, so these are the difference between a demo and a bill.
 *
 * State is in-process and lost on restart, which matches the crawler's own job
 * registry. At this scale that is an accepted tradeoff, not an oversight: the
 * worst case after a restart is one repeated crawl.
 */
const MISS_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CRAWLS_PER_DAY = 5;

const missedAt = new Map<string, number>();
const importedJobs = new Set<string>();
const countedJobs = new Set<string>();
let today = { day: "", crawls: 0 };

function key(neighborhood: string): string {
  return neighborhood.trim().toLowerCase();
}

function currentDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function dailyLimit(): number {
  const configured = Number(process.env.CRAWLS_PER_DAY);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_CRAWLS_PER_DAY;
}

/** A neighborhood that found nothing is not retried for 24h — usually a typo. */
export function isRecentMiss(neighborhood: string): boolean {
  const at = missedAt.get(key(neighborhood));
  if (at === undefined) return false;
  if (Date.now() - at < MISS_TTL_MS) return true;
  missedAt.delete(key(neighborhood));
  return false;
}

export function recordMiss(neighborhood: string): void {
  missedAt.set(key(neighborhood), Date.now());
}

export function remainingCrawlsToday(): number {
  if (today.day !== currentDay()) return dailyLimit();
  return Math.max(0, dailyLimit() - today.crawls);
}

/**
 * Counted per job rather than per request: the crawler returns the existing
 * jobId when a neighborhood is already in flight, so a double-clicked button
 * must not burn two of the day's crawls.
 */
export function recordCrawlStarted(jobId: string): void {
  if (countedJobs.has(jobId)) return;
  countedJobs.add(jobId);
  const day = currentDay();
  if (today.day !== day) today = { day, crawls: 0 };
  today.crawls += 1;
}

export function isImported(jobId: string): boolean {
  return importedJobs.has(jobId);
}

export function markImported(jobId: string): void {
  importedJobs.add(jobId);
}
