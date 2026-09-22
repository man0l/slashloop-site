import { describe, expect, it, beforeEach, vi } from "vitest";
import { readConsent, writeConsent, resetConsentForTests, CONSENT_KEY } from "./consent.js";

describe("cookie consent", () => {
  beforeEach(() => {
    resetConsentForTests();
    window.localStorage.clear();
    delete window.gtag;
  });

  it("starts undecided", () => {
    expect(readConsent()).toBeNull();
  });

  it("accept persists and grants analytics_storage via gtag", () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    expect(writeConsent("accepted")).toBe(true);
    expect(window.localStorage.getItem(CONSENT_KEY)).toBe("accepted");
    expect(gtag).toHaveBeenCalledWith("consent", "update", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "granted",
    });
  });

  it("reject persists and keeps analytics_storage denied", () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    expect(writeConsent("rejected")).toBe(false);
    expect(window.localStorage.getItem(CONSENT_KEY)).toBe("rejected");
    expect(gtag).toHaveBeenCalledWith("consent", "update", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
    });
  });

  it("session latch holds without any persistent store", () => {
    const store = window.localStorage;
    Object.defineProperty(window, "localStorage", { value: undefined, configurable: true });
    try {
      writeConsent("accepted");
      expect(readConsent()).toBe("accepted");
    } finally {
      Object.defineProperty(window, "localStorage", { value: store, configurable: true });
    }
  });
});
