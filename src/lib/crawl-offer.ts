import type { ToolCallRecord } from "@/lib/agent";

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
