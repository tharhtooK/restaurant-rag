import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isImported, markImported, releaseImportClaim } from "../src/lib/crawl-limits";

describe("import claim", () => {
  test("an unclaimed job is not imported", () => {
    assert.equal(isImported("job-unclaimed"), false);
  });

  test("claiming blocks a second concurrent poll from importing", () => {
    markImported("job-claimed");
    assert.equal(isImported("job-claimed"), true);
  });

  // A failed import used to stay claimed forever, so the next poll took the
  // early return and reported imported: true for data that was never written.
  test("releasing a failed claim lets the import be retried", () => {
    markImported("job-failed");
    assert.equal(isImported("job-failed"), true);

    releaseImportClaim("job-failed");
    assert.equal(isImported("job-failed"), false);
  });

  test("releasing one job does not release another", () => {
    markImported("job-a");
    markImported("job-b");

    releaseImportClaim("job-a");

    assert.equal(isImported("job-a"), false);
    assert.equal(isImported("job-b"), true);
  });

  test("releasing a job that was never claimed is harmless", () => {
    releaseImportClaim("job-never-claimed");
    assert.equal(isImported("job-never-claimed"), false);
  });
});
