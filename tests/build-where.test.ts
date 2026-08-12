import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildWhere } from "../src/lib/tools/filter-restaurants";

describe("buildWhere", () => {
  test("no input produces no constraints", () => {
    assert.deepEqual(buildWhere({}), {});
  });

  // The tool schema accepts any string now that the neighborhood enum is gone,
  // so casing from the model must not decide whether rows come back.
  test("neighborhood is matched case-insensitively", () => {
    assert.deepEqual(buildWhere({ neighborhood: "east village" }), {
      neighborhood: { equals: "east village", mode: "insensitive" },
    });
  });

  test("cuisine is a case-insensitive contains match", () => {
    assert.deepEqual(buildWhere({ cuisine: "korean" }), {
      cuisine: { contains: "korean", mode: "insensitive" },
    });
  });

  test("vegetarianFriendly false is kept rather than dropped as falsy", () => {
    assert.deepEqual(buildWhere({ vegetarianFriendly: false }), { vegetarianFriendly: false });
  });

  test("a price floor and ceiling combine into one range", () => {
    assert.deepEqual(buildWhere({ priceTierMin: 2, priceTierMax: 3 }), {
      priceTier: { gte: 2, lte: 3 },
    });
  });

  test("a ceiling alone does not invent a floor", () => {
    assert.deepEqual(buildWhere({ priceTierMax: 2 }), { priceTier: { lte: 2 } });
  });

  test("priceTier 0 is honoured rather than treated as absent", () => {
    assert.deepEqual(buildWhere({ priceTierMin: 0 }), { priceTier: { gte: 0 } });
  });

  // Hours are filtered in memory after the query, so they must never leak into
  // the SQL where clause.
  test("hour constraints do not become SQL predicates", () => {
    assert.deepEqual(buildWhere({ openPast: "23:00", opensBy: "09:00" }), {});
  });

  test("constraints combine", () => {
    assert.deepEqual(buildWhere({ neighborhood: "Harlem", cuisine: "soul", priceTierMax: 2 }), {
      neighborhood: { equals: "Harlem", mode: "insensitive" },
      cuisine: { contains: "soul", mode: "insensitive" },
      priceTier: { lte: 2 },
    });
  });
});
