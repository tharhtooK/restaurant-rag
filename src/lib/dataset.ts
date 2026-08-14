import type { Prisma } from "@/generated/prisma/client";

/**
 * Scopes the SQL tools to one dataset, mirroring how PINECONE_NAMESPACE scopes
 * vector search.
 *
 * Unset means no filter, so the app sees seeded and crawled restaurants alike.
 * evals/runner.ts sets it to "seed" so a crawl started from a chat turn cannot
 * change what the goldens are graded against.
 *
 * Read per call rather than cached, so a test or a script can change it.
 */
export function datasetWhere(): Prisma.RestaurantWhereInput {
  const dataset = process.env.RESTAURANT_DATASET?.trim();
  if (!dataset) return {};
  return { dataset };
}
