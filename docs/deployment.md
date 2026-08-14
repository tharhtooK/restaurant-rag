# Deployment — hosted Postgres + Vercel

> **Status** Reference · **executed** — the deploy is live and answering · **Updated** 2026-08-14 · **Version** v2

_Steps 1–3 were carried out on 2026-08-13/14. They are kept below as the record
of how production was built, not as work still to do._

## Where things stand

- `https://restaurant-rag.vercel.app/` serves the UI and `/api/chat` returns
  grounded answers naming real restaurants.
- Neon Postgres is provisioned through the Vercel Neon integration, migrated,
  and seeded. The integration supplies `RestaurantRag_*` variables; the app's
  own `DATABASE_URL` is set separately to the pooled string.
- Pinecone is hosted and populated. **Nothing to do there.**
- Production uses a **real OpenAI key against `api.openai.com`** —
  `OPENAI_BASE_URL` is deliberately unset, so production does not depend on the
  LiteLLM proxy or its per-student budget. Local development still goes through
  the proxy.

**Migrations run at build time.** `vercel.json` sets the build command to

```
DATABASE_URL=$RestaurantRag_DATABASE_URL_UNPOOLED npx prisma migrate deploy && npm run build
```

so schema changes reach Neon as part of the deploy that needs them, and a
migration failure fails the build instead of producing a running app whose code
and schema disagree. The **unpooled** URL is used for the reason in Step 1 —
Prisma Migrate cannot run through PgBouncer in transaction mode. This makes the
manual `migrate deploy` in Step 3 unnecessary for subsequent deploys.

**The crawler service is a separate deployment.** `CRAWLER_URL` points at a Fly
app (`restaurant-crawler-cqfv-w.fly.dev`), which is outside this repo and can be
down independently. `/api/chat` handles that: it returns `crawlUnavailable: true`
with a normal answer rather than failing the turn. Verified 2026-08-14 while the
Fly app was unreachable.

Use the alias `restaurant-rag.vercel.app`, never a
`restaurant-<hash>-<scope>.vercel.app` URL — those are immutable per-deployment
links frozen at the build that produced them.

## Step 1 — Create the Neon database

1. [neon.tech](https://neon.tech) → new project, name `restaurant-rag`, region
   near you.
2. From the connection details, copy **both** strings — you need each for a
   different purpose:

   | Which | Looks like | Used for |
   |---|---|---|
   | **Pooled** | `...@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require` | app runtime (serverless) |
   | **Direct** | `...@ep-xxx.region.aws.neon.tech/neondb?sslmode=require` | migrations |

   > ⚠️ **Do not run migrations through the pooled URL.** Neon's pooler runs
   > PgBouncer in transaction mode, which breaks the prepared statements Prisma
   > Migrate relies on. Symptoms are confusing — `prepared statement "s0" already
   > exists`, or a migration that appears to hang. Use the direct URL for
   > migrate, the pooled URL for the running app.

3. Put both in local `.env` **as new variables** so the Docker stack keeps
   working unchanged:

   ```bash
   DATABASE_URL_PROD="<pooled string>"
   DATABASE_URL_PROD_DIRECT="<direct string>"
   ```

   Keep the existing `DATABASE_URL="postgresql://app:app@db:5432/restaurant_rag?schema=public"`
   exactly as it is — that is what local development uses.

## Step 2 — Set Vercel environment variables

Project → Settings → Environment Variables → **Production**:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Neon **pooled** string |
| `OPENAI_API_KEY` | from local `.env` |
| `OPENAI_BASE_URL` | `https://parsity-litellm.fly.dev` |
| `PINECONE_API_KEY` | from local `.env` |
| `PINECONE_INDEX` | `restaurants` |
| `LANGSMITH_TRACING` | `true` |
| `LANGSMITH_API_KEY` | from local `.env` |
| `LANGSMITH_ENDPOINT` | `https://api.smith.langchain.com` |
| `LANGSMITH_PROJECT` | `restaurant-rag` |

Leave **`PINECONE_NAMESPACE` unset.** Production should read the default
namespace, which holds all reviews and gives richer answers. The `web-research`
namespace exists only so the eval can measure retrieval against
independently-sourced data (see `prisma/seed-data-independent.ts`).

**Redeploy after adding these.** Vercel only injects environment variables into
*new* deployments — adding a variable does not retroactively fix the running one.
Deployments → latest → Redeploy, or push any commit.

## Step 3 — Migrate, seed, and embed against Neon

Run from the repo root. These are one-time; they populate the Neon database that
production reads.

```bash
# 1. Schema — note the DIRECT url
DATABASE_URL="$DATABASE_URL_PROD_DIRECT" npx prisma migrate deploy

# 2. Data — 20 restaurants, 36 authored + 23 independent reviews
DATABASE_URL="$DATABASE_URL_PROD_DIRECT" npx tsx prisma/seed.ts
```

`migrate deploy` (not `migrate dev`) is correct for a non-interactive target: it
applies existing migrations without trying to author new ones or reset anything.

Pinecone needs **no re-ingestion** — it is a separate hosted service and the
vectors are already there, keyed by Review id. But note the caveat below.

> ⚠️ **Review IDs will not match.** `Review.id` is a cuid generated at seed time,
> and the Pinecone vector IDs came from the *local* seed. Re-seeding Neon
> produces different ids, so the existing vectors will not correspond to Neon
> rows. This does not break anything today: `search_opinions` returns
> `restaurantSlug` / `content` straight out of Pinecone metadata and never joins
> back to `Review` by id. It *would* break the moment anything looks a review up
> by id. If you want them consistent, re-run the ingest against Neon:
>
> ```bash
> DATABASE_URL="$DATABASE_URL_PROD" npx tsx scripts/ingest/embed-upsert.ts
> DATABASE_URL="$DATABASE_URL_PROD" npx tsx scripts/ingest/embed-upsert.ts web-research
> ```
>
> That overwrites the index with Neon-keyed vectors. Do it before demoing if
> you want one coherent story; skip it if you are short on time.

## Step 4 — Verify

```bash
curl -s -X POST https://restaurant-rag.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"cheap korean bbq in flushing"}'
```

Expected: JSON with `text` and `toolCalls`, naming a real restaurant.

Failure modes and what they mean:

| Response | Cause |
|---|---|
| `Missing credentials ... OPENAI_API_KEY` | env vars not set, or set but not redeployed |
| Prisma connection / timeout error | `DATABASE_URL` missing, wrong, or pointing at the direct URL under serverless load |
| Answers with no restaurant names | Neon reachable but empty — Step 3 seed did not run |
| `search_opinions` returns `[]` | `PINECONE_API_KEY` / `PINECONE_INDEX` missing |

Then click through the UI at `https://restaurant-rag.vercel.app/` and confirm a
question returns a grounded answer, and check the run appears in the LangSmith
`restaurant-rag` project.

## Known issues to mention rather than fix

- **Fette Sau has closed** — it served its last Williamsburg dinner after ~20
  years, and two goldens (G14, G20) reference it. Recommended handling: leave it
  and cite it as a staleness finding. It is a concrete argument for why the
  scraped pipeline in the original design would need periodic re-running.
  Replacing it means redoing the manifest entry, seed data, embeddings, and two
  goldens.
- **The eval runs locally, not in production.** `evals/runner.ts` imports the
  agent directly and needs a database; it is not wired to hit the deployed API.
  Demo the eval from the Docker stack.
