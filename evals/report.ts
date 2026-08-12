import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { CheckResult, GoldenResult } from "./types";

function mark(check: CheckResult): string {
  return check.pass ? "ok  " : "FAIL";
}

function printGolden(result: GoldenResult): void {
  const status = result.pass ? "PASS" : "FAIL";
  console.log(
    `${status}  ${result.id}  ${result.category.padEnd(14)} ${result.difficulty.padEnd(6)} "${result.query}"`,
  );
  console.log(
    `      route:${mark(result.checks.route)} ${result.checks.route.detail}` +
      ` | retrieval:${mark(result.checks.retrieval)} ${result.checks.retrieval.detail}`,
  );
  if (!result.checks.rubric.pass) console.log(`      rubric:FAIL ${result.checks.rubric.detail}`);
  if (result.error) console.log(`      error: ${result.error}`);
}

function printTotals(results: GoldenResult[], elapsed: string): void {
  const passed = results.filter((r) => r.pass).length;
  const byCheck = {
    route: results.filter((r) => r.checks.route.pass).length,
    retrieval: results.filter((r) => r.checks.retrieval.pass).length,
    rubric: results.filter((r) => r.checks.rubric.pass).length,
  };

  console.log(`\n${"=".repeat(70)}`);
  console.log(
    `OVERALL   ${passed}/${results.length} (${((passed / results.length) * 100).toFixed(0)}%)   in ${elapsed}s`,
  );
  console.log(
    `by check  route ${byCheck.route}/${results.length}` +
      ` | retrieval ${byCheck.retrieval}/${results.length}` +
      ` | rubric ${byCheck.rubric}/${results.length}`,
  );
}

function printByCategory(results: GoldenResult[]): void {
  const categories = [...new Set(results.map((r) => r.category))].sort();
  console.log("\nby category");
  for (const category of categories) {
    const rows = results.filter((r) => r.category === category);
    const passed = rows.filter((r) => r.pass).length;
    const failedIds = rows.filter((r) => !r.pass).map((r) => r.id).join(" ");
    const suffix = passed < rows.length ? `   <-- ${failedIds}` : "";
    console.log(`  ${category.padEnd(14)} ${passed}/${rows.length}${suffix}`);
  }
}

function writeResultsFile(results: GoldenResult[]): string {
  const outDir = join(process.cwd(), "evals", "results");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const passed = results.filter((r) => r.pass).length;
  writeFileSync(outFile, JSON.stringify({ passed, total: results.length, results }, null, 2));
  return outFile;
}

/**
 * Printed with every run so the headline number can never be quoted on its own:
 * the authored corpus's review text was written to satisfy the goldens, so only
 * the independent namespace grades retrieval rather than plumbing.
 */
function printCorpusCaveat(): void {
  const namespace = process.env.PINECONE_NAMESPACE;
  console.log(
    namespace === "web-research"
      ? `\nCORPUS: independently-sourced reviews (namespace "${namespace}"). Review text came from web\n` +
          "research on what real reviewers say, gathered without consulting the goldens, so this\n" +
          "score reflects retrieval against data the goldens did not author. Residual bias is\n" +
          "documented in prisma/seed-data-independent.ts."
      : "\nCAVEAT: this corpus's review text was authored to satisfy these goldens' required_facts,\n" +
          "so the score measures plumbing (routing, retrieval, grounding, refusal), not retrieval\n" +
          "quality. Re-run with PINECONE_NAMESPACE=web-research for the independent number.",
  );
}

export function reportResults(results: GoldenResult[], elapsed: string): void {
  for (const result of [...results].sort((a, b) => a.id.localeCompare(b.id))) {
    printGolden(result);
  }

  printTotals(results, elapsed);
  printByCategory(results);
  console.log(`\nfull results → ${writeResultsFile(results)}`);
  printCorpusCaveat();
}
