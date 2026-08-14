# restaurant-crawler — service spec

> **Status** Design · **not built** — handoff spec for a separate repo · **Updated** 2026-08-12 · **Version** v1

Handoff document for a **separate repo**. Paste this as the opening task in that
repo. It is a contract, not an implementation plan: how the crawler is built
inside is its own business, as long as the seam below holds.

The consumer is `restaurant-rag` (Next.js on Vercel, Postgres + Pinecone).

---

## 1. What you are building

An HTTP service that, given a **neighborhood name**, crawls public sources for
restaurants there and returns structured restaurant records plus review text.

That is the whole job. It acquires data. It does not store it, embed it, or
know anything about the consumer.

### Why a separate service (do not fight this)

- **Vercel cannot crawl.** Serverless functions cap at 60s (Hobby) / 300s (Pro),
  have no browser binary, and are size-limited. Playwright will not run there.
- **crawl4ai is Python**, the consumer is TypeScript.
- A crawl takes minutes, not milliseconds.

So the boundary is an HTTP API on a long-running host. Not a library, not a
function call, not a Vercel route.

## 2. Non-goals

Do **not** build these. They belong to the consumer:

- No embeddings, no vector store, no Pinecone
- No Postgres, no database of any kind (job state may be in memory)
- No knowledge of the consumer's schema beyond the JSON below
- No knowledge of the eval, the goldens, or which restaurants "should" be found
- No judgement about data quality — return what you found, flag what failed

## 3. The API

Three endpoints. Auth is a bearer token on everything except `/health`.

```
GET  /health              -> 200 {"ok": true}
POST /crawl               -> 202 {"jobId": "...", "status": "queued"}
GET  /crawl/{jobId}       -> 200 {"jobId": "...", "status": ..., ...}
```

**Async by submit-and-poll.** A crawl takes minutes; a synchronous request would
time out at the Vercel end. No webhooks — polling is simpler, needs no public
callback URL, and makes a live demo legible because you can show progress.

`Authorization: Bearer <CRAWLER_API_KEY>` — a single shared secret from env.
Without it, anyone who finds the URL can burn your quota and your money.

### POST /crawl — the arguments

```jsonc
{
  "neighborhood": "Bushwick",        // required
  "city": "New York",                // optional, default "New York"
  "limit": 10,                       // optional, default 10 — max restaurants
  "maxReviewsPerRestaurant": 10,     // optional, default 10
  "sources": ["google", "foursquare", "reddit", "website"]  // optional, default all
}
```

Keep `limit` small for demos. 3–5 restaurants should finish inside ~90 seconds.

**Be idempotent.** If a job for the same `neighborhood` is already `queued` or
`running`, return that job's id with `202` rather than starting a second crawl.
The consumer calls this on a user click and clicks get double-fired.

### GET /crawl/{jobId} — the result

`status` is one of `queued` | `running` | `succeeded` | `failed`.

While running, return progress and omit `restaurants`:

```jsonc
{
  "jobId": "a1b2c3",
  "status": "running",
  "progress": { "found": 7, "completed": 3, "total": 10 }
}
```

When succeeded:

```jsonc
{
  "jobId": "a1b2c3",
  "status": "succeeded",
  "neighborhood": "Bushwick",
  "crawledAt": "2026-08-12T20:00:00Z",
  "restaurants": [
    {
      "slug": "bw-robertas",
      "name": "Roberta's",
      "neighborhood": "Bushwick",
      "cuisine": "Pizza",
      "priceTier": 2,
      "address": "261 Moore St, Brooklyn, NY 11206",
      "dietary": ["vegetarian", "vegan"],
      "hours": {
        "mon": { "open": "11:00", "close": "23:00" },
        "tue": { "open": "11:00", "close": "23:00" },
        "wed": { "open": "11:00", "close": "23:00" },
        "thu": { "open": "11:00", "close": "23:00" },
        "fri": { "open": "11:00", "close": "00:00" },
        "sat": { "open": "10:00", "close": "00:00" },
        "sun": null
      },
      "reviews": [
        {
          "content": "The wood-fired pizza is the draw...",
          "source": "google",
          "sourceUrl": "https://...",
          "publishedAt": "2026-07-01"
        }
      ],
      "raw": { "google": {}, "foursquare": {} }
    }
  ],
  "sourceStatus": {
    "google": "ok",
    "foursquare": "ok",
    "reddit": "partial",
    "website": "failed"
  },
  "errors": [
    { "source": "website", "slug": "bw-robertas", "message": "navigation timeout" }
  ]
}
```

**Field names are camelCase and match the consumer's Prisma schema exactly**, so
its importer is validate-and-insert with no renaming. This is the one place the
spec bends Python convention on purpose — it removes a whole mapping layer.

**Partial success is normal and must not fail the job.** If Google worked and
Reddit did not, return `status: "succeeded"` with `sourceStatus.reddit` set and
the reason in `errors`. A job only `failed` if it produced no restaurants at all.

`raw` is per-source untouched payloads, for debugging normalization. The
consumer ignores it.

## 4. Normalization rules

This is where the bugs live. Be strict.

