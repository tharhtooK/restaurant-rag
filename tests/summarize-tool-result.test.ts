import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { summarizeToolResult } from "../src/lib/summarize-tool-result";

const restaurant = {
  slug: "ev-tuome",
  name: "Tuome",
  neighborhood: "East Village",
  cuisine: "New American",
  priceTier: 3,
};

describe("summarizeToolResult for filter_restaurants", () => {
  test("counts results and lists name, neighborhood and price tier", () => {
    const result = summarizeToolResult("filter_restaurants", JSON.stringify([restaurant]));
    assert.equal(result.headline, "1 result");
    assert.deepEqual(result.items, ["Tuome — East Village — $$$"]);
  });

  test("pluralises multiple results", () => {
    const result = summarizeToolResult(
      "filter_restaurants",
      JSON.stringify([restaurant, { ...restaurant, name: "Superiority Burger" }]),
    );
    assert.equal(result.headline, "2 results");
    assert.equal(result.items.length, 2);
  });

  // The empty case is the interesting one — it is how the UI shows that a
  // constraint matched nothing.
  test("an empty result set reads as 'no results'", () => {
    const result = summarizeToolResult("filter_restaurants", "[]");
    assert.equal(result.headline, "no results");
    assert.deepEqual(result.items, []);
  });

  test("missing fields are skipped rather than rendered as blanks", () => {
    const result = summarizeToolResult("filter_restaurants", JSON.stringify([{ name: "Tuome" }]));
    assert.deepEqual(result.items, ["Tuome"]);
  });
});

describe("summarizeToolResult for search_opinions", () => {
  test("counts snippets and pairs each with its restaurant", () => {
    const result = summarizeToolResult(
      "search_opinions",
      JSON.stringify([{ restaurantName: "Tuome", snippet: "Low lighting, quiet enough to talk." }]),
    );
    assert.equal(result.headline, "1 snippet");
    assert.deepEqual(result.items, ["Tuome — Low lighting, quiet enough to talk."]);
  });

  test("long snippets are truncated with an ellipsis", () => {
    const long = "x".repeat(300);
    const result = summarizeToolResult(
      "search_opinions",
      JSON.stringify([{ restaurantName: "Tuome", snippet: long }]),
    );
    assert.equal(result.items[0].endsWith("…"), true);
    assert.equal(result.items[0].length < 200, true);
  });

  test("no matches reads as 'no snippets'", () => {
    assert.equal(summarizeToolResult("search_opinions", "[]").headline, "no snippets");
  });
});

describe("summarizeToolResult for get_restaurant_details", () => {
  test("a null result reads as 'not found'", () => {
    const result = summarizeToolResult("get_restaurant_details", "null");
    assert.equal(result.headline, "not found");
    assert.deepEqual(result.items, []);
  });

  test("a hit reports the restaurant and its review count", () => {
    const result = summarizeToolResult(
      "get_restaurant_details",
      JSON.stringify({ ...restaurant, reviews: ["a", "b"] }),
    );
    assert.equal(result.headline, "found");
    assert.deepEqual(result.items, ["Tuome — East Village", "2 reviews"]);
  });

  test("a hit with no reviews still reports the count", () => {
    const result = summarizeToolResult(
      "get_restaurant_details",
      JSON.stringify({ ...restaurant, reviews: [] }),
    );
    assert.deepEqual(result.items, ["Tuome — East Village", "no reviews"]);
  });
});

describe("summarizeToolResult error and edge cases", () => {
  test("a tool error is surfaced as an error headline", () => {
    const result = summarizeToolResult(
      "filter_restaurants",
      JSON.stringify({ error: "Invalid arguments" }),
    );
    assert.equal(result.headline, "error");
    assert.deepEqual(result.items, ["Invalid arguments"]);
  });

  test("unparseable output does not throw", () => {
    const result = summarizeToolResult("filter_restaurants", "{not json");
    assert.equal(result.headline, "unreadable output");
    assert.deepEqual(result.items, ["{not json"]);
  });

  test("an unknown tool returning an array still gets a count", () => {
    assert.equal(summarizeToolResult("some_future_tool", "[1,2,3]").headline, "3 results");
  });

  test("a non-array, non-error object falls back to 'ok'", () => {
    assert.equal(summarizeToolResult("some_future_tool", '{"a":1}').headline, "ok");
  });
});
