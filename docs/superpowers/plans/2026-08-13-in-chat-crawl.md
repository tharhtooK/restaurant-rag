# In-Chat Crawl Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a chat lookup finds nothing, ask the user which neighborhood, crawl it with progress shown inline, then offer to re-answer the original question — with no crawl button anywhere in the UI.

**Architecture:** Two pure functions inspect the agent's `toolCalls` after `runAgent` returns; `/api/chat` turns their verdict into either a `needsNeighborhood` flag or a started crawl job. The browser polls the already-built `GET /api/crawl/:jobId`, which imports and embeds on success. The crawl trigger lives in the route, never in the agent, so eval runs cannot spend money.

**Tech Stack:** Next.js 16.3 (App Router), TypeScript 5 strict, React 19.2, Prisma 7.9, zod 4, `node:test` + `tsx`.

**Spec:** [`docs/superpowers/specs/2026-08-13-on-demand-crawl-wiring-design.md`](../specs/2026-08-13-on-demand-crawl-wiring-design.md)

## Global Constraints

- Every command runs **inside the web container**: `docker compose exec web <cmd>`.
- **Except HTTP checks.** The `node:22-bookworm-slim` image has no `curl`. Compose publishes `3000:3000`, so run `curl` **from the host** against `localhost:3000` with no `docker compose exec` prefix.
- Run all three before every commit: `npx tsc --noEmit`, `npm run lint`, `npm test`.
- **No `any`.** Use `unknown` plus a narrowing check or a zod parse.
- **Never construct an API client at module scope.** Lazy singletons only — importing a module must not throw because a key is missing.
- **Never move the crawl trigger into `src/lib/agent/`.** `evals/runner.ts:40` calls `runAgent` directly, so keeping the trigger in the route is the only thing stopping G19 ("best ramen shop in tokyo") from crawling on every eval run.
- **No new dependencies.** Tests are `node:test` + `tsx`; test files import with relative paths (`../src/lib/...`), source files use the `@/` alias.
- Comments explain **why**, never what. No comment restates the line below it.
- ~40 lines per function, ~200 lines per file.
- Do not touch `prisma/schema.prisma`, `src/lib/agent/`, `evals/`, or `src/lib/coverage.ts`.
- The existing 93 tests must stay green throughout.

---

### Task 1: Detection logic

Two pure functions that read the agent's tool calls. No I/O, so this is the one task that is fully unit-testable and it is written test-first.

**Files:**
- Create: `src/lib/crawl-offer.ts`
- Test: `tests/crawl-offer.test.ts`

**Interfaces:**
- Consumes: `ToolCallRecord` from `src/lib/agent/index.ts` — `{ name: string; input: unknown; output: string }`. Import it as `import type`, so nothing from the agent is pulled in at runtime.
- Produces: `findNeighborhoodInTurn(userMessage: string, toolCalls: ToolCallRecord[]): string | null` and `hadEmptyResult(toolCalls: ToolCallRecord[]): boolean`, both used by Task 4.

- [X] **Step 1: Write the failing test**

Create `tests/crawl-offer.test.ts`:

```ts
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
```

- [X] **Step 2: Run the test to verify it fails**

```bash
docker compose exec web node --import tsx --test tests/crawl-offer.test.ts
```

Expected: FAIL — `Cannot find module '../src/lib/crawl-offer'`.

- [X] **Step 3: Write the implementation**

Create `src/lib/crawl-offer.ts`:

```ts
import type { ToolCallRecord } from "@/lib/agent";

function neighborhoodArgument(input: unknown): string | null {
  if (typeof input !== "object" || input === null) return null;
  const value = (input as Record<string, unknown>).neighborhood;
  if (typeof value !== "string" || value.trim() === "") return null;
  return value;
}

/**
 * The neighborhood a crawl may target for this turn, or null.
 *
 * Requiring the argument to appear in the user's own message is what replaces
 * the crawl button: without a click, a neighborhood the model inferred rather
 * than read would start spending on its own.
 */
export function findNeighborhoodInTurn(
  userMessage: string,
  toolCalls: ToolCallRecord[],
): string | null {
  const message = userMessage.toLowerCase();
  for (const call of toolCalls) {
    const neighborhood = neighborhoodArgument(call.input);
    if (!neighborhood) continue;
    if (message.includes(neighborhood.toLowerCase())) return neighborhood;
  }
  return null;
}

/** runTool stringifies every result, so an empty one is exactly "[]" or "null". */
export function hadEmptyResult(toolCalls: ToolCallRecord[]): boolean {
  return toolCalls.some((call) => call.output === "[]" || call.output === "null");
}
```

