# Data Manifest — Golden Slug → Real Restaurant (Step 3)

Maps the 20 invented placeholder slugs in [`evals/golden.json`](../evals/golden.json) to real,
verifiable NYC restaurants, researched via web search (no Google Places/Foursquare/Reddit API
access in this pass — see caveats below).

**Status of `required_facts`**: address, cuisine, and price tier below are grounded in real
listings (Yelp/OpenTable/restaurant sites) and reasonably solid. Review-*sentiment* facts
(e.g. "reviewers call it a hidden gem," "reviewers praise the service," "reviewers describe it
as loud") are based on secondhand summaries of review language surfaced by search, not the raw
review corpus itself. Treat these as **plausible, not confirmed** until the actual scrape
(Step 4/5) pulls real reviews and someone checks whether the sentiment holds up at corpus scale.
Facts golden.json deliberately designed as *not in the dataset* (reservation policy, parking,
real-time wait time) are unaffected by this — they stay absent regardless of what's actually
true for the real restaurant, since the point is testing refusal, not the restaurant's real
policies.

## East Village

| Slug | Real Restaurant | Address | Cuisine | Price | Notes |
|---|---|---|---|---|---|
| `ev-kimchi-house` | Gen Korean BBQ House | 150 E 14th St | Korean BBQ | $$$ | AYCE $27.95 lunch / $34.95 dinner. Closes 12am Mon–Thu/Sun, 2am Fri–Sat. Sits right at the East Village/Union Square boundary (14th St) — flag if strict neighborhood-boundary grading matters. |
| `ev-ramen-den` | Momofuku Noodle Bar | East Village | Ramen | $$ | Counter seating, well-documented as good for solo/quick meals. |
| `ev-golden-fig` | Tuome | 536 E 5th St | New American (Asian-influenced small plates) | $$ | Not literally Mediterranean/Moroccan as originally invented — real match is Michelin-recognized, intimate small-plates dining, which is what G05's required_facts actually grade (romantic/intimate, dim lighting, small plates), not the cuisine label. |
| `ev-corner-slice` | East Village Pizza | 145 1st Ave | Pizza | $ | Confirmed open until 3am Sun–Thu, 5am Fri–Sat. Slices from $4.99. |

## Flushing

| Slug | Real Restaurant | Address | Cuisine | Price | Notes |
|---|---|---|---|---|---|
| `fl-noodle-king` | Lanzhou Hand Pulled Noodles | 133-35 Roosevelt Ave (New York Food Court) | Hand-pulled noodles | $ | Food-court stall, genuinely low-profile — good fit for "hidden gem, not touristy." |
| `fl-jade-garden` | Asian Jewels Seafood Restaurant | Flushing | Cantonese (banquet-style) | $$ | Large banquet-hall format, family/group-style ordering — matches "not solo-friendly" framing. |
| `fl-seoul-plate` | Picnic Garden | 154-05 Northern Blvd | Korean BBQ (AYCE) | $$ | Weekday lunch AYCE is $17 — directly satisfies G01's "under $20" requirement. Weekend lunch is $25. |
| `fl-dumpling-house` | Tian Jin Dumpling House | 41-28 Main St (Golden Mall) | Dumplings | $ | Confirmed cash-only. 12 dumplings for $6. |
| `fl-charcoal-house` | San Soo Kap San | 171-02 Northern Blvd / 38-13 Union St (two locations) | Korean BBQ | $$$$ | $30–50/person, reviews describe it as quality-focused but pricier — matches the "better meat quality, less value" side of the G13 comparison. |

## Williamsburg

| Slug | Real Restaurant | Address | Cuisine | Price | Notes |
|---|---|---|---|---|---|
| `wb-green-table` | Reverie | 135 Metropolitan Ave | Vegan (cocktail bar) | $$$ | Search results describe it as an "elevated," destination-style vegan spot — fits the "trendy" framing G10 needs it to have. |
| `wb-smoke-yard` | Fette Sau | 354 Metropolitan Ave | BBQ | $$$ | Confirmed communal tables, explicitly described as built for big groups. |
| `wb-bowl-and-bean` | Wild Ginger | 182 N 10th St | Pan-Asian vegan | $$ | Described as casual, quiet, low-key — good contrast to Reverie for G10's "not overpriced/trendy" requirement. |
| `wb-nightowl-diner` | Kellogg's Diner | 518 Metropolitan Ave | American diner | $$ | Confirmed 24/7 (Brooklyn institution since 1928, reopened under new ownership). |

## Harlem

| Slug | Real Restaurant | Address | Cuisine | Price | Notes |
|---|---|---|---|---|---|
| `hl-sweet-home-kitchen` | Manna's Soul Food Restaurant | 2353 Frederick Douglass Blvd | Soul food (pay-by-pound) | $$ | Reviews specifically call out friendly/fast service — matches G09's service-praise requirement well. |
| `hl-uptown-grill` | Londel's | 2620 Frederick Douglass Blvd | Soul food (upscale, white-tablecloth) | $$$ | Dinner 5–10:30pm Tue–Sat, brunch Sun 11am–4pm, closed Mon. "Opens at 5pm" holds for weekdays; Sunday is the exception — worth a footnote if a golden ever tests Sunday hours specifically (none currently do). |
| `hl-corner-biscuit` | Harlem Biscuit Company | 2308 Adam Clayton Powell Jr Blvd | Soul food / breakfast | $ | Confirmed closes at 2pm daily — exact match to the invented fact. |

## Astoria

| Slug | Real Restaurant | Address | Cuisine | Price | Notes |
|---|---|---|---|---|---|
| `as-taverna-blue` | Amylos Taverna | 33-19 Broadway | Greek (seafood taverna) | $$$ | DJ Friday nights, described as lively — close match to "live music Fri/Sat" framing (DJ, not a live band, if that distinction matters later). |
| `as-kebab-corner` | Balkh Shish Kabab House | 23-10 31st St | Afghan (kebab-focused) | $ | Actually Afghan cuisine, not Turkish as originally invented — same kebab-centric category, and no golden's required_facts hinge on "Turkish" specifically, so this doesn't break anything. Flagging in case cuisine-label precision matters later. |
| `as-mezze-house` | Aliada | 2919 Broadway | Greek/Cypriot Mediterranean | $$ | Confirmed quiet outdoor seating explicitly described as a "quiet oasis" — strong match for G11's quiet/low-key requirement. |
| `as-grill-house` | Prime No. 7 | 34-19 Steinway St | Korean BBQ (upscale) | $$$$ | Described as the only Korean BBQ in Astoria, premium positioning, dim lighting, DJ weekends, open till 2am weekends. |

## Known gaps / follow-ups before Step 4 (scrapers)

1. **Cuisine label drift**: two slugs (`ev-golden-fig`, `as-kebab-corner`) matched to real restaurants with a different cuisine label than originally invented. Neither breaks a golden's `required_facts`, but worth a final check against `evals/golden.json` before scraping locks the data in.
2. **Neighborhood boundary**: `ev-kimchi-house` (Gen Korean BBQ House, 150 E 14th St) sits right at the East Village/Union Square line. If the scraper's neighborhood-tagging logic is strict about boundaries, double-check this one lands in "East Village."
3. **Review-sentiment facts are unverified at corpus scale** (see status note above) — this is expected to be resolved by the actual review scrape, not by this manifest.
4. **South Brooklyn padding restaurants** (Gerritsen Beach, Marine Park, Avenue U) not yet sourced — these aren't required by any golden, only needed to pad the corpus toward the ~50-restaurant target. Not blocking Step 4 for the 20 required restaurants.
