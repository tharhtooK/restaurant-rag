# Project Status — restaurant-rag

_Last updated: 2026-08-12_

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
| 9 | embed + upsert | ✅ done | [`scripts/ingest/embed-upsert.ts`](../scripts/ingest/embed-upsert.ts) — 36 chunks in Pinecone |
| 10 | tools | ✅ done | [`src/lib/tools/`](../src/lib/tools) — 3 tools |
| 11 | agent | ✅ done | [`src/lib/agent/`](../src/lib/agent) — OpenAI Responses API |
| 12 | eval harness | ✅ done | [`evals/runner.ts`](../evals/runner.ts) — scores route / retrieval / rubric |
| 13 | failure loop | ✅ done | 16/20 → 20/20; see commit `a1cf268` for the attribution |

**Working today:** ask a question in the browser → agent selects tools → Postgres → grounded
answer, rendered as markdown. Local stack is `docker compose up` (Next.js + Postgres 16).

**Eval: 20/20** (route 20/20, retrieval 20/20, rubric 20/20), ~35s for a full run. Read that
number with the circularity caveat below — it measures plumbing, not retrieval quality.

**Deployed:** `https://restaurant-rag.vercel.app/` serves the UI and builds green, but the
agent path does not work there — Vercel has no environment variables set, and `DATABASE_URL`
points at the Docker-internal `db:5432`, so a hosted Postgres is required before `/api/chat`
can run in production. Pinecone is already hosted and populated.

Note the earlier `restaurant-<hash>-<scope>.vercel.app` link documented in the README was an
immutable per-deployment URL frozen at the scaffold build; it never picked up later pushes.
Corrected 2026-08-12.

## Architecture as built

```
src/lib/tools/          retrieval
  filter-restaurants.ts   SQL path: neighborhood, cuisine, price tier, veg flag, hours
  search-opinions.ts      vector path: Pinecone semantic search over review chunks
  get-restaurant-details.ts  single-entity lookup
src/lib/
  pinecone.ts             Pinecone + embedding clients (lazy singletons)
  db.ts                   Prisma client (lazy singleton)
src/lib/agent/
  index.ts                manual tool-calling loop, OpenAI Responses API (gpt-5.6-terra)
  tools.ts                zod schemas → JSON Schema tool defs + runtime arg validation
  system-prompt.ts        scope, refusal behavior, price-tier legend
scripts/ingest/
  embed-upsert.ts         chunk + embed + upsert reviews to Pinecone
src/app/api/chat/route.ts POST endpoint
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

### The eval is circular (most important)

Review text was authored specifically to satisfy each golden's `required_facts`, and the
goldens were then verified against those same reviews. **Passing goldens demonstrates that the
plumbing works — routing, tool selection, SQL correctness, refusal behavior — and says nothing
about retrieval quality**, because the question and the haystack share an author.

This is acceptable for validating the harness. It is not acceptable as an evaluation result,
and should not be reported as one.

### The judge is non-deterministic

`must_mention` / `must_not_claim` are graded by an LLM judge, because both are semantic rather
than literal ("don't have" is satisfied by "that isn't in my data"). G19 failed one run and
passed the next on identical input. **Treat any score as ±1 item.** Run the suite several times
before defending a specific number.

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

### `.env` contains unrelated live credentials

The file holds another project's configuration and live API keys (Pinecone, LangSmith,
Cal.com, Retell — a "medical-notes" project). Confirmed intentional by the repo owner. It is
gitignored, so nothing has been committed, but real credentials are sitting in this working
directory.

## Next steps

All 13 planned steps are done or explicitly substituted. What remains, in priority order:

**1. Break the eval's circularity.** The single largest threat to the result meaning anything.
Even a handful of reviews sourced independently of the goldens would turn 20/20 from "the
plumbing works" into a claim about retrieval quality.

**2. Make the deployment functional**, if a live demo matters. Needs a hosted Postgres
(Neon/Supabase/Vercel Postgres) plus `DATABASE_URL`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`,
`PINECONE_API_KEY`, `PINECONE_INDEX`, and the `LANGSMITH_*` vars set in Vercel, then a migrate
+ seed + embed against that database. Pinecone needs nothing further.

**3. Point `LANGSMITH_PROJECT` at `restaurant-rag`** in `.env` — it currently reads
`medical-notes`, so traces land in another project's workspace.

**4. Decide the monorepo split** (`python-scraper/` + `nextjs-rag/`) or formally drop it.

### Infrastructure (verified 2026-08-11)

- **Pinecone index `restaurants`** — 1536 dims, cosine, 36 records. Dedicated to this
  project (separate from the `medical-notes` and `bible` indexes on the same account).
  Re-ingest with `docker compose exec web npx tsx scripts/ingest/embed-upsert.ts`.
- **Embeddings** — `text-embedding-3-small`, 1536 dims. Matches the index.
- **OpenAI traffic routes through a LiteLLM proxy** (`OPENAI_BASE_URL=parsity-litellm.fly.dev`),
  not `api.openai.com` — this applies to agent chat calls and embeddings alike. Note that
  `.env` is loaded by Next.js from the bind-mounted project root, *not* injected as container
  environment variables, so `docker compose exec web env` will not show these.

### Open decisions

- **Monorepo split** — implement or formally drop.
- **Does the deployed demo need to work?** Determines whether hosted Postgres is worth the
  time.
