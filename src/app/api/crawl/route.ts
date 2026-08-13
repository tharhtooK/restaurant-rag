import { NextResponse } from "next/server";
import { z } from "zod";
import { DEFAULT_CRAWL_LIMIT, startCrawlIfEligible } from "@/lib/crawl-trigger";
import { getLogger } from "@/lib/logger";

const log = getLogger("api/crawl");

const CrawlRequestSchema = z.object({
  neighborhood: z.string().min(1),
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
    return NextResponse.json({ error: "neighborhood is required" }, { status: 400 });
  }
  const { neighborhood, limit } = parsed.data;

  const result = await startCrawlIfEligible(neighborhood, limit);

  if (result.started) {
    return NextResponse.json({ jobId: result.jobId, status: result.status }, { status: 202 });
  }

  if (result.reason === "covered") {
    return NextResponse.json(
      {
        error: `Already have ${result.coverage.restaurantCount} restaurants in ${neighborhood}`,
        coverage: result.coverage,
      },
      { status: 409 },
    );
  }

  if (result.reason === "recent-miss") {
    return NextResponse.json(
      { error: `A recent crawl of ${neighborhood} found nothing; not retrying today` },
      { status: 409 },
    );
  }

  return NextResponse.json({ error: "Daily crawl limit reached" }, { status: 429 });
}