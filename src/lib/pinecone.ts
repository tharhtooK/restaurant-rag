import { Pinecone } from "@pinecone-database/pinecone";
import { getOpenAI } from "@/lib/openai";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

export type ReviewVectorMetadata = {
  restaurantSlug: string;
  restaurantName: string;
  neighborhood: string;
  source: string;
  content: string;
};

// Lazy singletons: importing this module must not throw when credentials are
// absent - only actually using the clients should.
let pinecone: Pinecone | null = null;

export function getPineconeIndex() {
  if (!pinecone) {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) throw new Error("PINECONE_API_KEY is not set");
    pinecone = new Pinecone({ apiKey });
  }
  const indexName = process.env.PINECONE_INDEX;
  if (!indexName) throw new Error("PINECONE_INDEX is not set");
  return pinecone.index<ReviewVectorMetadata>(indexName);
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
