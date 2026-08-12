import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getLogger } from "../src/lib/logger";

// The level threshold is resolved once per process, so this file exercises the
// default (info). node --test runs each file in its own process, so a file that
// needs a different LOG_LEVEL would set it at import time in its own file.
const log = getLogger("test-module");

let captured: string[] = [];
const realWrite = process.stderr.write.bind(process.stderr);

beforeEach(() => {
  captured = [];
  process.stderr.write = (chunk: string | Uint8Array): boolean => {
    captured.push(String(chunk));
    return true;
  };
});

afterEach(() => {
  process.stderr.write = realWrite;
});

describe("logger level filtering at the default level", () => {
  test("debug is suppressed", () => {
    log.debug("hidden");
    assert.equal(captured.length, 0);
  });

  test("info, warn and error are emitted", () => {
    log.info("one");
    log.warn("two");
    log.error("three");
    assert.equal(captured.length, 3);
  });
});

describe("logger output format", () => {
  test("includes level, module name and message", () => {
    log.info("something happened");
    assert.match(captured[0], /INFO {2}test-module something happened/);
  });

  test("ends with a single newline", () => {
    log.info("one line");
    assert.equal(captured[0].endsWith("\n"), true);
    assert.equal(captured[0].split("\n").length, 2);
  });

  test("renders fields as key=value pairs", () => {
    log.info("tool call finished", { tool: "filter_restaurants", ms: 12, ok: true });
    assert.match(captured[0], /tool=filter_restaurants ms=12 ok=true/);
  });

  // Unquoted spaces would break key=value parsing downstream.
  test("quotes values containing whitespace", () => {
    log.error("agent failed", { detail: "two words" });
    assert.match(captured[0], /detail="two words"/);
  });

  test("writes to stderr so stdout report output stays clean", () => {
    log.info("boundary");
    assert.equal(captured.length, 1);
  });
});
