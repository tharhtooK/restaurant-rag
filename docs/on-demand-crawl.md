# On-demand crawl — consumer-side design

> **Status** Design · **not built** — depends on the crawler service · **Updated** 2026-08-12 · **Version** v1

How `restaurant-rag` decides to call the crawler. The crawler itself knows none
of this; see [`crawler-service-spec.md`](crawler-service-spec.md).

**The rule: never crawl before checking what we already have.** Crawling costs
money and minutes. It is the fallback, never the first move.

---

## 1. Coverage check

One cheap query answers "do we know this neighborhood?", run **before** any crawl
is even offered:

```
SELECT count(*) FROM Restaurant WHERE neighborhood ILIKE $1
```

| restaurants | coverage | what happens |
|---|---|---|
| 0 | `none` | crawl is offered |
| > 0 | `covered` | **never crawl** — answer from what we have |

**If we have anything at all, we never crawl.** No "thin coverage" tier, no
partial top-ups. Deciding whether existing data is *good enough* is a judgement
call, and judgement calls are where cost and complexity leak in. One row is
enough to say we know this place.

`ILIKE` because the tool schema takes any string now and casing is not pinned.

### Why this counts as "checking the vector store"

Pinecone is derived from Postgres reviews — `embed-upsert.ts` reads `Review`
rows. If `reviewCount` is 0, the vector store has nothing for that neighborhood
by construction. So the SQL count is an exact proxy, and it is free.

The two can only diverge if reviews were inserted but never embedded. If that
worries you, verify with `describeIndexStats()` on the namespace rather than a
real query — no embedding call, no cost.

Do **not** run a real vector search as the gate. It costs an embedding round-trip
on every chat turn to answer a question a `COUNT` already answers.

## 2. Who decides to crawl

**Code decides eligibility. The user decides to spend.** Not the LLM.

Giving the agent a `crawl_neighborhood` tool is the obvious move and it is a
trap:

- it will crawl for typos — "Flushig" is a cash register with no brakes
- it will crawl for out-of-scope places — Tokyo is not a neighborhood
- it may crawl twice in one turn, or on every retry
- non-deterministic spending is impossible to eval and impossible to budget

So the agent never triggers a crawl. It answers honestly with what it has. The
server attaches a coverage verdict to the response, and the UI offers a button.

## 3. Ask for the neighborhood before the chat starts

The user picks a neighborhood **before** they can ask anything. It is the first
thing the app does.

```
┌─────────────────────────────────┐
│  Which neighborhood are you in? │
│                                 │
│  [East Village] [Flushing]      │   ← what we already have
│  [Williamsburg] [Harlem]        │
│  [Astoria]                      │
│                                 │
│  or type somewhere else: [____] │   ← anything, including places we lack
└─────────────────────────────────┘
```

This is the smallest change that makes on-demand crawling safe, because it moves
the neighborhood out of free text and into a known value:

- the coverage check runs on an **exact string the user chose**, not on a guess
  the model extracted from a sentence
- one crawl target per session, decided up front, instead of one per stray
  mention of a place name
- the chips show what we already have, which steers most sessions onto covered
  data without forbidding anything

The chips are generated from the database, not hardcoded — reintroducing a fixed
list in the UI would undo the enum removal.

## 4. Flow

```
user picks "Bushwick" up front
   │
   ├─ coverage check: 0 restaurants → coverage "none"
   │
   ├─ UI shows: "I don't have Bushwick yet"  [ Fetch data for Bushwick ]
   │
   └─ click → POST /api/crawl { neighborhood: "Bushwick" }
                 │
                 ├─ 202 { jobId }
                 ├─ UI polls GET /api/crawl/:jobId → progress
                 ├─ on success: import → embed → done
                 └─ chat unlocks for Bushwick
```

If coverage is `covered`, the chat starts immediately and no crawl is ever
offered. The chat turn is never blocked by a crawl; the crawl happens before the
conversation, with visible progress, which is also the clearest thing to show on
stage — the system visibly learning a neighborhood it did not know.

## 5. Two routes in this repo

```
POST /api/crawl          { neighborhood }  -> 202 { jobId }
GET  /api/crawl/:jobId                     -> { status, progress, imported? }
```

`POST` is a thin proxy: coverage check → guardrails → call the crawler → return
its jobId. The crawler API key stays server-side and is never exposed to the
browser.

`GET` polls the crawler. When the crawler reports `succeeded`, this route runs
the import (upsert restaurants, insert reviews as `crawled:<source>`, then embed
into the `crawled` namespace) and reports `imported`.

## 6. Guardrails

Small and boring, but do not skip them — this endpoint spends money.

- **Reject if coverage is `covered`.** We already have data; nothing to gain.
- **Deduplicate in-flight jobs.** Same neighborhood already running → return the
  existing jobId instead of starting a second crawl.
- **Remember misses.** "Bushwig" found nothing; do not retry it for 24h. A tiny
  table or an in-memory map is enough.
- **Cap crawls per day.** A single number in env. This is the difference between
  a demo and a bill.
- **Keep `limit` small** (3–5). A demo crawl should finish in ~90 seconds.

## 7. Demo fallback

Build on-demand as the real path, and keep one flag for insurance:

```
scripts/ingest/import-crawl.ts --from-file fixtures/bushwick.json
```

Same import code, different source of the JSON. Record one successful job's
payload and commit it. Live crawls fail in exactly the ways demos hate — captcha,
rate limit, a sleeping free dyno — and this is a one-flag escape hatch, not a
second code path.

## 8. Open question, deliberately deferred

Crawled restaurants land in the same `Restaurant` table the eval reads, so they
will change eval results — G01 asserts no Flushing Korean BBQ under $20, and one
crawled cheap KBBQ makes that false. Isolating them needs a `dataset` column
scoping the SQL tools, mirroring how `PINECONE_NAMESPACE` scopes vector search.

Deferred by decision on 2026-08-12. Re-run both corpora after the first import
and expect movement; treat it as a data change, not a regression.
