import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveTarget, DEFAULT_NAMESPACE_SOURCE } from "../src/lib/embed-reviews";

describe("resolveTarget", () => {
  test("no source embeds the authored corpus into the default namespace", () => {
    const target = resolveTarget(undefined);
    assert.equal(target.selector, DEFAULT_NAMESPACE_SOURCE);
    assert.equal(target.namespace, undefined);
  });

  // The 2026-08-14 contamination: a no-arg run that selected every review took
  // the default namespace from 36 records to 120, mixing three corpora into the
  // set the eval is graded against.
  test("no source selects only authored reviews, never every review", () => {
    assert.deepEqual(resolveTarget(undefined).where, { source: DEFAULT_NAMESPACE_SOURCE });
  });

  test("a plain source matches it exactly and names the namespace after it", () => {
    const target = resolveTarget("web-research");
    assert.equal(target.namespace, "web-research");
    assert.deepEqual(target.where, { source: "web-research" });
  });

  test("a trailing colon selects a family and strips the colon from the namespace", () => {
    const target = resolveTarget("crawled:");
    assert.equal(target.namespace, "crawled");
    assert.deepEqual(target.where, { source: { startsWith: "crawled:" } });
  });

  test("an explicit authored source still gets its own namespace, not the default", () => {
    assert.equal(resolveTarget(DEFAULT_NAMESPACE_SOURCE).namespace, DEFAULT_NAMESPACE_SOURCE);
  });
});
