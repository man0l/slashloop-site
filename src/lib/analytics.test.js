import { describe, expect, it, beforeEach, vi } from "vitest";
import { trackPageview, track } from "./analytics.js";

// Measurement is always on: the banner only controls GA cookies, never
// whether pageviews/events fire (see consent.js / index.html Consent Mode).
describe("analytics — always-on measurement", () => {
  beforeEach(() => {
    delete window.gtag;
  });

  it("pageviews and events fire to gtag with no consent choice made", () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    trackPageview("/pricing");
    track("sign_up", { method: "google" });
    expect(gtag).toHaveBeenCalledWith("event", "page_view", { page_path: "/pricing" });
    expect(gtag).toHaveBeenCalledWith("event", "sign_up", { method: "google" });
  });

  it("is a guarded no-op when gtag is blocked or absent", () => {
    expect(() => trackPageview("/x")).not.toThrow();
    expect(() => track("event_name")).not.toThrow();
  });
});