- [X] **Step 4: Run the test to verify it passes**

```bash
docker compose exec web node --import tsx --test tests/crawl-offer.test.ts
```

Expected: PASS, 12 tests.

- [X] **Step 5: Run the full checks**

```bash
docker compose exec web npx tsc --noEmit && docker compose exec web npm run lint && docker compose exec web npm test
```

Expected: no output from tsc, no lint errors, `# pass 105` (93 existing + 12 new).

- [X] **Step 6: Commit**

```bash
git add src/lib/crawl-offer.ts tests/crawl-offer.test.ts
git commit -m "Detect a crawlable neighborhood from a chat turn"
```

---

### Task 2: Extract the crawl eligibility check

`POST /api/crawl` currently holds the coverage check, the guardrails and the start call inline. `/api/chat` needs the same sequence in Task 4, so it moves to a module both call. Behaviour is unchanged — this is a refactor, verified by the route still returning the same status codes.

**Files:**
- Create: `src/lib/crawl-trigger.ts`
- Modify: `src/app/api/crawl/route.ts` (replaces lines 35–65 with a call)

**Interfaces:**
- Consumes: `getCoverage` from `@/lib/coverage`; `isRecentMiss`, `recordCrawlStarted`, `remainingCrawlsToday` from `@/lib/crawl-limits`; `startCrawl` from `@/lib/crawler`.
- Produces: `startCrawlIfEligible(neighborhood: string, limit?: number): Promise<CrawlTriggerResult>` and `DEFAULT_CRAWL_LIMIT`, used by Task 4.

**Note on tests:** this module does database and network I/O, and the repo has no mocking setup and may not gain a dependency. Pure logic gets unit tests; I/O glue is verified by running it. Do not invent a mocking layer for this.

**Deviation from the spec:** the spec lists both crawl routes as untouched. This task modifies `POST /api/crawl` anyway, because `/api/chat` needs the identical coverage-and-guardrail sequence in Task 4 and duplicating it would mean a future guardrail could be added to one path and not the other. The route's observable behaviour is unchanged — Step 3 verifies that.

- [X] **Step 1: Write the module**

Create `src/lib/crawl-trigger.ts`:

```ts
import { getCoverage, type Coverage } from "@/lib/coverage";
import { isRecentMiss, recordCrawlStarted, remainingCrawlsToday } from "@/lib/crawl-limits";
import { startCrawl } from "@/lib/crawler";
import { getLogger } from "@/lib/logger";

const log = getLogger("crawl-trigger");

// Small on purpose: a demo crawl should finish in about 90 seconds.
export const DEFAULT_CRAWL_LIMIT = 3;

export type CrawlTriggerResult =
  | { started: true; jobId: string; status: string }
  | { started: false; reason: "covered"; coverage: Coverage }
  | { started: false; reason: "recent-miss" }
  | { started: false; reason: "daily-cap" };

/**
 * The single gate between a neighborhood and money being spent. Both the crawl
 * route and the chat route go through here, so a guardrail added once applies
 * to every path.
 */
export async function startCrawlIfEligible(
  neighborhood: string,
  limit: number = DEFAULT_CRAWL_LIMIT,
): Promise<CrawlTriggerResult> {
  const coverage = await getCoverage(neighborhood);
  if (coverage.hasData) {
    log.info("refusing to crawl a covered neighborhood", {
      neighborhood,
      restaurants: coverage.restaurantCount,
    });
    return { started: false, reason: "covered", coverage };
  }

  if (isRecentMiss(neighborhood)) {
    return { started: false, reason: "recent-miss" };
  }

  if (remainingCrawlsToday() <= 0) {
    log.warn("daily crawl limit reached", { neighborhood });
    return { started: false, reason: "daily-cap" };
  }

  // In-flight duplicates are the crawler's job: it returns the existing jobId
  // for a neighborhood already queued or running.
  const job = await startCrawl(neighborhood, limit);
  recordCrawlStarted(job.jobId);
  log.info("crawl started", { neighborhood, jobId: job.jobId, limit });

  return { started: true, jobId: job.jobId, status: job.status };
}
```

- [X] **Step 2: Rewrite the crawl route to use it**