**hours** — exactly seven keys `mon,tue,wed,thu,fri,sat,sun`. Each is either
`null` (closed that day) or `{"open": "HH:MM", "close": "HH:MM"}` in **24-hour**
time. No `"11 AM – 10 PM"`, no `"Closed"`, no missing days. A place open past
midnight closes at `"00:00"`–`"05:59"`; the consumer knows this reads as
"earlier than evening" and handles it, but be consistent.

**priceTier** — integer 1–4 only.

| Meaning | Tier | Google `priceLevel` | Foursquare `price` |
|---|---|---|---|
| under ~$15 | 1 | 1 | 1 |
| ~$15–30 | 2 | 2 | 2 |
| ~$30–50 | 3 | 3 | 3 |
| $50+ | 4 | 4 | 4 |

If no source gives a price, use `2` and record that in `raw`. Never emit `0`
or `null`.

**slug** — lowercase, kebab-case, stable across re-crawls, prefixed with a short
neighborhood code: `bw-robertas`. Existing codes in use: `ev` East Village,
`fl` Flushing, `wb` Williamsburg, `hl` Harlem, `as` Astoria. Pick a new two-letter
code per new neighborhood. Stability matters — the consumer upserts on slug, so
an unstable slug creates duplicates.

**cuisine** — a short human label (`"Pizza"`, `"Korean BBQ"`, `"Dim Sum"`), not
a source-specific category id.

**dietary** — array of lowercase kebab-case tags, `[]` when nothing is known.
Starter vocabulary: `vegetarian`, `vegan`, `pescatarian`, `halal`, `kosher`,
`gluten-free`, `nut-free`, `dairy-free`, `shellfish-free`. Not a closed set —
emit a new tag rather than dropping information, but normalize casing and
spelling (`"Halal"`, `"halal certified"` → `halal`).

**Only emit a tag when a source explicitly states it** — a certification, the
restaurant's own site, or an official listing attribute. **Never infer from
cuisine.** Middle Eastern is not automatically halal; a deli is not automatically
kosher. An omitted tag reads as "unknown", which is correct and safe; a wrong
halal or kosher tag can cause someone real harm. Put the evidence in `raw` so the
consumer can audit it.

**reviews.content** — plain text, 1–3 sentences, no markup, no reviewer names,
no star ratings embedded in the prose. Quote or close-paraphrase what the
reviewer said. **Do not summarize multiple reviews into one.**

## 5. Sources

Prefer official APIs where they exist; scrape only what you must.

| Source | Approach | Note |
|---|---|---|
| Google Places | **Official Places API** | Scraping Maps breaks Google's ToS. The API is paid — set a budget cap. |
| Foursquare | **Official Places API** | Free tier is generous. |
| Reddit | **Official API** (`/r/FoodNYC` etc.) | Needs an app credential. Best source of honest opinion prose. |
| Restaurant sites | **Playwright / crawl4ai** | This is the real crawling exercise: hours, menus, veg options. |

Respect `robots.txt`. Rate limit yourself (1–2 req/s per host). Set a per-page
timeout and a whole-job timeout. Cache aggressively during development so you are
not re-hitting live sites on every run.

## 6. Operational requirements

- **Deploy target**: Render, Railway, or Fly.io — anywhere that runs a container
  with a browser. Use a Playwright base image; do not hand-install Chromium.
- **Cold starts**: free tiers sleep. For a live demo, either pay for always-on or
  hit `/health` a few minutes beforehand to wake it.
- **Job state** may be an in-memory dict. It is lost on restart; that is an
  acceptable tradeoff here, but say so in your README.
- **Whole-job timeout** — hard cap (5 min suggested). A hung crawl during a demo
  is worse than a partial result.
- **Logs** — one line per restaurant per source with outcome and duration. You
  will need them when a live demo misbehaves.

## 7. Acceptance criteria

1. `POST /crawl {"neighborhood":"Bushwick","limit":3}` returns a jobId in under
   one second.
2. Polling that jobId eventually returns `succeeded` with 3 restaurants.
3. Every returned record validates against the shape in §3 — all seven `hours`
   keys present, `priceTier` in 1–4, slug stable.
4. Re-running the same crawl produces the **same slugs**.
5. Killing one source (bad credential) still returns `succeeded` with that source
   marked in `sourceStatus`.
6. No endpoint except `/health` is reachable without the bearer token.

## 8. What the consumer does with this

Context so the seam makes sense — none of this is yours to build.

`restaurant-rag` runs `scripts/ingest/import-crawl.ts <jobId>`, which:

1. Fetches `GET /crawl/{jobId}`
2. Validates the payload with zod
3. Upserts `Restaurant` rows by `slug`
4. Inserts `Review` rows with `source: "crawled:<source>"`
5. Runs the existing `scripts/ingest/embed-upsert.ts` to chunk, embed, and upsert
   into a **separate Pinecone namespace** (`crawled`)

The separate namespace is not optional — see the warning in the consumer's
`CLAUDE.md`. Its eval grades three isolated corpora, and mixing crawled text into
the existing ones destroys the measurement.

The consumer only calls you when it has checked its own Postgres and vector store
first and found nothing — see [`on-demand-crawl.md`](on-demand-crawl.md). Assume
every request is a genuine cache miss, and that a human clicked a button to
authorise it.
