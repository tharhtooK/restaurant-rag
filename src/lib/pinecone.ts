import { Pinecone } from "@pinecone-database/pinecone";
import { getOpenAI } from "@/lib/openai";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

export type ReviewVectorMetadata = {
  restaurantSlug: string;
  restaurantName: string;
  /** Empty string where a restaurant has no neighborhood: Pinecone metadata cannot hold null. */
  neighborhood: string;
  city: string;
  state: string;
  source: string;
  content: string;
};

export const RERANK_MODEL = "bge-reranker-v2-m3";

export type RankedIndex = {
  index: number;
  score: number;
};

// Lazy singletons: importing this module must not throw when credentials are
// absent - only actually using the clients should.
let pinecone: Pinecone | null = null;

function getPineconeClient(): Pinecone {
  if (!pinecone) {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) throw new Error("PINECONE_API_KEY is not set");
    pinecone = new Pinecone({ apiKey });
  }
  return pinecone;
}

export function getPineconeIndex() {
  const indexName = process.env.PINECONE_INDEX;
  if (!indexName) throw new Error("PINECONE_INDEX is not set");
  return getPineconeClient().index<ReviewVectorMetadata>(indexName);
}

/**
 * Cross-encoder reranking. Returns positions into `documents` in descending
 * relevance, which the caller maps back to whatever it embedded.
 */
export async function rerank(
  query: string,
  documents: string[],
  topN: number,
): Promise<RankedIndex[]> {
  const result = await getPineconeClient().inference.rerank({
    model: RERANK_MODEL,
    query,
    documents,
    topN,
  });
  return result.data.map((ranked) => ({ index: ranked.index, score: ranked.score }));
}

export async function embed(texts: string[]): Promise<number[][]> {
  const response = await getOpenAI().embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  // The API does not guarantee ordering, so sort by the returned index.
  return response.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function embedOne(text: string): Promise<number[]> {
  const [vector] = await embed([text]);
  return vector;
}
