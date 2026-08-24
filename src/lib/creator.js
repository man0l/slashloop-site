// Creator-handle helpers shared by the gallery hover chip and the track button.
// Mirrors the connector's normalizeQuery('creator', ...) so "@Maker" and "maker"
// match the same tracked source.

export const CREATOR_OUTLIER_MIN = 2;

export function normalizeCreatorHandle(handle) {
  return String(handle || "").trim().replace(/^@+/, "").toLowerCase();
}

export function trackedCreatorSource(sources, handle) {
  const key = normalizeCreatorHandle(handle);
  if (!key) return null;
  return (sources ?? []).find(
    (s) => s.sourceType === "creator" && normalizeCreatorHandle(s.query) === key,
  ) ?? null;
}

/** The workspace's own TikTok, if one creator source is flagged isSelf. */
export function selfCreatorSource(sources) {
  return (sources ?? []).find((s) => s.isSelf && s.sourceType === "creator") ?? null;
}

function cardToPreviewVideo(c) {
  return {
    id: c.id,
    thumbUrl: c.thumbUrl,
    views: c.views,
    outlierScore: c.outlierScore ?? null,
    caption: c.caption,
    postedAt: c.postedAt,
    url: c.url,
  };
}

/**
 * Instant hover preview from cards already on the gallery page — used while
 * the dedicated preview request is in flight, and as a fallback when the
 * connector doesn't yet support creatorHandle.
 */
export function previewFromGalleryCards(handle, cards) {
  const key = normalizeCreatorHandle(handle);
  const mine = (cards ?? []).filter((c) => normalizeCreatorHandle(c.creatorHandle) === key);
  const outliers = [...mine]
    .filter((c) => c.outlierScore != null)
    .sort((a, b) => (b.outlierScore ?? 0) - (a.outlierScore ?? 0))
    .slice(0, 4)
    .map(cardToPreviewVideo);
  const recent = [...mine]
    .sort((a, b) => (b.postedAt ?? 0) - (a.postedAt ?? 0))
    .slice(0, 5)
    .map(cardToPreviewVideo);
  return {
    handle: key,
    trackedSourceId: null,
    videoCount: mine.length,
    outlierCount: mine.filter((c) => (c.outlierScore ?? 0) >= CREATOR_OUTLIER_MIN).length,
    followers: null,
    medianViews: null,
    outliers,
    recent,
  };
}
