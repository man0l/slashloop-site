// Client for /api/gallery-data on the connector (VITE_MCP_URL) — JSON cards
// for the site's Gallery page. Not to be confused with /gallery, the
// connector's HTML gallery link used inside Claude conversations.

import { apiFetch, ApiError } from "./http.js";

export const GalleryApiError = ApiError;

/**
 * GET /api/gallery-data -> { cards, note, filters }
 * opts: { workspaceId, sourceId?, sortBy?: "outlier_score"|"views"|"newest",
 *         minOutlier?, minViews?, analyzedBy?: "openrouter", limit? }
 *
 * analyzedBy restricts to videos whose most recent analysis ran on that backend
 * (see the connector's buildCards), ordered most-recently-analyzed first.
 */
export function getGallery(accessToken, opts, signal) {
  const { workspaceId, sourceId, sortBy, minOutlier, minViews, analyzedBy, limit } = opts;
  const raw = { workspaceId, sourceId, sortBy, minOutlier, minViews, analyzedBy, limit };
  const clean = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  );
  const params = new URLSearchParams(clean);
  return apiFetch(`/api/gallery-data?${params.toString()}`, { accessToken, signal });
}

/**
 * GET /api/gallery-data?workspaceId=&creatorHandle= -> creator hover preview
 * { handle, trackedSourceId, videoCount, outlierCount, followers, medianViews,
 *   outliers, recent }.
 *
 * Uses videos already in the workspace — no live scrape. An older connector
 * that ignores creatorHandle still returns `{ cards }`; callers should check
 * isCreatorPreview() and fall back to previewFromGalleryCards().
 */
export function getCreatorPreview(accessToken, { workspaceId, creatorHandle }, signal) {
  const handle = String(creatorHandle || "").replace(/^@+/, "").trim().toLowerCase();
  const params = new URLSearchParams({ workspaceId, creatorHandle: handle });
  return apiFetch(`/api/gallery-data?${params.toString()}`, { accessToken, signal });
}

/** True when the gallery-data response is a creator hover preview, not a card grid. */
export function isCreatorPreview(data) {
  return Boolean(data && Array.isArray(data.outliers) && Array.isArray(data.recent) && !Array.isArray(data.cards));
}
