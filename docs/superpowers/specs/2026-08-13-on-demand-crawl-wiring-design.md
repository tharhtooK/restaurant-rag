# On-demand crawl — in-chat, no crawl button

> **Status** Design · **not built** · **Updated** 2026-08-13 · **Version** v3

Implements the consumer half of [`on-demand-crawl.md`](../../on-demand-crawl.md).
The crawl happens **inside the conversation**: a lookup comes back empty, the
assistant asks which neighborhood, the crawl runs with progress in the thread,
and when it lands the user is asked whether to look again.

**The rule is unchanged: check Postgres first, never crawl what we already have.**

v3 replaces the up-front neighborhood gate and the crawl button from v1/v2. Both
are gone.

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

**Nothing calls any of it.** This spec is the ignition, not the engine.

The crawler service is also real, despite `crawler-service-spec.md` still reading
*Status: Design · not built* — `4dd1ba3` was verified against a live crawl. Treat
its §3 API as a shipped contract.

## Decisions closed here

1. **Eval isolation.** The `dataset` column, deferred in `on-demand-crawl.md` §8,
   is **undeferred** (§1).
2. **Crawl unit stays the neighborhood** — not a query or a restaurant name (§2).
3. **Coverage becomes a threshold, not `> 0`.** Overrides `on-demand-crawl.md`
   §1 (§2).
4. **No user-facing crawl control.** Overrides `on-demand-crawl.md` §2 and §3 —
   there is no button and no up-front gate. Consent is the user naming a
   neighborhood in conversation (§4).

---

## 1. Dataset isolation

### Why now

`on-demand-crawl.md` §8 deferred this because crawled rows land in the
`Restaurant` table the eval reads. That was tolerable while crawling meant
running a script deliberately. Here a crawl fires from a chat turn, so the
eval's input becomes mutable by ordinary use. `CLAUDE.md`: *anything that makes
the eval less meaningful is a bug, even if the app still works.*

Exposure, precisely:

- The coverage guard only permits a crawl below the threshold, and all five
  seeded neighborhoods sit well above it, so they **cannot receive crawled
  rows**. That structurally protects the 17 goldens naming a neighborhood.
- The vector path is already isolated — crawled reviews go to the `crawled`
  namespace; the eval reads `default` and `web-research`.
- Of the three goldens with no neighborhood, G16 (reservations) and G20 (wait
  time) grade on fields the schema deliberately lacks, so crawled rows cannot
  reach them.
- **G19 ("best ramen shop in tokyo") is the live one.** See §7 — it is why the
  crawl trigger must live in the route and never in the agent.

Rejecting non-NYC crawl targets would mean a server-side allowlist,
reintroducing the hardcoded list `feat/unrestricted-neighborhood` removed.
Scoping the eval is the fix that does not walk that back.

### Schema

```prisma
model Restaurant {
  // ...
  dataset String @default("seed")

  @@index([dataset])
}
```

### Migration and backfill

`DEFAULT 'seed'` alone is **wrong** for the current database. Live state is 20
seeded rows plus two already-crawled ones, which the default would mislabel into
the eval's view:

```
 Astoria 4 | East Village 4 | Flushing 5 | Harlem 3 | Williamsburg 4
 Greenpoint 1 | Red Hook 1        <- crawled by 4dd1ba3
```

Both crawled rows are identifiable by review source (`gr-karczma` and
`re-hometown-bar-b-que`, 5 `crawled:%` reviews each, 0 others):

```sql
UPDATE "Restaurant" SET dataset = 'crawled'
WHERE id IN (SELECT DISTINCT "restaurantId" FROM "Review" WHERE source LIKE 'crawled:%');
```

**Known gap:** a crawled restaurant with zero reviews would stay `'seed'`. None
exists today. §9 step 2 is what catches it if one ever does — do not assume the
backfill was complete, check it.

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

**Not applied in `getCoverage()`** — coverage decides whether to spend and must
count crawled rows, or a neighborhood we just fetched reads as uncovered and gets
crawled again.

