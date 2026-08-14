import { z } from "zod";
import type { FunctionTool } from "openai/resources/responses/responses";
import { filterRestaurants } from "@/lib/tools/filter-restaurants";
import { searchOpinions } from "@/lib/tools/search-opinions";
import { getRestaurantDetails } from "@/lib/tools/get-restaurant-details";

const filterRestaurantsSchema = z.object({
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  cuisine: z.string().optional(),
  priceTierMin: z.number().int().min(1).max(4).optional(),
  priceTierMax: z.number().int().min(1).max(4).optional(),
  vegetarianFriendly: z.boolean().optional(),
  openPast: z.string().optional(),
  opensBy: z.string().optional(),
});

const searchOpinionsSchema = z.object({
  query: z.string(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  restaurantSlugs: z.array(z.string()).optional(),
});

const getRestaurantDetailsSchema = z.object({
  slug: z.string().optional(),
  name: z.string().optional(),
});

type ToolEntry<Schema extends z.ZodType> = {
  description: string;
  schema: Schema;
  run: (args: z.infer<Schema>) => Promise<unknown>;
};

const toolEntries = {
  filter_restaurants: {
    description:
      "Search restaurants by structured criteria: city, state, neighborhood, cuisine, price tier, whether it's " +
      "tagged vegetarian-friendly, and time-of-day constraints (open past a given time, or opens by " +
      "a given time - useful for 'open late' or 'breakfast before 9am' style queries). Use this for " +
      "any query with a hard filterable constraint. Returns matching restaurants with their basic facts.",
    schema: filterRestaurantsSchema,
    run: (args) => filterRestaurants(args),
  } satisfies ToolEntry<typeof filterRestaurantsSchema>,

  search_opinions: {
    description:
      "Search review text for qualitative/experiential signal that has no structured column: vibe, " +
      "atmosphere, who it's good for (solo dining, dates, groups), service quality, whether it feels " +
      "like a hidden gem or touristy, etc. Use this whenever the query depends on what reviewers say " +
      "rather than a filterable fact. Returns ranked review snippets with the restaurant they belong to.",
    schema: searchOpinionsSchema,
    run: (args) => searchOpinions(args),
  } satisfies ToolEntry<typeof searchOpinionsSchema>,

  get_restaurant_details: {
    description:
      "Look up everything on file for one specific, already-identified restaurant by slug or name: " +
      "neighborhood, cuisine, price tier, address, hours, and its review snippets. Use this for a " +
      "single-entity fact question ('what time does X open'). If a fact the user asked about isn't in " +
      "the returned data (e.g. reservations, parking, real-time wait time), it is genuinely not in the " +
      "dataset - say so plainly rather than guessing.",
    schema: getRestaurantDetailsSchema,
    run: (args) => getRestaurantDetails(args),
  } satisfies ToolEntry<typeof getRestaurantDetailsSchema>,
};

export const toolDefinitions: FunctionTool[] = Object.entries(toolEntries).map(([name, entry]) => ({
  type: "function",
  name,
  description: entry.description,
  parameters: z.toJSONSchema(entry.schema) as Record<string, unknown>,
  strict: false,
}));

export async function runTool(name: string, rawArgs: unknown): Promise<string> {
  const entry = toolEntries[name as keyof typeof toolEntries];
  if (!entry) {
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  }

  const parsed = entry.schema.safeParse(rawArgs);
  if (!parsed.success) {
    return JSON.stringify({ error: "Invalid arguments", details: parsed.error.message });
  }

  const result = await entry.run(parsed.data as never);
  return JSON.stringify(result);
}
