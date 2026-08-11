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
| 8 | chunk | ❌ not started | |
| 9 | embed + upsert | ❌ not started | |
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
src/lib/tools/          provider-agnostic retrieval
  filter-restaurants.ts   SQL path: neighborhood, cuisine, price tier, veg flag, hours
  search-opinions.ts      Postgres full-text search over Review.content (vector stand-in)
  get-restaurant-details.ts  single-entity lookup
src/lib/agent/
  index.ts                manual tool-calling loop, OpenAI Responses API (gpt-5.6-terra)
  tools.ts                zod schemas → JSON Schema tool defs + runtime arg validation
  system-prompt.ts        scope, refusal behavior, price-tier legend
src/app/api/chat/route.ts POST endpoint
```

## Divergences from the original plan

Three were deliberate decisions made during the build:

1. **Scrapers dropped.** Restaurant *identities* are real and verified against live listings
   (names, addresses, hours, price tier). Review text is fabricated — see the eval caveat below.
2. **Pinecone unused.** The `vector` retrieval route is currently Postgres full-text search.
   3 goldens are `expected_route: "vector"` and 7 more are `hybrid`, so **10 of 20 goldens —
   half the set — are graded against a retrieval path the system does not actually have yet.**
3. **No monorepo split.** The original sketch had `python-scraper/` and `nextjs-rag/` as
   sibling directories; this is a flat Next.js repo. Raised after Step 2, never resolved.

One divergence was **never explicitly decided** and should be:

4. **Prisma vs. drizzle.** The architecture sketch specifies `db/schema.ts # drizzle`, but the
   project runs on Prisma, carried forward from an earlier instruction that predates the sketch.
   If drizzle is a real requirement, migrating is cheaper now than after ingestion code
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

13 of 20 goldens have been run end-to-end through the agent and checked by eye. There is no
score, no pass/fail record, and no automation. **Never run end-to-end: G03, G04, G06, G07,
G08, G10, G14.**

### `.env` contains unrelated live credentials

The file holds another project's configuration and live API keys (Pinecone, LangSmith,
Cal.com, Retell — a "medical-notes" project). Confirmed intentional by the repo owner. It is
gitignored, so nothing has been committed, but real credentials are sitting in this working
directory.

## Next steps

**1. Build the eval runner (Step 12).** Highest leverage remaining work; everything downstream
depends on it. Should run all 20 goldens and check:

- `expected_route` vs. the tools the agent actually called
- `required_restaurant_slugs` present / `forbidden_restaurant_slugs` absent in retrieved results
- `grading_rubric.must_mention` / `must_not_claim` against the answer text

Output a per-item table plus an overall pass rate. This converts hand-verification into a
number and is a precondition for Step 13's failure loop.

**2. Decide Prisma vs. drizzle** before more code lands on Prisma.

**3. Decide whether Pinecone is in scope.** This affects half the golden set, so it is not a
side quest. Either implement embeddings + upsert (Steps 8–9) and make the `vector` route real,
or cut it explicitly and revise `docs/taxonomy.md` so the route table reflects what the system
actually does. Half-building it is the worst option.

**4. Break the eval circularity** if there's time — even a small set of reviews sourced
independently of the goldens would make the numbers mean something.
