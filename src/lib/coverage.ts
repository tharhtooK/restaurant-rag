import { prisma } from "@/lib/db";
import type { Location } from "@/lib/location";

export type Coverage = {
  city: string;
  state: string;
  restaurantCount: number;
  hasData: boolean;
};

/**
 * Answers "do we already know this city?" before any crawl is offered.
 *
 * A count, not a findMany: this only has to distinguish zero from non-zero.
 * Matched case-insensitively, mirroring buildWhere in filter-restaurants.ts.
 * Keyed on city rather than neighborhood because crawls target a city: most
 * places outside dense metros have no neighborhood to speak of.
 *
 * Pinecone is derived from Review rows, so a city with no restaurants has
 * nothing in the vector store either, by construction.
 */
export async function getCoverage(location: Location): Promise<Coverage> {
  const restaurantCount = await prisma.restaurant.count({
    where: {
      city: { equals: location.city, mode: "insensitive" },
      ...(location.state ? { state: { equals: location.state, mode: "insensitive" } } : {}),
    },
  });
  return {
    city: location.city,
    state: location.state,
    restaurantCount,
    hasData: restaurantCount > 0,
  };
}
