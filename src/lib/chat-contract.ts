import type { ToolCallRecord } from "@/lib/agent";

/**
 * The shape /api/chat returns, imported by both the route and the client.
 *
 * response.json() is untyped, so without a shared type the client can read a
 * field the route no longer sends and still compile: renaming crawl.neighborhood
 * to crawl.location on 2026-08-14 shipped "I've got undefined now" to the UI.
 */
export type ChatResponse = {
  text?: string;
  toolCalls?: ToolCallRecord[];
  /** Present when this turn started a crawl. */
  crawl?: { jobId: string; location: string };
  /** Present when the lookup found nothing and we need a location to fetch. */
  needsNeighborhood?: true;
  /** The location was crawlable but the crawler service could not be reached. */
  crawlUnavailable?: true;
  error?: string;
  detail?: string;
};

/** What GET /api/crawl/:jobId returns while polling. */
export type CrawlJobStatus = {
  jobId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  progress?: { found: number; completed: number; total: number };
  imported?: boolean;
  restaurants?: number;
};
