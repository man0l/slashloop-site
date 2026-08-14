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
