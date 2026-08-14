// Client for the connector's per-video endpoints on VITE_MCP_URL:
//   GET  /api/videos/:id?workspaceId=...          — detail (analysis, playback URL, job status)
//   POST /api/videos/:id/analyze { workspaceId }  — trigger AI analysis
//
// Contract lives in the connector's api/videos.ts; the gallery's per-card
// "Analyze with Gemini" UI is the only caller. Error shaping mirrors the
// Sources page so both surfaces render failures the same way (warning icon +
// tooltip, retry only when it can help).

import { apiFetch, ApiError } from "./http.js";

export const VideoApiError = ApiError;

// Gemini failure tags the connector stamps onto terminal MediaJobs (and maps
// to 429s) — retryable, nothing the user can fix by changing their request.
const QUOTA_CODES = new Set(["gemini_quota", "gemini_rate_limit", "gemini_server", "gemini_timeout"]);

/**
 * GET /api/videos/:id?workspaceId=... -> VideoDetail
 * { id, thumbUrl, mediaUrl, creatorHandle, caption, views, outlierScore,
 *   analysis: { id, analysisBasis, backend, model, data } | null,
 *   analysisJob: { jobId, status, lastError, errorCode } | null }
 */
export function getVideoDetail(accessToken, { workspaceId, videoId }, signal) {
  const params = new URLSearchParams({ workspaceId });
  return apiFetch(`/api/videos/${encodeURIComponent(videoId)}?${params.toString()}`, { accessToken, signal });
}

/**
 * POST /api/videos/:id/analyze { workspaceId } -> { queued: true, jobId, ... }
 * (native analysis, runs off-request on the job queue) or
 * { queued: false, analysis, model, ... } (inline text analysis).
 * Throws ApiError — see friendlyAnalysisError() for display mapping.
 */
export async function analyzeVideo(accessToken, { workspaceId, videoId }) {
  return apiFetch(`/api/videos/${encodeURIComponent(videoId)}/analyze`, {
    method: "POST",
    accessToken,
    body: { workspaceId },
  });
}

/**
 * Turn an analyze ApiError into a display shape the card renders like a
 * Sources-list error (warning icon + tooltip, retry only when it can help):
 *   - 402 insufficient credits -> kind "credits",  not retryable (retry re-charges)
 *   - 429 quota/rate/transient -> kind "quota",   retryable
 *   - 404 video_not_found      -> kind "notFound", not retryable
 *   - anything else (422)      -> kind "failure", retryable
 * Returns { kind, retryable, message }.
 */
export function friendlyAnalysisError(err) {
  const status = err?.status;
  const code = err?.code;
  const message = err?.message || "Analysis failed.";
  if (status === 402 || code === "insufficient_credits") {
    return { kind: "credits", retryable: false, message };
  }
  if (status === 429 || (code && QUOTA_CODES.has(code))) {
    return { kind: "quota", retryable: true, message };
  }
  if (status === 404 || code === "video_not_found") {
    return { kind: "notFound", retryable: false, message };
  }
  return { kind: "failure", retryable: true, message };
}

/**
 * Map a terminal MediaJob failure (surfaced by the detail endpoint's
 * analysisJob) the same way — a quota-tagged job gets a friendly line instead
 * of the raw [gemini_quota] prefix the worker persisted.
 */
export function friendlyJobError(jobErrorCode, lastError) {
  const quota = Boolean(jobErrorCode && QUOTA_CODES.has(jobErrorCode));
  const message = quota
    ? "Gemini is temporarily unavailable — try again later."
    : lastError || "Analysis failed.";
  return { kind: quota ? "quota" : "failure", retryable: true, message };
}
