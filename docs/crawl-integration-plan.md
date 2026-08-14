# Crawl integration — step-by-step plan for this repo

> **Status** Design · **not built** — implements on-demand-crawl.md here · **Updated** 2026-08-12 · **Version** v1

Implements [`on-demand-crawl.md`](on-demand-crawl.md) inside `restaurant-rag`.
Paste a step at a time. Do not batch them; each one ends in a working app.

**Phase 1 needs no crawler.** Steps 1–5 give a working neighborhood gate and an
honest "I don't have that yet" — build and demo this before the other repo
exists. Phase 2 wires the crawl in.

---

## The one thing that must not break

`evals/runner.ts` calls `runAgent(golden.query)` with **no neighborhood**, and
several goldens deliberately test resolving a neighborhood out of free text
("cheap korean bbq in flushing", "somewhere in williamsburg for vegan food").

So the neighborhood parameter is **optional everywhere**. When absent, the agent
behaves exactly as it does today. Making it required would invalidate the eval,
which is the point of the project.

After every step: `npm test`, `npx tsc --noEmit`, `npm run lint`. After steps 4
and 9, also run both corpora and confirm **18/20 authored / 20/20 independent**,
route and retrieval 20/20.

---

# Phase 1 — the gate

## Step 1 — Coverage module

**Goal.** One function answering "do we have this neighborhood?"

**Files.** `src/lib/coverage.ts`

```ts
export type Coverage = {
  neighborhood: string;
  restaurantCount: number;
  hasData: boolean;      // restaurantCount > 0
};

export async function getCoverage(neighborhood: string): Promise<Coverage>
```

Case-insensitive match, mirroring `buildWhere` in `filter-restaurants.ts`. A
`count`, not a `findMany` — do not pull rows to check existence.

**Accept.** A throwaway script prints `hasData: true` for `"east village"` and
`"EAST VILLAGE"`, `false` for `"Bushwick"`. Delete the script after.

## Step 2 — Known neighborhoods endpoint

**Goal.** The UI needs to show what we already have, generated from data.

**Files.** `src/app/api/neighborhoods/route.ts`

`GET` → `{ "neighborhoods": ["Astoria", "East Village", ...] }`, distinct,
sorted. Read from Postgres. **Never hardcode this list** — a hardcoded list in
the UI would undo the enum removal from `feat/unrestricted-neighborhood`.

**Accept.** `curl localhost:3000/api/neighborhoods` returns the five currently
seeded.

## Step 3 — Neighborhood gate in the UI

**Goal.** Ask before the chat is usable.

**Files.** `src/components/NeighborhoodGate.tsx` (new),
`src/components/ChatContainer.tsx` (holds the state)

- chips from `/api/neighborhoods`, plus a free-text input for anywhere else
- `ChatContainer` keeps `neighborhood: string | null`; render the gate while null
- once chosen, show it somewhere persistent with a way to change it

Free text is required, not optional: the whole point is that the user can name a
place we do not have.

**Accept.** Reload → gate. Pick a chip → chat appears. Change it → gate returns.
Type "Bushwick" → accepted, chat appears.

## Step 4 — Thread the neighborhood into the agent

**Goal.** The agent knows where the user is, without the eval changing.

**Files.** `src/app/api/chat/route.ts`, `src/lib/agent/index.ts`,
`src/lib/agent/system-prompt.ts`, `src/components/ChatContainer.tsx`

- chat request zod schema gains `neighborhood: z.string().optional()`
- `runAgent(userMessage, history, options?: { neighborhood?: string })`
- `system-prompt.ts` exports `buildSystemPrompt(neighborhood?)` which appends one
  line when present, e.g. *"The user is in Bushwick. Prefer it unless they name
  somewhere else."* Keep `SYSTEM_PROMPT` as the no-neighborhood default so
  nothing else has to change.

Do not filter tool calls by neighborhood in code. The agent already passes
`neighborhood` to `filter_restaurants`; a hint in the prompt is enough, and hard
filtering would break comparison goldens that span two neighborhoods.

