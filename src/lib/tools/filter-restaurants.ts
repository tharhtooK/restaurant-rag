import { prisma } from "@/lib/db";
import { Hours, RestaurantSummary, timeToMinutes } from "./types";

export type FilterRestaurantsInput = {
  neighborhood?: string;
  cuisine?: string;
  priceTierMin?: number;
  priceTierMax?: number;
  vegetarianFriendly?: boolean;
  /** Restaurant must be open past this time (HH:MM, 24h) on at least one day of the week. */
  openPast?: string;
  /** Restaurant must open at or before this time (HH:MM, 24h) on at least one day of the week. */
  opensBy?: string;
};

function matchesOpenPast(hours: Hours, threshold: string): boolean {
  const thresholdMin = timeToMinutes(threshold);
  return Object.values(hours).some((day) => {
    if (!day) return false;
    return timeToMinutes(day.close) > thresholdMin;
  });
}

function matchesOpensBy(hours: Hours, threshold: string): boolean {
  const thresholdMin = timeToMinutes(threshold);
  return Object.values(hours).some((day) => {
    if (!day) return false;
    return timeToMinutes(day.open) <= thresholdMin;
  });
}

export async function filterRestaurants(
  input: FilterRestaurantsInput,
): Promise<RestaurantSummary[]> {
  const rows = await prisma.restaurant.findMany({
    where: {
      ...(input.neighborhood ? { neighborhood: input.neighborhood } : {}),
      ...(input.cuisine ? { cuisine: { contains: input.cuisine, mode: "insensitive" } } : {}),
      ...(input.vegetarianFriendly !== undefined
        ? { vegetarianFriendly: input.vegetarianFriendly }
        : {}),
      ...(input.priceTierMin !== undefined || input.priceTierMax !== undefined
        ? {
            priceTier: {
              ...(input.priceTierMin !== undefined ? { gte: input.priceTierMin } : {}),
              ...(input.priceTierMax !== undefined ? { lte: input.priceTierMax } : {}),
            },
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });

  return rows
    .filter((r) => {
      const hours = r.hours as unknown as Hours;
      if (input.openPast && !matchesOpenPast(hours, input.openPast)) return false;
      if (input.opensBy && !matchesOpensBy(hours, input.opensBy)) return false;
      return true;
    })
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      neighborhood: r.neighborhood,
      cuisine: r.cuisine,
      priceTier: r.priceTier,
      address: r.address,
      vegetarianFriendly: r.vegetarianFriendly,
      hours: r.hours as unknown as Hours,
    }));
}
