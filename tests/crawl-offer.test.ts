import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { findNeighborhoodInTurn, hadEmptyResult } from "../src/lib/crawl-offer";
import type { ToolCallRecord } from "../src/lib/agent";

function call(input: unknown, output = "[]"): ToolCallRecord {
  return { name: "filter_restaurants", input, output };
}

describe("findNeighborhoodInTurn", () => {
  test("returns the neighborhood when the user typed it", () => {
    const calls = [call({ neighborhood: "Greenpoint" })];
    assert.equal(findNeighborhoodInTurn("what about Greenpoint?", calls), "Greenpoint");
  });

  test("matches case-insensitively but returns the tool's spelling", () => {
    const calls = [call({ neighborhood: "Greenpoint" })];
    assert.equal(findNeighborhoodInTurn("anything in greenpoint", calls), "Greenpoint");
  });

  // The one failure removing the crawl button introduced: without a click, a
  // neighborhood the model invented would spend money on its own.
  test("returns null when the model invented the neighborhood", () => {
    const calls = [call({ neighborhood: "Manhattan" })];
    assert.equal(findNeighborhoodInTurn("somewhere downtown", calls), null);
  });

  test("returns null when no tool carried a neighborhood", () => {
    const calls = [call({ name: "Karczma" }, "null")];
    assert.equal(findNeighborhoodInTurn("is Karczma any good?", calls), null);
  });

  test("ignores a blank neighborhood argument", () => {
    const calls = [call({ neighborhood: "   " })];
    assert.equal(findNeighborhoodInTurn("anywhere at all", calls), null);
  });

  test("ignores a non-string neighborhood argument", () => {
    const calls = [call({ neighborhood: 42 })];
    assert.equal(findNeighborhoodInTurn("what about 42", calls), null);
  });

  test("returns null for no tool calls at all", () => {
    assert.equal(findNeighborhoodInTurn("hello", []), null);
  });
});

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