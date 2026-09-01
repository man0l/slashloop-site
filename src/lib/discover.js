// Client for the /api/sources/discover* actions on the connector
// (VITE_MCP_URL). Two calls on purpose, mirroring the backend split: seed
// expansion is one fast AI call; each seed is then probed by its own mine
// call so the Discover screen can render each result the moment it lands
// instead of blocking on the slowest probe (a real scrape can take anywhere
// from a few seconds to well over a minute).

import { apiFetch, ApiError } from "./http.js";

export const DiscoverApiError = ApiError;

/**
 * POST /api/sources/discover { workspaceId, keywords[] } -> AI-expanded seeds
 * [{ sourceType, query, rationale, origin: "input"|"ai", alreadyTracked? }],
 * NOT yet probed. Cost: 3 credits for the AI call (skipped — and free — when
 * the user's own inputs already fill all probe slots).
 */
export function discoverSeeds(accessToken, workspaceId, keywords) {
  return apiFetch("/api/sources/discover", { method: "POST", accessToken, body: { workspaceId, keywords } });
}

/**
 * POST /api/sources/discover/mine { workspaceId, ...seed } -> probes ONE seed
 * with a small real TikTok scrape (5 videos) and mines hashtags + creators
 * from the sampled captions. Returns { ok, verified, seed, sampleCount,
 * topViews, hashtags, creators, creditsCharged, creditsRemaining, error? } —
 * verified:false is a normal outcome ("no real content", cap breach, out of
 * credits), not an error. Meant to be called once per seed from
 * discoverSeeds, concurrently, each updating its own row.
 */
export function mineDiscoverSeed(accessToken, workspaceId, seed) {
  return apiFetch("/api/sources/discover/mine", {
    method: "POST",
    accessToken,
    body: {
      workspaceId,
      sourceType: seed.sourceType,
      query: seed.query,
      rationale: seed.rationale,
      origin: seed.origin,
    },
  });
}

/** GET /api/sources/discover/mine?workspaceId=&jobId= -> current mine result.
 *  `pending: true` means the scraper is still on it. */
export function pollDiscoverMine(accessToken, workspaceId, jobId) {
  const params = new URLSearchParams({ workspaceId, jobId });
  return apiFetch(`/api/sources/discover/mine?${params.toString()}`, { accessToken });
}

const MINE_POLL_MS = 1_500;
const MINE_WAIT_MS = 90_000;

/** POST the probe, then poll until the scraper finishes (or we give up).
 *  The connector returns immediately with `{ pending, jobId }` so the
 *  Cloudflare Worker never holds a 50s D1 poll. */
export async function mineDiscoverSeedUntilDone(accessToken, workspaceId, seed) {
  const first = await mineDiscoverSeed(accessToken, workspaceId, seed);
  if (!first?.pending || !first.jobId) return first;
  const deadline = Date.now() + MINE_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, MINE_POLL_MS));
    const next = await pollDiscoverMine(accessToken, workspaceId, first.jobId);
    if (!next?.pending) return next;
  }
  return {
    ...first,
    ok: false,
    pending: false,
    error: "Probe is still running on the scraper. Wait a moment and try again.",
  };
}
