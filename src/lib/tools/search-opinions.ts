import { embedOne, getPineconeIndex } from "@/lib/pinecone";

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
  score: number;
};

/**
 * Semantic search over review chunks stored in Pinecone (embedded by
 * scripts/ingest/embed-upsert.ts). Structured constraints are applied as
 * Pinecone metadata filters so they compose with the vector search rather than
 * being applied after top-K truncation.
 */
export async function searchOpinions(input: SearchOpinionsInput): Promise<OpinionMatch[]> {
  const topK = input.limit ?? 5;

  const filters: Record<string, unknown>[] = [];
  if (input.neighborhood) filters.push({ neighborhood: { $eq: input.neighborhood } });
  if (input.restaurantSlugs?.length) {
    filters.push({ restaurantSlug: { $in: input.restaurantSlugs } });
  }

  const vector = await embedOne(input.query);

  // PINECONE_NAMESPACE lets the eval point retrieval at an isolated corpus
  // (e.g. only independently-sourced reviews). Unset = the default namespace.
  const base = getPineconeIndex();
  const ns = process.env.PINECONE_NAMESPACE;
  const index = ns ? base.namespace(ns) : base;

  const response = await index.query({
    vector,
    topK,
    includeMetadata: true,
    ...(filters.length === 1
      ? { filter: filters[0] }
      : filters.length > 1
        ? { filter: { $and: filters } }
        : {}),
  });

  return (response.matches ?? []).map((match) => ({
    restaurantSlug: match.metadata?.restaurantSlug ?? "",
    restaurantName: match.metadata?.restaurantName ?? "",
    neighborhood: match.metadata?.neighborhood ?? "",
    snippet: match.metadata?.content ?? "",
    score: match.score ?? 0,
  }));
}
