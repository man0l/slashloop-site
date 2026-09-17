// Thin wrapper over the gtag.js snippet in index.html. gtag is absent in
// tests and whenever the script is blocked, so every call is a guarded no-op —
// call sites never need to check anything. GA4 runs in Consent Mode (default
// denied in index.html): nothing leaves the browser until the cookie banner
// grants analytics_storage — canTrack() enforces that here as well.

import { canTrack } from "./consent.js";

/** SPA navigation pageview. The initial load is covered by the gtag config
 *  in index.html; this is for route changes after that. */
export function trackPageview(path) {
  if (!canTrack()) return;
  window.gtag?.("event", "page_view", { page_path: path });
}

/** Custom event, e.g. track("begin_checkout", { plan: "creator" }). */
export function track(name, params = {}) {
  if (!canTrack()) return;
  window.gtag?.("event", name, params);
}
