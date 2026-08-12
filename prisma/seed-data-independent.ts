/**
 * Independently-sourced review content.
 *
 * WHY THIS FILE EXISTS
 * The reviews in seed-data.ts were written to satisfy evals/golden.json's
 * required_facts. Grading the goldens against them is circular: question and
 * haystack share an author, so a passing score measures plumbing, not retrieval.
 *
 * These reviews were instead sourced from web research on what real reviewers
 * actually say (Yelp / Tripadvisor / The Infatuation / Google aggregates, August
 * 2026), gathered per-restaurant WITHOUT consulting the goldens. Dominant themes
 * were taken as found — including negatives and details that contradict the
 * authored set. They are paraphrased rather than quoted verbatim.
 *
 * RESIDUAL BIAS, stated plainly: I still chose which themes to include and wrote
 * the sentences, and I already knew the goldens when I did it. This weakens the
 * circularity substantially; it does not eliminate it. A fully clean test would
 * use raw third-party review text ingested by someone who had never read the
 * goldens.
 *
 * CONTRADICTIONS FOUND (the point of the exercise):
 *  - Picnic Garden: real reviews report AYCE at ~$41/person. The authored set
 *    claimed a $17 weekday lunch, which is what made G01's "entree under $20"
 *    satisfiable at all.
 *  - Manna's: real reviews are mixed on price — several call the pay-by-weight
 *    buffet expensive. The authored set called it unambiguously affordable.
 *  - Lanzhou: real reviews mention difficulty finding seating; the authored set
 *    sold it as ideal for solo counter dining.
 *  - Fette Sau: CLOSED. Served its last Williamsburg dinner after ~20 years.
 *
 * COVERAGE: 14 of 20 restaurants. The 6 without independent reviews
 * (hl-corner-biscuit, wb-nightowl-diner, ev-corner-slice, ev-kimchi-house,
 * as-kebab-corner, as-grill-house) are only ever reached by the structured route
 * or appear as forbidden distractors, so their absence from the vector index
 * does not invalidate any golden.
 */

export type IndependentReview = {
  slug: string;
  content: string;
};