**Accept.** `npm test`, `tsc`, `lint`, **and both eval corpora at their expected
numbers** — this is the step that could silently break them.

## Step 5 — Surface coverage in the chat response

**Goal.** The UI can tell the user we have nothing for their neighborhood.

**Files.** `src/app/api/chat/route.ts`, `src/components/ChatContainer.tsx`,
`src/components/MessageList.tsx`

- when the request carries a `neighborhood`, call `getCoverage` and include
  `coverage: { neighborhood, hasData }` in the response
- when `hasData` is false, the UI shows an empty state: *"I don't have Bushwick
  yet"* with a **disabled** `Fetch data for Bushwick` button

Better: run the coverage check when the neighborhood is chosen (Step 3) rather
than on every chat turn, and show the empty state before the user types at all.
One query per session instead of one per message.

**Accept.** Choosing "Bushwick" shows the empty state. Choosing "Flushing" goes
straight to chat with no crawl offer.

---

# Phase 2 — the crawl

Needs the crawler service from [`crawler-service-spec.md`](crawler-service-spec.md)
running and reachable.

## Step 6 — Crawl proxy routes

**Goal.** Talk to the crawler without leaking its key to the browser.

**Files.** `src/app/api/crawl/route.ts`, `src/app/api/crawl/[jobId]/route.ts`

```
POST /api/crawl        { neighborhood }  -> 202 { jobId }
GET  /api/crawl/:jobId                   -> { status, progress, imported? }
```

`CRAWLER_URL` and `CRAWLER_API_KEY` from env, validated in the lazy-getter style
already used by `getPineconeIndex` — importing must not throw.

Guardrails on `POST`, all cheap:

- reject with 409 if `getCoverage(...).hasData` — we already have it
- dedupe in-flight jobs by neighborhood
- remember misses so a typo is not retried for 24h
- cap crawls per day from env

**Accept.** `POST` with a covered neighborhood returns 409. With an uncovered one
it returns a jobId. No route works without the server-side key set.

## Step 7 — Import script

**Goal.** Turn a crawler payload into rows and vectors.

**Files.** `scripts/ingest/import-crawl.ts`

```
npx tsx scripts/ingest/import-crawl.ts <jobId>
npx tsx scripts/ingest/import-crawl.ts --from-file fixtures/bushwick.json
```

1. fetch the job result (or read the file)
2. **validate with zod** — the payload crosses a network boundary from another
   repo; treat it as untrusted. Reject a restaurant missing any of the seven
   `hours` keys rather than writing a half-record.
3. upsert `Restaurant` by `slug`
4. insert `Review` rows with `source: "crawled:<source>"`
5. shell out to the existing `embed-upsert.ts` for the `crawled` namespace — do
   not reimplement chunking or embedding

`--from-file` is the demo fallback: same code path, different JSON source.

**Accept.** Importing a recorded fixture creates the restaurants, and re-running
it produces no duplicates. `PINECONE_NAMESPACE=crawled` retrieval finds the new
reviews once the index settles — Pinecone is eventually consistent, so do not
measure immediately after upsert.

## Step 8 — Wire the button

**Goal.** The demo beat.

**Files.** `src/components/ChatContainer.tsx` and a small progress component

Click → `POST /api/crawl` → poll `GET /api/crawl/:jobId` every ~2s → show
`progress.completed / progress.total` → on success unlock the chat for that
neighborhood.

**Accept.** Pick an uncovered neighborhood, click, watch progress, then ask a
question and get a grounded answer about a place the app did not know minutes
earlier.

## Step 9 — Re-verify and write it down

Run both corpora. **Expect movement**, and treat it as a data change rather than
a regression: crawled restaurants land in the same `Restaurant` table the eval
reads, so a new cheap Flushing Korean BBQ makes G01's premise false. See §8 of
`on-demand-crawl.md`.

Record in `CLAUDE.md` and `docs/status.md`: the new corpus, its namespace, the
eval numbers before and after, and which goldens moved and why.

If the numbers move a lot, that is the signal to stop deferring the `dataset`
column.
