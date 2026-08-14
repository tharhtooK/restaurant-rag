import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseAddressLocation, parseLocation, scopeSlug } from "../src/lib/location";

describe("parseLocation", () => {
  test("city and state", () => {
    assert.deepEqual(parseLocation("Austin, TX"), {
      neighborhood: null,
      city: "Austin",
      state: "TX",
    });
  });

  test("neighborhood, city and state", () => {
    assert.deepEqual(parseLocation("South Congress, Austin, TX"), {
      neighborhood: "South Congress",
      city: "Austin",
      state: "TX",
    });
  });

  test("city alone is still usable - the crawler can resolve it", () => {
    assert.deepEqual(parseLocation("Austin"), {
      neighborhood: null,
      city: "Austin",
      state: "",
    });
  });

  test("state is upper-cased so TX and tx agree", () => {
    assert.deepEqual(parseLocation("austin, tx"), {
      neighborhood: null,
      city: "austin",
      state: "TX",
    });
  });

  test("extra whitespace is trimmed", () => {
    assert.deepEqual(parseLocation("  Austin ,  TX  "), {
      neighborhood: null,
      city: "Austin",
      state: "TX",
    });
  });

  test("empty segments are dropped", () => {
    assert.deepEqual(parseLocation("Austin,,TX"), {
      neighborhood: null,
      city: "Austin",
      state: "TX",
    });
  });

  test("more than three parts keeps the first as the neighborhood", () => {
    assert.deepEqual(parseLocation("South Congress, Travis County, Austin, TX"), {
      neighborhood: "South Congress",
      city: "Austin",
      state: "TX",
    });
  });

  // Boroughs read as cities, which is correct: Brooklyn is what the crawler and
  // Google both use in an address, and it stops "Brooklyn" becoming a fake
  // neighborhood the way it did on 2026-08-13.
  test("a borough is treated as the city", () => {
    assert.deepEqual(parseLocation("Brooklyn, NY"), {
      neighborhood: null,
      city: "Brooklyn",
      state: "NY",
    });
  });

  test("a two-letter city with no state is a city, not a state", () => {
    assert.deepEqual(parseLocation("Ely"), { neighborhood: null, city: "Ely", state: "" });
  });

  test("a bare state has no city to crawl", () => {
    assert.equal(parseLocation("TX"), null);
  });

  test("empty input", () => {
    assert.equal(parseLocation(""), null);
    assert.equal(parseLocation("   "), null);
    assert.equal(parseLocation(",,,"), null);
  });
});

describe("parseAddressLocation", () => {
  test("a Google address with the USA suffix", () => {
    assert.deepEqual(parseAddressLocation("1722 S Congress Ave, Austin, TX 78704, USA"), {
      city: "Austin",
      state: "TX",
    });
  });

  test("a seeded address without the suffix", () => {
    assert.deepEqual(parseAddressLocation("150 E 14th St, New York, NY 10003"), {
      city: "New York",
      state: "NY",
    });
  });

  test("a zip+4", () => {
    assert.deepEqual(parseAddressLocation("1 Main St, Dallas, TX 75201-1234, USA"), {
      city: "Dallas",
      state: "TX",
    });
  });

  test("a state with no zip", () => {
    assert.deepEqual(parseAddressLocation("500 Sutter St, San Francisco, CA"), {
      city: "San Francisco",
      state: "CA",
    });
  });

  test("an unparseable address yields empties rather than guessing", () => {
    assert.deepEqual(parseAddressLocation("somewhere"), { city: "", state: "" });
    assert.deepEqual(parseAddressLocation(""), { city: "", state: "" });
  });
});

describe("scopeSlug", () => {
  test("namespaces by state and city so South Congress cannot collide with SoHo", () => {
    const austin = { neighborhood: "South Congress", city: "Austin", state: "TX" };
    const manhattan = { neighborhood: "SoHo", city: "New York", state: "NY" };
    assert.equal(scopeSlug("so-junes", austin), "tx-austin-so-junes");
    assert.equal(scopeSlug("so-junes", manhattan), "ny-new-york-so-junes");
  });

  test("is stable, so a re-crawl upserts rather than duplicating", () => {
    const location = { neighborhood: null, city: "Austin", state: "TX" };
    assert.equal(scopeSlug("so-junes", location), scopeSlug("so-junes", location));
  });

  test("skips a missing state", () => {
    assert.equal(scopeSlug("so-junes", { neighborhood: null, city: "Austin", state: "" }), "austin-so-junes");
  });
});