`evals/runner.ts` sets `process.env.RESTAURANT_DATASET ??= "seed"` at the top
rather than depending on a CLI flag. An env var you must remember to pass is a
contaminated eval waiting to happen; `??=` still allows a deliberate override.

## 2. Crawl granularity and the coverage threshold

### The crawl unit stays the neighborhood

`POST /crawl` takes `neighborhood` (required), `city`, `limit`,
`maxReviewsPerRestaurant`, `sources`. No query or name parameter, so
query-driven crawling is a cross-repo API change. It is also the wrong shape:

- **Coverage is only cheaply answerable per neighborhood.** `getCoverage()` is a
  `COUNT`; "do we have data for *cheap korean bbq*?" has no equivalent without
  judging whether existing rows are good enough.
- **Queries are an infinite key space.** Dedup and the daily cap both assume a
  finite set of targets.
- **Crawls amortize.** One Greenpoint crawl answers every future Greenpoint
  question.
- **Slugs are neighborhood-prefixed by contract** (`bw-robertas`) and must be
  stable across re-crawls.

The eval is *not* a reason here — once §1 lands, a query crawl's results would be
tagged `crawled` and stay out of the eval's view.

### Why `> 0` is not enough

Live data shows the cost of `on-demand-crawl.md` §1's "one row is enough":

```
 Greenpoint 1 | Red Hook 1
```

Under that rule Greenpoint can **never be crawled again**, so every Greenpoint
question beyond its single restaurant fails permanently.

§1 rejected a thin tier because *"deciding whether existing data is good enough
is a judgement call."* That argument is about **quality**. A restaurant count
read from env is the same shape as the existing `CRAWLS_PER_DAY` cap: one number,
no judgement.

**Be honest about what this gives up.** It is a partial top-up, which §1 said no
to, and it adds a second way to spend on a neighborhood we already have rows for.
The bound is the 24h memory below plus the daily cap.

### Shape

```ts
export type Coverage = {
  neighborhood: string;
  restaurantCount: number;
  hasData: boolean;   // > 0            — we can answer at all
  isThin: boolean;    // < the threshold — a crawl or top-up is allowed
};
```

`CRAWL_MIN_RESTAURANTS`, default **3**, matching `DEFAULT_LIMIT` in
`src/app/api/crawl/route.ts` — asking for 3 and then treating 3 as thin loops.

`POST /api/crawl` rejects with 409 when `!isThin`, replacing today's check on
`hasData`. Every other guardrail is untouched.

### Not re-crawling forever

`crawl-limits.ts` already holds a neighborhood-keyed 24h map with the right TTL.
It is only written today when a job **fails** (`[jobId]/route.ts:20`), and per
the crawler contract a job only fails when it returns no restaurants at all.

After a successful import, re-check coverage; if it is **still thin**, record it.
One extra call site, no new mechanism.

That widens the meaning of the existing names beyond "found nothing", so rename
`recordMiss` → `recordUnproductiveCrawl` and `isRecentMiss` →
`wasRecentlyUnproductive`. Three call sites.

## 3. Endpoints

```
GET /api/neighborhoods -> { neighborhoods: string[] }
```

Distinct values from Postgres, sorted, unscoped by dataset so crawled
neighborhoods appear too. **Never hardcode this list.** Used for the suggestion
chips in §4.

No `GET /api/coverage` — with the gate gone, nothing in the UI asks about
coverage on its own; `/api/chat` checks it server-side as part of a turn.

`POST /api/crawl` and `GET /api/crawl/:jobId` are unchanged apart from the §2
threshold.

## 4. The in-chat flow

No gate, no button. A normal chat turn, with three possible additions to the
response.

