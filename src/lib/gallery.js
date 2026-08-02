// Client for /api/gallery-data on the connector (VITE_MCP_URL) — JSON cards
// for the site's Gallery page. Not to be confused with /gallery, the
// connector's HTML gallery link used inside Claude conversations.

import { apiFetch, ApiError } from "./http.js";

export const GalleryApiError = ApiError;

/**
 * GET /api/gallery-data -> { cards, note, filters }
 * opts: { workspaceId, sourceId?, sortBy?: "outlier_score"|"views"|"newest", minOutlier?, minViews?, limit? }
 */
export function getGallery(accessToken, opts) {
  const { workspaceId, sourceId, sortBy, minOutlier, minViews, limit } = opts;
  const raw = { workspaceId, sourceId, sortBy, minOutlier, minViews, limit };
  const clean = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  );
  const params = new URLSearchParams(clean);
  return apiFetch(`/api/gallery-data?${params.toString()}`, { accessToken });
}
