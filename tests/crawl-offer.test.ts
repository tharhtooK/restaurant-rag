import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { hadEmptyResult } from "../src/lib/crawl-offer";
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