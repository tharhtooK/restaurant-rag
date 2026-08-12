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
export function buildMetadataFilter(input: SearchOpinionsInput): Record<string, unknown> | null {
  const filters: Record<string, unknown>[] = [];
  if (input.neighborhood) filters.push({ neighborhood: { $eq: input.neighborhood } });
  if (input.restaurantSlugs?.length) {
    filters.push({ restaurantSlug: { $in: input.restaurantSlugs } });
  }

  if (filters.length === 0) return null;
  if (filters.length === 1) return filters[0];
  return { $and: filters };
}

// PINECONE_NAMESPACE lets the eval point retrieval at an isolated corpus
// (e.g. only independently-sourced reviews). Unset = the default namespace.
function getSearchIndex() {
  const base = getPineconeIndex();
  const namespace = process.env.PINECONE_NAMESPACE;
  return namespace ? base.namespace(namespace) : base;
}

export async function searchOpinions(input: SearchOpinionsInput): Promise<OpinionMatch[]> {
  const filter = buildMetadataFilter(input);
  const vector = await embedOne(input.query);

  const response = await getSearchIndex().query({
    vector,
    topK: input.limit ?? 5,
    includeMetadata: true,
    ...(filter ? { filter } : {}),
  });

  return (response.matches ?? []).map((match) => ({
    restaurantSlug: match.metadata?.restaurantSlug ?? "",
    restaurantName: match.metadata?.restaurantName ?? "",
    neighborhood: match.metadata?.neighborhood ?? "",
    snippet: match.metadata?.content ?? "",
    score: match.score ?? 0,
  }));
}
