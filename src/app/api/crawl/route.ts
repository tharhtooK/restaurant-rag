import { NextResponse } from "next/server";
import { z } from "zod";
import { DEFAULT_CRAWL_LIMIT, startCrawlIfEligible } from "@/lib/crawl-trigger";
import { describeLocation, parseLocation } from "@/lib/location";
import { getLogger } from "@/lib/logger";

const log = getLogger("api/crawl");

const CrawlRequestSchema = z.object({
  location: z.string().min(1),
  limit: z.number().int().min(1).max(10).default(DEFAULT_CRAWL_LIMIT),
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
    return NextResponse.json({ error: "location is required" }, { status: 400 });
  }

  const location = parseLocation(parsed.data.location);
  if (!location) {
    return NextResponse.json(
      { error: `Could not read a city from "${parsed.data.location}"` },
      { status: 400 },
    );
  }

  const result = await startCrawlIfEligible(location, parsed.data.limit);

  if (result.started) {
    return NextResponse.json({ jobId: result.jobId, status: result.status }, { status: 202 });
  }

  if (result.reason === "covered") {
    return NextResponse.json(
      {
        error: `Already have ${result.coverage.restaurantCount} restaurants in ${describeLocation(location)}`,
        coverage: result.coverage,
      },
      { status: 409 },
    );
  }

  if (result.reason === "recent-miss") {
    return NextResponse.json(
      { error: `A recent crawl of ${describeLocation(location)} found nothing; not retrying today` },
      { status: 409 },
    );
  }

  return NextResponse.json({ error: "Daily crawl limit reached" }, { status: 429 });
}