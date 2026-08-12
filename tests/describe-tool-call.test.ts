import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { describeToolCall, formatToolArguments } from "../src/lib/describe-tool-call";

function call(name: string, input: unknown) {
  return { name, input, output: "" };
}

describe("describeToolCall for filter_restaurants", () => {
  test("lists each constraint that was actually set", () => {
    const label = describeToolCall(
      call("filter_restaurants", { cuisine: "Korean BBQ", neighborhood: "Flushing", priceTierMax: 2 }),
    );
    assert.equal(label, "Filtered restaurants: Korean BBQ, Flushing, up to $$");
  });

  test("omits constraints that were not set", () => {
    const label = describeToolCall(call("filter_restaurants", { neighborhood: "Harlem" }));
    assert.equal(label, "Filtered restaurants: Harlem");
  });

  test("falls back to a bare label when no constraints were set", () => {
    assert.equal(describeToolCall(call("filter_restaurants", {})), "Filtered restaurants");
  });

  test("renders price tiers as dollar signs", () => {
    const label = describeToolCall(call("filter_restaurants", { priceTierMin: 1, priceTierMax: 3 }));
    assert.equal(label, "Filtered restaurants: from $, up to $$$");
  });

  test("shows vegetarianFriendly only when true", () => {
    const on = describeToolCall(call("filter_restaurants", { vegetarianFriendly: true }));
    const off = describeToolCall(call("filter_restaurants", { vegetarianFriendly: false }));
    assert.equal(on, "Filtered restaurants: vegetarian-friendly");
    assert.equal(off, "Filtered restaurants");
  });

  test("includes time constraints", () => {
    const label = describeToolCall(call("filter_restaurants", { openPast: "23:00", opensBy: "09:00" }));
    assert.equal(label, "Filtered restaurants: open past 23:00, opens by 09:00");
  });
});

describe("describeToolCall for search_opinions", () => {
  test("quotes the query", () => {
    const label = describeToolCall(call("search_opinions", { query: "quiet date spot" }));
    assert.equal(label, 'Searched reviews: "quiet date spot"');
  });

  test("appends a neighborhood filter", () => {
    const label = describeToolCall(
      call("search_opinions", { query: "hidden gem", neighborhood: "Flushing" }),
    );
    assert.equal(label, 'Searched reviews: "hidden gem", Flushing');
  });

  test("names the restaurants when the search was scoped to slugs", () => {
    const label = describeToolCall(
      call("search_opinions", { query: "vibe", restaurantSlugs: ["fette-sau", "wild-ginger"] }),
    );
    assert.equal(label, 'Searched reviews: "vibe", fette-sau, wild-ginger');
  });

  test("ignores an empty slug array", () => {
    const label = describeToolCall(call("search_opinions", { query: "vibe", restaurantSlugs: [] }));
    assert.equal(label, 'Searched reviews: "vibe"');
  });
});

describe("describeToolCall for get_restaurant_details", () => {
  test("prefers the name over the slug", () => {
    const label = describeToolCall(
      call("get_restaurant_details", { name: "Fette Sau", slug: "wb-smoke-yard" }),
    );
    assert.equal(label, "Looked up Fette Sau");
  });

  test("falls back to the slug", () => {
    assert.equal(
      describeToolCall(call("get_restaurant_details", { slug: "wb-smoke-yard" })),
      "Looked up wb-smoke-yard",
    );
  });

  test("falls back again when neither is present", () => {
    assert.equal(describeToolCall(call("get_restaurant_details", {})), "Looked up a restaurant");
  });
});

describe("describeToolCall edge cases", () => {
  test("an unknown tool falls back to its raw name", () => {
    assert.equal(describeToolCall(call("some_future_tool", {})), "some_future_tool");
  });

  // The agent records malformed arguments as the raw string it received.
  test("non-object arguments do not crash the label", () => {
    assert.equal(describeToolCall(call("filter_restaurants", "not json")), "Filtered restaurants");
    assert.equal(describeToolCall(call("filter_restaurants", null)), "Filtered restaurants");
  });
});

describe("formatToolArguments", () => {
  test("pretty-prints an object", () => {
    assert.equal(formatToolArguments({ neighborhood: "Harlem" }), '{\n  "neighborhood": "Harlem"\n}');
  });

  test("passes a raw string through unchanged, so a malformed call stays inspectable", () => {
    assert.equal(formatToolArguments('{"broken": '), '{"broken": ');
  });
});
