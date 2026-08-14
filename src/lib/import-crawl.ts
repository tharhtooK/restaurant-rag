/**
 * Turns a crawler payload into Restaurant and Review rows, then embeds them.
 *
 * Shared by scripts/ingest/import-crawl.ts and the /api/crawl polling route so
 * a hand-run import and a user-triggered one cannot drift apart.
 */
import { spawn } from "node:child_process";
import type { CrawlJob, CrawledRestaurant } from "@/lib/crawler";
import { prisma } from "@/lib/db";
import { parseAddressLocation, scopeSlug, type Location } from "@/lib/location";
import { getLogger } from "@/lib/logger";

const log = getLogger("import-crawl");

export const CRAWLED_SOURCE_PREFIX = "crawled:";
const VEGETARIAN_TAGS = ["vegetarian", "vegan"];

export type ImportedRestaurant = {
  slug: string;
  reviews: number;
  replaced: number;
};

function publishedDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function importRestaurant(restaurant: CrawledRestaurant): Promise<ImportedRestaurant> {
  const vegetarianFriendly = restaurant.dietary.some((tag) => VEGETARIAN_TAGS.includes(tag));
  const { city, state } = parseAddressLocation(restaurant.address);

  // A city-level crawl has to send the city as the neighborhood, because the
  // crawler requires one. Storing that back would invent a neighborhood named
  // after a city, which is how "Brooklyn" became one on 2026-08-13.
  const isCityLevel =
    restaurant.neighborhood.trim().toLowerCase() === city.trim().toLowerCase();

  const slug = scopeSlug(restaurant.slug, { neighborhood: null, city, state });

  const fields = {
    name: restaurant.name,
    neighborhood: isCityLevel ? null : restaurant.neighborhood,
    city,
    state,
    cuisine: restaurant.cuisine,
    priceTier: restaurant.priceTier,
    address: restaurant.address,
    vegetarianFriendly,
    dietary: restaurant.dietary,
    hours: restaurant.hours,
    dataset: "crawled",
  };

  const row = await prisma.restaurant.upsert({
    where: { slug },
    create: { slug, ...fields },
    update: fields,
  });

  // No unique key on Review, so replace this restaurant's crawled reviews
  // rather than appending a duplicate set on every re-import. Authored and
  // web-research reviews are left alone.
  const removed = await prisma.review.deleteMany({
    where: { restaurantId: row.id, source: { startsWith: CRAWLED_SOURCE_PREFIX } },
  });

  await prisma.review.createMany({
    data: restaurant.reviews.map((review) => ({
      restaurantId: row.id,
      source: `${CRAWLED_SOURCE_PREFIX}${review.source}`,
      content: review.content,
      sourceUrl: review.sourceUrl ?? null,
      publishedAt: publishedDate(review.publishedAt),
    })),
  });

  return { slug, reviews: restaurant.reviews.length, replaced: removed.count };
}

/**
 * Restaurants actually in the city that was asked for.
 *
 * The crawler falls back to New York when it cannot resolve a city, so a request
 * for an unresolvable place comes back full of real restaurants somewhere else.
 * Importing those files them under the requested name and quietly corrupts the
 * data, which is what "in mable grove" did on 2026-08-14.
 */
function inRequestedCity(restaurants: CrawledRestaurant[], expected: Location) {
  const wanted = expected.city.trim().toLowerCase();
  return restaurants.filter(
    (restaurant) => parseAddressLocation(restaurant.address).city.trim().toLowerCase() === wanted,
  );
}

export async function importCrawlJob(
  job: CrawlJob,
  expected?: Location,
): Promise<ImportedRestaurant[]> {
  if (job.status !== "succeeded") {
    throw new Error(`job ${job.jobId} is "${job.status}", not "succeeded"`);
  }
  if (!job.restaurants?.length) {
    throw new Error(`job ${job.jobId} succeeded but carries no restaurants`);
  }

  const wanted = expected ? inRequestedCity(job.restaurants, expected) : job.restaurants;
  const dropped = job.restaurants.length - wanted.length;
  if (dropped > 0) {
    log.warn("dropped crawled restaurants from the wrong city", {
      jobId: job.jobId,
      requested: expected ? expected.city : "",
      dropped,
      kept: wanted.length,
    });
  }

  const imported: ImportedRestaurant[] = [];
  for (const restaurant of wanted) {
    imported.push(await importRestaurant(restaurant));
  }

  log.info("imported crawl job", {
    jobId: job.jobId,
    neighborhood: job.neighborhood ?? "",
    restaurants: imported.length,
    reviews: imported.reduce((total, one) => total + one.reviews, 0),
  });
  return imported;
}

/**
 * Shells out rather than reimplementing chunking. Re-embeds every crawled
 * review, not just this job's; vector IDs are review primary keys, so that
 * overwrites rather than duplicates.
 */
export function embedCrawledReviews(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["tsx", "scripts/ingest/embed-upsert.ts", CRAWLED_SOURCE_PREFIX],
      { stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`embed-upsert exited with code ${code}`));
    });
  });
}
