# Project Status — restaurant-rag

_Last updated: 2026-08-11_

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
| 12 | eval harness | ❌ **not started** | `evals/golden.json` exists; no runner |
| 13 | failure loop | ❌ blocked | depends on 12 |

**Working today:** ask a question in the browser → agent selects tools → Postgres → grounded
answer, rendered as markdown. Local stack is `docker compose up` (Next.js + Postgres 16).

**Deployed:** the scaffold is on Vercel and builds green, but the agent path has never run
there — no environment variables are configured in Vercel.

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

One divergence was **never explicitly decided** and should be:

3. **Prisma vs. drizzle.** The architecture sketch specifies `db/schema.ts # drizzle`, but the
   project runs on Prisma, carried forward from an earlier instruction that predates the sketch.
   If drizzle is a real requirement, migrating is cheaper now than after more code
   accumulates on top of Prisma.

## Known problems

### The eval is circular (most important)

Review text was authored specifically to satisfy each golden's `required_facts`, and the
goldens were then verified against those same reviews. **Passing goldens demonstrates that the
plumbing works — routing, tool selection, SQL correctness, refusal behavior — and says nothing
about retrieval quality**, because the question and the haystack share an author.

This is acceptable for validating the harness. It is not acceptable as an evaluation result,
and should not be reported as one.

### "All goldens pass" is not a measurement

16 of 20 goldens have been exercised end-to-end through the agent and checked by eye. There is
still no score, no pass/fail record, and no automation. **Never run end-to-end: G03, G04, G10,
G14.** (Retrieval for those four has been spot-checked at the tool level, but not through the
agent.) Step 12 replaces all of this with an actual number.

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

Steps 8–9 are done, so the sequence is now **12 → 13**, with the semantic path already real.

**1. Build the eval runner (Step 12).** Run all 20 goldens and check:

- `expected_route` vs. the tools the agent actually called
- `required_restaurant_slugs` present / `forbidden_restaurant_slugs` absent in retrieved results
- `grading_rubric.must_mention` / `must_not_claim` against the answer text

Output a per-item table plus an overall pass rate. This converts hand-verification into a
number and is a precondition for Step 13's failure loop.

**2. Failure loop (Step 13).** Depends on 1.

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

- **Prisma vs. drizzle** — settle before more code lands on Prisma.
- **Eval circularity** — even a small set of reviews sourced independently of the goldens would
  make the Step 12 numbers mean something. Worth doing before 12, not after. This is now the
  single largest threat to the credibility of the final eval result.
