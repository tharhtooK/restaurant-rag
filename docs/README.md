# Docs index

Every doc carries a status line under its title. **Read the status before the
content** — roughly half of what is in here describes things that do not exist
yet.

| Status | Meaning |
|---|---|
| **Standard** | Rules that apply to code being written now |
| **Reference** | Describes what is actually built and running |
| **Living** | Kept current as the project moves |
| **Guide** | Instructions for something not yet done |
| **Design** | **Not built.** A proposal or a handoff contract |

---

## Built and running

| Doc | What it is |
|---|---|
| [status.md](status.md) | Running project status — eval numbers, known problems, what is next. Start here. |
| [taxonomy.md](taxonomy.md) | The 6 query categories the 20 goldens are drawn from |
| [data-manifest.md](data-manifest.md) | Invented slug → real restaurant mapping |
| [coding-guidelines.md](coding-guidelines.md) | The style this repo is written to. Imported into `CLAUDE.md`, so it is loaded every session. |
| [deployment.md](deployment.md) | How production was built, and how migrations reach Neon on each deploy |

## Not built yet

| Doc | What it is | Blocked on |
|---|---|---|
| [crawler-service-spec.md](crawler-service-spec.md) | Contract for a **separate crawler repo** — paste as its opening task | The other repo existing |
| [on-demand-crawl.md](on-demand-crawl.md) | How this app decides to call the crawler: check local first, ask the user's neighborhood up front | The crawler service |
| [crawl-integration-plan.md](crawl-integration-plan.md) | Step-by-step to build the above here. **Phase 1 needs no crawler** | Nothing — Phase 1 is startable |
| [dietary-tags.md](dietary-tags.md) | Replacing `vegetarianFriendly` with a `dietary String[]` so halal, kosher and the rest fit | A migration decision |

---

## Reading order

**New to the project:** `status.md` → `taxonomy.md` → `data-manifest.md`.

**About to write code:** `coding-guidelines.md`, and `CLAUDE.md` in the repo root.

**Picking up the crawler work:** `on-demand-crawl.md` for the why, then
`crawl-integration-plan.md` for what to do here, then hand
`crawler-service-spec.md` to the other repo.

## Keeping this honest

The status line is the whole point of this index, so it has to stay true:

- When a design ships, flip its status to **Reference**, bump the version, and
  move its row up into "Built and running".
- When a design is abandoned, mark it **Superseded** and say what replaced it.
  Do not delete it — the reasoning is usually the valuable part.
- A doc that describes something unbuilt while claiming Reference status is worse
  than no doc, because it will be believed.
