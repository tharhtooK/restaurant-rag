/**
 * Eval harness.
 *
 * Runs every golden through the real agent and scores three independent checks:
 *
 *   route      — did the tools the agent chose match the expected retrieval path?
 *   retrieval  — did the required restaurants actually surface, and did the answer
 *                avoid recommending forbidden ones?
 *   rubric     — must_mention / must_not_claim, graded by an LLM judge (see judge.ts).
 *
 * Scoring lives in scoring.ts (pure) and output in report.ts; this file only
 * orchestrates.
 *
 * Usage:
 *   docker compose exec web npx tsx evals/runner.ts            # all goldens
 *   docker compose exec web npx tsx evals/runner.ts G01 G05    # a subset
 */
import "dotenv/config";
import { runAgent } from "../src/lib/agent";
import { prisma } from "../src/lib/db";
import { judge } from "./judge";
import { reportResults } from "./report";
import { checkRetrieval, checkRoute, checkRubric, describeRoute } from "./scoring";
import type { Golden, GoldenResult } from "./types";
import goldensJson from "./golden.json";

const goldens = goldensJson as Golden[];
const CONCURRENCY = 4;

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
    const rubric = checkRubric(await judge(golden, text));

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

function selectGoldens(ids: string[]): Golden[] {
  if (ids.length === 0) return goldens;

  const selected = goldens.filter((g) => ids.includes(g.id));
  if (selected.length === 0) {
    console.error(`no goldens matched: ${ids.join(", ")}`);
    process.exit(1);
  }
  return selected;
}

async function loadSlugToName(): Promise<Map<string, string>> {
  const restaurants = await prisma.restaurant.findMany({ select: { slug: true, name: true } });
  return new Map(restaurants.map((r) => [r.slug, r.name]));
}

async function main() {
  const selected = selectGoldens(process.argv.slice(2));
  const slugToName = await loadSlugToName();

  console.log(`running ${selected.length} goldens (concurrency ${CONCURRENCY})...\n`);
  const started = Date.now();
  const results = await mapPool(selected, CONCURRENCY, (g) => runOne(g, slugToName));
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  reportResults(results, elapsed);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
