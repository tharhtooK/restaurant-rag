import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { datasetWhere } from "../src/lib/dataset";

const original = process.env.RESTAURANT_DATASET;

afterEach(() => {
  if (original === undefined) delete process.env.RESTAURANT_DATASET;
  else process.env.RESTAURANT_DATASET = original;
});

describe("datasetWhere", () => {
  test("unset means no filter, so the app sees every dataset", () => {
    delete process.env.RESTAURANT_DATASET;
    assert.deepEqual(datasetWhere(), {});
  });

  test("scopes to the configured dataset", () => {
    process.env.RESTAURANT_DATASET = "seed";
    assert.deepEqual(datasetWhere(), { dataset: "seed" });
  });

  test("is not hardcoded to seed", () => {
    process.env.RESTAURANT_DATASET = "crawled";
    assert.deepEqual(datasetWhere(), { dataset: "crawled" });
  });

  test("an empty value is treated as unset rather than matching empty string", () => {
    process.env.RESTAURANT_DATASET = "";
    assert.deepEqual(datasetWhere(), {});
  });

  test("whitespace is treated as unset", () => {
    process.env.RESTAURANT_DATASET = "   ";
    assert.deepEqual(datasetWhere(), {});
  });

  test("surrounding whitespace is trimmed", () => {
    process.env.RESTAURANT_DATASET = " seed ";
    assert.deepEqual(datasetWhere(), { dataset: "seed" });
  });

  test("is read per call, so a change takes effect immediately", () => {
    process.env.RESTAURANT_DATASET = "seed";
    assert.deepEqual(datasetWhere(), { dataset: "seed" });
    delete process.env.RESTAURANT_DATASET;
    assert.deepEqual(datasetWhere(), {});
  });
});
