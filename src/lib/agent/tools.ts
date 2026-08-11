import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { filterRestaurants } from "@/lib/tools/filter-restaurants";
import { searchOpinions } from "@/lib/tools/search-opinions";
import { getRestaurantDetails } from "@/lib/tools/get-restaurant-details";

const NEIGHBORHOODS = ["East Village", "Flushing", "Williamsburg", "Harlem", "Astoria"] as const;

export const filterRestaurantsTool = betaZodTool({
  name: "filter_restaurants",
  description:
    "Search restaurants by structured criteria: neighborhood, cuisine, price tier, whether it's " +
    "tagged vegetarian-friendly, and time-of-day constraints (open past a given time, or opens by " +
    "a given time - useful for 'open late' or 'breakfast before 9am' style queries). Use this for " +
    "any query with a hard filterable constraint. Returns matching restaurants with their basic facts.",
  inputSchema: z.object({
    neighborhood: z.enum(NEIGHBORHOODS).optional().describe("Restrict to one of the 5 covered neighborhoods."),
    cuisine: z.string().optional().describe("Cuisine substring, e.g. 'Korean BBQ', 'Vegan'."),
    priceTierMin: z.number().int().min(1).max(4).optional(),
    priceTierMax: z.number().int().min(1).max(4).optional(),
    vegetarianFriendly: z.boolean().optional(),
    openPast: z
      .string()
      .optional()
      .describe("HH:MM 24h - restaurant must be open past this time on at least one day, e.g. '23:00'."),
    opensBy: z
      .string()
      .optional()
      .describe("HH:MM 24h - restaurant must open at or before this time on at least one day, e.g. '09:00'."),
  }),
  run: async (args) => {
    const results = await filterRestaurants(args);
    return JSON.stringify(results);
  },
});

export const searchOpinionsTool = betaZodTool({
  name: "search_opinions",
  description:
    "Search review text for qualitative/experiential signal that has no structured column: vibe, " +
    "atmosphere, who it's good for (solo dining, dates, groups), service quality, whether it feels " +
    "like a hidden gem or touristy, etc. Use this whenever the query depends on what reviewers say " +
    "rather than a filterable fact. Returns ranked review snippets with the restaurant they belong to.",
  inputSchema: z.object({
    query: z.string().describe("Free-text description of the vibe/sentiment/experience to search for."),
    neighborhood: z.enum(NEIGHBORHOODS).optional(),
    restaurantSlugs: z.array(z.string()).optional().describe("Restrict search to specific restaurant slugs."),
  }),
  run: async (args) => {
    const results = await searchOpinions(args);
    return JSON.stringify(results);
  },
});

export const getRestaurantDetailsTool = betaZodTool({
  name: "get_restaurant_details",
  description:
    "Look up everything on file for one specific, already-identified restaurant by slug or name: " +
    "neighborhood, cuisine, price tier, address, hours, and its review snippets. Use this for a " +
    "single-entity fact question ('what time does X open'). If a fact the user asked about isn't in " +
    "the returned data (e.g. reservations, parking, real-time wait time), it is genuinely not in the " +
    "dataset - say so plainly rather than guessing.",
  inputSchema: z.object({
    slug: z.string().optional().describe("Restaurant slug if already known from a prior tool call."),
    name: z.string().optional().describe("Restaurant name to look up if the slug isn't known yet."),
  }),
  run: async (args) => {
    const result = await getRestaurantDetails(args);
    return JSON.stringify(result);
  },
});

export const tools = [filterRestaurantsTool, searchOpinionsTool, getRestaurantDetailsTool];
