import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { T, fD, fM, FONTS } from "./lib/theme.js";
import { CTAButton, GhostButton, Spinner } from "./components/ui.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { useAuth } from "./lib/auth.jsx";
import { trackPageview } from "./lib/analytics.js";
import { readConsent, writeConsent, openCookieSettings, OPEN_SETTINGS_EVENT } from "./lib/consent.js";
import Home from "./pages/Home.jsx";

// The landing page ships in the entry chunk (it's what first-time visitors
// wait on); everything else becomes its own chunk so the app pages don't
// pay for the marketing pages' JS and vice versa.
const Pricing = lazy(() => import("./pages/Pricing.jsx"));
const AgentSetup = lazy(() => import("./pages/AgentSetup.jsx"));
const Login = lazy(() => import("./pages/Login.jsx"));
const Onboarding = lazy(() => import("./pages/Onboarding.jsx"));
const Account = lazy(() => import("./pages/Account.jsx"));
const EmailSettings = lazy(() => import("./pages/EmailSettings.jsx"));
const Sources = lazy(() => import("./pages/Sources.jsx"));
const Discover = lazy(() => import("./pages/Discover.jsx"));
const Gallery = lazy(() => import("./pages/Gallery.jsx"));
const Experiments = lazy(() => import("./pages/Experiments.jsx"));
const Studio = lazy(() => import("./pages/Studio.jsx"));
const CalendarPage = lazy(() => import("./pages/CalendarPage.jsx"));
const BillingSuccess = lazy(() => import("./pages/BillingSuccess.jsx"));
const BillingCancel = lazy(() => import("./pages/BillingCancel.jsx"));
const Privacy = lazy(() => import("./pages/Privacy.jsx"));
const Terms = lazy(() => import("./pages/Terms.jsx"));
const NotFound = lazy(() => import("./pages/NotFound.jsx"));

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="w-6 h-6 rounded flex items-center justify-center" style={{ background: T.signal }}>
        <span style={{ ...fM, fontWeight: 600, fontSize: 15, color: "#fff" }}>/</span>
      </span>
      <span style={{ ...fD, fontWeight: 900, fontSize: 18, letterSpacing: -0.5 }}>slashloop</span>
    </Link>
  );
}

const MenuIcon = ({ open }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    {open ? (
      <>
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </>
    ) : (
      <>
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </>
    )}
  </svg>
);