Replace the entire contents of `src/app/api/crawl/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { DEFAULT_CRAWL_LIMIT, startCrawlIfEligible } from "@/lib/crawl-trigger";
import { getLogger } from "@/lib/logger";

const log = getLogger("api/crawl");

const CrawlRequestSchema = z.object({
  neighborhood: z.string().min(1),
  limit: z.number().int().min(1).max(10).default(DEFAULT_CRAWL_LIMIT),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    log.warn("request body was not valid JSON", {
      reason: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = CrawlRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "neighborhood is required" }, { status: 400 });
  }
  const { neighborhood, limit } = parsed.data;

  const result = await startCrawlIfEligible(neighborhood, limit);

  if (result.started) {
    return NextResponse.json({ jobId: result.jobId, status: result.status }, { status: 202 });
  }

  if (result.reason === "covered") {
    return NextResponse.json(
      {
        error: `Already have ${result.coverage.restaurantCount} restaurants in ${neighborhood}`,
        coverage: result.coverage,
      },
      { status: 409 },
    );
  }

  if (result.reason === "recent-miss") {
    return NextResponse.json(
      { error: `A recent crawl of ${neighborhood} found nothing; not retrying today` },
      { status: 409 },
    );
  }

  return NextResponse.json({ error: "Daily crawl limit reached" }, { status: 429 });
}
```

- [X] **Step 3: Verify the route still behaves identically**

Start the app if it is not running, then check a covered neighborhood still gives 409:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3000/api/crawl -H 'Content-Type: application/json' -d '{"neighborhood":"Flushing"}'
```

Expected: `409`.

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3000/api/crawl -H 'Content-Type: application/json' -d '{}'
```

Expected: `400`.

- [X] **Step 4: Run the full checks**

```bash
docker compose exec web npx tsc --noEmit && docker compose exec web npm run lint && docker compose exec web npm test
```

Expected: clean, `# pass 105`.

- [X] **Step 5: Commit**

```bash
git add src/lib/crawl-trigger.ts src/app/api/crawl/route.ts
git commit -m "Extract crawl eligibility so chat and the crawl route share it"
```

---

### Task 3: Known neighborhoods endpoint

The chips in Task 5 need the neighborhoods we already have. Generated from the database — a hardcoded list here would undo `feat/unrestricted-neighborhood`.

**Files:**
- Create: `src/app/api/neighborhoods/route.ts`

**Interfaces:**
- Produces: `GET /api/neighborhoods` → `{ neighborhoods: string[] }`, consumed by Task 5.

- [ ] **Step 1: Write the route**

Create `src/app/api/neighborhoods/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const rows = await prisma.restaurant.findMany({
    distinct: ["neighborhood"],
    select: { neighborhood: true },
    orderBy: { neighborhood: "asc" },
  });

  return NextResponse.json({ neighborhoods: rows.map((row) => row.neighborhood) });
}
```

- [ ] **Step 2: Verify it returns what is actually seeded**

```bash
curl -s localhost:3000/api/neighborhoods
```

Expected: `{"neighborhoods":["Astoria","East Village","Flushing","Greenpoint","Harlem","Red Hook","Williamsburg"]}`

- [ ] **Step 3: Run the full checks**

```bash
docker compose exec web npx tsc --noEmit && docker compose exec web npm run lint && docker compose exec web npm test
```

