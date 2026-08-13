import { prisma } from "@/lib/db";

export type Coverage = {
  neighborhood: string;
  restaurantCount: number;
  hasData: boolean;
};

/**
 * Answers "do we already know this neighborhood?" before any crawl is offered.
 *
 * A count, not a findMany: this only has to distinguish zero from non-zero.
 * Matched case-insensitively, mirroring buildWhere in filter-restaurants.ts.
 *
 * Pinecone is derived from Review rows, so a neighborhood with no restaurants
 * has nothing in the vector store either, by construction.
 */
export async function getCoverage(neighborhood: string): Promise<Coverage> {
  const restaurantCount = await prisma.restaurant.count({
    where: { neighborhood: { equals: neighborhood, mode: "insensitive" } },
  });
  return { neighborhood, restaurantCount, hasData: restaurantCount > 0 };
}
