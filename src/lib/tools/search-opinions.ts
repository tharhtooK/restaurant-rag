import { prisma } from "@/lib/db";

export type SearchOpinionsInput = {
  /** Free-text query describing the vibe/experience/sentiment to search for. */
  query: string;
  /** Optionally restrict the search to one neighborhood. */
  neighborhood?: string;
  /** Optionally restrict the search to specific restaurant slugs. */
  restaurantSlugs?: string[];
  limit?: number;
};

export type OpinionMatch = {
  restaurantSlug: string;
  restaurantName: string;
  neighborhood: string;
  snippet: string;
  rank: number;
};

/**
 * Stand-in for semantic/vector search: Postgres full-text search (to_tsvector /
 * plainto_tsquery) over review content. No embeddings or Pinecone in this phase.
 */
function toOrTsQuery(query: string): string {
  const words = query
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((w) => w.length > 1);
  if (!words || words.length === 0) return "";
  // OR the terms together: plainto_tsquery ANDs every word, which is too
  // strict for a multi-concept query like "romantic quiet date night spot" -
  // this is a stand-in for semantic recall, so favor recall over precision
  // and let ts_rank do the ordering.
  return words.map((w) => `${w}:*`).join(" | ");
}

export async function searchOpinions(input: SearchOpinionsInput): Promise<OpinionMatch[]> {
  const limit = input.limit ?? 5;
  const tsQuery = toOrTsQuery(input.query);
  if (!tsQuery) return [];

  const neighborhoodClause = input.neighborhood ? `AND r."neighborhood" = $2` : "";
  const slugsClause = input.restaurantSlugs?.length
    ? `AND r."slug" = ANY($${input.neighborhood ? 3 : 2})`
    : "";

  const params: unknown[] = [tsQuery];
  if (input.neighborhood) params.push(input.neighborhood);
  if (input.restaurantSlugs?.length) params.push(input.restaurantSlugs);

  const rows = await prisma.$queryRawUnsafe<
    { slug: string; name: string; neighborhood: string; content: string; rank: number }[]
  >(
    `
    SELECT r."slug", r."name", r."neighborhood", rev."content",
           ts_rank(to_tsvector('english', rev."content"), to_tsquery('english', $1)) AS rank
    FROM "Review" rev
    JOIN "Restaurant" r ON r."id" = rev."restaurantId"
    WHERE to_tsvector('english', rev."content") @@ to_tsquery('english', $1)
    ${neighborhoodClause}
    ${slugsClause}
    ORDER BY rank DESC
    LIMIT ${limit}
    `,
    ...params,
  );

  return rows.map((r) => ({
    restaurantSlug: r.slug,
    restaurantName: r.name,
    neighborhood: r.neighborhood,
    snippet: r.content,
    rank: r.rank,
  }));
}