Expected: clean, `# pass 105`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/neighborhoods/route.ts
git commit -m "Serve the neighborhoods we already have"
```

---

### Task 4: Wire detection into the chat route

Where the decision actually happens. **This is the task the Tokyo guarantee depends on** — the trigger goes in the route, never in `src/lib/agent/`.

**Files:**
- Modify: `src/app/api/chat/route.ts:48-54`

**Interfaces:**
- Consumes: `findNeighborhoodInTurn`, `hadEmptyResult` (Task 1); `startCrawlIfEligible` (Task 2).
- Produces: the `/api/chat` response gains two optional fields, consumed by Tasks 5 and 6:
  - `crawl?: { jobId: string; neighborhood: string }`
  - `needsNeighborhood?: true`

The decision table this implements:

| Neighborhood in turn | Covered | Empty result | Response carries |
|---|---|---|---|
| yes | no | either | `crawl` |
| yes | yes | — | nothing |
| no | — | yes | `needsNeighborhood` |
| no | — | no | nothing |

- [ ] **Step 1: Add the imports**

At the top of `src/app/api/chat/route.ts`, after the existing `runAgent` import:

```ts
import { findNeighborhoodInTurn, hadEmptyResult } from "@/lib/crawl-offer";
import { startCrawlIfEligible } from "@/lib/crawl-trigger";
```

- [ ] **Step 2: Replace the try block body**

Replace lines 48–54 (the `try { ... }` up to and including `return NextResponse.json(result);`) with:

```ts
  try {
    const result = await runAgent(message, parsed.data.history);
    log.info("chat request answered", {
      ms: Date.now() - started,
      toolCalls: result.toolCalls.map(tool => tool.name).join(", "),
    });

    const neighborhood = findNeighborhoodInTurn(message, result.toolCalls);

    if (neighborhood) {
      const trigger = await startCrawlIfEligible(neighborhood);
      if (trigger.started) {
        log.info("crawl started from a chat turn", { neighborhood, jobId: trigger.jobId });
        return NextResponse.json({
          ...result,
          crawl: { jobId: trigger.jobId, neighborhood },
        });
      }
      return NextResponse.json(result);
    }

    if (hadEmptyResult(result.toolCalls)) {
      return NextResponse.json({ ...result, needsNeighborhood: true });
    }

    return NextResponse.json(result);
  } catch (error) {
```

- [ ] **Step 3: Verify a covered neighborhood does not crawl**

```bash
curl -s -X POST localhost:3000/api/chat -H 'Content-Type: application/json' -d '{"message":"anything good in Flushing?"}' | head -c 400
```

Expected: a normal answer with **no** `crawl` and **no** `needsNeighborhood` field.

- [ ] **Step 4: Verify a missing restaurant asks for a neighborhood**

```bash
curl -s -X POST localhost:3000/api/chat -H 'Content-Type: application/json' -d '{"message":"is Fuzzy Wombat Diner any good?"}' | grep -o '"needsNeighborhood":true'
```

Expected: `"needsNeighborhood":true`.

- [ ] **Step 5: Run the full checks**

```bash
docker compose exec web npx tsc --noEmit && docker compose exec web npm run lint && docker compose exec web npm test
```

Expected: clean, `# pass 105`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "Start a crawl from a chat turn that found nothing"
```

---

### Task 5: Ask for a neighborhood in the UI

Renders the question and chips when the response carries `needsNeighborhood`. Chips **fill the composer** rather than sending, matching the existing `handleChipClick`, so every crawl traces to a message the user chose to send.

**Files:**
- Create: `src/components/NeighborhoodAsk.tsx`
- Modify: `src/components/ChatContainer.tsx`

**Interfaces:**
- Consumes: `GET /api/neighborhoods` (Task 3); the `needsNeighborhood` response field (Task 4).
- Produces: `NeighborhoodAsk` with props `{ neighborhoods: string[]; onPick: (neighborhood: string) => void }`.

- [ ] **Step 1: Write the component**

Create `src/components/NeighborhoodAsk.tsx`:

```tsx
"use client";

type NeighborhoodAskProps = {
  neighborhoods: string[];
  onPick: (neighborhood: string) => void;
};

export function NeighborhoodAsk({ neighborhoods, onPick }: NeighborhoodAskProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface p-4">
      <p className="text-sm text-foreground">
        I don&apos;t have that one. Which neighborhood is it in? I already know these,
        or type somewhere else and I&apos;ll go look it up.
      </p>
      <div className="flex flex-wrap gap-2">
        {neighborhoods.map((neighborhood) => (
          <button
            key={neighborhood}
            type="button"
            onClick={() => onPick(neighborhood)}
            className="rounded-full bg-background px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {neighborhood}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Hold the state in ChatContainer**

In `src/components/ChatContainer.tsx`, add to the imports:

```tsx
import { useEffect, useRef, useState } from "react";
import { NeighborhoodAsk } from "./NeighborhoodAsk";
```

Add inside `ChatContainer`, after the existing `useState` calls:

```tsx
  const [needsNeighborhood, setNeedsNeighborhood] = useState(false);
  const [knownNeighborhoods, setKnownNeighborhoods] = useState<string[]>([]);
  // The question that triggered the ask, so it can be re-offered once a crawl lands.
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/neighborhoods")
      .then((response) => response.json())
      .then((data) => setKnownNeighborhoods(data.neighborhoods ?? []))
      .catch(() => setKnownNeighborhoods([]));
  }, []);
```

- [ ] **Step 3: Set the flag when the response carries it**

In `handleSend`, immediately after `const toolCalls = ...`:

```tsx
      if (data.needsNeighborhood) {
        setNeedsNeighborhood(true);
        setPendingQuestion(text);
      } else {
        setNeedsNeighborhood(false);
      }
```

- [ ] **Step 4: Render it**

In the JSX, replace the `<Composer ... />` line with:

```tsx
        {needsNeighborhood && (
          <NeighborhoodAsk
            neighborhoods={knownNeighborhoods}
            onPick={handleChipClick}
          />
        )}
        <Composer
          ref={textareaRef}
          value={draft}
          onChange={setDraft}
          onSend={handleSend}
          disabled={isThinking}
        />
```

- [ ] **Step 5: Verify in the browser**

Open `http://localhost:3000`, ask `is Fuzzy Wombat Diner any good?`.

Expected: the answer, then the ask with seven chips. Clicking a chip fills the composer without sending.

- [ ] **Step 6: Run the full checks**

```bash
docker compose exec web npx tsc --noEmit && docker compose exec web npm run lint && docker compose exec web npm test
```

Expected: clean, `# pass 105`.

- [ ] **Step 7: Commit**

```bash
git add src/components/NeighborhoodAsk.tsx src/components/ChatContainer.tsx
git commit -m "Ask which neighborhood when a lookup finds nothing"
```

---

### Task 6: Show crawl progress and offer the re-ask

The payoff. Polls the already-built job route, which imports and embeds on success, then pre-fills the original question.

**Files:**
- Create: `src/components/CrawlProgress.tsx`
- Modify: `src/components/ChatContainer.tsx`

**Interfaces:**
- Consumes: the `crawl` response field (Task 4); `GET /api/crawl/:jobId`, which returns `{ jobId, status, progress? }` while running and `{ jobId, status, imported, restaurants }` on success.
- Produces: `CrawlProgress` with props `{ neighborhood: string; status: string; completed: number; total: number }`.

- [ ] **Step 1: Write the progress component**

Create `src/components/CrawlProgress.tsx`:

```tsx
"use client";

type CrawlProgressProps = {
  neighborhood: string;
  status: string;
  completed: number;
  total: number;
};

export function CrawlProgress({ neighborhood, status, completed, total }: CrawlProgressProps) {
  const label =
    status === "failed"
      ? `Couldn't find anything for ${neighborhood}.`
      : `Looking up ${neighborhood}… ${completed}/${total || "?"}`;

  return (
    <div className="rounded-lg bg-surface px-4 py-3 text-sm text-muted" aria-live="polite">
      {label}
    </div>
  );
}
```

- [ ] **Step 2: Track the pending crawl**

In `src/components/ChatContainer.tsx`, add the import:

```tsx
import { CrawlProgress } from "./CrawlProgress";
```

Add the type above `ChatContainer`:

```tsx
type PendingCrawl = {
  jobId: string;
  neighborhood: string;
  question: string;
  status: string;
  completed: number;
  total: number;
};
```

Add the state, next to the others:

```tsx
  const [pendingCrawl, setPendingCrawl] = useState<PendingCrawl | null>(null);
```

- [ ] **Step 3: Start tracking when a crawl begins**

In `handleSend`, next to the `needsNeighborhood` handling from Task 5:

```tsx
      if (data.crawl) {
        setNeedsNeighborhood(false);
        setPendingCrawl({
          jobId: data.crawl.jobId,
          neighborhood: data.crawl.neighborhood,
          question: pendingQuestion ?? text,
          status: "queued",
          completed: 0,
          total: 0,
        });
      }
```

- [ ] **Step 4: Poll until it finishes**

Add this effect after the `/api/neighborhoods` effect:

```tsx
  useEffect(() => {
    if (!pendingCrawl || pendingCrawl.status === "succeeded" || pendingCrawl.status === "failed") {
      return;
    }

    const jobId = pendingCrawl.jobId;
    let cancelled = false;

    const timer = setInterval(async () => {
      let job;
      try {
        const response = await fetch(`/api/crawl/${jobId}`);
        job = await response.json();
      } catch {
        return;
      }
      if (cancelled) return;

      setPendingCrawl((current) => {
        if (!current || current.jobId !== jobId) return current;
        return {
          ...current,
          status: job.status ?? current.status,
          completed: job.progress?.completed ?? current.completed,
          total: job.progress?.total ?? current.total,
        };
      });

      if (job.status === "succeeded") {
        // Cleared here, not just by the effect re-running, so a poll already in
        // flight cannot append the completion message a second time.
        clearInterval(timer);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `I've got ${pendingCrawl.neighborhood} now — want me to look at "${pendingCrawl.question}" again?`,
          },
        ]);
        setDraft(pendingCrawl.question);
        setPendingQuestion(null);
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pendingCrawl]);
```

- [ ] **Step 5: Render it**

Above the `needsNeighborhood` block from Task 5:

```tsx
        {pendingCrawl && pendingCrawl.status !== "succeeded" && (
          <CrawlProgress
            neighborhood={pendingCrawl.neighborhood}
            status={pendingCrawl.status}
            completed={pendingCrawl.completed}
            total={pendingCrawl.total}
          />
        )}
```

- [ ] **Step 6: Verify end to end in the browser**

Ask `is Fuzzy Wombat Diner any good?`, then send an uncovered neighborhood such as `Bushwick`.

Expected: progress appears and counts up; on success the assistant offers to look again and the composer is pre-filled with the original question; sending it returns an answer grounded in crawled data.

**Pinecone is eventually consistent** — if the re-ask returns nothing about the new restaurants, wait ten seconds and ask again before treating it as a bug.

- [ ] **Step 7: Run the full checks**

```bash
docker compose exec web npx tsc --noEmit && docker compose exec web npm run lint && docker compose exec web npm test
```

Expected: clean, `# pass 105`.

- [ ] **Step 8: Commit**

```bash
git add src/components/CrawlProgress.tsx src/components/ChatContainer.tsx
git commit -m "Show crawl progress and offer to re-answer once it lands"
```

---

### Task 7: Verify the eval and record the result

The eval is the point of this project, and this change makes its table writable by ordinary use. This task is not optional.

**Files:**
- Modify: `CLAUDE.md`, `docs/status.md`

- [ ] **Step 1: Run both corpora**

```bash
docker compose exec web npx tsx evals/runner.ts
```

Expected: **18/20** authored.

```bash
docker compose exec -e PINECONE_NAMESPACE=web-research web npx tsx evals/runner.ts
```

Expected: **20/20** independent, route and retrieval 20/20.

If a single golden fails, re-run that golden before treating it as a regression — G09 has been observed failing once and passing 3/3 on re-run with no code change.

- [ ] **Step 2: Confirm an eval run starts zero crawls**

The eval calls `runAgent` directly and never touches `/api/chat`, so no crawl should fire — including on G19, "best ramen shop in tokyo".

**Do not probe this by POSTing a crawl.** `POST /api/crawl` with an uncovered neighborhood *starts* a crawl; it does not report the budget. Probing with `{"neighborhood":"Tokyo"}` would spend a crawl and, if it succeeded, write Tokyo restaurants into the table the eval reads — causing the exact failure this step exists to detect.

Check structurally instead. First, that the agent cannot reach the trigger at all:

```bash
docker compose exec web grep -rn "crawl-trigger\|startCrawlIfEligible\|crawl-offer" src/lib/agent/ evals/ || echo "clean - no crawl trigger reachable from the agent or the eval"
```

Expected: `clean - no crawl trigger reachable from the agent or the eval`.

Then, that a full eval run wrote nothing. Record the count before Step 1 and again after:

```bash
docker compose exec -T db psql -U app -d restaurant_rag -c 'SELECT count(*) FROM "Restaurant";'
```

Expected: **identical** before and after. Any increase means a crawl fired during the eval — stop, because the trigger has leaked out of the route, and that is the one thing this design forbids.

- [ ] **Step 3: Record the numbers**

In `docs/status.md`, add a dated entry: what shipped, both corpus numbers before and after, and whether any golden moved. In `CLAUDE.md`, note that a chat turn can now start a crawl and that `evals/runner.ts` bypasses the route by design.

State the eval numbers you actually observed. Do not copy the expected numbers from this plan.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/status.md
git commit -m "Record eval results after wiring the in-chat crawl"
```

---

## Deferred

Recorded in the spec's Deferred table. Not part of this plan:

- The `dataset` column isolating the eval's rows from crawled ones.
- The coverage threshold (`isThin`) — Greenpoint and Red Hook stay at one restaurant each and cannot be topped up.
- Model-suggested chips for neighborhoods we do not have.
- Renaming `recordMiss` / `isRecentMiss`.
