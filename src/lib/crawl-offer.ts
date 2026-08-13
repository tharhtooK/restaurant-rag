import type { ToolCallRecord } from "@/lib/agent";

function neighborhoodArgument(input: unknown): string | null {
  if (typeof input !== "object" || input === null) return null;
  const value = (input as Record<string, unknown>).neighborhood;
  if (typeof value !== "string" || value.trim() === "") return null;
  return value;
}

/**
 * The neighborhood a crawl may target for this turn, or null.
 *
 * Requiring the argument to appear in the user's own message is what replaces
 * the crawl button: without a click, a neighborhood the model inferred rather
 * than read would start spending on its own.
 */
export function findNeighborhoodInTurn(
  userMessage: string,
  toolCalls: ToolCallRecord[],
): string | null {
  const message = userMessage.toLowerCase();
  for (const call of toolCalls) {
    const neighborhood = neighborhoodArgument(call.input);
    if (!neighborhood) continue;
    if (message.includes(neighborhood.toLowerCase())) return neighborhood;
  }
  return null;
}

/** runTool stringifies every result, so an empty one is exactly "[]" or "null". */
export function hadEmptyResult(toolCalls: ToolCallRecord[]): boolean {
  return toolCalls.some((call) => call.output === "[]" || call.output === "null");
}