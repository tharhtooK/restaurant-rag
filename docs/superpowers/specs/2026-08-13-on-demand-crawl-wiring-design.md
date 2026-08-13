# On-demand crawl — wiring the existing backend to the UI

> **Status** Design · **not built** · **Updated** 2026-08-13 · **Version** v1

Implements the consumer half of [`on-demand-crawl.md`](../../on-demand-crawl.md)
and Phase 1 + Step 8 of [`crawl-integration-plan.md`](../../crawl-integration-plan.md),
with two decisions those docs left open now closed.

**The rule is unchanged: check Postgres first, never crawl what we already have.**

---

## What already exists

Commit `4dd1ba3` built the whole spending side:

| Piece | File | State |
|---|---|---|
| Coverage check | `src/lib/coverage.ts` | built |
| Crawl proxy, guardrails | `src/app/api/crawl/route.ts` | built — 409 covered, 409 recent miss, 429 daily cap |
| Poll → import → embed | `src/app/api/crawl/[jobId]/route.ts` | built |
| Payload validation | `src/lib/crawler.ts` | built — zod at the network boundary |
| Import | `src/lib/import-crawl.ts`, `scripts/ingest/import-crawl.ts` | built |

**Nothing calls any of it.** There is no `/api/neighborhoods`, no gate, no
button, and `/api/chat` never checks coverage. This spec is the ignition, not
the engine.

## Decisions closed here

Two questions the earlier docs deferred:

1. **Trigger point.** Both an up-front gate *and* a reactive offer after an
   empty turn. `on-demand-crawl.md` §3 specified only the gate.
2. **Eval isolation.** The `dataset` column, deferred in `on-demand-crawl.md` §8
   on 2026-08-12, is **undeferred**. Rationale in §1 below.

---

## 1. Dataset isolation

### Why now

`on-demand-crawl.md` §8 deferred this on the grounds that crawled rows land in
the `Restaurant` table the eval reads. That was tolerable while crawling meant
running a script deliberately. This spec puts a button in the UI, so the eval's
input becomes mutable by anyone clicking it. `CLAUDE.md`: *anything that makes
the eval less meaningful is a bug, even if the app still works.*

The exposure is narrower than §8 feared, but not zero:

- The coverage guard only permits a crawl where `restaurantCount == 0`, so the
  five seeded neighborhoods **can never receive crawled rows**. That structurally
  protects the 17 goldens that name a neighborhood.
- The vector path is already isolated — crawled reviews go to the `crawled`
  namespace; the eval reads `default` and `web-research`.
- Of the three goldens with no neighborhood in the query, G16 (reservations) and
  G20 (wait time) grade on fields the schema deliberately lacks, so crawled rows
  cannot reach them.
- **G19 is live.** `POST /api/crawl` accepts any non-empty string and
  `getCoverage("Tokyo")` returns 0, so a demo crawl of "Tokyo" writes Tokyo
  restaurants into the eval's table and makes G19's out-of-scope refusal wrong.

Fixing G19 by rejecting non-NYC crawl targets would mean a server-side
allowlist — reintroducing exactly the hardcoded list that
`feat/unrestricted-neighborhood` removed. Scoping the eval is the fix that does
not walk that back.

### Schema

```prisma
model Restaurant {
  // ...
  dataset String @default("seed")

  @@index([dataset])
}
```

### Migration and backfill

`DEFAULT 'seed'` alone is **wrong** for the current database. Live state today is
20 seeded rows plus two already-crawled ones, which the default would mislabel
into the eval's view:

```
 Astoria 4 | East Village 4 | Flushing 5 | Harlem 3 | Williamsburg 4
 Greenpoint 1 | Red Hook 1        <- crawled by 4dd1ba3
```

Both crawled rows are identifiable by their review source (`gr-karczma` and
`re-hometown-bar-b-que`, 5 `crawled:%` reviews each, 0 other reviews), so the
migration backfills:

