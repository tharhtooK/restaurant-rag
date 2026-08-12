import type { ToolCallRecord } from "@/lib/agent";

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) return {};
  return value as Record<string, unknown>;
}

function describeFilter(args: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof args.cuisine === "string") parts.push(args.cuisine);
  if (typeof args.neighborhood === "string") parts.push(args.neighborhood);
  if (typeof args.priceTierMin === "number") parts.push(`from ${"$".repeat(args.priceTierMin)}`);
  if (typeof args.priceTierMax === "number") parts.push(`up to ${"$".repeat(args.priceTierMax)}`);
  if (args.vegetarianFriendly === true) parts.push("vegetarian-friendly");
  if (typeof args.openPast === "string") parts.push(`open past ${args.openPast}`);
  if (typeof args.opensBy === "string") parts.push(`opens by ${args.opensBy}`);

  if (parts.length === 0) return "Filtered restaurants";
  return `Filtered restaurants: ${parts.join(", ")}`;
}

function describeSearch(args: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof args.query === "string") parts.push(`"${args.query}"`);
  if (typeof args.neighborhood === "string") parts.push(args.neighborhood);
  if (Array.isArray(args.restaurantSlugs) && args.restaurantSlugs.length > 0) {
    parts.push(args.restaurantSlugs.join(", "));
  }

  if (parts.length === 0) return "Searched reviews";
  return `Searched reviews: ${parts.join(", ")}`;
}

function describeDetails(args: Record<string, unknown>): string {
  if (typeof args.name === "string") return `Looked up ${args.name}`;
  if (typeof args.slug === "string") return `Looked up ${args.slug}`;
  return "Looked up a restaurant";
}

export function describeToolCall(call: ToolCallRecord): string {
  const args = asRecord(call.input);
  if (call.name === "filter_restaurants") return describeFilter(args);
  if (call.name === "search_opinions") return describeSearch(args);
  if (call.name === "get_restaurant_details") return describeDetails(args);
  return call.name;
}

// The agent hands back whatever the model sent, which is not always an object —
// a malformed call is recorded with its raw string so it can still be inspected.
export function formatToolArguments(input: unknown): string {
  if (typeof input === "string") return input;
  return JSON.stringify(input, null, 2);
}