export const independentReviews: IndependentReview[] = [
  // ---------- East Village ----------
  {
    slug: "ev-golden-fig",
    content:
      "Sits on a quiet stretch of 5th Street near Avenue B and feels like a low-key place you " +
      "could wander into. Dim and intimate, closer to a chic tavern than a typical upscale NYC " +
      "room — a good date spot without the pressure. Service is friendly and unpretentious.",
  },
  {
    slug: "ev-golden-fig",
    content:
      "Seating is cramped and it can be uncomfortable. If you're expecting something new or " +
      "experimental you may find it a little snoozy — prices have moved with inflation while the " +
      "flavors haven't changed much in a decade.",
  },
  {
    slug: "ev-ramen-den",
    content:
      "Counter and bar seating with a theatrical view of the kitchen — fun to sit and watch the " +
      "cooks work, and well suited to eating alone. Reasonably priced for the quality.",
  },
  {
    slug: "ev-ramen-den",
    content:
      "Lively, energetic and casual — a bustling, sometimes noisy room. More informal than " +
      "romantic, so it's great for a spirited night out rather than a quiet intimate dinner. " +
      "Extremely popular; walk-in seats are almost impossible at peak hours.",
  },

  // ---------- Flushing ----------
  {
    slug: "fl-noodle-king",
    content:
      "Big steaming bowls of noodles in a rich broth with beef, bok choy and cilantro, and the " +
      "noodles are hand-pulled in front of you. Flavors are there, chewy and tasty, and the price " +
      "is reasonable.",
  },
  {
    slug: "fl-noodle-king",
    content:
      "It's a stall in a food court, so seating can be hard to find when it's busy.",
  },
  {
    slug: "fl-jade-garden",
    content:
      "A cavernous, chandelier-lit banquet hall with large round tables, mostly sized for seven " +
      "or eight. Lots of multi-generational families and celebrations. Lively, with a dull roar of " +
      "conversation and dim sum carts arriving at speed. Long waits on weekends, especially for " +
      "big groups.",
  },
  {
    slug: "fl-seoul-plate",
    content:
      "All-you-can-eat Korean BBQ running about $41 per person with a 90-minute limit. Wide " +
      "spread — meats and seafood plus cold salads, chicken wings, scallion pancakes, soup and " +
      "rice stations. Staff are attentive and change the grill for you. Very busy on weekends; " +
      "reservations recommended.",
  },
  {
    slug: "fl-dumpling-house",
    content:
      "Buried in the basement of the Golden Shopping Mall and completely unassuming — genuinely " +
      "hard to find, and the setting is gritty enough that the dinginess puts some people off. " +
      "Over a dozen dumpling fillings that go well beyond pork and chive; the lamb and green " +
      "squash is a standout. Staff are helpful despite the language barrier. Around 12 for $7.",
  },
  {
    slug: "fl-charcoal-house",
    content:
      "Generous portions of high-quality meat with a strong spread of complimentary banchan. " +
      "Staff grill your order tableside rather than leaving it to you. Cozy, prompt and friendly.",
  },
  {
    slug: "fl-charcoal-house",
    content:
      "Opinion splits on price: the food is top quality but the cost keeps some people away, and " +
      "Flushing has plenty of cheaper options. Choice kalbi runs about $41 a serving. Worth it as " +
      "an occasional splurge.",
  },

  // ---------- Williamsburg ----------
  {
    slug: "wb-green-table",
    content:
      "Entirely plant-based and kosher-certified, built around shared plates — cheese boards, " +
      "mushroom sliders, squash gratin, root vegetable tarts — with an inventive cocktail list and " +
      "elaborate desserts. Reviewers consistently single out the shared plates, the cocktails and " +
      "the elegant atmosphere.",
  },
  {
    slug: "wb-smoke-yard",
    content:
      "Roast meats and simple sides served on long communal tables in a converted auto-body shop " +
      "with big garage doors — you will likely sit next to strangers. Easy-going, cool vibe. With " +
      "four or more people the move is to just order everything and hold a picnic table for hours.",
  },
  {
    slug: "wb-smoke-yard",
    content:
      "Note: after almost twenty years on Metropolitan Avenue, the Williamsburg location served " +
      "its last dinner and has closed.",
  },
  {
    slug: "wb-bowl-and-bean",
    content:
      "Vegan and raw options alongside sushi and Japanese plates. Visiting mid-afternoon the room " +
      "was very quiet and calming. It doesn't seem widely known on North 10th, so it's rarely " +
      "crowded and there's seldom a wait, though table space is limited.",
  },
  {
    slug: "wb-bowl-and-bean",
    content:
      "Excellent sauces and the wheat-meat dishes are very good. Some call it the best vegan food " +
      "in Brooklyn for the price.",
  },

  // ---------- Harlem ----------
  {
    slug: "hl-sweet-home-kitchen",
    content:
      "Pay-by-weight buffet: grab a box, fill it, pay for what it weighs. Food is fresh and warm, " +
      "service is fast and efficient, and the room is casual — plastic utensils and simple decor, " +
      "which many feel suits it. A Harlem institution since 1984.",
  },
  {
    slug: "hl-sweet-home-kitchen",
    content:
      "Reviews split on cost. Some are happy with the prices for the quality, others say the " +
      "buffet is good but far too expensive and warn you'll spend more than you expect.",
  },
  {
    slug: "hl-uptown-grill",
    content:
      "A Harlem supper club since 1995 serving Southern and Creole cooking. White tablecloths, " +
      "attentive service and live jazz on Friday and Saturday evenings make for an upscale, " +
      "date-night atmosphere that nods to Harlem's older nightlife.",
  },
  {
    slug: "hl-uptown-grill",
    content:
      "Reviews are mixed — plenty of praise, but some diners report disappointing food, " +
      "particularly at brunch.",
  },

  // ---------- Astoria ----------
  {
    slug: "as-taverna-blue",
    content:
      "Festive, inviting and stylish with warm, attentive service and a great open room. Weekends " +
      "bring a DJ and a lively crowd for cocktails and desserts. It gets very busy at peak hours, " +
      "which can mean a wait, though most think the food justifies it.",
  },
  {
    slug: "as-mezze-house",
    content:
      "A Greek-Cypriot taverna going since 2002, with a cozy indoor room and a popular outdoor " +
      "area — the cherry blossom trees out there get mentioned a lot. Guests repeatedly describe " +
      "it as cozy and romantic with attentive service.",
  },
  {
    slug: "as-mezze-house",
    content:
      "Midweek is the quieter visit and easier for reservations; Friday through Sunday evenings " +
      "are livelier. For a calmer meal, ask for an outdoor table on a still night or book an early " +
      "indoor seating.",
  },
];
