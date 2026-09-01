// Mirror of the connector's src/lib/refresh-notes.ts classifier.
//
// RefreshRun.errorsJson is a log, not an error list: it holds both real
// failures ("Scoring failed", an Apify notice) and bookkeeping about the run
// ("Refresh policy: mode=incremental limit=5", "Already known: 1/3 results
// were existing videos"). Rendering the second kind put a red "last refresh
// had errors" warning on sources whose refresh went perfectly.
//
// The connector now tags bookkeeping with "[info] ". The legacy prefixes are
// still matched because rows written before that ship are in the database and
// must not keep raising false alarms.

const INFO_PREFIX = "[info] ";

const LEGACY_INFO_PREFIXES = [
  "Refresh policy:",
  "Recency filter:",
  "Per-source watermark:",
  "Already known:",
  "Multi-tenant batch:",
  "Resumed dataset ",
];

/** True when a log line is bookkeeping rather than something that failed. */
export function isInfoNote(line) {
  if (typeof line !== "string") return false;
  if (line.startsWith(INFO_PREFIX)) return true;
  if (line.includes("(cosmetic only)")) return true;
  if (LEGACY_INFO_PREFIXES.some((p) => line.startsWith(p))) return true;
  // A deferral ("N beyond the per-run cap ... queued as thumb jobs"), unlike
  // "Thumbnail ingest: 2/5 failed", which is a genuine failure.
  if (line.startsWith("Thumbnail ingest:") && line.includes("beyond the per-run cap")) return true;
  return false;
}

/** The failure lines only — the only ones a user should ever be shown. */
export function failureLines(lines) {
  return (Array.isArray(lines) ? lines : []).filter((l) => !isInfoNote(l));
}

/** Parse a RefreshRun.errorsJson string into its failure lines. */
export function parseRefreshFailures(errorsJson) {
  let parsed;
  try {
    parsed = JSON.parse(errorsJson || "[]");
  } catch {
    return [];
  }
  return failureLines(parsed);
}

/**
 * Last-refresh warning for a Sources-list row. The list payload now carries
 * lastRefreshRun + lastRefreshJob so the page doesn't GET /sources?id= per row.
 *
 * A refusal (insufficient credits, Apify cap) never writes a RefreshRun —
 * if the last refresh JOB failed more recently than the last RUN, that's
 * the real story.
 */
export function refreshIssueFromSource(source) {
  const run = source?.lastRefreshRun;
  const job = source?.lastRefreshJob;
  if (job?.status === "failed" && (!run || new Date(job.createdAt) > new Date(run.ranAt))) {
    return { errors: [job.lastError || "Refresh failed."], ranAt: job.createdAt };
  }
  if (!run) return null;
  const errors = parseRefreshFailures(run.errorsJson);
  return errors.length ? { errors, ranAt: run.ranAt } : null;
}
