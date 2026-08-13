# Project Status — restaurant-rag

> **Status** Living · running project status · **Updated** 2026-08-13

Capstone scope: NYC, 5 neighborhoods (East Village, Flushing, Williamsburg, Harlem, Astoria),
~20 restaurants. Retrieval over Postgres (structured) + semantic search over review prose.
Single router + tool-calling agent.

## Where we are

Against the planned order of operations:

| # | Step | Status | Artifact |
|---|---|---|---|
| 1 | taxonomy | ✅ done | [`docs/taxonomy.md`](taxonomy.md) |
| 2 | goldens | ✅ done | [`evals/golden.json`](../evals/golden.json) — 20 items |
| 3 | data manifest | ✅ done | [`docs/data-manifest.md`](data-manifest.md) |
| 4 | scrapers | ⛔️ skipped | no API keys available; replaced by web research |
| 5 | run scrape | ⛔️ substituted | hand-written mock data instead |
| 6 | postgres schema | ✅ done | [`prisma/schema.prisma`](../prisma/schema.prisma) |
| 7 | normalize + load | ◐ partial | [`prisma/seed.ts`](../prisma/seed.ts) loads; no raw→normalized stage exists because there is no raw |
| 8 | chunk | ✅ done | no-op at current size — each 1–3 sentence review is already a chunk |
| 9 | embed + upsert | ✅ done | [`scripts/ingest/embed-upsert.ts`](../scripts/ingest/embed-upsert.ts) — 84 chunks across 3 namespaces |
| 10 | tools | ✅ done | [`src/lib/tools/`](../src/lib/tools) — 3 tools |
| 11 | agent | ✅ done | [`src/lib/agent/`](../src/lib/agent) — OpenAI Responses API |
| 12 | eval harness | ✅ done | [`evals/runner.ts`](../evals/runner.ts) — scores route / retrieval / rubric |
| 13 | failure loop | ✅ done | 16/20 → 20/20; see commit `a1cf268` for the attribution |

**Working today:** ask a question in the browser → agent selects tools → Postgres → grounded
answer, rendered as markdown. Local stack is `docker compose up` (Next.js + Postgres 16).

**Also working since 2026-08-13:** a lookup that finds nothing asks which neighborhood, and
naming one crawls it live with progress in the thread, then offers to re-answer the original
question. No crawl button — see the on-demand crawl section below.

**Eval: 18/20 on the authored corpus, 20/20 on independently-sourced reviews.** ~35s per run.
The independent number is the meaningful one — it grades retrieval against data the goldens did
not author. The authored corpus is now the *lower* of the two by design: G07 and G01 were
corrected to match real reviews, and the authored review text contradicts both. See the
circularity section below.

**Deployed:** `https://restaurant-rag.vercel.app/` serves the UI and builds green, but the
agent path does not work there — no Vercel environment variables, and `DATABASE_URL` points at
the Docker-internal `db:5432`. Step-by-step fix in [`docs/deployment.md`](deployment.md).

Note the earlier `restaurant-<hash>-<scope>.vercel.app` link documented in the README was an
immutable per-deployment URL frozen at the scaffold build; it never picked up later pushes.
Corrected 2026-08-12.

## Architecture as built

```
src/lib/tools/          retrieval
  filter-restaurants.ts   SQL path: neighborhood, cuisine, price tier, veg flag, hours
  search-opinions.ts      vector path: Pinecone semantic search over review chunks
  get-restaurant-details.ts  single-entity lookup
  hours.ts                pure open/close predicates — no I/O, unit-tested
  types.ts                shared retrieval types only
src/lib/
  pinecone.ts             Pinecone + embedding clients (lazy singletons)
  db.ts                   Prisma client (lazy singleton)
  logger.ts               leveled stderr logger, Node stdlib only
  dataset.ts              scopes the SQL tools to seed or crawled, by env
  coverage.ts             "do we know this neighborhood?" — one COUNT
  crawl-offer.ts          pure: is there a crawlable neighborhood in this turn?
  crawl-trigger.ts        the single gate between a neighborhood and money
  crawl-limits.ts         daily cap + 24h miss memory, in-process
  crawler.ts              client for the crawler service, zod at the boundary
  import-crawl.ts         crawl payload -> Restaurant + Review rows
src/lib/agent/
  index.ts                manual tool-calling loop, OpenAI Responses API (gpt-5.6-terra)
  tools.ts                zod schemas → JSON Schema tool defs + runtime arg validation
  system-prompt.ts        scope, refusal behavior, price-tier legend
scripts/ingest/
  embed-upsert.ts         chunk + embed + upsert reviews to Pinecone
  import-crawl.ts         CLI wrapper: import a crawl job by id, or from a file
scripts/
  pinecone-stats.ts       per-namespace record counts, no embedding call
evals/
  runner.ts               orchestration + CLI only
  scoring.ts              route / retrieval / rubric checks — pure, unit-tested
  report.ts               console output + results file
  judge.ts                LLM-as-judge for the rubric
tests/                  node:test + tsx — 112 tests, no network, no new dependency
src/app/api/
  chat/route.ts           POST endpoint; also decides whether a turn starts a crawl
  crawl/route.ts          POST: start a crawl, behind the guardrails
  crawl/[jobId]/route.ts  GET: poll, then import + embed once on success
  neighborhoods/route.ts  GET: the neighborhoods we already have, for the chips
src/components/
  NeighborhoodAsk.tsx     "which neighborhood?" + chips, shown on an empty lookup
  CrawlProgress.tsx       passive inline progress; not a control
```

