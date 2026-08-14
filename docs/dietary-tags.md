# Dietary tags — replacing `vegetarianFriendly`

> **Status** Design · **not built** — needs a migration decision · **Updated** 2026-08-12 · **Version** v1

Design only. The migration has not been run; it needs a decision first (§6).

---

## 1. The problem

`Restaurant.vegetarianFriendly Boolean` does not extend. Adding halal, kosher,
vegan, gluten-free as columns means a migration and a new tool argument per diet,
forever.

It also lies. `false` means both "we checked, it is not vegetarian-friendly" and
"we have no idea", and the agent cannot tell those apart.

## 2. The shape

One scalar list, no join table:

```prisma
model Restaurant {
  ...
  dietary String[]        // replaces vegetarianFriendly
  @@index([dietary], type: Gin)
}
```

Prisma generates `StringNullableListFilter` for this — verified against the
generated client, the operators are `has`, `hasEvery`, `hasSome`, `isEmpty`,
`equals`.

A join table would be more normalized and is not worth it at this size. Twenty
restaurants and a handful of tags do not need two extra tables and a join.

**Absence means unknown, not false.** A missing `halal` tag says we have no
evidence, which is the honest reading and what the agent should say.

## 3. Vocabulary

Lowercase kebab-case, normalized on write. A starter set, **not an enum**:

| Group | Tags |
|---|---|
| Diet | `vegetarian`, `vegan`, `pescatarian` |
| Religious | `halal`, `kosher` |
| Allergen | `gluten-free`, `nut-free`, `dairy-free`, `shellfish-free` |

New tags need no migration — write the string. The live vocabulary is whatever is
in the database, exposed the same way neighborhoods are (`/api/neighborhoods`),
so the UI and the system prompt can list what actually exists rather than a
hardcoded list.

Normalize at the edges — import and seed — so `"Halal"`, `"halal-certified"` and
`"Muslim friendly"` all land as `halal`. Without that, exact matching quietly
fails and the failure looks like missing data.

## 4. Tool change

`filter_restaurants` loses `vegetarianFriendly?: boolean` and gains:

```ts
dietary?: string[]     // ALL must be satisfied
```

Query with `hasEvery`, not `hasSome`. Dietary needs are constraints, not
preferences: someone asking for halal *and* gluten-free needs both, and returning
places that satisfy one is worse than returning nothing.

Describe it in the tool schema as "dietary requirements the restaurant must
satisfy" and let the model pass whatever the user said. Do not enumerate values
in the schema — that is the neighborhood enum mistake again.

## 5. Getting it wrong has real consequences

Halal and kosher are certifications, not vibes. Someone eating non-halal food
because the app said otherwise is a genuine harm, not a UX defect. So:

- **Only tag from an explicit source** — a certification, the restaurant's own
  site, an official listing attribute. Never infer from cuisine: Middle Eastern
  is not automatically halal, a deli is not automatically kosher.
- **Attribute the claim in the answer.** "Their site lists halal certification"
  is honest; "this place is halal" is the app taking on a guarantee it cannot
  make. Add a line to the system prompt's Grounding section.
- **Prefer absence to a guess.** The agent already handles "not in my data" well;
  that is the correct output when a source has not said so.

This applies to the crawler too — `crawler-service-spec.md` should require an
explicit source before emitting a religious tag.

## 6. Decision needed before implementing

**Migration touches the eval.** Replacing the column changes the tool schema the
model sees and the seed data, and G03 (`"vegetarian"`) and G10 (`"vegan"`) grade
against it. Sequence:

1. add `dietary String[]`, keep `vegetarianFriendly` temporarily
2. backfill: `vegetarianFriendly: true` → `dietary: ["vegetarian"]`
3. switch the tool and the seed to `dietary`
4. **run both corpora** — expect 18/20 authored, 20/20 independent, route and
   retrieval 20/20
5. only then drop `vegetarianFriendly`

Do not run steps 1–5 in one commit. Step 4 is the checkpoint; if the numbers
move, stop and find out why before dropping the column.

Two things worth knowing before starting:

- **We have no halal or kosher data today.** The schema will support it and every
  query will return nothing until the crawler supplies it. That is honest but
  unimpressive in a demo — worth pairing with the crawl work rather than shipping
  alone.
- **This does not conflict with the "absence of data is a feature" rule** in
  `CLAUDE.md`. That rule protects the reservations / parking / wait-time gaps
  that make G16, G17 and G20 gradable. Dietary is a different axis and none of
  those goldens touch it.
