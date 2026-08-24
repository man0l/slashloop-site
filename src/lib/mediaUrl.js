/**
 * TikTok's image/video CDNs 403 when hotlinked from our origin.
 * The connector stores covers on R2 and should already return those;
 * this is the UI-side refusal so a stale or unstored CDN URL never
 * becomes an <img src> (console 403 + broken thumb).
 *
 * Regional hosts (`tiktokcdn-us.com`, …) are the ones the Sources page
 * actually sees — a `tiktokcdn.com`-only check misses them.
 */
export function isTikTokCdnUrl(url) {
  if (!url || typeof url !== "string") return false;
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return /tiktokcdn/i.test(url);
  }
  return (
    /(^|\.)tiktokcdn([.-][a-z0-9]+)*\.com$/.test(host)
    || /(^|\.)tiktok\.com$/.test(host)
    || /(^|\.)tiktokv\.com$/.test(host)
    || /(^|\.)tik-tok\.com$/.test(host)
    || /(^|\.)ibyteimg\.com$/.test(host)
  );
}

/** URL the UI is allowed to load. Null → render a placeholder, don't request. */
export function displayMediaUrl(url) {
  if (typeof url !== "string" || !url.startsWith("http")) return null;
  if (isTikTokCdnUrl(url)) return null;
  return url;
}

export function displayMediaUrls(urls) {
  return (Array.isArray(urls) ? urls : []).map(displayMediaUrl).filter(Boolean);
}
