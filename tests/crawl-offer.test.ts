import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { hadEmptyResult, isSpecificEnoughToCrawl } from "../src/lib/crawl-offer";
import { parseLocation } from "../src/lib/location";
import type { ToolCallRecord } from "../src/lib/agent";

function call(input: unknown, output = "[]"): ToolCallRecord {
  return { name: "filter_restaurants", input, output };
}

describe("hadEmptyResult", () => {
  test("an empty array counts as empty", () => {
    assert.equal(hadEmptyResult([call({}, "[]")]), true);
  });

  test("a null result counts as empty", () => {
    assert.equal(hadEmptyResult([call({}, "null")]), true);
  });

  test("a populated result does not", () => {
    assert.equal(hadEmptyResult([call({}, '[{"slug":"gr-karczma"}]')]), false);
  });

  test("one empty call among several is enough", () => {
    assert.equal(hadEmptyResult([call({}, '[{"slug":"x"}]'), call({}, "[]")]), true);
  });

  test("no tool calls is not an empty result", () => {
    assert.equal(hadEmptyResult([]), false);
  });
});
describe("isSpecificEnoughToCrawl", () => {
  // Everything a user might type after a greeting armed the ask. parseLocation
  // treats a bare word as a city, so each of these used to be crawlable.
  test("conversational text is never crawlable", () => {
    for (const text of ["cheap ramen", "something spicy", "yes please", "idk", "vegan"]) {
      const location = parseLocation(text);
      assert.equal(
        location === null || isSpecificEnoughToCrawl(location),
        false,
        `"${text}" should not be crawlable`,
      );
    }
  });

  // Portland, OR and Portland, ME. Crawling either one is a guess.
  test("a bare city is not enough", () => {
    assert.equal(isSpecificEnoughToCrawl({ neighborhood: null, city: "Portland", state: "" }), false);
  });

  test("city and state is crawlable", () => {
    assert.equal(isSpecificEnoughToCrawl({ neighborhood: null, city: "Austin", state: "TX" }), true);
  });

  test("a neighborhood within a city is crawlable", () => {
    assert.equal(
      isSpecificEnoughToCrawl({ neighborhood: "Astoria", city: "Queens", state: "" }),
      true,
    );
  });

  test("a neighborhood with no city is not", () => {
    assert.equal(isSpecificEnoughToCrawl({ neighborhood: "Chinatown", city: "", state: "" }), false);
  });

  test("the forms the ask actually suggests all pass", () => {
    for (const text of ["Austin, TX", "East Village, New York, NY", "Marine Park, Brooklyn"]) {
      const location = parseLocation(text);
      assert.ok(location && isSpecificEnoughToCrawl(location), `"${text}" should be crawlable`);
    }
  });
});
