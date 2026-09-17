import { describe, expect, it, beforeEach, vi } from "vitest";
import { readConsent, writeConsent, canTrack, CONSENT_KEY } from "./consent.js";

describe("cookie consent", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.gtag;
  });

  it("starts undecided and blocks tracking", () => {
    expect(readConsent()).toBeNull();
    expect(canTrack()).toBe(false);
  });

  it("accept persists and grants analytics_storage via gtag", () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    expect(writeConsent("accepted")).toBe(true);
    expect(window.localStorage.getItem(CONSENT_KEY)).toBe("accepted");
    expect(canTrack()).toBe(true);
    expect(gtag).toHaveBeenCalledWith("consent", "update", {
      ad_storage: "denied",
      analytics_storage: "granted",
    });
  });

  it("reject persists and keeps analytics denied", () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    expect(writeConsent("rejected")).toBe(false);
    expect(canTrack()).toBe(false);
    expect(gtag).toHaveBeenCalledWith("consent", "update", {
      ad_storage: "denied",
      analytics_storage: "denied",
    });
  });
});
