import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { checkRetrieval, checkRoute, checkRubric, describeRoute } from "../evals/scoring";
import type { Verdict } from "../evals/judge";
import type { Golden } from "../evals/types";

function golden(overrides: Partial<Golden> = {}): Golden {
  return {
    id: "G00",
    category: "sql-filter",
    query: "test query",
    expected_route: "sql",
    expected_tools: [],
    required_restaurant_slugs: [],
    acceptable_restaurant_slugs: [],
    forbidden_restaurant_slugs: [],
    required_facts: [],
    golden_answer: "",
    grading_rubric: { must_mention: [], must_not_claim: [], must_cite: false },
    difficulty: "easy",
    notes: "",
    ...overrides,
  };
}

function verdict(overrides: Partial<Verdict> = {}): Verdict {
  return { must_mention_results: [], must_not_claim_results: [], ...overrides };
}

describe("describeRoute", () => {
  test("no tools is 'none'", () => {
    assert.equal(describeRoute([]), "none");
  });

  test("filter_restaurants alone is 'sql'", () => {
    assert.equal(describeRoute(["filter_restaurants"]), "sql");
  });

  test("search_opinions alone is 'vector'", () => {
    assert.equal(describeRoute(["search_opinions"]), "vector");
  });

  test("both tools together is 'hybrid-capable'", () => {
    assert.equal(describeRoute(["filter_restaurants", "search_opinions"]), "hybrid-capable");
  });

  test("get_restaurant_details alone counts as hybrid-capable, since it returns facts and reviews", () => {
    assert.equal(describeRoute(["get_restaurant_details"]), "hybrid-capable");
  });
});

describe("checkRoute", () => {
  test("a refuse golden passes regardless of which tools were called", () => {
    const noTools = checkRoute(golden({ expected_route: "refuse" }), "none", []);
    const someTools = checkRoute(
      golden({ expected_route: "refuse" }),
      "sql",
      ["filter_restaurants"],
    );
    assert.equal(noTools.pass, true);
    assert.equal(someTools.pass, true);
  });

  test("sql is satisfied by a structured tool", () => {
    const result = checkRoute(golden({ expected_route: "sql" }), "sql", ["filter_restaurants"]);
    assert.equal(result.pass, true);
  });

  // The load-bearing interpretation: get_restaurant_details supplies structured
  // and semantic data at once, so it alone satisfies vector and hybrid.
  test("get_restaurant_details alone satisfies vector and hybrid", () => {
    const vector = checkRoute(golden({ expected_route: "vector" }), "hybrid-capable", [
      "get_restaurant_details",
    ]);
    const hybrid = checkRoute(golden({ expected_route: "hybrid" }), "hybrid-capable", [
      "get_restaurant_details",
    ]);
    assert.equal(vector.pass, true);
    assert.equal(hybrid.pass, true);
  });

  // The rule still has teeth: answering a vibe query from structured columns fails.
  test("filter_restaurants alone can never satisfy vector or hybrid", () => {
    const vector = checkRoute(golden({ expected_route: "vector" }), "sql", ["filter_restaurants"]);
    const hybrid = checkRoute(golden({ expected_route: "hybrid" }), "sql", ["filter_restaurants"]);
    assert.equal(vector.pass, false);
    assert.equal(hybrid.pass, false);
    assert.match(vector.detail, /expected vector, got sql/);
  });

  test("calling no tools at all fails a sql golden", () => {
    assert.equal(checkRoute(golden({ expected_route: "sql" }), "none", []).pass, false);
  });
});

describe("checkRetrieval", () => {
  const slugToName = new Map([
    ["lanzhou-noodle", "Lanzhou Noodle"],
    ["fette-sau", "Fette Sau"],
  ]);

  test("passes when a required slug appears in tool output", () => {
    const result = checkRetrieval(
      golden({ required_restaurant_slugs: ["lanzhou-noodle"] }),
      '[{"slug":"lanzhou-noodle"}]',
      "You should try Lanzhou Noodle.",
      slugToName,
    );
    assert.equal(result.pass, true);
    assert.equal(result.detail, "ok");
  });

  test("fails when a required slug never surfaced in retrieval", () => {
    const result = checkRetrieval(
      golden({ required_restaurant_slugs: ["lanzhou-noodle"] }),
      '[{"slug":"fette-sau"}]',
      "You should try Fette Sau.",
      slugToName,
    );
    assert.equal(result.pass, false);
    assert.match(result.detail, /required lanzhou-noodle never retrieved/);
  });

  test("fails when a forbidden restaurant is named in the answer", () => {
    const result = checkRetrieval(
      golden({ forbidden_restaurant_slugs: ["fette-sau"] }),
      "",
      "I recommend Fette Sau in Williamsburg.",
      slugToName,
    );
    assert.equal(result.pass, false);
    assert.match(result.detail, /forbidden fette-sau/);
  });

  // A distractor surfacing in top-K and then being correctly excluded from the
  // recommendation is the system working, not failing.
  test("a forbidden restaurant in retrieval but absent from the answer passes", () => {
    const result = checkRetrieval(
      golden({ forbidden_restaurant_slugs: ["fette-sau"] }),
      '[{"slug":"fette-sau","name":"Fette Sau"}]',
      "I recommend Lanzhou Noodle instead.",
      slugToName,
    );
    assert.equal(result.pass, true);
  });

  test("forbidden matching is case-insensitive", () => {
    const result = checkRetrieval(
      golden({ forbidden_restaurant_slugs: ["fette-sau"] }),
      "",
      "try FETTE SAU",
      slugToName,
    );
    assert.equal(result.pass, false);
  });

  test("a forbidden slug with no known name is ignored rather than crashing", () => {
    const result = checkRetrieval(
      golden({ forbidden_restaurant_slugs: ["not-in-the-database"] }),
      "",
      "any answer",
      slugToName,
    );
    assert.equal(result.pass, true);
  });

  test("reports every problem at once", () => {
    const result = checkRetrieval(
      golden({
        required_restaurant_slugs: ["lanzhou-noodle"],
        forbidden_restaurant_slugs: ["fette-sau"],
      }),
      "",
      "I recommend Fette Sau.",
      slugToName,
    );
    assert.equal(result.pass, false);
    assert.match(result.detail, /required lanzhou-noodle never retrieved/);
    assert.match(result.detail, /forbidden fette-sau/);
  });
});

describe("checkRubric", () => {
  test("an empty rubric passes", () => {
    assert.equal(checkRubric(verdict()).pass, true);
  });

  test("passes when every must_mention is satisfied and nothing is violated", () => {
    const result = checkRubric(
      verdict({
        must_mention_results: [{ item: "NYC", satisfied: true, reason: "stated" }],
        must_not_claim_results: [{ item: "booked a table", violated: false, reason: "absent" }],
      }),
    );
    assert.equal(result.pass, true);
    assert.equal(result.detail, "ok");
  });

  test("fails and names an unsatisfied must_mention", () => {
    const result = checkRubric(
      verdict({
        must_mention_results: [{ item: "NYC", satisfied: false, reason: "never said NYC" }],
      }),
    );
    assert.equal(result.pass, false);
    assert.match(result.detail, /missing "NYC" \(never said NYC\)/);
  });

  test("fails and names a violated must_not_claim", () => {
    const result = checkRubric(
      verdict({
        must_not_claim_results: [
          { item: "made a reservation", violated: true, reason: "claimed to book" },
        ],
      }),
    );
    assert.equal(result.pass, false);
    assert.match(result.detail, /claimed "made a reservation" \(claimed to book\)/);
  });
});
