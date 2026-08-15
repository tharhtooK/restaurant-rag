import type { ToolCallRecord } from "@/lib/agent";
import type { Location } from "@/lib/location";

/**
 * Did this turn come up empty?
 *
 * runTool stringifies every result, so an empty one is exactly "[]" or "null".
 * An empty turn is what triggers the "which city?" ask; the crawl target then
 * comes from the user's answer, never from a tool argument.
 */
export function hadEmptyResult(toolCalls: ToolCallRecord[]): boolean {
  return toolCalls.some((call) => call.output === "[]" || call.output === "null");
}

/**
 * Is this answer specific enough to spend a crawl on?
 *
 * The ask is armed by any turn that called no tools, which includes a greeting -
 * the agent replies "what city are you looking to eat in?", which is a fair
 * question to have asked. What was not fair is what came next: parseLocation is
 * permissive by design, so it reads a bare "cheap ramen" as a city called
 * exactly that, and the next thing typed after a greeting used to start a real
 * crawl for it.
 *
 * A city on its own is not enough either, and not only because of junk:
 * "Portland" is two different cities, so crawling one of them is a guess. This
 * enforces in code what NeighborhoodAsk already asks for in words - city and
 * state, or a neighborhood within a city.
 */
export function isSpecificEnoughToCrawl(location: Location): boolean {
  if (!location.city) return false;
  return Boolean(location.state || location.neighborhood);
}
