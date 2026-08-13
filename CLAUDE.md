@AGENTS.md
@docs/coding-guidelines.md

# restaurant-rag

## Objective

A capstone RAG system: a restaurant recommendation assistant over a small,
deliberately-bounded dataset, built so that **retrieval quality can be measured
rather than asserted**.

Scope is fixed and load-bearing — narrowness is the point, because it makes the
eval tractable:

- **NYC, 5 seeded neighborhoods:** East Village, Flushing, Williamsburg, Harlem,
  Astoria — the corpus the eval is graded against, and the only rows tagged
  `dataset: "seed"`
- **20 seeded restaurants**, real and verified (see `docs/data-manifest.md`).
  Crawling adds more, tagged `crawled` and invisible to the eval
- **Two retrieval paths:** Postgres for structured facts, Pinecone for semantic
  search over review prose
- **One router + tool-calling agent** — not a multi-agent system

**Scope is enforced by what is in the data.** Not by the tool schema, and since
2026-08-13 not by a list in the prompt either. Three steps got here:

1. the `neighborhood` argument was a `z.enum` of the five until 2026-08-12; it is
   now a plain string, so the agent can ask for anywhere and gets an empty result
   rather than a validation error;
2. the prompt now tells the agent to **look a neighborhood up before saying
   anything about scope** — without this the crawl could never fire, because the
   agent refused unknown neighborhoods without calling a tool at all;
3. the prompt no longer asserts "5 neighborhoods" or "20 restaurants". It cannot:
   `RESTAURANT_DATASET` makes the true answer differ between the eval (5 and 20)
   and the app (8 and 25, after crawling Bushwick, Greenpoint and Red Hook). A
   coverage question is answered by calling `filter_restaurants`, not from memory.

The five names remain in the prompt for one reason only: `search_opinions` needs
canonical spellings because Pinecone metadata filters cannot match
case-insensitively. Postgres matches `neighborhood` case-insensitively, so the SQL
path does not care.

The refusal behaviour G18/G19/G20 grade is unchanged in outcome — an out-of-scope
place is still refused, now with a lookup behind the refusal rather than a list.

Both rules are load-bearing rather than stylistic; the failure each one prevents is
recorded under Known Problems.

The goal is not "a chatbot that answers about restaurants." It is a system whose
answers are **graded against a golden set**, where a regression shows up as a
number. Anything that makes the eval less meaningful is a bug, even if the app
still works.

### Direction

Built in the planned order: taxonomy → goldens → data manifest → schema → tools
→ agent → embeddings → eval harness → failure loop. All 13 steps are done or
explicitly substituted (scraping was replaced by web research; see below).

The eval's circularity was addressed on 2026-08-12 with the independent corpus,
and the `dataset` column made it hermetic against crawled data on 2026-08-13.
**The next meaningful work is making the deployment functional** — see Known
Problems and `docs/deployment.md`.

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16.3.0 (App Router) | See `AGENTS.md` — this version has breaking changes vs. training data |
| Language | TypeScript 5, React 19.2 | strict mode |
| Styling | Tailwind CSS v4 | dark-only, monochrome accent |
| Database | Postgres 16 (Docker) | |
| ORM | **Prisma 7.9** | v7 needs an explicit driver adapter (`@prisma/adapter-pg`) — no built-in engine |
| Vector store | Pinecone, index `restaurants` | 1536 dims, cosine |
| Reranking | Pinecone Inference, `bge-reranker-v2-m3` | cross-encoder over a 20-candidate pool, returns 8 |
| LLM | OpenAI `gpt-5.6-terra` via **Responses API** | not Chat Completions |
| Embeddings | `text-embedding-3-small` (1536 dims) | must match the index |
| Tracing | LangSmith via `wrapOpenAI` | `src/lib/openai.ts` |
| Local dev | Docker Compose | `node:22-bookworm-slim` + Postgres 16 |