## Divergences from the original plan

Deliberate decisions made during the build:

1. **Scrapers dropped.** Restaurant *identities* are real and verified against live listings
   (names, addresses, hours, price tier). Review text is fabricated — see the eval caveat below.
2. **No monorepo split.** The original sketch had `python-scraper/` and `nextjs-rag/` as
   sibling directories; this is a flat Next.js repo. Raised after Step 2, never resolved.

_Resolved 2026-08-11:_ Pinecone was previously unused, with the `vector` route served by
Postgres full-text search. It is now real (Steps 8–9), so all 10 `vector`/`hybrid` goldens are
graded against the retrieval path the design actually specifies.

_Resolved 2026-08-12:_ **Prisma only.** The architecture sketch specified drizzle; that is
superseded. Do not introduce a second ORM.

## Known problems

### The eval's circularity — largely addressed 2026-08-12

The original review text was authored to satisfy each golden's `required_facts`, making a
score against it a measure of plumbing rather than retrieval. There is now a second corpus,
sourced from web research on what real reviewers say and gathered without consulting the
goldens, isolated in the `web-research` Pinecone namespace:

```bash
docker compose exec -e PINECONE_NAMESPACE=web-research web npx tsx evals/runner.ts
```

**Authored 18/20 → independent 20/20** (after the G07 and G01 corrections below; before them,
authored 20/20 → independent 18/20). The 2-point gap is the useful signal, and since the G19
rubric fix it is fully attributable: both points are measured fabrication in the authored
reviews, with no judge noise left in the number. Residual bias is documented in
`prisma/seed-data-independent.ts`: the themes were still selected and written by someone who
had read the goldens. Weakened substantially, not eliminated.

### Real data contradicts several goldens

Surfaced by the independent corpus:

- **G07 — RESOLVED 2026-08-12.** Asks which Flushing spot is the biggest hidden gem. The
  golden required Lanzhou, because the authored review said so. Real reviews give Lanzhou no
  hidden-gem framing at all and describe Tian Jin Dumpling House as "buried in the basement",
  "completely unassuming", "genuinely hard to find". The golden was backwards and has been
  swapped: Tian Jin is now required, Lanzhou acceptable.

  Swapping `required` and `must_mention` alone was **not** enough — it passed on both corpora,
  because the authored-corpus agent still led with Lanzhou and name-checked Tian Jin as an
  aside, which satisfies a mention check. A second `must_not_claim` forbidding Lanzhou as the
  *strongest* pick is what makes the golden discriminate. It now fails on the authored corpus
  and passes on the independent one, which is the correct shape: a golden that passes against
  fabricated data is not testing anything.
- **G01 — RESOLVED 2026-08-12.** Required "at least one entree under $20" at Picnic Garden,
  satisfiable only because the authored review invented a $17 weekday lunch. Real reviews put
  the all-you-can-eat at ~$41/person, and the only other Flushing Korean BBQ (San Soo Kap San)
  is tier 4 and dearer still — so **no restaurant in the dataset can satisfy the query**.

  Rather than delete the golden, it was inverted into a grounding test: the agent must decline
  the under-$20 claim while still surfacing the closest option. On the independent corpus it
  answers "I don't have a Flushing Korean BBQ option with plates under $20... reviews put its
  all-you-can-eat at about $41 per person", which is exactly the target behaviour. On the
  authored corpus it cites the fabricated $17 lunch and fails. Difficulty raised easy → medium.
