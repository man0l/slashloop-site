// Thin wrapper over the gtag.js snippet in index.html. gtag is absent in
// tests and whenever the script is blocked, so every call is a guarded no-op —
// call sites never need to check anything.

/** SPA navigation pageview. The initial load is covered by the gtag config
 *  in index.html; this is for route changes after that. */
export function trackPageview(path) {
  window.gtag?.("event", "page_view", { page_path: path });
}

/** Custom event, e.g. track("begin_checkout", { plan: "creator" }). */
export function track(name, params = {}) {
  window.gtag?.("event", name, params);
}
