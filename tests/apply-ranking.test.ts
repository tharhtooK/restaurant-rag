import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { applyRanking, type OpinionMatch } from "../src/lib/tools/search-opinions";

function match(slug: string, score: number): OpinionMatch {
  return {
    restaurantSlug: slug,
    restaurantName: slug,
    neighborhood: "Flushing",
    snippet: `snippet for ${slug}`,
    score,
  };
}

describe("applyRanking", () => {
  const candidates = [match("a", 0.9), match("b", 0.8), match("c", 0.7)];

  test("reorders candidates into the ranked order", () => {
    const result = applyRanking(candidates, [
      { index: 2, score: 0.99 },
      { index: 0, score: 0.4 },
      { index: 1, score: 0.1 },
    ]);
    assert.deepEqual(
      result.map((r) => r.restaurantSlug),
      ["c", "a", "b"],
    );
  });

  test("replaces the vector score with the rerank score", () => {
    const result = applyRanking(candidates, [{ index: 1, score: 0.42 }]);
    assert.equal(result[0].restaurantSlug, "b");
    assert.equal(result[0].score, 0.42);
  });

  test("carries the rest of each match through untouched", () => {
    const result = applyRanking(candidates, [{ index: 0, score: 0.5 }]);
    assert.equal(result[0].snippet, "snippet for a");
    assert.equal(result[0].neighborhood, "Flushing");
  });

  test("returning fewer than the candidate count truncates rather than pads", () => {
    const result = applyRanking(candidates, [{ index: 1, score: 0.9 }]);
    assert.equal(result.length, 1);
  });

  // An out-of-range index would otherwise shift every later result onto the
  // wrong restaurant, which is worse than dropping one.
  test("skips an out-of-range index instead of emitting undefined", () => {
    const result = applyRanking(candidates, [
      { index: 9, score: 0.99 },
      { index: 1, score: 0.5 },
    ]);
    assert.deepEqual(
      result.map((r) => r.restaurantSlug),
      ["b"],
    );
  });

  test("no ranked results yields no matches", () => {
    assert.deepEqual(applyRanking(candidates, []), []);
  });

  test("no candidates yields no matches", () => {
    assert.deepEqual(applyRanking([], [{ index: 0, score: 1 }]), []);
  });
});
