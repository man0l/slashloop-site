// Client for the connector's AI hook-test REST surface (VITE_MCP_URL):
//   GET   /api/videos/:id/hook-test            -> { test | null } — the open
//                                                 test, else the most recent
//                                                 of any status (a won/closed
//                                                 test stays viewable read-only)
//   POST   …/hook-test  { brandContext?, insight? }        (2 credits)
//   PATCH  …/hook-test  { insight?, sameIn? }               (free — edit the lock)
//   POST   …/hook-test/pick { picks: ["A","C"] }
//   POST   …/hook-test/reroll                           (2 credits)
//   GET    …/hook-test/shotlist       -> { markdown }
//   POST   …/hook-test/close { outcome?, winner? }        ("won" may name the
//                                                          opening that beat
//                                                          the original)
//   GET    /api/workspaces?resource=hook-tests&includeClosed=1 -> { tests }
//
// Contract lives in the connector's api/videos.ts + src/lib/hook-tests.ts.
// Spending calls (start/reroll) deliberately take NO abort signal: navigating
// away must not orphan a generation the user already paid for.

import { apiFetch, ApiError } from "./http.js";

export const HookTestApiError = ApiError;

const vid = (videoId) => `/api/videos/${encodeURIComponent(videoId)}/hook-test`;

/** Open test for one video — null when none. */
export function getHookTestForVideo(accessToken, { workspaceId, videoId }, signal) {
  const params = new URLSearchParams({ workspaceId });
  return apiFetch(`${vid(videoId)}?${params.toString()}`, { accessToken, signal });
}

/**
 * Start a test. The connector pre-checks for an open test BEFORE metering, so
 * a second attempt returns { test, alreadyOpen: true } and never re-charges.
 */
export function startHookTest(accessToken, { workspaceId, videoId, brandContext, insight }) {
  const context = brandContext?.trim();
  const override = insight?.trim();
  return apiFetch(`${vid(videoId)}`, {
    method: "POST",
    accessToken,
    body: { workspaceId, ...(context ? { brandContext: context } : {}), ...(override ? { insight: override } : {}) },
  });
}

/** Edit the lock — the insight/chips every future re-roll obeys. Free. */
export function updateHookTestLock(accessToken, { workspaceId, videoId, insight, sameIn }) {
  return apiFetch(`${vid(videoId)}`, {
    method: "PATCH",
    accessToken,
    body: { workspaceId, ...(insight !== undefined ? { insight } : {}), ...(sameIn !== undefined ? { sameIn } : {}) },
  });
}

export function pickHookVersions(accessToken, { workspaceId, videoId, picks }) {
  return apiFetch(`${vid(videoId)}/pick`, { method: "POST", accessToken, body: { workspaceId, picks } });
}

export function rerollHooks(accessToken, { workspaceId, videoId }) {
  return apiFetch(`${vid(videoId)}/reroll`, { method: "POST", accessToken, body: { workspaceId } });
}

export function getShotlist(accessToken, { workspaceId, videoId }, signal) {
  const params = new URLSearchParams({ workspaceId });
  return apiFetch(`${vid(videoId)}/shotlist?${params.toString()}`, { accessToken, signal });
}

export function closeHookTest(accessToken, { workspaceId, videoId, outcome, winner }) {
  return apiFetch(`${vid(videoId)}/close`, {
    method: "POST",
    accessToken,
    body: { workspaceId, ...(outcome ? { outcome } : {}), ...(winner ? { winner } : {}) },
  });
}

/** Workspace-wide index for the /tests page. */
export function listHookTests(accessToken, { workspaceId, includeClosed }, signal) {
  const params = new URLSearchParams({ workspaceId, resource: "hook-tests", ...(includeClosed ? { includeClosed: "1" } : {}) });
  return apiFetch(`/api/workspaces?${params.toString()}`, { accessToken, signal });
}

const CREDIT_CODES = new Set(["insufficient_credits"]);

/**
 * Map a hook-test ApiError to a display shape (same philosophy as
 * friendlyAnalysisError): credits errors are never retryable (a retry just
 * re-charges), conflicts mean someone/something else moved the test — the
 * caller should refetch rather than retry blind.
 * Returns { kind: "credits"|"conflict"|"notFound"|"failure", retryable, message }.
 */
export function friendlyHookTestError(err) {
  const status = err?.status;
  const code = err?.code;
  const message = err?.message || "Something went wrong with this hook test.";
  if (status === 402 || (code && CREDIT_CODES.has(code))) {
    return { kind: "credits", retryable: false, message };
  }
  if (status === 409 || code === "hook_test_failed_conflict") {
    return { kind: "conflict", retryable: false, message };
  }
  if (status === 404) {
    return { kind: "notFound", retryable: false, message };
  }
  return { kind: "failure", retryable: true, message };
}
