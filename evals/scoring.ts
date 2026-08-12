import type { Verdict } from "./judge";
import type { CheckResult, Golden } from "./types";

/**
 * Which retrieval path did the agent actually take?
 *
 * Scored on the *kinds of data the agent obtained*, not on which tool names it
 * happened to call. This matters because get_restaurant_details returns both
 * structured fields and review text, so it supplies structured and semantic
 * data at once — an agent that answers a comparison by pulling details for both
 * restaurants has genuinely joined structured + unstructured (the definition of
 * hybrid), just via one tool instead of two.
 *
 * The rule still has teeth: filter_restaurants alone can never satisfy `vector`
 * or `hybrid`, so a genuine routing miss (answering a vibe query from structured
 * columns) still fails.
 */
const STRUCTURED_TOOLS = ["filter_restaurants", "get_restaurant_details"];
const SEMANTIC_TOOLS = ["search_opinions", "get_restaurant_details"];

export function describeRoute(tools: string[]): string {
  const structured = tools.some((t) => STRUCTURED_TOOLS.includes(t));
  const semantic = tools.some((t) => SEMANTIC_TOOLS.includes(t));
  if (structured && semantic) return "hybrid-capable";
  if (semantic) return "vector";
  if (structured) return "sql";
  return "none";
}

function satisfiesRoute(expected: string, tools: string[]): boolean {
  const structured = tools.some((t) => STRUCTURED_TOOLS.includes(t));
  const semantic = tools.some((t) => SEMANTIC_TOOLS.includes(t));
  if (expected === "sql") return structured;
  if (expected === "vector") return semantic;
  if (expected === "hybrid") return structured && semantic;
  return true;
}

export function checkRoute(golden: Golden, actual: string, tools: string[]): CheckResult {
  // "refuse" is a property of the answer, not of tool usage: a refusal may
  // legitimately call a tool first (G18 looks up East Village options before
  // declining to book) or call nothing at all (G19, out-of-scope city). The
  // refusal itself is graded by the rubric, so route is not scored here.
  if (golden.expected_route === "refuse") {
    return { pass: true, detail: `n/a for refuse (tools: ${actual})` };
  }
  const pass = satisfiesRoute(golden.expected_route, tools);
  return {
    pass,
    detail: pass
      ? `${golden.expected_route} satisfied (${actual})`
      : `expected ${golden.expected_route}, got ${actual}`,
  };
}

/**
 * required_restaurant_slugs are specified as "MUST appear in retrieval", so they
 * are checked against raw tool output.
 *
 * forbidden_restaurant_slugs say "appearing = failure", which is ambiguous. They
 * are checked against the *answer*, not retrieval: a distractor surfacing in
 * top-K and then being correctly excluded from the recommendation is the system
 * working, not failing. Checking forbidden against retrieval would fail G05 for
 * behaviour that is actually correct.
 */
export function checkRetrieval(
  golden: Golden,
  toolOutputs: string,
  answer: string,
  slugToName: Map<string, string>,
): CheckResult {
  const problems: string[] = [];

  for (const slug of golden.required_restaurant_slugs) {
    if (!toolOutputs.includes(slug)) {
      problems.push(`required ${slug} never retrieved`);
    }
  }

  const answerLower = answer.toLowerCase();
  for (const slug of golden.forbidden_restaurant_slugs) {
    const name = slugToName.get(slug);
    if (name && answerLower.includes(name.toLowerCase())) {
      problems.push(`forbidden ${slug} ("${name}") appears in answer`);
    }
  }

  return problems.length === 0
    ? { pass: true, detail: "ok" }
    : { pass: false, detail: problems.join("; ") };
}

export function checkRubric(verdict: Verdict): CheckResult {
  const missing = verdict.must_mention_results.filter((r) => !r.satisfied);
  const violated = verdict.must_not_claim_results.filter((r) => r.violated);

  if (missing.length === 0 && violated.length === 0) {
    return { pass: true, detail: "ok" };
  }

  return {
    pass: false,
    detail: [
      ...missing.map((m) => `missing "${m.item}" (${m.reason})`),
      ...violated.map((v) => `claimed "${v.item}" (${v.reason})`),
    ].join("; "),
  };
}
