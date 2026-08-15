import { embedOne, getPineconeIndex, rerank, type RankedIndex } from "@/lib/pinecone";
import { getLogger } from "@/lib/logger";
import { normalizeLocationValue } from "@/lib/location";
import { prisma } from "@/lib/db";

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
  city?: string;
  state?: string;
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
 * Postgres' insensitive mode, so matching the raw fields meant a neighborhood
 * whose casing differed from the upsert returned nothing at all - "east village"
 * scored 0 snippets where "East Village" scored 7. Matching the normalized twins
 * instead makes city + neighborhood behave like the SQL path, and stops the
 * canonical spellings in the system prompt from being load-bearing.
 */
export function buildMetadataFilter(input: SearchOpinionsInput): Record<string, unknown> | null {
  const filters: Record<string, unknown>[] = [];
  if (input.neighborhood) {
    filters.push({ neighborhoodNormalized: { $eq: normalizeLocationValue(input.neighborhood) } });
  }
  if (input.city) {
    filters.push({ cityNormalized: { $eq: normalizeLocationValue(input.city) } });
  }
  if (input.state) filters.push({ state: { $eq: input.state.toUpperCase() } });
  if (input.restaurantSlugs?.length) {
    filters.push({ restaurantSlug: { $in: input.restaurantSlugs } });
  }

  if (filters.length === 0) return null;
  if (filters.length === 1) return filters[0];
  return { $and: filters };
}

const CRAWLED_NAMESPACE = "crawled";

/**
 * Which corpora this search reads.
 *
 * PINECONE_NAMESPACE pins exactly one, which is how the eval points retrieval at
 * the independently-sourced corpus. Unpinned, the app must read the crawled
 * namespace as well as the default one: crawled reviews are embedded there, so
 * reading only the default meant a city the user had just crawled answered
 * filter_restaurants while search_opinions returned nothing - the same split
 * between the SQL and vector paths that the serverless embedding bug caused,
 * arriving by a different route.
 *
 * Scoped by RESTAURANT_DATASET rather than a flag of its own so the two paths
 * are always excluded together: evals/runner.ts sets it to "seed" and therefore
 * sees neither crawled rows nor crawled vectors.
 */
export function getSearchNamespaces(): (string | undefined)[] {
  const pinned = process.env.PINECONE_NAMESPACE?.trim();
  if (pinned) return [pinned];
  if (process.env.RESTAURANT_DATASET?.trim()) return [undefined];
  return [undefined, CRAWLED_NAMESPACE];
}

/**
 * Drops snippets whose restaurant is no longer in Postgres.
 *
 * Nothing deletes a vector when its row goes, so the two stores drift: the
 * crawled namespace currently holds 15 vectors for restaurants that are not in
 * the database. Trusting metadata alone would hand the model a real-looking name
 * and real-looking review text for a restaurant get_restaurant_details cannot
 * find - a confident recommendation for somewhere that does not exist, which is
 * the failure this project grades itself on.
 */
export function dropUnknownRestaurants(
  candidates: OpinionMatch[],
  knownSlugs: Set<string>,
): OpinionMatch[] {
  return candidates.filter((candidate) => knownSlugs.has(candidate.restaurantSlug));
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

  const base = getPineconeIndex();
  const responses = await Promise.all(
    getSearchNamespaces().map((namespace) =>
      (namespace ? base.namespace(namespace) : base).query({
        vector,
        topK: Math.max(CANDIDATE_POOL, limit),
        includeMetadata: true,
        ...(filter ? { filter } : {}),
      }),
    ),
  );

  // Each namespace ranks only against itself, so the union is unordered here.
  // The cross-encoder below is what puts a crawled snippet and a seeded one on
  // one scale - a raw cosine merge across namespaces would not be comparable.
  const candidates = responses.flatMap((response) =>
    (response.matches ?? []).map((match) => ({
      restaurantSlug: match.metadata?.restaurantSlug ?? "",
      restaurantName: match.metadata?.restaurantName ?? "",
      neighborhood: match.metadata?.neighborhood ?? "",
      snippet: match.metadata?.content ?? "",
      score: match.score ?? 0,
    })),
  );

  if (candidates.length === 0) return [];

  // Existence only, deliberately unscoped by dataset: which corpus this search
  // may read is already decided by the namespace, and asking twice would drop a
  // crawled restaurant the app is entitled to see.
  const rows = await prisma.restaurant.findMany({
    where: { slug: { in: candidates.map((candidate) => candidate.restaurantSlug) } },
    select: { slug: true },
  });
  const grounded = dropUnknownRestaurants(candidates, new Set(rows.map((row) => row.slug)));

  if (grounded.length < candidates.length) {
    log.warn("dropped snippets with no restaurant row", {
      dropped: candidates.length - grounded.length,
      candidates: candidates.length,
    });
  }
  if (grounded.length === 0) return [];

  const ranked = await rerank(
    input.query,
    grounded.map((candidate) => candidate.snippet),
    Math.min(limit, grounded.length),
  );
  log.debug("reranked candidates", { candidates: grounded.length, returned: ranked.length });

  return applyRanking(grounded, ranked);
}
