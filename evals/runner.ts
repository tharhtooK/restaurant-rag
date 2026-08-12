/**
 * Step 12: eval harness.
 *
 * Runs every golden through the real agent and scores three independent checks:
 *
 *   route      — did the tools the agent chose match the expected retrieval path?
 *   retrieval  — did the required restaurants actually surface, and did the answer
 *                avoid recommending forbidden ones?
 *   rubric     — must_mention / must_not_claim, graded by an LLM judge (see judge.ts).
 *
 * Usage:
 *   docker compose exec web npx tsx evals/runner.ts            # all goldens
 *   docker compose exec web npx tsx evals/runner.ts G01 G05    # a subset
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { runAgent } from "../src/lib/agent";
import { prisma } from "../src/lib/db";
import { judge } from "./judge";
import type { CheckResult, Golden, GoldenResult } from "./types";
import goldensJson from "./golden.json";

const goldens = goldensJson as Golden[];
const CONCURRENCY = 4;

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

function describeRoute(tools: string[]): string {
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

function checkRoute(golden: Golden, actual: string, tools: string[]): CheckResult {
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
function checkRetrieval(
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

async function runOne(golden: Golden, slugToName: Map<string, string>): Promise<GoldenResult> {
  const base = {
    id: golden.id,
    category: golden.category,
    difficulty: golden.difficulty,
    query: golden.query,
    routeExpected: golden.expected_route,
  };

  try {
    const { text, toolCalls } = await runAgent(golden.query);
    const toolsCalled = toolCalls.map((t) => t.name);
    const routeActual = describeRoute(toolsCalled);
    const toolOutputs = toolCalls.map((t) => t.output).join("\n");

    const route = checkRoute(golden, routeActual, toolsCalled);
    const retrieval = checkRetrieval(golden, toolOutputs, text, slugToName);

    const verdict = await judge(golden, text);
    const missing = verdict.must_mention_results.filter((r) => !r.satisfied);
    const violated = verdict.must_not_claim_results.filter((r) => r.violated);
    const rubric: CheckResult = {
      pass: missing.length === 0 && violated.length === 0,
      detail:
        missing.length === 0 && violated.length === 0
          ? "ok"
          : [
              ...missing.map((m) => `missing "${m.item}" (${m.reason})`),
              ...violated.map((v) => `claimed "${v.item}" (${v.reason})`),
            ].join("; "),
    };

    return {
      ...base,
      answer: text,
      toolsCalled,
      routeActual,
      checks: { route, retrieval, rubric },
      pass: route.pass && retrieval.pass && rubric.pass,
    };
  } catch (error) {
    return {
      ...base,
      answer: "",
      toolsCalled: [],
      routeActual: "error",
      checks: {
        route: { pass: false, detail: "errored" },
        retrieval: { pass: false, detail: "errored" },
        rubric: { pass: false, detail: "errored" },
      },
      pass: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

function mark(c: CheckResult): string {
  return c.pass ? "ok  " : "FAIL";
}

async function main() {
  const filter = process.argv.slice(2);
  const selected = filter.length ? goldens.filter((g) => filter.includes(g.id)) : goldens;
  if (selected.length === 0) {
    console.error(`no goldens matched: ${filter.join(", ")}`);
    process.exit(1);
  }

  const restaurants = await prisma.restaurant.findMany({ select: { slug: true, name: true } });
  const slugToName = new Map(restaurants.map((r) => [r.slug, r.name]));

  console.log(`running ${selected.length} goldens (concurrency ${CONCURRENCY})...\n`);
  const started = Date.now();
  const results = await mapPool(selected, CONCURRENCY, (g) => runOne(g, slugToName));
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  for (const r of results.sort((a, b) => a.id.localeCompare(b.id))) {
    const status = r.pass ? "PASS" : "FAIL";
    console.log(`${status}  ${r.id}  ${r.category.padEnd(14)} ${r.difficulty.padEnd(6)} "${r.query}"`);
    console.log(
      `      route:${mark(r.checks.route)} ${r.checks.route.detail}` +
        ` | retrieval:${mark(r.checks.retrieval)} ${r.checks.retrieval.detail}`,
    );
    if (!r.checks.rubric.pass) console.log(`      rubric:FAIL ${r.checks.rubric.detail}`);
    if (r.error) console.log(`      error: ${r.error}`);
  }

  const passed = results.filter((r) => r.pass).length;
  const byCheck = {
    route: results.filter((r) => r.checks.route.pass).length,
    retrieval: results.filter((r) => r.checks.retrieval.pass).length,
    rubric: results.filter((r) => r.checks.rubric.pass).length,
  };

  console.log(`\n${"=".repeat(70)}`);
  console.log(`OVERALL   ${passed}/${results.length} (${((passed / results.length) * 100).toFixed(0)}%)   in ${elapsed}s`);
  console.log(
    `by check  route ${byCheck.route}/${results.length}` +
      ` | retrieval ${byCheck.retrieval}/${results.length}` +
      ` | rubric ${byCheck.rubric}/${results.length}`,
  );

  const categories = [...new Set(results.map((r) => r.category))].sort();
  console.log("\nby category");
  for (const c of categories) {
    const rows = results.filter((r) => r.category === c);
    const p = rows.filter((r) => r.pass).length;
    console.log(`  ${c.padEnd(14)} ${p}/${rows.length}${p < rows.length ? "   <-- " + rows.filter(r => !r.pass).map(r => r.id).join(" ") : ""}`);
  }

  const outDir = join(process.cwd(), "evals", "results");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(outFile, JSON.stringify({ passed, total: results.length, results }, null, 2));
  console.log(`\nfull results → ${outFile}`);

  const ns = process.env.PINECONE_NAMESPACE;
  console.log(
    ns === "web-research"
      ? `\nCORPUS: independently-sourced reviews (namespace "${ns}"). Review text came from web\n` +
          "research on what real reviewers say, gathered without consulting the goldens, so this\n" +
          "score reflects retrieval against data the goldens did not author. Residual bias is\n" +
          "documented in prisma/seed-data-independent.ts."
      : "\nCAVEAT: this corpus's review text was authored to satisfy these goldens' required_facts,\n" +
          "so the score measures plumbing (routing, retrieval, grounding, refusal), not retrieval\n" +
          "quality. Re-run with PINECONE_NAMESPACE=web-research for the independent number.",
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
