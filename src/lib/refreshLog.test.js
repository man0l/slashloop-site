// @vitest-environment node
// Pure string classification — no DOM, so skip the jsdom environment.
import { describe, expect, it } from "vitest";
import { failureLines, isInfoNote, parseRefreshFailures } from "./refreshLog.js";

describe("refresh log classification", () => {
  it("hides the run bookkeeping the connector tags as informational", () => {
    const log = [
      "[info] Refresh policy: mode=incremental limit=5",
      "[info] Already known: 1/3 results were existing videos (stats updated; not new outliers)",
    ];
    expect(parseRefreshFailures(JSON.stringify(log))).toEqual([]);
  });

  it("hides untagged bookkeeping already stored by older runs", () => {
    const log = [
      "Refresh policy: mode=incremental limit=5",
      "Already known: 1/3 results were existing videos (stats updated; not new outliers)",
      "Recency filter: 2 of 5 scraped videos were older than 3 months (cosmetic only)",
      "Per-source watermark: 3 items older than this source's postedAfter were ignored",
      "Multi-tenant batch: 2 sources shared one Apify scrape",
      "Resumed dataset abc from a previous attempt — no new Apify run, 0c",
      "Thumbnail ingest: 4 beyond the per-run cap of 15 queued as thumb jobs (4 enqueued)",
    ];
    expect(parseRefreshFailures(JSON.stringify(log))).toEqual([]);
  });

  it("still surfaces things that actually failed", () => {
    const log = [
      "[info] Refresh policy: mode=incremental limit=5",
      "Scoring failed: connection reset",
      "Thumbnail ingest: 2/5 failed",
      "Apify: run failed [actor-timeout]",
    ];
    expect(parseRefreshFailures(JSON.stringify(log))).toEqual([
      "Scoring failed: connection reset",
      "Thumbnail ingest: 2/5 failed",
      "Apify: run failed [actor-timeout]",
    ]);
  });

  it("treats malformed or missing logs as no warning at all", () => {
    expect(parseRefreshFailures(undefined)).toEqual([]);
    expect(parseRefreshFailures("not json")).toEqual([]);
    expect(failureLines(null)).toEqual([]);
    expect(isInfoNote(undefined)).toBe(false);
  });
});