- **Manna's** price is contested in real reviews; the authored set called it plainly affordable.
- **Fette Sau has closed.** G14 and G20 reference it. This is a dataset-freshness question
  rather than a wrong golden, so it is left alone deliberately.

### The judge is an LLM — write rubric items as propositions

`must_mention` / `must_not_claim` are graded by an LLM judge, because both are semantic rather
than literal ("don't have" is satisfied by "that isn't in my data").

**G19's flakiness was a rubric bug, not judge noise. FIXED 2026-08-12.** Its `must_mention` was
three bare tokens — `["NYC", "can't", "Tokyo"]`. A bare token invites literal grading even
though the judge is instructed to grade meaning, so the same answer passed when the judge read
"NYC" semantically and failed when it demanded the literal string from an answer that had
listed the five NYC neighborhoods. That demand was also stricter than the golden's own
`required_facts`, which only asks that the coverage area be conveyed.

Rewritten as propositions. Verified two ways: 5 consecutive passing runs, and by driving the
judge directly with five hand-written answers — both good variants (including the
neighborhoods-only phrasing that used to flake) pass, and all three bad variants fail, each for
the right reason. An answer that declines Tokyo but never states coverage still fails, so the
item retains its teeth.

**Rule going forward: rubric items are statements, never keywords.** Scores are still not
guaranteed reproducible, but no golden is currently known to flake.

### 20/20 was reached partly by adjusting the scorer

Attribution, recorded so the number is not over-read: 16/20 baseline, +2 from real agent fixes,
+2 from golden corrections (the test was wrong — G01 demanded a fact the schema cannot express;
G06 required "live music" for a restaurant that has a DJ), and +1 from a route-scoring
correction. Six negative controls confirm the route rule still rejects genuine routing misses.

### Pinecone is eventually consistent

An initial retrieval check run seconds after ingestion scored 7/8 with an obviously wrong
ranking — a "quiet" restaurant topping a "loud party" query. The identical check scored 8/8
once the index settled. **Do not measure retrieval immediately after an upsert**; this will
matter for the Step 12 runner if it ever re-ingests as part of a test cycle.

### Crawled data lands in the table the eval reads — RESOLVED 2026-08-13

`Restaurant.dataset` is now `seed` or `crawled`, and `datasetWhere()` scopes
`filter_restaurants` and `get_restaurant_details` by `RESTAURANT_DATASET`. Unset
means no filter, so the app sees everything; `evals/runner.ts` sets `seed` itself
rather than depending on a flag someone must remember. Measured after the change:

| `RESTAURANT_DATASET` | restaurants | Bushwick | Karczma |
|---|---|---|---|
| unset — the app | 25 | 3 | found |
| `seed` — the eval | 20 | 0 | null |
| `crawled` | 5 | 3 | found |

Both corpora unmoved: 18/20 authored, 20/20 independent, route 20/20, retrieval
20/20. `getCoverage` is deliberately **not** scoped — it decides whether to spend
money and must count crawled rows, or a neighborhood we just fetched would read as
uncovered and be crawled again.

The migration's generated `DEFAULT 'seed'` was wrong for the five rows already
crawled, so it carries a backfill keyed on the `crawled:` review source. A crawled
restaurant with no reviews would still be missed; none exists, and the check is in
the migration comment.

The original problem, kept for the reasoning:



The in-chat crawl shipped today (below). Crawled restaurants go into the same
`Restaurant` table `filter_restaurants` and `get_restaurant_details` read, so an
ordinary chat turn can now change the eval's input. There is no `dataset` column
yet; it was specced and deliberately cut for simplicity.

**This is no longer hypothetical.** A crawl of Bushwick during development took the
table from 22 rows to 25. Both corpora were re-run afterwards and were unmoved —
18/20 authored, 20/20 independent, route 20/20, retrieval 20/20 — because Bushwick
appears in no golden. That is luck about which neighborhood was crawled, not a
guarantee.

Until the `dataset` column exists, **re-run both corpora after any crawl**. The
structural protections that do hold:

- a crawl only fires where coverage is 0, so the five seeded neighborhoods cannot
  receive crawled rows, which protects the 17 goldens that name one;