**All OpenAI traffic routes through a LiteLLM proxy** (`OPENAI_BASE_URL`), not
`api.openai.com`.

## Commands

Everything runs **inside the web container**. `.env` is loaded by Next.js from
the bind-mounted project root, *not* injected as container env vars — so
`docker compose exec web env` will not show `OPENAI_API_KEY` et al. That is
expected, not a bug.

```bash
docker compose up -d                  # start Next.js + Postgres
docker compose up -d --build -V web   # rebuild after adding a dependency
docker compose logs -f web
```

```bash
# checks — run all three before every commit
docker compose exec web npx tsc --noEmit
docker compose exec web npm run lint
docker compose exec web npm test           # 112 unit tests, ~0.4s, no network
```

```bash
# eval (the important one)
docker compose exec web npx tsx evals/runner.ts          # authored corpus  -> 18/20
docker compose exec web npx tsx evals/runner.ts G01 G05  # a subset

# against independently-sourced reviews — this is the number that means something
docker compose exec -e PINECONE_NAMESPACE=web-research web npx tsx evals/runner.ts   # -> 20/20
```

```bash
# data
docker compose exec web npx prisma migrate dev --name <name>
docker compose exec web npx prisma db seed
docker compose exec web npx tsx scripts/ingest/embed-upsert.ts                # all -> default ns
docker compose exec web npx tsx scripts/ingest/embed-upsert.ts web-research   # independent only
docker compose exec db psql -U app -d restaurant_rag
```

Adding a dependency requires a **container rebuild** (`-V` to reset the
anonymous `node_modules` volume). Installing on the host alone is not enough.

## Architecture

```
src/lib/tools/            retrieval, provider-agnostic
  filter-restaurants.ts     SQL: neighborhood, cuisine, price tier, veg, hours
  search-opinions.ts        Pinecone semantic search + cross-encoder rerank
  get-restaurant-details.ts single-entity lookup (returns BOTH facts and reviews)
  hours.ts                  pure open/close predicates — no I/O, unit-tested
  types.ts                  shared retrieval types only
src/lib/
  openai.ts                 one LangSmith-wrapped OpenAI client, shared
  pinecone.ts               Pinecone index + embedding helpers
  db.ts                     Prisma client
  logger.ts                 leveled stderr logger, Node stdlib only
src/lib/agent/
  index.ts                  manual tool-calling loop over the Responses API
  tools.ts                  zod schemas -> JSON Schema defs + runtime validation
  system-prompt.ts          scope, refusal rules, price-tier legend
src/lib/                  on-demand crawl — none of it reachable from the agent
  dataset.ts                scopes the SQL tools to seed or crawled, by env
  coverage.ts               "do we know this neighborhood?" — one COUNT
  crawl-offer.ts            pure: is there a crawlable neighborhood in this turn?
  crawl-trigger.ts          the single gate between a neighborhood and money
  crawl-limits.ts           daily cap + 24h miss memory, in-process
  crawler.ts                client for the crawler service, zod at the boundary
  import-crawl.ts           crawl payload -> Restaurant + Review rows
scripts/ingest/
  embed-upsert.ts           chunk + embed + upsert reviews
evals/
  golden.json               20 graded queries
  runner.ts                 orchestration + CLI only
  scoring.ts                route / retrieval / rubric checks — pure, unit-tested
  report.ts                 console output + results file
  judge.ts                  LLM-as-judge for the rubric
tests/                    node:test + tsx, no new dependency
  scoring.test.ts           the eval's own scoring rules
  hours.test.ts             open/close boundary conditions
  search-filter.test.ts     Pinecone metadata filter branching
  logger.test.ts            level filtering and field formatting
  crawl-offer.test.ts       which turns may start a crawl
  dataset.test.ts           env scoping, including unset meaning no filter
docs/
  README.md                 index — every doc has a status; half are DESIGN ONLY
  taxonomy.md               6 query categories
  data-manifest.md          slug -> real restaurant mapping
  status.md                 running project status
```

