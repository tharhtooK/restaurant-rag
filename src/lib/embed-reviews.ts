/**
 * Chunk + embed + upsert reviews into Pinecone.
 *
 * Shared by scripts/ingest/embed-upsert.ts and the /api/crawl polling route, for
 * the same reason import-crawl.ts is shared: a hand-run ingest and a
 * user-triggered one must not drift apart.
 *
 * The route used to reach this code by spawning `npx tsx scripts/...`, which
 * works under Docker and cannot work on a serverless deploy - no npx, no tsx, no
 * scripts/ in the traced bundle, and a read-only filesystem. Every crawl import
 * on Vercel therefore wrote its Postgres rows and then died before embedding,
 * leaving crawled restaurants answerable by SQL but invisible to search_opinions.
 *
 * Chunking is a no-op at the current data size: review snippets are 1-3
 * sentences, so each review is already an appropriately-sized chunk. If review
 * text ever grows to full paragraphs, split here before embedding.
 *
 * Vector IDs are the Review primary key, so re-running overwrites rather than
 * duplicating.
 */
import { prisma } from "@/lib/db";
import { getLogger } from "@/lib/logger";
import { normalizeLocationValue } from "@/lib/location";
import { embed, getPineconeIndex, type ReviewVectorMetadata } from "@/lib/pinecone";

const log = getLogger("embed-reviews");

const BATCH_SIZE = 50;

// The default namespace holds the authored corpus and nothing else. Embedding
// every review into it was safe when authored reviews were the only ones; with
// three corpora it silently contaminates the set the eval grades against, which
// is exactly what happened on 2026-08-14.
export const DEFAULT_NAMESPACE_SOURCE = "authored-for-goldens";

export type EmbedSummary = {
  source: string;
  namespace: string;
  embedded: number;
};

/**
 * Reviews to embed, and where they go.
 *
 * Omitting the source means the authored corpus in the default namespace. A
 * trailing colon selects a family: "crawled:" matches crawled:google and
 * crawled:website and writes both to one "crawled" namespace.
 */
export function resolveTarget(source: string | undefined) {
  const selector = source ?? DEFAULT_NAMESPACE_SOURCE;
  const isPrefix = selector.endsWith(":");
  return {
    selector,
    namespace: source === undefined ? undefined : isPrefix ? selector.slice(0, -1) : selector,
    where: isPrefix ? { source: { startsWith: selector } } : { source: selector },
  };
}

export async function embedReviews(source?: string): Promise<EmbedSummary> {
  const { selector, namespace, where } = resolveTarget(source);
  const namespaceLabel = namespace ?? "__default__";

  const reviews = await prisma.review.findMany({ where, include: { restaurant: true } });

  log.info("embedding reviews", {
    source: selector,
    namespace: namespaceLabel,
    reviews: reviews.length,
  });

  if (reviews.length === 0) {
    return { source: selector, namespace: namespaceLabel, embedded: 0 };
  }

  const base = getPineconeIndex();
  const index = namespace ? base.namespace(namespace) : base;

  for (let start = 0; start < reviews.length; start += BATCH_SIZE) {
    const batch = reviews.slice(start, start + BATCH_SIZE);
    const vectors = await embed(batch.map((review) => review.content));

    await index.upsert({
      records: batch.map((review, n) => ({
        id: review.id,
        values: vectors[n],
        metadata: {
          restaurantSlug: review.restaurant.slug,
          restaurantName: review.restaurant.name,
          neighborhood: review.restaurant.neighborhood ?? "",
          city: review.restaurant.city,
          state: review.restaurant.state.toUpperCase(),
          neighborhoodNormalized: normalizeLocationValue(review.restaurant.neighborhood ?? ""),
          cityNormalized: normalizeLocationValue(review.restaurant.city),
          source: review.source,
          content: review.content,
        } satisfies ReviewVectorMetadata,
      })),
    });

    log.debug("upserted a batch", {
      namespace: namespaceLabel,
      upserted: Math.min(start + BATCH_SIZE, reviews.length),
      total: reviews.length,
    });
  }

  log.info("embedded reviews", {
    source: selector,
    namespace: namespaceLabel,
    embedded: reviews.length,
  });

  return { source: selector, namespace: namespaceLabel, embedded: reviews.length };
}
