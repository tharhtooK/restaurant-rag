import type { Location } from "@/lib/location";

/**
 * What location each crawl job was started for.
 *
 * The crawler echoes back only the neighborhood it was sent, never the city, so
 * the import cannot otherwise tell what was asked for. It has to know: the
 * crawler falls back to New York when it cannot resolve a city, and on
 * 2026-08-14 a request for "in mable grove" returned three Brooklyn restaurants
 * that were imported under that name.
 *
 * In-process and lost on restart, matching crawl-limits.ts. A job whose location
 * is forgotten imports unvalidated, which is the same behaviour as the CLI.
 */
const jobLocations = new Map<string, Location>();

export function recordCrawlLocation(jobId: string, location: Location): void {
  jobLocations.set(jobId, location);
}

export function getCrawlLocation(jobId: string): Location | undefined {
  return jobLocations.get(jobId);
}
