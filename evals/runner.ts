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
 * Which retrieval path did the agent actually take, inferred from tool usage.
 * get_restaurant_details is a structured lookup, so it counts toward "sql".
 */
function inferRoute(tools: string[]): string {
  const structured = tools.some((t) => t === "filter_restaurants" || t === "get_restaurant_details");
  const semantic = tools.includes("search_opinions");
  if (structured && semantic) return "hybrid";
  if (semantic) return "vector";
  if (structured) return "sql";
  return "none";
}

function checkRoute(golden: Golden, actual: string): CheckResult {
  // "refuse" is a property of the answer, not of tool usage: a refusal may
  // legitimately call a tool first (G18 looks up East Village options before
  // declining to book) or call nothing at all (G19, out-of-scope city). The
  // refusal itself is graded by the rubric, so route is not scored here.
  if (golden.expected_route === "refuse") {
    return { pass: true, detail: `n/a for refuse (tools: ${actual})` };
  }
  const pass = actual === golden.expected_route;
  return {
    pass,
    detail: pass ? actual : `expected ${golden.expected_route}, got ${actual}`,
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
    const routeActual = inferRoute(toolsCalled);
    const toolOutputs = toolCalls.map((t) => t.output).join("\n");

    const route = checkRoute(golden, routeActual);
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

  console.log(
    "\nCAVEAT: review text was authored to satisfy these goldens' required_facts, so this\n" +
      "score measures plumbing (routing, retrieval, grounding, refusal), not retrieval\n" +
      "quality against independent data. See docs/status.md.",
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
