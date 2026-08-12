import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildMetadataFilter } from "../src/lib/tools/search-opinions";

describe("buildMetadataFilter", () => {
  test("returns null when there is nothing to filter on", () => {
    assert.equal(buildMetadataFilter({ query: "cosy" }), null);
  });

  // A single filter is passed bare rather than wrapped in $and, so the query
  // sent to Pinecone stays the simplest form that expresses the constraint.
  test("a lone neighborhood filter is not wrapped in $and", () => {
    assert.deepEqual(buildMetadataFilter({ query: "cosy", neighborhood: "Harlem" }), {
      neighborhood: { $eq: "Harlem" },
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
          { neighborhood: { $eq: "Harlem" } },
          { restaurantSlug: { $in: ["fette-sau", "lanzhou-noodle"] } },
        ],
      },
    );
  });

  test("an empty slug array is treated as no constraint", () => {
    assert.equal(buildMetadataFilter({ query: "cosy", restaurantSlugs: [] }), null);
  });
});