- crawled reviews embed into the `crawled` Pinecone namespace, which the eval never
  reads, so the vector path is already isolated;
- `evals/runner.ts` calls `runAgent` directly and never touches `/api/chat`, so an
  eval run cannot itself start a crawl. **Never move the crawl trigger into
  `src/lib/agent/`** — that property is what stops G19 ("best ramen shop in tokyo")
  from crawling twenty times a run.

### On-demand crawl, in-chat — shipped 2026-08-13

A lookup that finds nothing asks which neighborhood; naming one starts a crawl with
progress in the thread; when it lands the user is offered a re-ask with the original
question pre-filled. **No crawl button and no up-front gate** — consent is naming the
neighborhood. Design and plan in [`docs/superpowers/`](superpowers/).

The non-obvious part, and the reason the first build silently did nothing: detection
reads the neighborhood out of tool-call arguments, but `SYSTEM_PROMPT` listed the
five neighborhoods and told the agent to declare anything else out of scope — so the
agent refused **without calling a tool at all**. Measured: "any good spots in
Bushwick?", "any vegan places in Bushwick?", a bare "Bushwick" reply and "best ramen
shop in tokyo" each produced zero tool calls. Detection could therefore only ever see
covered neighborhoods, which are exactly the ones a crawl refuses.

The fix was one paragraph in the prompt's Scope section: look the neighborhood up and
use the empty result as confirmation before refusing. That aligns the prompt with the
enum removal in `feat/unrestricted-neighborhood`, which had intended this all along.

Consequence: G19 now calls `filter_restaurants` with `neighborhood: "Tokyo"`, so a
real user asking it spends one crawl. Bounded by the crawler's New York `city`
default (the job fails and is remembered for 24h) and by `CRAWLS_PER_DAY`.

### `.env` contains unrelated live credentials

The file holds another project's configuration and live API keys (Pinecone, LangSmith,
Cal.com, Retell — a "medical-notes" project). Confirmed intentional by the repo owner. It is
gitignored, so nothing has been committed, but real credentials are sitting in this working
directory.

## Next steps

All 13 planned steps are done or explicitly substituted. What remains, in priority order:

**1. ~~Break the eval's circularity.~~ DONE 2026-08-12.** A second corpus of
independently-sourced reviews now lives in the `web-research` Pinecone namespace.
**Authored corpus 18/20; independent corpus 20/20.** The authored corpus is now the lower
number by design — G07 and G01 were corrected to match real reviews, and the authored data
contradicts both. Those two are its only failures; the former third (G19) was a rubric bug and
is fixed.

**2. ~~Add the `dataset` column.~~ DONE 2026-08-13.** The eval reads only `seed`, so a
crawl started from a chat turn can no longer change what the goldens are graded
against. See the resolved section above.

**3. Make the deployment functional** — step-by-step guide in
[`docs/deployment.md`](deployment.md). Needs a Neon Postgres and Vercel env vars; Pinecone
is already done. **Not started.**

**4. Point `LANGSMITH_PROJECT` at `restaurant-rag`** in `.env` — it currently reads
`medical-notes`, so traces land in another project's workspace.

**5. Decide the monorepo split** (`python-scraper/` + `nextjs-rag/`) or formally drop it.

### Infrastructure (verified 2026-08-11)

- **Pinecone index `restaurants`** — 1536 dims, cosine, 84 records across 3 namespaces
  (`__default__` 36 authored, `web-research` 23 independent, `crawled` 25). Dedicated to
  this project (separate from the `medical-notes` and `bible` indexes on the same account).
  Re-ingest with `docker compose exec web npx tsx scripts/ingest/embed-upsert.ts`.
  Inspect with `docker compose exec web npx tsx scripts/pinecone-stats.ts` — it reads
  `describeIndexStats`, so it costs no embedding call.
- **Embeddings** — `text-embedding-3-small`, 1536 dims. Matches the index.
- **OpenAI traffic routes through a LiteLLM proxy** (`OPENAI_BASE_URL=parsity-litellm.fly.dev`),
  not `api.openai.com` — this applies to agent chat calls and embeddings alike. Note that
  `.env` is loaded by Next.js from the bind-mounted project root, *not* injected as container
  environment variables, so `docker compose exec web env` will not show these.

### Open decisions

- **Monorepo split** — implement or formally drop.
- **Does the deployed demo need to work?** Determines whether hosted Postgres is worth the
  time.