```sql
UPDATE "Restaurant" SET dataset = 'crawled'
WHERE id IN (SELECT DISTINCT "restaurantId" FROM "Review" WHERE source LIKE 'crawled:%');
```

**Known gap:** a crawled restaurant with zero reviews would stay `'seed'`. None
exists today. The verification step below is what catches it if one ever does —
do not assume the backfill was complete, check it.

`prisma/seed.ts` sets `dataset: "seed"` explicitly rather than leaning on the
column default, so a future default change cannot silently reclassify the corpus.
`import-crawl.ts` writes `dataset: "crawled"`.

### Scoping

`src/lib/dataset.ts` — pure, no I/O:

```ts
export function datasetWhere(): { dataset?: string }
```

Reads `RESTAURANT_DATASET`. Unset returns `{}`, so the app sees everything.

Applied in `buildWhere()` (`filter-restaurants.ts`) and `getRestaurantDetails()`.

**Not applied in `getCoverage()`.** Coverage decides whether to spend money, and
it must count crawled rows — otherwise a neighborhood we just fetched reads as
uncovered and gets crawled again on the next visit.

`evals/runner.ts` sets `process.env.RESTAURANT_DATASET ??= "seed"` at the top
rather than depending on a CLI flag. An env var you have to remember to pass is a
contaminated eval waiting to happen; `??=` still allows a deliberate override.

## 2. Read-only endpoints

```
GET /api/neighborhoods              -> { neighborhoods: string[] }
GET /api/coverage?neighborhood=...  -> { neighborhood, restaurantCount, hasData }
```

Both unscoped by dataset — crawled neighborhoods should appear as chips so a
user can return to one, and coverage must see them per §1.

`/api/neighborhoods` reads distinct values from Postgres, sorted. **Never
hardcode this list.**

`/api/coverage` exists so the UI can ask "do we have this?" without POSTing to
the endpoint that spends money.

## 3. Neighborhood gate

`src/components/NeighborhoodGate.tsx` (new), `ChatContainer.tsx` (state).

- Chips from `/api/neighborhoods`, plus a free-text input for anywhere else.
  Free text is required, not optional — naming a place we lack is the point.
- `ChatContainer` holds `neighborhood: string | null`; the gate renders while null.
- Once chosen, it stays visible with a way to change it.
- Coverage is checked **once on selection**, not per chat turn.
- `hasData: false` → empty state plus the crawl panel, shown before the user types.

## 4. Neighborhood into the agent

- `ChatRequestSchema` gains `neighborhood: z.string().optional()`.
- `runAgent(userMessage, history, options?: { neighborhood?: string })`.
- `system-prompt.ts` exports `buildSystemPrompt(neighborhood?)`, appending one
  line when present. `SYSTEM_PROMPT` stays exported as the no-neighborhood
  default.

**The neighborhood is optional everywhere.** `evals/runner.ts` calls
`runAgent(golden.query)` with none, and several goldens deliberately test
resolving a neighborhood out of free text. Making it required would invalidate
the eval.

No hard filtering of tool calls by neighborhood — a prompt hint is enough, and
filtering would break the comparison goldens that span two neighborhoods.

## 5. Reactive detection

`src/lib/crawl-offer.ts` — pure, no I/O:

```ts
export function findCrawlCandidate(
  userMessage: string,
  toolCalls: ToolCallRecord[],
): string | null
```

A tool call qualifies when **all three** hold:

1. its parsed `input` carries a non-empty `neighborhood` string;
2. that string appears **case-insensitively in the user's own message**;
3. its `output` is empty — `runTool` returns `JSON.stringify(result)`, so that
   means exactly `"[]"` or `"null"`.

`/api/chat` then calls `getCoverage()` on the result and attaches
`crawlOffer: { neighborhood }` only when `hasData` is false. Logic stays pure and
unit-tested; the I/O stays in the route, matching the split in `hours.ts` and
`scoring.ts`.

