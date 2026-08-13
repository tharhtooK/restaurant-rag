/**
 * What is actually in Pinecone, per namespace.
 *
 * describeIndexStats costs no embedding call, so this is the cheap way to
 * answer "did the crawl land in the vector store?" - unlike a real query,
 * which needs an embedding round-trip to tell you the same thing.
 *
 * Usage:
 *   npx tsx scripts/pinecone-stats.ts
 *
 * Pinecone is eventually consistent: counts lag an upsert by a few seconds.
 * A namespace reading 0 right after ingestion is not proof it failed.
 */
import "dotenv/config";
import { getPineconeIndex } from "../src/lib/pinecone";

async function main() {
  const stats = await getPineconeIndex().describeIndexStats();

  console.log(`index total: ${stats.totalRecordCount ?? 0} records`);
  console.log(`dimension:   ${stats.dimension ?? "unknown"}`);
  console.log("");

  const namespaces = stats.namespaces ?? {};
  const names = Object.keys(namespaces).sort();

  if (names.length === 0) {
    console.log("no namespaces - the index is empty");
    return;
  }

  for (const name of names) {
    console.log(`${name.padEnd(16)} ${namespaces[name].recordCount ?? 0}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
