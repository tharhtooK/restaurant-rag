export type ToolResultSummary = {
  headline: string;
  items: string[];
};

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) return {};
  return value as Record<string, unknown>;
}

function readString(value: unknown): string {
  if (typeof value === "string") return value;
  return "";
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trimEnd()}…`;
}

function countLabel(count: number, singular: string): string {
  if (count === 0) return `no ${singular}s`;
  if (count === 1) return `1 ${singular}`;
  return `${count} ${singular}s`;
}

function summarizeRestaurants(rows: unknown[]): ToolResultSummary {
  const items = rows.map((row) => {
    const record = asRecord(row);
    const name = readString(record.name);
    const neighborhood = readString(record.neighborhood);
    const tier = typeof record.priceTier === "number" ? "$".repeat(record.priceTier) : "";
    return [name, neighborhood, tier].filter(Boolean).join(" — ");
  });
  return { headline: countLabel(rows.length, "result"), items };
}

function summarizeOpinions(matches: unknown[]): ToolResultSummary {
  const items = matches.map((match) => {
    const record = asRecord(match);
    const name = readString(record.restaurantName);
    const snippet = truncate(readString(record.snippet), 140);
    return [name, snippet].filter(Boolean).join(" — ");
  });
  return { headline: countLabel(matches.length, "snippet"), items };
}

function summarizeDetails(value: unknown): ToolResultSummary {
  if (value === null) return { headline: "not found", items: [] };

  const record = asRecord(value);
  const name = readString(record.name);
  const neighborhood = readString(record.neighborhood);
  const reviewCount = Array.isArray(record.reviews) ? record.reviews.length : 0;

  return {
    headline: "found",
    items: [
      [name, neighborhood].filter(Boolean).join(" — "),
      countLabel(reviewCount, "review"),
    ].filter(Boolean),
  };
}

export function summarizeToolResult(toolName: string, output: string): ToolResultSummary {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return { headline: "unreadable output", items: [truncate(output, 200)] };
  }

  const asObject = asRecord(parsed);
  if (typeof asObject.error === "string") {
    return { headline: "error", items: [asObject.error] };
  }

  if (toolName === "get_restaurant_details") return summarizeDetails(parsed);
  if (!Array.isArray(parsed)) return { headline: "ok", items: [] };
  if (toolName === "filter_restaurants") return summarizeRestaurants(parsed);
  if (toolName === "search_opinions") return summarizeOpinions(parsed);

  return { headline: countLabel(parsed.length, "result"), items: [] };
}