## Code style

Strict, and derived from what is already in the codebase — match it.

**Clients are lazy singletons.** Never construct an API client at module scope.
Importing a module must not throw because a key is missing; only *using* it
should. `/api/chat` depends on this to return a clean error instead of a 500
from a failed route load.

```ts
let client: X | null = null;
export function getX() { if (!client) client = new X(); return client; }
```

**Never guess an SDK signature.** Read the installed `.d.ts` in `node_modules`.
This session lost time to a guessed Pinecone `upsert(array)` that actually takes
`{ records: [...] }`, and nearly shipped a LangSmith wrapper that would have been
a silent no-op if it hadn't turned out to patch the Responses API.

**Verify, don't assert.** A change is not done because it type-checks. Run it.
Where behavior is claimed, produce the output that proves it.

**Comments explain *why*, never *what*.** Existing comments in `evals/runner.ts`
and `search-opinions.ts` document *interpretation decisions* — that is the bar.
No comment should restate the line below it.

**Absence of data is a feature.** The schema deliberately has no reservations,
parking, or wait-time fields. Do not add them. Their absence is what makes the
refusal goldens (G16/G17/G20) gradable instead of untested.

**Only an answer to the neighborhood ask may start a crawl.** `/api/chat` takes
`answeringNeighborhood`, true only when the ask was on screen when the message was
sent. Any place name used to be enough, and "near Brooklyn" duly spent a crawl on a
borough — bad data, since a `neighborhood: "Brooklyn"` row overlaps four
neighborhoods we already have and matches only the literal word. Coverage is 0 for
a borough, a city, a typo and a vague phrase alike, so consent has to come from the
conversation, not from the string.

**The crawl trigger lives in the route, never in the agent.** `/api/chat` decides
whether a turn starts a crawl; nothing in `src/lib/agent/` may import
`crawl-trigger.ts` or `crawl-offer.ts`. `evals/runner.ts` calls `runAgent`
directly, so this is the only thing stopping an eval run from spending money —
G19 ("best ramen shop in tokyo") now calls `filter_restaurants` with
`neighborhood: "Tokyo"`, and would crawl on every run if the trigger moved.

**Never write review content to make a golden pass.** That is how the eval became
circular in the first place. New review text belongs in
`prisma/seed-data-independent.ts`, sourced from what real reviewers say, chosen
without reference to what the goldens need. If a golden fails against real data,
the golden is the more likely thing to be wrong.

Other rules: no `any` (use `unknown` + a zod parse); zod schemas are the single
source of truth for tool args (reused for both JSON Schema and runtime
validation); tools return provider-agnostic types — nothing in `src/lib/tools/`
should import an LLM SDK.

## State

**Eval: 18/20 authored corpus, 20/20 independent corpus.** ~35s per run.

Quote the **independent number**. The authored reviews were written to satisfy
the goldens' `required_facts`, so scoring against them measures plumbing. The
independent corpus (`web-research` namespace) was sourced from real review
content gathered without consulting the goldens, so it grades retrieval.

**The authored corpus now scores lower on purpose.** G07 and G01 were corrected
on 2026-08-12 to encode what real reviews say — Tian Jin Dumpling House is the
Flushing hidden gem rather than Lanzhou, and no Korean BBQ in the set comes in
under $20 (the authored "$17 weekday lunch" was invented). The authored corpus
asserts the opposite in both cases, so it fails both goldens, and those failures
are the fabricated reviews being wrong, not the agent. A golden that passes
against fabricated data is not doing its job.

**The 2-point gap between the corpora is the useful signal**, not either number
alone. Both points are measured fabrication in the authored reviews — G19's
rubric was rewritten on 2026-08-12, so the gap no longer contains judge noise
and is now fully attributable.

The judge is still an LLM and no score is guaranteed reproducible, but the
golden that actually flaked has been fixed and no other is currently known to.