```
"is Karczma any good?"        → get_restaurant_details → null
        │
        ├─ no neighborhood identifiable → response carries needsNeighborhood
        │     UI appends: "I don't have that one. Which neighborhood is it in?"
        │     + chips: covered neighborhoods first, then suggestions
        │
   user sends "Greenpoint"
        │
        ├─ tool arg neighborhood="Greenpoint", present in the message,
        │  getCoverage → isThin → route starts the crawl
        │
        ├─ response carries crawl: { jobId, neighborhood }
        │     UI renders inline progress, polling GET /api/crawl/:jobId
        │
   job succeeds → that route imports + embeds (already built)
        │
        └─ UI appends: "Greenpoint is ready — want me to look at
           'is Karczma any good?' again?" and pre-fills the composer.
           The user sends it. Normal turn, now grounded.
```

### Why this needs no new server state

The client already holds the thread, so it remembers which question triggered
the crawl and pre-fills it on completion. The browser is the poller, and
`GET /api/crawl/:jobId` already imports idempotently via `isImported` /
`markImported`. Nothing has to survive between requests.

**Tradeoff:** close the tab mid-crawl and the job never imports. The crawler
still holds the result, so `npx tsx scripts/ingest/import-crawl.ts <jobId>`
recovers it. The crawl still counted against the day's cap.

### The ask, and its suggestions

Wording is **code-templated**, so it is deterministic and testable. Chips are
covered neighborhoods from `/api/neighborhoods` **first** — picking one redirects
the user to data we already have, with no spend — followed by model-suggested
crawlable neighborhoods.

The model supplying the second group is what keeps a list of NYC neighborhoods
out of our code; hardcoding candidates would undo
`feat/unrestricted-neighborhood`. It costs nothing, because code still decides
the spend after the user picks.

**Ships in two steps:** covered-neighborhood chips first, model suggestions
second. The first step is useful alone.

Chips **fill the composer** rather than sending, matching the existing
`handleChipClick` in `ChatContainer.tsx`. The user still presses send, so every
crawl traces to a message they chose to send — and the reply is an ordinary turn
needing no "awaiting neighborhood" state machine.

## 5. Detection

`src/lib/crawl-offer.ts` — pure, no I/O:

```ts
export function findNeighborhoodInTurn(
  userMessage: string,
  toolCalls: ToolCallRecord[],
): string | null;

export function hadEmptyResult(toolCalls: ToolCallRecord[]): boolean;
```

`findNeighborhoodInTurn` returns a neighborhood when some tool call's parsed
`input` carries a non-empty `neighborhood` string **that appears
case-insensitively in the user's own message**.

`hadEmptyResult` is true when any call's `output` is empty — `runTool` returns
`JSON.stringify(result)`, so exactly `"[]"` or `"null"`.

`/api/chat` combines them:

| Neighborhood found | `isThin` | Empty result | Response carries |
|---|---|---|---|
| yes | yes | either | `crawl` — start it |
| yes | no | — | nothing |
| no | — | yes | `needsNeighborhood` — ask |
| no | — | no | nothing |

**The empty-result condition is deliberately not required for the crawl row.**
Greenpoint has one restaurant, so a Greenpoint query returns one result, not
zero — requiring emptiness would make thin neighborhoods uncrawlable, which is
the §2 bug all over again.

### Why the substring condition

Without a button, a model-invented neighborhood spends money on its own instead
of producing an unclicked button. Requiring the string to appear in the user's
message targets exactly that failure:

- "what about Greenpoint?" → arg `Greenpoint`, present → crawl.
- Model infers `Manhattan` from "downtown" → absent → no crawl.
- "Flushig" → the user typed it, so it crawls; bounded by §2's 24h memory and
  the daily cap.

Rejected: fuzzy did-you-mean (East Village and West Village are four edits apart
and both real); auto-crawling on any empty turn regardless of source.

## 6. What the user sees

`src/components/CrawlProgress.tsx` — passive, not a control. Renders inline in
the thread: neighborhood, `progress.completed / progress.total`, and a terminal
state. It surfaces the real errors the routes already return (409 covered, 409
recently unproductive, 429 daily cap) and never invents a fallback.

`ChatContainer.tsx` gains: the pending crawl (jobId, neighborhood, the question
that triggered it), the poll loop, and rendering for `needsNeighborhood` chips.