function Nav() {
  const { user, loading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  // A route change (following a link, or the "next" redirect after sign-in)
  // means the menu's job is done — leaving it open would cover the new page.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  // Land on the marketing home deterministically — a signed-out user left on
  // an app page (e.g. /sources) would just bounce to /login from that page's
  // own guard.
  async function handleSignOut() {
    setMenuOpen(false);
    await signOut();
    navigate("/");
  }

  const loggedInLinks = (
    <>
      <Link to="/discover" onClick={() => setMenuOpen(false)} style={{ ...fM, fontSize: 13, color: T.ink }}>Discover</Link>
      <Link to="/sources" onClick={() => setMenuOpen(false)} style={{ ...fM, fontSize: 13, color: T.ink }}>Sources</Link>
      <Link to="/gallery" onClick={() => setMenuOpen(false)} style={{ ...fM, fontSize: 13, color: T.ink }}>Gallery</Link>
      <Link to="/experiments" onClick={() => setMenuOpen(false)} style={{ ...fM, fontSize: 13, color: T.ink }}>Experiments</Link>
      <Link to="/studio" onClick={() => setMenuOpen(false)} style={{ ...fM, fontSize: 13, color: T.ink }}>Studio</Link>
      <Link to="/calendar" onClick={() => setMenuOpen(false)} style={{ ...fM, fontSize: 13, color: T.ink }}>Calendar</Link>
    </>
  );

  return (
    <header className="max-w-5xl mx-auto px-5 py-5 relative">
      <div className="flex items-center justify-between">
        <Logo />
        {/* Desktop: full inline nav. Hidden below sm — a signed-in user's
            Sources/Gallery links have nowhere else to live at that width, so
            the hamburger below is the only way to reach them on mobile. */}
        <div className="hidden xl:flex items-center gap-4">
          <Link to="/pricing" style={{ ...fM, fontSize: 13, color: T.ink }}>Pricing</Link>
          {loading ? (
            // Placeholder with the logged-out controls' footprint — without
            // it the nav CTAs pop in when auth resolves and shift the header.
            <span className="invisible flex items-center gap-4" aria-hidden="true">
              <GhostButton to="/login">Sign in</GhostButton>
              <CTAButton to="/pricing">Get started</CTAButton>
            </span>
          ) : user ? (
            <>
              {loggedInLinks}
              <CTAButton to="/account">Account</CTAButton>
              <button
                type="button"
                onClick={handleSignOut}
                style={{ ...fM, fontSize: 13, color: T.muted }}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <GhostButton to="/login">Sign in</GhostButton>
              <CTAButton to="/pricing">Get started</CTAButton>
            </>
          )}
        </div>
        <button
          type="button"
          className="xl:hidden p-1.5"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          style={{ color: T.ink }}
        >
          <MenuIcon open={menuOpen} />
        </button>
      </div>

      {menuOpen && (
        <div
          className="xl:hidden absolute left-0 right-0 top-full mx-5 mt-2 rounded-xl p-4 flex flex-col gap-3.5 z-20"
          style={{ background: T.card, border: `1px solid ${T.line}`, boxShadow: "0 12px 30px rgba(0,0,0,0.12)" }}
        >
          <Link to="/pricing" onClick={() => setMenuOpen(false)} style={{ ...fM, fontSize: 14, color: T.ink }}>Pricing</Link>
          {loading ? null : user ? (
            <>
              {loggedInLinks}
              <Link to="/account" onClick={() => setMenuOpen(false)} style={{ ...fM, fontSize: 14, color: T.ink }}>Account</Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="text-left"
                style={{ ...fM, fontSize: 14, color: T.muted }}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={() => setMenuOpen(false)} style={{ ...fM, fontSize: 14, color: T.ink }}>Sign in</Link>
              <div className="pt-1">
                <CTAButton to="/pricing">Get started</CTAButton>
              </div>
            </>
          )}
        </div>
      )}
    </header>
  );
}

function Footer() {
  const colTitle = { ...fM, fontSize: 11, letterSpacing: 2, color: "#5D656E" };
  const footLink = { ...fM, fontSize: 13, color: "#AEB6BF", textDecoration: "none" };
  return (
    <section style={{ background: T.ink }}>
      <footer className="max-w-5xl mx-auto px-5 pt-10 pb-6" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded flex items-center justify-center" style={{ background: T.signal }}>
                <span style={{ ...fM, fontSize: 12, fontWeight: 600, color: "#fff" }}>/</span>
              </span>
              <span style={{ ...fM, fontSize: 12, color: "#7A828B" }}>slashloop.dev — /loop for marketing</span>
            </div>
            <div className="mt-3 flex items-center gap-2.5">
              <img src="/manol.jpg" alt="Manol T." width="36" height="36" loading="lazy" className="rounded-full" style={{ width: 36, height: 36, objectFit: "cover" }} />
              <p style={{ ...fM, fontSize: 13, color: "#AEB6BF", lineHeight: 1.6 }}>
                Built by <a href="https://x.com/manol_ai" target="_blank" rel="noreferrer" style={{ color: "#fff", fontWeight: 600 }}>Manol T. (@manol_ai)</a> —
                turning TikTok trends into profitable apps. 20y dev, ex-funded founder cracking distribution with AI.
              </p>
            </div>
          </div>
          <div>
            <div style={colTitle}>PRODUCT</div>
            <div className="mt-3 flex flex-col gap-2">
              <Link to="/discover" style={footLink}>Discover</Link>
              <Link to="/sources" style={footLink}>Sources</Link>
              <Link to="/gallery" style={footLink}>Gallery</Link>
              <Link to="/experiments" style={footLink}>Experiments</Link>
              <Link to="/studio" style={footLink}>Studio</Link>
              <Link to="/calendar" style={footLink}>Calendar</Link>
              <Link to="/pricing" style={footLink}>Pricing</Link>
            </div>
          </div>
          <div>
            <div style={colTitle}>RESOURCES</div>
            <div className="mt-3 flex flex-col gap-2">
              <Link to="/agent-setup" style={footLink}>AI setup</Link>
              <Link to="/privacy" style={footLink}>Privacy</Link>
              <Link to="/terms" style={footLink}>Terms</Link>
              <button type="button" onClick={openCookieSettings} style={{ ...footLink, background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", textAlign: "left" }}>
                Cookie settings
              </button>
            </div>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 16 }}>
          <span style={{ ...fM, fontSize: 11, color: "#5D656E" }}>© 2026 · made with Claude Code, naturally</span>
        </div>
      </footer>
    </section>
  );
}

/** GDPR cookie banner — analytics (GA4) stays off until accept. Re-opens via
 *  the footer "Cookie settings" link (OPEN_SETTINGS_EVENT). The cookieless
 *  indiestack counter is unaffected and always on. */
function CookieBanner() {
  const [visible, setVisible] = useState(() => readConsent() === null);

  useEffect(() => {
    const reopen = () => setVisible(true);
    window.addEventListener(OPEN_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, reopen);
  }, []);

  if (!visible) return null;

  const choose = (value) => {
    writeConsent(value);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm rounded-xl p-4 z-50"
      style={{ background: T.card, border: `1px solid ${T.line}`, boxShadow: "0 12px 30px rgba(0,0,0,0.18)" }}
    >
      <p style={{ ...fM, fontSize: 12.5, color: T.ink, lineHeight: 1.6 }}>
        We use a sign-in cookie (required) and, with your permission, Google Analytics cookies
        to understand usage. See <Link to="/privacy" style={{ color: T.signal }}>Privacy</Link>.
      </p>
      <div className="mt-3 flex gap-2">
        <CTAButton onClick={() => choose("accepted")}>Accept</CTAButton>
        <GhostButton onClick={() => choose("rejected")}>Reject</GhostButton>
      </div>
    </div>
  );
}

export default function App() {
  useRoutePageviews();

  return (
    <div style={{ background: T.paper, fontFamily: "'Inter', sans-serif", color: T.ink }} className="min-h-screen">
      <style>{FONTS}</style>
      <Nav />
      <ErrorBoundary>
        <Suspense
          fallback={(
            <div className="flex items-center justify-center py-24" role="status" aria-label="Loading page">
              <Spinner />
            </div>
          )}
        >
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/agent-setup" element={<AgentSetup />} />
            <Route path="/login" element={<Login />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/account" element={<Account />} />
            <Route path="/settings/email" element={<EmailSettings />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/sources" element={<Sources />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/experiments" element={<Experiments />} />
            <Route path="/experiments/:experimentId" element={<Experiments />} />
            <Route path="/studio" element={<Studio />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/billing/success" element={<BillingSuccess />} />
            <Route path="/billing/cancel" element={<BillingCancel />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
      <CookieBanner />
      <Footer />
    </div>
  );
}

// GA4 only sees the initial load (the config snippet in index.html); every
// client-side route change after that has to be reported here.
function useRoutePageviews() {
  const { pathname, search } = useLocation();
  const last = useRef(null);

  useEffect(() => {
    const path = `${pathname}${search}`;
    if (last.current === null) {
      // First render: index.html's gtag config already sent this pageview.
      last.current = path;
      return;
    }
    if (last.current !== path) {
      last.current = path;
      trackPageview(path);
    }
  }, [pathname, search]);
}
