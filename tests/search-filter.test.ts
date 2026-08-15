import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildMetadataFilter, getSearchNamespaces } from "../src/lib/tools/search-opinions";

describe("buildMetadataFilter", () => {
  test("returns null when there is nothing to filter on", () => {
    assert.equal(buildMetadataFilter({ query: "cosy" }), null);
  });

  // A single filter is passed bare rather than wrapped in $and, so the query
  // sent to Pinecone stays the simplest form that expresses the constraint.
  test("a lone neighborhood filter is not wrapped in $and", () => {
    assert.deepEqual(buildMetadataFilter({ query: "cosy", neighborhood: "Harlem" }), {
      neighborhoodNormalized: { $eq: "harlem" },
    });
  });

  // Pinecone $eq has no insensitive mode, so casing the model happened to emit
  // used to decide whether a filtered search returned anything at all.
  test("neighborhood casing and punctuation do not change the filter", () => {
    const canonical = buildMetadataFilter({ query: "cosy", neighborhood: "East Village" });
    for (const variant of ["east village", "EAST VILLAGE", "East  Village"]) {
      assert.deepEqual(buildMetadataFilter({ query: "cosy", neighborhood: variant }), canonical);
    }
  });

  test("city casing does not change the filter", () => {
    assert.deepEqual(buildMetadataFilter({ query: "cosy", city: "new york" }), {
      cityNormalized: { $eq: "new york" },
    });
  });

  test("state is matched uppercase whatever the model sent", () => {
    assert.deepEqual(buildMetadataFilter({ query: "cosy", state: "ny" }), {
      state: { $eq: "NY" },
    });
  });

  test("a lone slug filter is not wrapped in $and", () => {
    assert.deepEqual(buildMetadataFilter({ query: "cosy", restaurantSlugs: ["fette-sau"] }), {
      restaurantSlug: { $in: ["fette-sau"] },
    });
  });

  test("two filters combine under $and", () => {
    assert.deepEqual(
      buildMetadataFilter({
        query: "cosy",
        neighborhood: "Harlem",
        restaurantSlugs: ["fette-sau", "lanzhou-noodle"],
      }),
      {
        $and: [
          { neighborhoodNormalized: { $eq: "harlem" } },
          { restaurantSlug: { $in: ["fette-sau", "lanzhou-noodle"] } },
        ],
      },
    );
  });

  test("an empty slug array is treated as no constraint", () => {
    assert.equal(buildMetadataFilter({ query: "cosy", restaurantSlugs: [] }), null);
  });
});

describe("getSearchNamespaces", () => {
  const pinecone = process.env.PINECONE_NAMESPACE;
  const dataset = process.env.RESTAURANT_DATASET;

  function restore() {
    if (pinecone === undefined) delete process.env.PINECONE_NAMESPACE;
    else process.env.PINECONE_NAMESPACE = pinecone;
    if (dataset === undefined) delete process.env.RESTAURANT_DATASET;
    else process.env.RESTAURANT_DATASET = dataset;
  }

  // The app leaves both unset, and must see crawled reviews: reading only the
  // default namespace is what made a just-crawled city answerable by SQL and
  // silent to search_opinions.
  test("the app reads the default and crawled namespaces", () => {
    delete process.env.PINECONE_NAMESPACE;
    delete process.env.RESTAURANT_DATASET;
    assert.deepEqual(getSearchNamespaces(), [undefined, "crawled"]);
    restore();
  });

  test("a dataset-scoped run excludes the crawled namespace", () => {
    delete process.env.PINECONE_NAMESPACE;
    process.env.RESTAURANT_DATASET = "seed";
    assert.deepEqual(getSearchNamespaces(), [undefined]);
    restore();
  });

  test("an explicit namespace pins exactly one corpus", () => {
    process.env.PINECONE_NAMESPACE = "web-research";
    process.env.RESTAURANT_DATASET = "seed";
    assert.deepEqual(getSearchNamespaces(), ["web-research"]);
    restore();
  });
});
