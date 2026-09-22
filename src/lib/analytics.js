// Thin wrapper over the gtag.js snippet in index.html. gtag is absent in
// tests and whenever the script is blocked, so every call is a guarded no-op —
// call sites never need to check anything. Measurement is always on: GA4 runs
// in Consent Mode (index.html), so visitors who have not accepted cookies are
// still measured via cookieless pings — the banner only controls whether
// analytics_storage (cookies) may be used for richer measurement.

/** SPA navigation pageview. The initial load is covered by the gtag config
 *  in index.html; this is for route changes after that. */
export function trackPageview(path) {
  window.gtag?.("event", "page_view", { page_path: path });
}

/** Custom event, e.g. track("begin_checkout", { plan: "creator" }). */
export function track(name, params = {}) {
  window.gtag?.("event", name, params);
}
