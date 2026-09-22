// Cookie consent state (GDPR/ePrivacy). Google Analytics measurement is
// always on — index.html runs GA4 in Consent Mode, so undecided/rejecting
// visitors are measured via cookieless pings. Accepting flips
// analytics_storage to granted, letting GA4 use cookies for richer
// measurement. The cookieless indiestack counter is always on and needs no
// consent. Choice persists in localStorage; tests reset it.

export const CONSENT_KEY = "sl-cookie-consent";
export const OPEN_SETTINGS_EVENT = "sl:cookie-settings";

// In-memory latch: once the visitor chooses in this tab session, never ask
// again even if both persistent stores are unavailable (blocked storage,
// private-mode quirks). Survives remounts; localStorage/cookie cover reloads.
let sessionChoice = null;

function readStore() {
  try {
    const v = window.localStorage?.getItem(CONSENT_KEY);
    if (v === "accepted" || v === "rejected") return v;
  } catch {
    /* blocked storage */
  }
  try {
    const m = document.cookie.match(/(?:^|;\s*)sl-cookie-consent=(accepted|rejected)/);
    if (m) return m[1];
  } catch {
    /* cookies unavailable */
  }
  return null;
}

export function readConsent() {
  return sessionChoice ?? readStore();
}

export function writeConsent(value) {
  const granted = value === "accepted";
  sessionChoice = value;
  try {
    window.localStorage?.setItem(CONSENT_KEY, value);
  } catch {
    /* private mode — consent applies to this session only */
  }
  try {
    // Fallback for browsers with localStorage disabled: 1-year first-party
    // cookie, SameSite=Lax, Secure on https. Same values, same semantics.
    const secure = window.location?.protocol === "https:" ? ";Secure" : "";
    document.cookie = `${CONSENT_KEY}=${value};max-age=31536000;path=/;SameSite=Lax${secure}`;
  } catch {
    /* cookies unavailable — sessionChoice still holds for this tab */
  }
  window.gtag?.("consent", "update", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: granted ? "granted" : "denied",
  });
  return granted;
}

/** Test-only: clear the in-memory latch (persistent stores are the test's job). */
export function resetConsentForTests() {
  sessionChoice = null;
}

/** Re-open the banner (footer "Cookie settings" link dispatches this). */
export function openCookieSettings() {
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT));
}
