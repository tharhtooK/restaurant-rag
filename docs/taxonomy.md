# Query Taxonomy — Restaurant RAG Golden Set (v1)

Scope: NYC, 5 neighborhoods (East Village, Flushing, Williamsburg, Harlem, Astoria), ~50 restaurants.
Retrieval: Postgres (structured) + Pinecone (semantic over reviews/menus/Reddit prose).
Agent pattern: single router + tool-calling agent.

This taxonomy defines the 6 categories the 20-item golden set (step 2) will be drawn from.

| ID | Category | Capability Stressed | Retrieval Path | # of 20 | Example Queries |
|---|---|---|---|---|---|
| `sql-filter` | Structured Filter Search | Correctly translating hard constraints (cuisine, neighborhood, price tier, hours) into a SQL predicate — no over- or under-inclusion | `sql` | 4 | "Cheap Korean BBQ spots in Flushing under $20 a plate" · "What restaurants in Williamsburg are open past 11pm?" |
| `vector-vibe` | Semantic Vibe & Experience | Retrieving qualitative atmosphere/experience signal that only exists as prose (reviews, Reddit threads, menu blurbs) — not a column | `vector` | 3 | "Somewhere cozy and romantic for a first date in the East Village" · "A loud, high-energy spot for a big group in Astoria" |
| `hybrid-filter` | Hybrid Structured + Semantic Filter | Query decomposition and tool orchestration — recognizing a request has both a hard filter and a soft filter, calling both retrieval paths, and intersecting correctly | `hybrid` | 4 | "Cheap noodle spot in Flushing that's good for eating alone" · "Affordable Harlem soul food place people say has great service" |
| `comparison` | Cross-Restaurant Comparison | Multi-entity retrieval and synthesis — pulling facts *and* review sentiment for 2+ named or filtered restaurants and reasoning across them, not just returning parallel single lookups | `hybrid` | 3 | "Which has better vegetarian options, [Restaurant A] or [Restaurant B]?" · "Compare the Korean BBQ spots in Flushing on price vs. how people rate them" |
| `fact-lookup` | Single-Entity Fact Grounding | Hallucination resistance on a *specific* named entity — must answer from the record or explicitly say the fact isn't in the dataset, never fabricate | `sql` | 3 | "What are [Restaurant X]'s hours on Sunday?" · "Does [Restaurant Y] take reservations?" |
| `unanswerable` | Unanswerable-by-Design | Refusal calibration — recognizing out-of-scope requests and declining/redirecting instead of guessing or hallucinating a retrieval result | `none` | 3 | "Book me a table for 4 at 7pm tonight" · "What's the best ramen shop in Tokyo?" |

## Category notes

**`sql-filter` — Structured Filter Search.** These are the queries where the dataset's structured columns (neighborhood, cuisine, price tier, hours) are sufficient on their own, and the only real risk is a bad SQL translation — missing a boundary condition, treating "cheap" as a fixed price rather than a tier, or silently dropping the neighborhood filter. This category is the baseline: if the agent can't nail these, nothing downstream matters.

**`vector-vibe` — Semantic Vibe & Experience.** These deliberately avoid any structured column. "Cozy," "romantic," "high-energy" don't exist as fields — they only exist as language in reviews and Reddit prose. This stresses embedding quality and whether the agent correctly routes to Pinecone instead of trying (and failing) to force a vibe into a SQL WHERE clause.

**`hybrid-filter` — Hybrid Structured + Semantic Filter.** A hard constraint (price, neighborhood, cuisine) *anded* with a soft one (sentiment, suitability, tone) that can only come from unstructured text. The graded capability isn't retrieval quality in isolation — it's whether the agent recognizes it needs both tools and correctly intersects rather than just answering off whichever tool fires first.

**`comparison` — Cross-Restaurant Comparison.** Requires holding 2+ entities in context simultaneously and synthesizing a comparative answer, which is a materially different shape of task than "find me one thing" — it exercises multi-hop retrieval (fetch A, fetch B, compare) and guards against the agent collapsing into a single-restaurant answer when two were asked for.

**`fact-lookup` — Single-Entity Fact Grounding.** These name a specific restaurant and ask for a specific fact. The trap is subtle: some of these facts genuinely won't be in the dataset (e.g., reservation policy, if that field was never scraped), and the correct behavior is to say so — not to infer a plausible-sounding answer from the restaurant's general vibe. This is where hallucination is easiest to catch because there's a single verifiable ground truth per item.

**`unanswerable` — Unanswerable-by-Design.** Spans three failure modes: an out-of-scope city (no data exists — nothing to retrieve), a transactional request (retrieval is irrelevant — this needs a capability the system doesn't have, not a lookup), and a fact the dataset structurally cannot contain (e.g., real-time wait times). Grading this category is about refusal quality: does the agent decline cleanly and say why, or does it retrieve something plausible-but-wrong and answer anyway.

## Path distribution check

`sql` ×2, `vector` ×1, `hybrid` ×2, `none` ×1 — all four retrieval paths are represented, so the golden set can separately score routing accuracy (did it pick the right path) from answer quality (given the right path, was the answer correct).
