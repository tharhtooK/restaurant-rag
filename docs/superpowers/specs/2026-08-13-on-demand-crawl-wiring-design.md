# On-demand crawl — in-chat, no button

> **Status** Design · **not built** · **Updated** 2026-08-13 · **Version** v4

The crawl happens **inside the conversation**. A lookup comes back empty, the
assistant asks which neighborhood, the crawl runs with progress in the thread,
and when it lands the user is asked whether to look again.

v4 is the deliberately simple version. Earlier drafts specced a neighborhood
gate, a crawl button, a `dataset` column and a coverage threshold; all are cut
and listed under [Deferred](#deferred) so they can be picked up later.

**The rule is unchanged: check Postgres first, never crawl what we already have.**

---

## What already exists

Commit `4dd1ba3` built the entire spending side, and **this spec changes none of
it**:

| Piece | File |
|---|---|
| Coverage check | `src/lib/coverage.ts` |
| Crawl proxy + guardrails | `src/app/api/crawl/route.ts` — 409 covered, 409 recent miss, 429 daily cap |
| Poll → import → embed | `src/app/api/crawl/[jobId]/route.ts` |
| Payload validation | `src/lib/crawler.ts` |
| Import | `src/lib/import-crawl.ts` |

Nothing calls any of it. This spec is the ignition, not the engine.

The crawler service is live, despite `crawler-service-spec.md` still reading
*not built* — `4dd1ba3` was verified against a real crawl.

## The flow

```
"is Karczma any good?"        → get_restaurant_details → null
        │
        ├─ no neighborhood in the turn → response carries needsNeighborhood
        │     UI: "I don't have that one. Which neighborhood is it in?"
        │     + chips of neighborhoods we already have
        │
   user sends "Greenpoint"
        │
        ├─ tool arg neighborhood="Greenpoint", present in the message,
        │  getCoverage → no data → route POSTs the crawl
        │
        ├─ response carries crawl: { jobId, neighborhood }
        │     UI renders inline progress, polling GET /api/crawl/:jobId
        │
   job succeeds → that route imports + embeds (already built)
        │
        └─ UI: "Greenpoint is ready — want me to look at
           'is Karczma any good?' again?" and pre-fills the composer.
           The user sends it. Normal turn, now grounded.
```

Consent is the user naming a neighborhood, not a click. This overrides
`on-demand-crawl.md` §2 and §3, which put the decision on a button behind an
up-front gate. **What that gives up:** the daily cap and the 24h miss memory in
`crawl-limits.ts` are now the entire budget rather than backstops behind a human.

### No new server state

The client holds the thread, so it remembers which question triggered the crawl
and pre-fills it on completion. The browser is the poller, and
`GET /api/crawl/:jobId` already imports idempotently (`isImported` /
`markImported`). Nothing has to survive between requests.

Close the tab mid-crawl and the job never imports; the crawler still holds it, so
`npx tsx scripts/ingest/import-crawl.ts <jobId>` recovers it.

## Detection

`src/lib/crawl-offer.ts` — pure, no I/O, the only real logic in this spec:

```ts
export function findNeighborhoodInTurn(
  userMessage: string,
  toolCalls: ToolCallRecord[],
): string | null;

export function hadEmptyResult(toolCalls: ToolCallRecord[]): boolean;
```

`findNeighborhoodInTurn` returns a neighborhood when some tool call's parsed
`input` carries a non-empty `neighborhood` string **that also appears
case-insensitively in the user's own message**.

`hadEmptyResult` is true when any call's `output` is empty. `runTool` returns
`JSON.stringify(result)`, so that means exactly `"[]"` or `"null"`.

`/api/chat` combines them after `runAgent` returns:

| Neighborhood in turn | Covered | Empty result | Response carries |
|---|---|---|---|
| yes | no | either | `crawl` — start it |
| yes | yes | — | nothing |
| no | — | yes | `needsNeighborhood` |
| no | — | no | nothing |

### Why the substring condition

With no button, a model-invented neighborhood would spend money on its own
rather than produce an unclicked button. Requiring the string to appear in the
user's message targets exactly that:

- "what about Greenpoint?" → arg `Greenpoint`, present → crawl.
- Model infers `Manhattan` from "downtown" → absent → no crawl.
- "Flushig" → the user typed it, so it crawls; bounded by the daily cap.

## The Tokyo problem

"best ramen shop in tokyo" yields a tool call with `neighborhood: "tokyo"`,
present in the message, and `getCoverage("Tokyo")` returns 0 — so it starts a
crawl. Removing the button removed the human who would not have clicked.

**The eval is structurally safe.** `evals/runner.ts:40` calls `runAgent`
directly, never `/api/chat`. Because the trigger lives in the route and not in
the agent, no eval run can spend. *Load-bearing: never move the crawl trigger
into `src/lib/agent/`.*

**A real user asking it spends once**, bounded three ways: the crawler's `city`
defaults to New York so a Tokyo crawl returns nothing and the job fails; a failed
job is remembered for 24h; the daily cap holds regardless.

An allowlist would prevent it outright and is rejected — it reintroduces the
hardcoded neighborhood list `feat/unrestricted-neighborhood` deleted.

## Files

New:

- `src/lib/crawl-offer.ts` — the two pure functions above.
- `src/app/api/neighborhoods/route.ts` — `GET` → distinct neighborhoods from
  Postgres, sorted, for the chips. **Never hardcode this list.**
- `src/components/CrawlProgress.tsx` — passive. Neighborhood,
  `progress.completed / progress.total`, terminal state. Surfaces the real errors
  the routes already return (409, 429) and never invents a fallback.

Edited:

- `src/app/api/chat/route.ts` — run the decision table, start the crawl by
  calling the existing `POST /api/crawl` logic, add `crawl` and
  `needsNeighborhood` to the response.
- `src/components/ChatContainer.tsx` — the pending crawl (jobId, neighborhood,
  the question that triggered it), the poll loop, and the chips.

Chips **fill the composer** rather than send, matching the existing
`handleChipClick`. Every crawl then traces to a message the user chose to send,
and no "awaiting neighborhood" state machine is needed.

Also edited, though v4 wrongly claimed otherwise:

- `src/lib/agent/system-prompt.ts` — see "Detection depends on the prompt" below.
- `src/app/api/crawl/route.ts` — the coverage-and-guardrail sequence moved to
  `src/lib/crawl-trigger.ts` so `/api/chat` shares one gate rather than
  duplicating it. Observable behaviour unchanged.

Untouched: the schema, `coverage.ts`, `crawl-limits.ts`, and `evals/`.

### Detection depends on the prompt

**Reading the neighborhood out of tool arguments is not sufficient on its own,
and v4 was wrong to assume it was.** `SYSTEM_PROMPT` listed the five
neighborhoods and told the agent to declare anything else out of scope, so the
agent refused *without calling any tool*. Measured 2026-08-13: "any good spots in
Bushwick?", "any vegan places in Bushwick?", a bare "Bushwick" reply and "whats
the best ramen shop in tokyo" all produced **zero** tool calls.

So `findNeighborhoodInTurn` could only ever see neighborhoods the agent
considered in scope — which are exactly the covered ones, which
`startCrawlIfEligible` then correctly refuses. The crawl was unreachable by
construction.

The fix is one paragraph in the Scope section: call `filter_restaurants` with the
unknown neighborhood and use the empty result as confirmation before refusing.
That also matches intent already recorded in `CLAUDE.md` — the enum was removed
from the tool schema so the agent could ask for anywhere and get an empty result
rather than a validation error; the prompt had not caught up.

**This is what makes the Tokyo problem real.** Before the change, G19 produced no
tool call and therefore could not spend. After it, G19 calls
`filter_restaurants` with `neighborhood: "Tokyo"`. The bounds in that section
apply, and eval runs still cannot spend because `runner.ts` calls `runAgent`
directly.

## Tests

`tests/crawl-offer.test.ts`, in the existing `node:test` + `tsx` style:

- `findNeighborhoodInTurn` — arg absent; arg present but not in the message (the
  model-invented case); case differing between message and arg; no tool carrying
  a neighborhood.
- `hadEmptyResult` — `"[]"`, `"null"`, and a populated result.
- The four-row decision table.

The existing 93 tests must stay green.

## Verification

1. `npx tsc --noEmit`, `npm run lint`, `npm test`.
2. **Both corpora still read 18/20 authored and 20/20 independent**, route and
   retrieval 20/20. Nothing here should move them — the agent is untouched.
3. Confirm a full eval run starts **zero** crawls, with G19 in it. This is the
   Tokyo guarantee.
4. Ask about a restaurant we do not have, no neighborhood named → the ask
   appears with chips.
5. Answer with an uncovered neighborhood → progress renders, the job imports, the
   completion prompt pre-fills the original question, and re-sending it answers
   from crawled data.
6. Answer with a covered neighborhood → no crawl starts.
7. Re-run step 2 after that crawl and record any movement. With no `dataset`
   column this is the only thing standing between a crawl and the eval, so it is
   not optional.

Pinecone is eventually consistent. Do not measure retrieval immediately after an
upsert.

## Deferred

Cut for simplicity, each with the reason it is survivable for now:

| Cut | Why it is OK for now | What it costs |
|---|---|---|
| ~~**`dataset` column**~~ **SHIPPED 2026-08-13** | — | Undeferred and built after a Bushwick crawl took the table from 22 rows to 25. `Restaurant.dataset` is `seed` or `crawled`; `datasetWhere()` scopes `buildWhere` and `getRestaurantDetails` by `RESTAURANT_DATASET`, which `evals/runner.ts` sets itself. Measured: unset 25 restaurants, `seed` 20, `crawled` 5. Both corpora unmoved. |
| **Coverage threshold** (`isThin`) | The core flow only needs coverage 0. | Greenpoint and Red Hook are stuck at 1 restaurant each and can never be topped up, because `hasData` is already true. |
| **Model-suggested chips** | Chips of what we already have still redirect the user usefully. | Every suggestion is covered, so picking one never crawls. To crawl, the user types a neighborhood themselves. |
| **`recordMiss` rename** | Its current meaning is still accurate while nothing else writes it. | Nothing yet. |
| **Up-front gate, crawl button** | Replaced by the in-chat flow. | Nothing — deliberately removed. |

## Follow-up, not in scope

`docs/README.md` needs a row for this spec; `on-demand-crawl.md` §2 and §3 are
superseded by the flow above; `crawler-service-spec.md` is marked *not built* but
is live. All have uncommitted changes in the working tree, so they are left
alone here.
