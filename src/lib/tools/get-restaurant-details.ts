import { prisma } from "@/lib/db";
import { Hours } from "./types";

export type GetRestaurantDetailsInput = {
  /** Restaurant slug if known, otherwise a name to look up. */
  slug?: string;
  name?: string;
};

export type RestaurantDetails = {
  slug: string;
  name: string;
  neighborhood: string;
  cuisine: string;
  priceTier: number;
  address: string;
  vegetarianFriendly: boolean;
  hours: Hours;
  reviews: string[];
} | null;

/**
 * Single-entity lookup. Only returns fields that exist in the schema - there is
 * no reservations/parking/wait-time data to return, by design, so the caller
 * has nothing to fabricate an answer from for those fact types.
 */
export async function getRestaurantDetails(
  input: GetRestaurantDetailsInput,
): Promise<RestaurantDetails> {
  const row = await prisma.restaurant.findFirst({
    where: input.slug
      ? { slug: input.slug }
      : { name: { contains: input.name ?? "", mode: "insensitive" } },
    include: { reviews: true },
  });

  if (!row) return null;

  return {
    slug: row.slug,
    name: row.name,
    neighborhood: row.neighborhood,
    cuisine: row.cuisine,
    priceTier: row.priceTier,
    address: row.address,
    vegetarianFriendly: row.vegetarianFriendly,
    hours: row.hours as unknown as Hours,
    reviews: row.reviews.map((r) => r.content),
  };
}
