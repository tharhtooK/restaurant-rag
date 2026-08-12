import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { matchesHours, timeToMinutes } from "../src/lib/tools/hours";
import type { Hours } from "../src/lib/tools/types";

function hours(overrides: Partial<Hours> = {}): Hours {
  return {
    mon: { open: "11:00", close: "22:00" },
    tue: { open: "11:00", close: "22:00" },
    wed: { open: "11:00", close: "22:00" },
    thu: { open: "11:00", close: "22:00" },
    fri: { open: "11:00", close: "22:00" },
    sat: { open: "11:00", close: "22:00" },
    sun: null,
    ...overrides,
  };
}

describe("timeToMinutes", () => {
  test("midnight is zero", () => {
    assert.equal(timeToMinutes("00:00"), 0);
  });

  test("converts hours and minutes", () => {
    assert.equal(timeToMinutes("09:05"), 545);
    assert.equal(timeToMinutes("23:30"), 1410);
  });
});

describe("matchesHours with no constraints", () => {
  test("everything matches", () => {
    assert.equal(matchesHours(hours(), {}), true);
  });
});

describe("matchesHours openPast", () => {
  test("matches when at least one day closes after the threshold", () => {
    const late = hours({ fri: { open: "11:00", close: "23:30" } });
    assert.equal(matchesHours(late, { openPast: "23:00" }), true);
  });

  test("does not match when every day closes at or before the threshold", () => {
    assert.equal(matchesHours(hours(), { openPast: "23:00" }), false);
  });

  test("the threshold is strict — closing exactly at it does not count", () => {
    const exact = hours({ fri: { open: "11:00", close: "23:00" } });
    assert.equal(matchesHours(exact, { openPast: "23:00" }), false);
  });

  test("closed days are skipped rather than treated as open", () => {
    const onlySundayClosed = hours({ sun: null });
    assert.equal(matchesHours(onlySundayClosed, { openPast: "21:00" }), true);
  });

  // Documents a known limitation rather than asserting desired behaviour: a
  // past-midnight close is stored as a small minutes value, so it reads as
  // *earlier* than an evening threshold. The seed data avoids past-midnight
  // closes so the G02 distractor stays a distractor.
  test("a past-midnight close does NOT satisfy openPast (known limitation)", () => {
    const pastMidnight = hours({ fri: { open: "18:00", close: "00:30" } });
    assert.equal(matchesHours(pastMidnight, { openPast: "23:00" }), false);
  });
});

describe("matchesHours opensBy", () => {
  test("matches when at least one day opens at or before the threshold", () => {
    const early = hours({ sat: { open: "08:00", close: "22:00" } });
    assert.equal(matchesHours(early, { opensBy: "09:00" }), true);
  });

  test("the threshold is inclusive — opening exactly at it counts", () => {
    const exact = hours({ sat: { open: "09:00", close: "22:00" } });
    assert.equal(matchesHours(exact, { opensBy: "09:00" }), true);
  });

  test("does not match when every day opens after the threshold", () => {
    assert.equal(matchesHours(hours(), { opensBy: "09:00" }), false);
  });
});

describe("matchesHours with both constraints", () => {
  // Each constraint is satisfied independently, so one day may open early while
  // a different day closes late.
  test("the two constraints need not be satisfied by the same day", () => {
    const mixed = hours({
      sat: { open: "08:00", close: "15:00" },
      fri: { open: "17:00", close: "23:30" },
    });
    assert.equal(matchesHours(mixed, { opensBy: "09:00", openPast: "23:00" }), true);
  });

  test("fails when only one of the two constraints is satisfied", () => {
    const earlyOnly = hours({ sat: { open: "08:00", close: "15:00" } });
    assert.equal(matchesHours(earlyOnly, { opensBy: "09:00", openPast: "23:00" }), false);
  });
});
