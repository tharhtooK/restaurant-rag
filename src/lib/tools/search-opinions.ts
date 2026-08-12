import { embedOne, getPineconeIndex, rerank, type RankedIndex } from "@/lib/pinecone";
import { getLogger } from "@/lib/logger";

const log = getLogger("search-opinions");

// Vector search decides which chunks are worth a closer look; the cross-encoder
// decides the order. The pool is what gives the reranker something to reorder —
// reranking exactly the K we intend to return cannot change which restaurants
// surface.
const CANDIDATE_POOL = 20;

// bge-reranker-v2-m3 is decisive about rank 1 and then collapses to ~0.000, so
// ordering within the tail carries little signal. Returning a wider slice means
// a genuinely good snippet is not dropped by an essentially arbitrary tail
// ordering. See the reranking note in CLAUDE.md.
const DEFAULT_LIMIT = 8;

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
 * Pinecone metadata filters are exact and case-sensitive, with no equivalent of
 * Postgres' insensitive mode, so a neighborhood whose casing does not match what
 * was upserted returns nothing. The canonical spellings are in the system prompt,
 * which is where the model gets them.
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

/**
 * `ranked` holds positions into `candidates`, so an out-of-range index would
 * silently shift every result onto the wrong restaurant. Skip rather than trust.
 */
export function applyRanking(candidates: OpinionMatch[], ranked: RankedIndex[]): OpinionMatch[] {
  const reordered: OpinionMatch[] = [];
  for (const item of ranked) {
    const candidate = candidates[item.index];
    if (!candidate) continue;
    reordered.push({ ...candidate, score: item.score });
  }
  return reordered;
}

/**
 * Semantic search over review chunks stored in Pinecone (embedded by
 * scripts/ingest/embed-upsert.ts). Structured constraints are applied as
 * Pinecone metadata filters so they compose with the vector search rather than
 * being applied after top-K truncation.
 *
 * Results are then reranked by a cross-encoder, which scores each snippet
 * against the full query text rather than comparing two independent embeddings.
 */
export async function searchOpinions(input: SearchOpinionsInput): Promise<OpinionMatch[]> {
  const limit = input.limit ?? DEFAULT_LIMIT;
  const filter = buildMetadataFilter(input);
  const vector = await embedOne(input.query);

  const response = await getSearchIndex().query({
    vector,
    topK: Math.max(CANDIDATE_POOL, limit),
    includeMetadata: true,
    ...(filter ? { filter } : {}),
  });

  const candidates = (response.matches ?? []).map((match) => ({
    restaurantSlug: match.metadata?.restaurantSlug ?? "",
    restaurantName: match.metadata?.restaurantName ?? "",
    neighborhood: match.metadata?.neighborhood ?? "",
    snippet: match.metadata?.content ?? "",
    score: match.score ?? 0,
  }));

  if (candidates.length === 0) return [];

  const ranked = await rerank(
    input.query,
    candidates.map((candidate) => candidate.snippet),
    Math.min(limit, candidates.length),
  );
  log.debug("reranked candidates", { candidates: candidates.length, returned: ranked.length });

  return applyRanking(candidates, ranked);
}
