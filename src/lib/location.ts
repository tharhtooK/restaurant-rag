/**
 * Where the user wants restaurants, parsed from one comma-separated answer.
 *
 * City and state are the pair that always matters; neighborhood only exists in
 * dense cities and stays null elsewhere. Crawling targets the city, so a bare
 * state has nothing to fetch and is rejected.
 */
export type Location = {
  neighborhood: string | null;
  city: string;
  state: string;
};

const STATE_CODE = /^[A-Za-z]{2}$/;

// "in mable grove" was stored as a city called exactly that on 2026-08-14, and
// the crawl it triggered came back full of Brooklyn restaurants. The trailing
// space matters: it stops "Independence" losing its first two letters.
const LEADING_PREPOSITION = /^(?:in|near|around|at|by)\s+/i;

// A place name, not a sentence. Four words covers "Truth or Consequences" and
// "Coeur d'Alene" while rejecting a question the user typed by mistake.
const MAX_WORDS_IN_CITY = 4;

export function parseLocation(input: string): Location | null {
  const cleaned = input.trim().replace(/[?!.]+$/, "").replace(LEADING_PREPOSITION, "");

  const parts = cleaned
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) return null;

  // A lone two-letter token is a state with no city attached, so there is
  // nothing to crawl. No US city is two letters, so this cannot swallow one.
  if (parts.length === 1 && STATE_CODE.test(parts[0])) return null;

  const hasState = parts.length > 1 && STATE_CODE.test(parts[parts.length - 1]);
  const state = hasState ? parts[parts.length - 1].toUpperCase() : "";
  const rest = hasState ? parts.slice(0, -1) : parts;

  if (rest.length === 0) return null;

  const city = rest[rest.length - 1];
  if (city.split(/\s+/).length > MAX_WORDS_IN_CITY) return null;

  const neighborhood = rest.length > 1 ? rest[0] : null;

  return { neighborhood, city, state };
}

/**
 * A city or neighborhood reduced to a case- and punctuation-free comparison key.
 *
 * Postgres matches these insensitively via `mode: "insensitive"`, but Pinecone
 * metadata filters are exact `$eq` with no insensitive mode, so `"east village"`
 * from the model returned zero snippets while `"East Village"` returned seven -
 * a silent empty result, not an error. Both the upsert and the filter run values
 * through here so the two sides always agree.
 */
export function normalizeLocationValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Namespaces a crawled slug by where the restaurant is.
 *
 * The crawler prefixes slugs from the neighborhood alone, so South Congress in
 * Austin and SoHo in Manhattan both yield "so-". import-crawl upserts by slug,
 * so a collision would overwrite a restaurant in another state. Prepending
 * rather than rebuilding keeps the crawler's slug stable across re-crawls.
 */
export function scopeSlug(slug: string, location: Location): string {
  const segments = [location.state, location.city].map(slugSegment).filter(Boolean);
  return [...segments, slug].join("-");
}

/**
 * Pulls city and state out of a crawled address.
 *
 * The crawler returns no city or state field, only the address, and Google
 * formats it as "<street>, <city>, <ST> <zip>[, USA]" for every US result seen
 * so far. Parsing here keeps the import stateless: it does not need to remember
 * what location a job was started for.
 */
export function parseAddressLocation(address: string): { city: string; state: string } {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);

  for (let i = parts.length - 1; i > 0; i--) {
    const match = /^([A-Za-z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/.exec(parts[i]);
    if (match) return { city: parts[i - 1], state: match[1].toUpperCase() };
  }

  return { city: "", state: "" };
}

/** One human-readable label for logs and for the 24h miss memory key. */
export function describeLocation(location: Location): string {
  return [location.neighborhood, location.city, location.state].filter(Boolean).join(", ");
}

/**
 * An address reduced to a comparison key.
 *
 * A restaurant's identity is its address: the crawler's slug is derived from
 * whichever neighborhood it was asked for, so the same place crawled as part of
 * "marine park" and again as part of "Brooklyn" arrives under two different
 * slugs. Google also appends ", USA" inconsistently, and the seeded corpus never
 * has it.
 */
export function normalizeAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/,\s*usa\s*$/, "")
    .replace(/[^a-z0-9]+/g, "");
}
