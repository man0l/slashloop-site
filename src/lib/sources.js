// Client for /api/sources on the connector (VITE_MCP_URL). Every call is
// scoped to a workspace the caller owns (enforced server-side).

import { apiFetch, ApiError } from "./http.js";

export const SourcesApiError = ApiError;

/** GET /api/sources?workspaceId=... -> [{ id, platform, sourceType, query, ... }] */
export function listSources(accessToken, workspaceId, filters = {}) {
  const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  const params = new URLSearchParams({ workspaceId, ...clean });
  return apiFetch(`/api/sources?${params.toString()}`, { accessToken });
}

/**
 * GET /api/sources?id=...&workspaceId=... -> source, with its 5 newest videos
 * and its 3 newest refreshRuns (itemsPulled, newVideos, errorsJson, costCents,
 * ranAt) — used to surface the last refresh's warnings/errors in the UI.
 */
export function getSource(accessToken, workspaceId, sourceId) {
  const params = new URLSearchParams({ id: sourceId, workspaceId });
  return apiFetch(`/api/sources?${params.toString()}`, { accessToken });
}

/**
 * POST /api/sources { workspaceId, platform, sourceType, query, ... } -> source
 * platform is locked to "tiktok" in the UI — the connector refuses others.
 */
export function createSource(accessToken, workspaceId, input) {
  return apiFetch("/api/sources", { method: "POST", accessToken, body: { workspaceId, ...input } });
}

/** PATCH /api/sources/:id { workspaceId, ...updates } -> source */
export function updateSource(accessToken, workspaceId, sourceId, updates) {
  return apiFetch(`/api/sources/${sourceId}`, { method: "PATCH", accessToken, body: { workspaceId, ...updates } });
}

/** DELETE /api/sources/:id?workspaceId=... -> { message, sourceId } */
export function deleteSource(accessToken, workspaceId, sourceId) {
  const params = new URLSearchParams({ workspaceId });
  return apiFetch(`/api/sources/${sourceId}?${params.toString()}`, { method: "DELETE", accessToken });
}

/** POST /api/sources/:id/refresh { workspaceId } -> queued-refresh summary */
export function refreshSource(accessToken, workspaceId, sourceId, videoLimit) {
  return apiFetch(`/api/sources/${sourceId}/refresh`, {
    method: "POST",
    accessToken,
    body: { workspaceId, videoLimit },
  });
}
