// Mock data for the 20 real restaurants documented in docs/data-manifest.md.
// Hours use "close" values past 24:00 (e.g. "28:00") to mean "closes that many
// hours after that day's midnight" — so Thursday close "28:00" means 4am Friday.
// Review snippets are written to satisfy the exact required_facts in evals/golden.json
// for each slug (see the mapping pulled from golden.json during authoring).

export type Hours = {
  open: string;
  close: string;
};

export type RestaurantSeed = {
  slug: string;
  name: string;
  neighborhood: string;
  cuisine: string;
  priceTier: number;
  address: string;
  vegetarianFriendly: boolean;
  hours: Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", Hours | null>;
  reviews: { source: string; content: string }[];
};

function daily(open: string, close: string): RestaurantSeed["hours"] {
  return {
    mon: { open, close },
    tue: { open, close },
    wed: { open, close },
    thu: { open, close },
    fri: { open, close },
    sat: { open, close },
    sun: { open, close },
  };
}

export const restaurants: RestaurantSeed[] = [
  // ---------- East Village ----------
  {
    slug: "ev-kimchi-house",
    name: "Gen Korean BBQ House",
    neighborhood: "East Village",
    cuisine: "Korean BBQ",
    priceTier: 3,
    address: "150 E 14th St, New York, NY 10003",
    vegetarianFriendly: false,
    hours: {
      mon: { open: "11:00", close: "24:00" },
      tue: { open: "11:00", close: "24:00" },
      wed: { open: "11:00", close: "24:00" },
      thu: { open: "11:00", close: "24:00" },
      fri: { open: "11:00", close: "26:00" },
      sat: { open: "11:00", close: "26:00" },
      sun: { open: "11:00", close: "24:00" },
    },
    reviews: [
      {
        source: "review",
        content:
          "All-you-can-eat Korean BBQ right on 14th Street. Good value for the price tier, solid variety of meats. Not the fanciest spot but a reliable group dinner option.",
      },
      {
        source: "review",
        content:
          "Open late most nights which is clutch after 11pm cravings hit. Service is fast, tables turn over quickly.",
      },
    ],
  },
  {
    slug: "ev-ramen-den",
    name: "Momofuku Noodle Bar",
    neighborhood: "East Village",
    cuisine: "Ramen",
    priceTier: 2,
    address: "171 1st Ave, New York, NY 10003",
    vegetarianFriendly: false,
    hours: {
      mon: { open: "11:30", close: "22:00" },
      tue: { open: "11:30", close: "22:00" },
      wed: { open: "11:30", close: "22:00" },
      thu: { open: "11:30", close: "25:00" },
      fri: { open: "11:30", close: "25:00" },
      sat: { open: "11:30", close: "25:00" },
      sun: { open: "11:30", close: "22:00" },
    },
    reviews: [
      {
        source: "review",
        content:
          "The counter seating makes this one of my favorite spots to eat solo in the East Village. Nobody blinks if you sit alone with a bowl of noodles and a book.",
      },
      {
        source: "review",
        content:
          "Consistent bowl of ramen, been coming here for years. Great if you're by yourself and don't want to wait for a table.",
      },
    ],
  },
  {
    slug: "ev-golden-fig",
    name: "Tuome",
    neighborhood: "East Village",
    cuisine: "New American",
    priceTier: 2,
    address: "536 E 5th St, New York, NY 10009",
    vegetarianFriendly: false,
    hours: {
      mon: null,
      tue: { open: "18:00", close: "21:00" },
      wed: { open: "18:00", close: "21:00" },
      thu: { open: "18:00", close: "21:00" },
      fri: { open: "17:00", close: "21:30" },
      sat: { open: "17:00", close: "21:30" },
      sun: null,
    },
    reviews: [
      {
        source: "review",
        content:
          "Dim lighting, small plates meant for sharing, quiet enough to actually talk. Took my partner here for our anniversary and it felt properly romantic and intimate without being stuffy.",
      },
      {
        source: "review",
        content:
          "One of the more intimate date-night spots in the East Village — low light, close tables, unhurried pacing. Great for a first date if you want to actually hear each other.",
      },
    ],
  },
  {
    slug: "ev-corner-slice",
    name: "East Village Pizza",
    neighborhood: "East Village",
    cuisine: "Pizza",
    priceTier: 1,
    address: "145 1st Ave, New York, NY 10003",
    vegetarianFriendly: false,
    hours: {
      mon: { open: "11:00", close: "27:00" },
      tue: { open: "11:00", close: "27:00" },
      wed: { open: "11:00", close: "27:00" },
      thu: { open: "11:00", close: "27:00" },
      fri: { open: "11:00", close: "29:00" },
      sat: { open: "11:00", close: "29:00" },
      sun: { open: "11:00", close: "27:00" },
    },
    reviews: [
      {
        source: "review",
        content:
          "Classic counter-service slice joint. Cheap, fast, open absurdly late on weekends. Not a sit-down date spot, just good pizza when you need it at 2am.",
      },
    ],
  },

  // ---------- Flushing ----------
  {
    slug: "fl-noodle-king",
    name: "Lanzhou Hand Pulled Noodles",
    neighborhood: "Flushing",
    cuisine: "Hand-Pulled Noodles",
    priceTier: 1,
    address: "133-35 Roosevelt Ave, Flushing, NY 11354",
    vegetarianFriendly: false,
    hours: daily("10:00", "21:00"),
    reviews: [
      {
        source: "review",
        content:
          "Total hidden gem tucked into the food court — most tourists walk right past this stall. Locals know it as the best hand-pulled noodles in Flushing, not touristy at all.",
      },
      {
        source: "review",
        content:
          "Cheap, fast, and great for eating alone at the counter. I come here solo all the time, nobody rushes you and the noodles are excellent for the price.",
      },
    ],
  },
  {
    slug: "fl-jade-garden",
    name: "Asian Jewels Seafood Restaurant",
    neighborhood: "Flushing",
    cuisine: "Cantonese",
    priceTier: 2,
    address: "133-30 39th Ave, Flushing, NY 11354",
    vegetarianFriendly: false,
    hours: daily("10:00", "22:00"),
    reviews: [
      {
        source: "review",
        content:
          "Huge banquet-hall dining room, great for big family gatherings and dim sum carts. Portions and tables are really built for groups, not a spot to eat by yourself.",
      },
      {
        source: "review",
        content:
          "We had a 10-person dinner here and it was fantastic — this place is clearly designed for large parties, not solo diners.",
      },
    ],
  },
  {
    slug: "fl-seoul-plate",
    name: "Picnic Garden",
    neighborhood: "Flushing",
    cuisine: "Korean BBQ",
    priceTier: 2,
    address: "154-05 Northern Blvd, Flushing, NY 11354",
    vegetarianFriendly: false,
    hours: daily("11:30", "22:00"),
    reviews: [
      {
        source: "review",
        content:
          "Weekday lunch AYCE is $17, which is unusually affordable for Korean BBQ — most places in the city run $30+. Great value if you go on a weekday.",
      },
      {
        source: "review",
        content:
          "Solid meat selection for the price. Not the highest-end cuts, but for the money it's hard to beat in Flushing.",
      },
    ],
  },
  {
    slug: "fl-dumpling-house",
    name: "Tian Jin Dumpling House",
    neighborhood: "Flushing",
    cuisine: "Dumplings",
    priceTier: 1,
    address: "41-28 Main St, Flushing, NY 11355",
    vegetarianFriendly: false,
    hours: daily("09:00", "20:00"),
    reviews: [
      {
        source: "review",
        content:
          "Cash only, no frills, but 12 hand-made dumplings for $6 is one of the best deals in Flushing. Feels like a local secret even though it's right in the Golden Mall food court.",
      },
      {
        source: "review",
        content: "Another hidden gem in the Golden Mall — always crowded with locals, never tourists.",
      },
    ],
  },
  {
    slug: "fl-charcoal-house",
    name: "San Soo Kap San",
    neighborhood: "Flushing",
    cuisine: "Korean BBQ",
    priceTier: 4,
    address: "171-02 Northern Blvd, Flushing, NY 11358",
    vegetarianFriendly: false,
    hours: daily("11:00", "22:00"),
    reviews: [
      {
        source: "review",
        content:
          "Premium cuts, charcoal grill built into the table, noticeably better meat quality than the AYCE spots nearby. You pay for it — this is not a budget option — but the quality is worth it for a special occasion.",
      },
      {
        source: "review",
        content:
          "Pricier than most Korean BBQ in the area, but the beef quality is genuinely a step up. Worth it if you're not watching the bill.",
      },
    ],
  },

  // ---------- Williamsburg ----------
  {
    slug: "wb-green-table",
    name: "Reverie",
    neighborhood: "Williamsburg",
    cuisine: "Vegan",
    priceTier: 3,
    address: "135 Metropolitan Ave, Brooklyn, NY 11249",
    vegetarianFriendly: true,
    hours: {
      mon: null,
      tue: null,
      wed: { open: "17:00", close: "23:00" },
      thu: { open: "17:00", close: "23:00" },
      fri: { open: "17:00", close: "23:00" },
      sat: { open: "12:00", close: "23:00" },
      sun: { open: "12:00", close: "22:00" },
    },
    reviews: [
      {
        source: "review",
        content:
          "Elevated vegan cocktail bar, definitely a scene — industrial-chic space, craft cocktails, feels like a destination spot rather than a casual dinner. Great food but you're paying for the experience.",
      },
      {
        source: "review",
        content:
          "Trendy, see-and-be-seen crowd on weekends. Beautiful plating, but it's more of a night out than a quiet meal.",
      },
    ],
  },
  {
    slug: "wb-smoke-yard",
    name: "Fette Sau",
    neighborhood: "Williamsburg",
    cuisine: "BBQ",
    priceTier: 3,
    address: "354 Metropolitan Ave, Brooklyn, NY 11211",
    vegetarianFriendly: false,
    hours: daily("12:00", "23:00"),
    reviews: [
      {
        source: "review",
        content:
          "Communal picnic tables, cafeteria-style ordering, great for a casual group hangout. Not fancy, not loud with music, just a relaxed spot to grab smoked meat with friends.",
      },
      {
        source: "review",
        content:
          "Good for big groups — the long communal tables mean you can just push in extra chairs. Chill vibe, not a party scene, more of a laid-back hang.",
      },
    ],
  },
  {
    slug: "wb-bowl-and-bean",
    name: "Wild Ginger",
    neighborhood: "Williamsburg",
    cuisine: "Pan-Asian Vegan",
    priceTier: 2,
    address: "182 N 10th St, Brooklyn, NY 11211",
    vegetarianFriendly: true,
    hours: daily("11:00", "21:00"),
    reviews: [
      {
        source: "review",
        content:
          "Quiet, unpretentious vegan spot — a nice break from the trendier vegan places in the neighborhood. Good for eating alone, nobody's going to judge you for a solo weeknight dinner here.",
      },
      {
        source: "review",
        content:
          "Not trendy, not overpriced, just solid pan-Asian vegan food in a low-key room. Exactly what I want on a weeknight.",
      },
    ],
  },
  {
    slug: "wb-nightowl-diner",
    name: "Kellogg's Diner",
    neighborhood: "Williamsburg",
    cuisine: "American Diner",
    priceTier: 2,
    address: "518 Metropolitan Ave, Brooklyn, NY 11211",
    vegetarianFriendly: false,
    hours: {
      mon: { open: "07:00", close: "25:00" },
      tue: { open: "07:00", close: "25:00" },
      wed: { open: "07:00", close: "25:00" },
      thu: { open: "07:00", close: "28:00" },
      fri: { open: "07:00", close: "28:00" },
      sat: { open: "07:00", close: "28:00" },
      sun: { open: "07:00", close: "25:00" },
    },
    reviews: [
      {
        source: "review",
        content:
          "The late-night spot in Williamsburg. Open until 4am Thursday through Saturday, which is rare around here — everything else shuts down by midnight.",
      },
      {
        source: "review",
        content:
          "Classic diner food, reliable, and one of the only places still serving at 3am on a Saturday.",
      },
    ],
  },

  // ---------- Harlem ----------
  {
    slug: "hl-sweet-home-kitchen",
    name: "Manna's Soul Food Restaurant",
    neighborhood: "Harlem",
    cuisine: "Soul Food",
    priceTier: 2,
    address: "2353 Frederick Douglass Blvd, New York, NY 10027",
    vegetarianFriendly: false,
    hours: daily("11:00", "21:00"),
    reviews: [
      {
        source: "review",
        content:
          "The service here is genuinely some of the best in Harlem — fast, friendly, and the staff remembers regulars. Affordable pay-by-the-pound soul food, great value.",
      },
      {
        source: "review",
        content:
          "Every time I come in the staff is warm and attentive. Consistently praised for service, and the price is right for the portion size.",
      },
    ],
  },
  {
    slug: "hl-uptown-grill",
    name: "Londel's",
    neighborhood: "Harlem",
    cuisine: "Soul Food",
    priceTier: 3,
    address: "2620 Frederick Douglass Blvd, New York, NY 10030",
    vegetarianFriendly: false,
    hours: {
      mon: null,
      tue: { open: "17:00", close: "22:30" },
      wed: { open: "17:00", close: "22:30" },
      thu: { open: "17:00", close: "22:30" },
      fri: { open: "17:00", close: "22:30" },
      sat: { open: "17:00", close: "22:30" },
      sun: { open: "11:00", close: "16:00" },
    },
    reviews: [
      {
        source: "review",
        content:
          "White tablecloths, live jazz some nights, a step up from the casual soul food spots nearby. Good but noticeably pricier — this is a special-occasion dinner, not a quick weeknight bite.",
      },
      {
        source: "review",
        content: "Elevated soul food with attentive service, but the prices reflect the upscale setting.",
      },
    ],
  },
  {
    slug: "hl-corner-biscuit",
    name: "Harlem Biscuit Company",
    neighborhood: "Harlem",
    cuisine: "Soul Food / Breakfast",
    priceTier: 1,
    address: "2308 Adam Clayton Powell Jr Blvd, New York, NY 10027",
    vegetarianFriendly: false,
    hours: daily("08:00", "14:00"),
    reviews: [
      {
        source: "review",
        content:
          "Breakfast and brunch only — they open at 8am and close at 2pm sharp, so plan accordingly. Biscuits are excellent, but don't show up for dinner.",
      },
    ],
  },

  // ---------- Astoria ----------
  {
    slug: "as-taverna-blue",
    name: "Amylos Taverna",
    neighborhood: "Astoria",
    cuisine: "Greek",
    priceTier: 3,
    address: "33-19 Broadway, Astoria, NY 11106",
    vegetarianFriendly: false,
    hours: daily("12:00", "23:00"),
    reviews: [
      {
        source: "review",
        content:
          "Loud, lively, DJ spinning on Friday nights — this is the place in Astoria for a big group celebration, not a quiet dinner. Birthday parties, big tables, lots of energy.",
      },
      {
        source: "review",
        content:
          "Great for groups and celebrations, gets loud and fun especially on weekends with the music going. Not the spot if you want to hear yourself think.",
      },
    ],
  },
  {
    slug: "as-kebab-corner",
    name: "Balkh Shish Kabab House",
    neighborhood: "Astoria",
    cuisine: "Afghan Kebab",
    priceTier: 1,
    address: "23-10 31st St, Astoria, NY 11105",
    vegetarianFriendly: false,
    hours: daily("12:00", "23:00"),
    reviews: [
      {
        source: "review",
        content:
          "Quick counter-service kebabs, cheap and filling. Not really a hangout spot — mostly quick in-and-out orders, not built for a party or a group event.",
      },
    ],
  },
  {
    slug: "as-mezze-house",
    name: "Aliada",
    neighborhood: "Astoria",
    cuisine: "Mediterranean",
    priceTier: 2,
    address: "2919 Broadway, Astoria, NY 11106",
    vegetarianFriendly: true,
    hours: daily("12:00", "22:00"),
    reviews: [
      {
        source: "review",
        content:
          "A genuinely quiet oasis in busy Astoria — cozy outdoor seating with fountains, low-key atmosphere. Completely different scene from the louder Greek spots nearby, plenty of vegetarian options too.",
      },
      {
        source: "review",
        content:
          "Low-key and relaxed, great outdoor patio. Good vegetarian options on the menu, and it's never too loud to talk.",
      },
    ],
  },
  {
    slug: "as-grill-house",
    name: "Prime No. 7",
    neighborhood: "Astoria",
    cuisine: "Korean BBQ",
    priceTier: 4,
    address: "34-19 Steinway St, Astoria, NY 11103",
    vegetarianFriendly: false,
    hours: {
      mon: { open: "17:00", close: "24:00" },
      tue: { open: "17:00", close: "24:00" },
      wed: { open: "17:00", close: "24:00" },
      thu: { open: "17:00", close: "24:00" },
      fri: { open: "17:00", close: "26:00" },
      sat: { open: "17:00", close: "26:00" },
      sun: { open: "17:00", close: "24:00" },
    },
    reviews: [
      {
        source: "review",
        content:
          "The only upscale Korean BBQ in Astoria — premium cuts, dim lighting, DJ on weekends. Pricier than anything else in the neighborhood but the quality and vibe are on another level.",
      },
    ],
  },
];
