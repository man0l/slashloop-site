// Cookie consent state (GDPR/ePrivacy). Google Analytics runs in Consent
// Mode: index.html defaults both storages to denied, and a grant here flips
// analytics_storage to granted. The cookieless indiestack counter is always
// on and needs no consent. Choice persists in localStorage; tests reset it.

export const CONSENT_KEY = "sl-cookie-consent";
export const OPEN_SETTINGS_EVENT = "sl:cookie-settings";

export function readConsent() {
  try {
    const v = window.localStorage?.getItem(CONSENT_KEY);
    return v === "accepted" || v === "rejected" ? v : null;
  } catch {
    return null;
  }
}

export function writeConsent(value) {
  const granted = value === "accepted";
  try {
    window.localStorage?.setItem(CONSENT_KEY, value);
  } catch {
    /* private mode — consent applies to this session only */
  }
  window.gtag?.("consent", "update", {
    ad_storage: "denied",
    analytics_storage: granted ? "granted" : "denied",
  });
  return granted;
}

/** Gate for analytics calls — GA4 pageviews/events only fire on accept. */
export function canTrack() {
  return readConsent() === "accepted";
}

/** Re-open the banner (footer "Cookie settings" link dispatches this). */
export function openCookieSettings() {
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT));
}
