/**
 * Client for the restaurant-crawler service.
 *
 * The payload crosses a network boundary from a separate repo, so it is
 * untrusted: every field is validated here rather than at the database.
 */
import { z } from "zod";

const hoursWindowSchema = z.object({
  open: z.string().regex(/^\d{2}:\d{2}$/),
  close: z.string().regex(/^\d{2}:\d{2}$/),
});

// All seven keys are required. A restaurant missing a day is rejected rather
// than written as a half-record.
const hoursSchema = z.object({
  mon: hoursWindowSchema.nullable(),
  tue: hoursWindowSchema.nullable(),
  wed: hoursWindowSchema.nullable(),
  thu: hoursWindowSchema.nullable(),
  fri: hoursWindowSchema.nullable(),
  sat: hoursWindowSchema.nullable(),
  sun: hoursWindowSchema.nullable(),
});

const crawledReviewSchema = z.object({
  content: z.string().min(1),
  source: z.string().min(1),
  sourceUrl: z.string().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
});

const crawledRestaurantSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  neighborhood: z.string().min(1),
  cuisine: z.string().min(1),
  priceTier: z.number().int().min(1).max(4),
  address: z.string(),
  dietary: z.array(z.string()),
  hours: hoursSchema,
  reviews: z.array(crawledReviewSchema),
});

export const crawlJobSchema = z.object({
  jobId: z.string(),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  neighborhood: z.string().optional(),
  crawledAt: z.string().nullable().optional(),
  progress: z
    .object({ found: z.number(), completed: z.number(), total: z.number() })
    .optional(),
  restaurants: z.array(crawledRestaurantSchema).optional(),
  sourceStatus: z.record(z.string(), z.string()).optional(),
  errors: z
    .array(
      z.object({
        source: z.string(),
        slug: z.string().nullable(),
        message: z.string(),
      }),
    )
    .optional(),
});

export type CrawlJob = z.infer<typeof crawlJobSchema>;
export type CrawledRestaurant = z.infer<typeof crawledRestaurantSchema>;

function crawlerConfig() {
  const baseUrl = process.env.CRAWLER_URL;
  const apiKey = process.env.CRAWLER_API_KEY;
  if (!baseUrl) throw new Error("CRAWLER_URL is not set");
  if (!apiKey) throw new Error("CRAWLER_API_KEY is not set");
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

export async function getCrawlJob(jobId: string): Promise<CrawlJob> {
  const { baseUrl, apiKey } = crawlerConfig();
  const response = await fetch(`${baseUrl}/crawl/${jobId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`crawler GET /crawl/${jobId} -> ${response.status} ${await response.text()}`);
  }
  return crawlJobSchema.parse(await response.json());
}

export async function startCrawl(
  neighborhood: string,
  city: string,
  limit: number,
): Promise<CrawlJob> {
  const { baseUrl, apiKey } = crawlerConfig();
  const response = await fetch(`${baseUrl}/crawl`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ neighborhood, city, limit }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`crawler POST /crawl -> ${response.status} ${await response.text()}`);
  }
  return crawlJobSchema.parse(await response.json());
}