## 7. The Tokyo problem

"best ramen shop in tokyo" produces a tool call with `neighborhood: "tokyo"`,
present in the user's message, and `getCoverage("Tokyo")` returns 0 — so under
§5 it starts a crawl. Removing the button removed the human who would not have
clicked it.

**The eval is structurally safe.** `evals/runner.ts:40` calls `runAgent`
directly, never `/api/chat`. Because the trigger lives in the route and not in
the agent, no eval run can spend money. *This is load-bearing: never move the
crawl trigger into `src/lib/agent/`.*

**A real user asking it does spend once.** Accepted, and bounded three ways: the
crawler's `city` defaults to New York, so a Tokyo crawl returns nothing and the
job fails; a failed job records the neighborhood for 24h, so it is not retried;
and the daily cap bounds the worst case regardless. Cost is one wasted crawl per
bogus term per day.

An allowlist would prevent it outright and is rejected — it reintroduces the
hardcoded neighborhood list `feat/unrestricted-neighborhood` deleted.

## 8. Tests

`node:test` + `tsx`, no new dependency:

- `tests/dataset.test.ts` — env set/unset/override.
- `tests/coverage.test.ts` — `isThin` below, exactly at, and above
  `CRAWL_MIN_RESTAURANTS`; the env default.
- `tests/crawl-offer.test.ts` — `findNeighborhoodInTurn` with the arg absent,
  the arg present but not in the message (the model-invented case), case
  differing between message and arg, and no tool carrying a neighborhood;
  `hadEmptyResult` for `"[]"`, `"null"`, and a populated result.
- The four-row decision table in §5, as a unit test over the pure functions.

The existing 93 tests must stay green.

## 9. Verification

Run, do not assert:

1. `npx tsc --noEmit`, `npm run lint`, `npm test`.
2. After the migration, confirm the backfill — seeded neighborhoods `'seed'`,
   Greenpoint and Red Hook `'crawled'`, nothing else:
   ```sql
   SELECT neighborhood, dataset, count(*) FROM "Restaurant" GROUP BY 1,2 ORDER BY 1;
   ```
3. **Both corpora must read 18/20 authored and 20/20 independent**, unchanged,
   route and retrieval 20/20. This is the acceptance test for §1.
4. Confirm an eval run starts **zero** crawls — check the crawler's logs across a
   full run, with G19 in it. This is the §7 guarantee.
5. Ask about a restaurant we do not have, with no neighborhood named: the ask
   appears, covered chips first.
6. Answer with an uncovered neighborhood: progress renders, the job imports, the
   completion prompt pre-fills the original question, and re-sending it answers
   from crawled data.
7. Re-run step 3 **after** that crawl. Still 18/20 and 20/20 — the proof §1
   works, and the check `on-demand-crawl.md` §8 could not previously make.
8. Answer with a covered neighborhood: no crawl starts.
9. Trigger a crawl that leaves coverage still thin; confirm it is not retried.

Pinecone is eventually consistent. Do not measure retrieval immediately after an
upsert.

## Not building

- No crawl button, no up-front neighborhood gate, no admin control.
- No `crawl_neighborhood` agent tool, and **no crawl trigger inside the agent at
  all** — §7 depends on this.
- No `neighborhood` parameter threaded into `runAgent`. With the gate gone there
  is no session neighborhood; `SYSTEM_PROMPT` is unchanged, so the eval's call
  path is untouched.
- No query- or name-targeted crawl (§2).
- No fuzzy matching, no server-side allowlist, no quality-based coverage
  judgement.

## Follow-up, not in scope

`docs/README.md` needs a row for this spec. `on-demand-crawl.md` needs §1's
`> 0` rule marked superseded by §2 here, §2 and §3's button-and-gate flow marked
superseded by §4, and §8 marked resolved. `crawler-service-spec.md` is still
marked *not built* but is live. All have uncommitted changes in the working tree,
so they are left alone here.