**Do not describe route and retrieval as "the deterministic checks".** The
scoring functions in `scoring.ts` are pure and unit-tested, but their *inputs*
are model output, so only part of what they grade is stable:

| Check | Graded against | Stable? |
|---|---|---|
| route | which tools were called | mostly — the agent rarely varies its path |
| retrieval, required slugs | raw tool output | yes — a slug either surfaced or it did not |
| retrieval, forbidden slugs | the **answer text** | **no** — same LLM variance as the rubric |
| rubric | the answer text | no |

Observed 2026-08-12: G09 failed on a forbidden slug in one full run and passed
3/3 on re-run, with no code change. Treat a single failing run as a signal to
re-run that golden, not as a regression.

Path to the earlier 20/20 on the authored corpus: 16/20 baseline → +2 real agent
fixes → +2 golden corrections (the test was wrong) → +1 scorer correction.
Recorded in `docs/status.md`, because a 100% that involved adjusting the scorer
deserves scrutiny.

### How we got here

1. Scaffolded Next.js, deployed to Vercel, added Docker + Postgres + Prisma.
2. Built the chat UI (dark, monochrome, markdown) against a fake reply.
3. **Taxonomy** (6 categories) → **20 goldens** → **data manifest** mapping
   invented slugs to real restaurants.
4. Scrapers were **dropped** (no API keys) in favour of web research. Restaurant
   identities are real; **review text is fabricated**.
5. Schema + seed, three retrieval tools, tool-calling agent.
6. **Pivoted the agent from Anthropic to OpenAI** when only an OpenAI key was
   available. The retrieval tools needed no changes — they never imported an
   LLM SDK, which is why that rule is in Code Style.
7. Pinecone embeddings replaced the Postgres full-text stand-in.
8. Eval runner + failure loop.
9. LangSmith tracing via a single wrapped client.

### Bugs caught by testing, not review

Kept because each one is a pattern likely to recur:

- **Seed data silently broke a test.** A restaurant's hours made it open past
  midnight, so it would have satisfied "open after 11pm" and destroyed its role
  as a distractor in G02. Found by scripting golden facts against seed data.
- **Price tiers had no dollar mapping**, so "under $20" became `priceTierMax: 1`
  and returned nothing. Fixed with a tier legend in the system prompt.
- **Pinecone is eventually consistent.** A retrieval check run seconds after
  ingestion scored 7/8 with a nonsense ranking; the identical check scored 8/8
  once the index settled. Never measure retrieval immediately after an upsert.
- **Goldens referenced restaurants that did not exist** — the query text still
  used pre-manifest placeholder names.

## Known problems

**The authored corpus is circular — mostly addressed, not eliminated.** Review
text in `seed-data.ts` was authored to satisfy the goldens' `required_facts`,
then the goldens were verified against those same reviews, so its score measures
*plumbing* (routing, retrieval, grounding, refusal), **not retrieval quality**.
The independent `web-research` corpus fixes this for 14 of 20 restaurants; the
runner prints which corpus produced a score so the number cannot be quoted alone.

Residual bias remains and is stated in `prisma/seed-data-independent.ts`: the
independent reviews were still selected and written by someone who had read the
goldens. A fully clean test would ingest raw third-party review text. The 6
restaurants without independent reviews are reached only by the structured route
or appear as forbidden distractors.

**The judge is an LLM, so scores are not guaranteed reproducible.** G19 used to
flake in both directions on identical input; its `must_mention` items were bare
tokens ("NYC") that invited literal grading despite the judge being told to
grade meaning. Rewritten as propositions on 2026-08-12 and stable over 5
consecutive runs. Write rubric items as statements, not keywords — a bare token
is the failure mode to avoid.

**`.env` holds another project's live credentials** (Pinecone, LangSmith,
Cal.com, Retell — a "medical-notes" project). Confirmed intentional. It is
gitignored, but real keys sit in this working directory. `LANGSMITH_PROJECT`
must be set to `restaurant-rag`, or traces land in that other project.

