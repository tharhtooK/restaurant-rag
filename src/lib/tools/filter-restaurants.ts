import { Prisma } from "@/generated/prisma/client";
import { datasetWhere } from "@/lib/dataset";
import { prisma } from "@/lib/db";
import { matchesHours } from "./hours";
import { Hours, RestaurantSummary } from "./types";

export type FilterRestaurantsInput = {
  neighborhood?: string;
  city?: string;
  state?: string;
  cuisine?: string;
  priceTierMin?: number;
  priceTierMax?: number;
  vegetarianFriendly?: boolean;
  openPast?: string;
  opensBy?: string;
};

export function buildWhere(input: FilterRestaurantsInput): Prisma.RestaurantWhereInput {
  const where: Prisma.RestaurantWhereInput = { ...datasetWhere() };

  // Matched case-insensitively because the tool schema accepts any string: with
  // no enum pinning the casing, "east village" would otherwise return nothing
  // rather than the East Village rows.
  if (input.neighborhood) {
    where.neighborhood = { equals: input.neighborhood, mode: "insensitive" };
  }
  if (input.city) where.city = { equals: input.city, mode: "insensitive" };
  if (input.state) where.state = { equals: input.state, mode: "insensitive" };
  if (input.cuisine) where.cuisine = { contains: input.cuisine, mode: "insensitive" };
  if (input.vegetarianFriendly !== undefined) where.vegetarianFriendly = input.vegetarianFriendly;

  const priceTier: Prisma.IntFilter = {};
  if (input.priceTierMin !== undefined) priceTier.gte = input.priceTierMin;
  if (input.priceTierMax !== undefined) priceTier.lte = input.priceTierMax;
  if (priceTier.gte !== undefined || priceTier.lte !== undefined) where.priceTier = priceTier;

  return where;
}

export async function filterRestaurants(
  input: FilterRestaurantsInput,
): Promise<RestaurantSummary[]> {
  const rows = await prisma.restaurant.findMany({
    where: buildWhere(input),
    orderBy: { name: "asc" },
  });

  const summaries: RestaurantSummary[] = [];
  for (const row of rows) {
    const hours = row.hours as unknown as Hours;
    if (!matchesHours(hours, input)) continue;

    summaries.push({
      slug: row.slug,
      name: row.name,
      neighborhood: row.neighborhood,
      city: row.city,
      state: row.state,
      cuisine: row.cuisine,
      priceTier: row.priceTier,
      address: row.address,
      vegetarianFriendly: row.vegetarianFriendly,
      hours,
    });
  }
  return summaries;
}