### Why condition 2

The gate's free-text box already lets a user's own typo through to the same
button, and `crawl-limits.ts` bounds that. What model extraction adds on top is a
*different* failure: the model naming a place the user never did. Requiring the
string to appear in the user's message targets that failure specifically.

- "what about Greenpoint?" → arg `Greenpoint`, present → offered.
- Model infers `Manhattan` from "downtown" → absent → honest answer, no button.
- "Flushig" → the user typed it, so it is offered, capped by `crawl-limits.ts`.

Rejected alternatives: a fuzzy did-you-mean (East Village and West Village are
four edits apart and both real, so it would misdirect on genuine input, and
collisions worsen as crawling grows the known list); restricting to the session
neighborhood (vacuous — coverage is neighborhood-level, so re-checking the gate's
own string returns the gate's own verdict); auto-crawling on an empty turn
(breaks *user decides to spend* and makes cost non-deterministic).

### Known limitation

`get_restaurant_details` takes `slug`/`name` and carries **no** `neighborhood`
argument, so a by-name miss ("is Karczma any good?") cannot be attributed to a
neighborhood and produces no crawl offer. Since crawling is neighborhood-scoped,
there is nothing to spend on for such a miss anyway. Named because the original
request said *"if restaurant not found"*: that half is covered only when the
question also names a neighborhood.

## 6. Crawl panel

`src/components/CrawlPanel.tsx` — one component, used by both the gate's empty
state and the reactive offer.

Click → `POST /api/crawl` → poll `GET /api/crawl/:jobId` every 2s → show
`progress.completed / progress.total` → on success re-check coverage and unlock.

Surfaces the real errors the route already returns: 409 covered, 409 recent miss,
429 daily cap. It never invents a fallback.

## 7. Tests

New, in the existing `node:test` + `tsx` style, no new dependency:

- `tests/dataset.test.ts` — env set/unset/override.
- `tests/crawl-offer.test.ts` — each of the three conditions failing
  independently; `"[]"` and `"null"` both count as empty; case-insensitive match;
  a tool with no neighborhood arg; the model-invented-neighborhood case.

The existing 93 tests must stay green.

## 8. Verification

Run, do not assert:

1. `npx tsc --noEmit`, `npm run lint`, `npm test`.
2. After the migration, confirm the backfill by inspection — every seeded
   neighborhood `'seed'`, Greenpoint and Red Hook `'crawled'`, nothing else:
   ```sql
   SELECT neighborhood, dataset, count(*) FROM "Restaurant" GROUP BY 1,2 ORDER BY 1;
   ```
3. **Both corpora must read 18/20 authored and 20/20 independent**, unchanged
   from today, with route and retrieval 20/20. This is the acceptance test for
   §1: if dataset scoping moves those numbers, the scoping is wrong.
4. End to end: pick an uncovered neighborhood at the gate, watch progress, then
   ask a question and get a grounded answer about a place the app did not know.
5. Re-run step 3 **after** that crawl. It must still read 18/20 and 20/20 — that
   is the proof the isolation works, and it is the check §8 of
   `on-demand-crawl.md` could not previously make.

Pinecone is eventually consistent. Do not measure retrieval immediately after an
upsert.

## Not building

- No `crawl_neighborhood` agent tool. Code decides eligibility, the user decides
  to spend. A tool would crawl for typos, for Tokyo, and on every retry.
- No fuzzy matching, no auto-crawl, no server-side neighborhood allowlist.
- No change to `crawl-limits.ts` — the daily cap and recent-miss memory already
  bound the spend.

## Follow-up, not in scope

`docs/README.md` needs a row for this spec, and `on-demand-crawl.md` §8 should be
marked resolved once §1 ships. Both files have uncommitted changes in the working
tree, so they are left alone here to avoid entangling this spec with in-flight
edits.