**Reranking is unmeasured by the eval.** `search_opinions` pulls a 20-candidate
pool, reranks with `bge-reranker-v2-m3`, and returns 8 (2026-08-12). Both
corpora scored identically before and after, and again after widening 5 → 8 —
20/20 independent, 18/20 authored — because the independent corpus was already
at ceiling, so the eval has no headroom to show a gain. It can only catch a
regression, which is what those runs actually verify.

Measured directly instead. The reranker picks the right top-1 decisively (0.759
vs 0.540 by cosine for counter-dining) but then collapses to ~0.000, so ordering
within the tail carries little signal. Returning 8 rather than 5 exists for that
reason: across 5 vibe queries, cutting at 5 dropped 4 vector-top-5 restaurants
and cutting at 8 dropped 3. Modest, and note that some drops are correct — the
reranker demoting Fette Sau for "eating alone at the counter" is the feature
working, not lost recall.

`cohere-rerank-3.5` is likely better calibrated but this Pinecone project is not
authorized for it (403). `pinecone-rerank-v0` was worse than bge — it ranked an
explicitly "noisy room" snippet above one about quieter midweek visits.

At 20 restaurants a 20-candidate pool is most of the namespace, so the reranker
is effectively doing retrieval rather than refining it. Fine here; not what the
design would look like at scale.

**Crawled rows are isolated from the eval — resolved 2026-08-13.** A chat turn that
finds nothing asks for a neighborhood, and naming one crawls it, so ordinary use
writes into the same `Restaurant` table the SQL tools read. `Restaurant.dataset` is
`seed` or `crawled`; `datasetWhere()` reads `RESTAURANT_DATASET` and scopes
`buildWhere` and `getRestaurantDetails`. Unset means no filter, so the app sees
everything; `evals/runner.ts` sets it to `seed` itself rather than relying on a CLI
flag. Measured: unset 25 restaurants, `seed` 20, `crawled` 5.

**`getCoverage` is deliberately unscoped.** It decides whether to spend money and
must count crawled rows — scope it and a neighborhood we just fetched reads as
uncovered and gets crawled again on the next visit.

The vector path was already isolated: crawled reviews go to the `crawled` namespace,
which the eval never reads.

**The prompt must look before it refuses.** `SYSTEM_PROMPT` tells the agent to call
`filter_restaurants` with an unrecognised neighborhood and use the empty result as
confirmation before declaring it out of scope. Load-bearing, not stylistic: crawl
detection reads the neighborhood out of tool-call arguments, and while the prompt
refused from its own list the agent called no tool at all, so the crawl could never
fire. It also aligns the prompt with the enum removal in
`feat/unrestricted-neighborhood`, which had intended this since 2026-08-12.

**The prompt must not recite a neighborhood list or a restaurant count.** Fixed on
2026-08-13, when "what neighborhoods do you cover?" answered "East Village,
Flushing, Williamsburg, Harlem, and Astoria" with no tool call, omitting all three
crawled neighborhoods. No hardcoded number can be right: `RESTAURANT_DATASET` makes
the true answer 5 and 20 for the eval but 8 and 25 for the app. Coverage questions
are answered by calling `filter_restaurants` with no filters. Verified in both
scopes — put a list back and the agent will be wrong in whichever context you were
not thinking about.

**Decided: Prisma only.** The original architecture sketch specified drizzle;
that is superseded. Do not introduce drizzle or a second ORM.

**Unresolved:** the monorepo split (`python-scraper/` + `nextjs-rag/` was
planned; this is a flat repo).

**The deployed app is not functional.** `restaurant-rag.vercel.app` serves the
UI, but `/api/chat` returns a credentials error — Vercel has no environment
variables set, and `DATABASE_URL` points at the Docker-internal `db:5432`, so a
hosted Postgres is needed before the agent can run in production. Pinecone is
already hosted and populated. Local (`docker compose up`) is the working system.
