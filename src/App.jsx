import { lazy, Suspense, useEffect, useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { T, fD, fM, FONTS } from "./lib/theme.js";
import { CTAButton, GhostButton, Spinner } from "./components/ui.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { useAuth } from "./lib/auth.jsx";
import Home from "./pages/Home.jsx";

// The landing page ships in the entry chunk (it's what first-time visitors
// wait on); everything else becomes its own chunk so the app pages don't
// pay for the marketing pages' JS and vice versa.
const Pricing = lazy(() => import("./pages/Pricing.jsx"));
const Login = lazy(() => import("./pages/Login.jsx"));
const Account = lazy(() => import("./pages/Account.jsx"));
const EmailSettings = lazy(() => import("./pages/EmailSettings.jsx"));
const Sources = lazy(() => import("./pages/Sources.jsx"));
const Discover = lazy(() => import("./pages/Discover.jsx"));
const Gallery = lazy(() => import("./pages/Gallery.jsx"));
const Studio = lazy(() => import("./pages/Studio.jsx"));
const BillingSuccess = lazy(() => import("./pages/BillingSuccess.jsx"));
const BillingCancel = lazy(() => import("./pages/BillingCancel.jsx"));
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
  const { user, loading } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // A route change (following a link, or the "next" redirect after sign-in)
  // means the menu's job is done — leaving it open would cover the new page.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const loggedInLinks = (
    <>
      <Link to="/discover" onClick={() => setMenuOpen(false)} style={{ ...fM, fontSize: 13, color: T.ink }}>Discover</Link>
      <Link to="/sources" onClick={() => setMenuOpen(false)} style={{ ...fM, fontSize: 13, color: T.ink }}>Sources</Link>
      <Link to="/gallery" onClick={() => setMenuOpen(false)} style={{ ...fM, fontSize: 13, color: T.ink }}>Gallery</Link>
      <Link to="/studio" onClick={() => setMenuOpen(false)} style={{ ...fM, fontSize: 13, color: T.ink }}>Studio</Link>
    </>
  );

  return (
    <header className="max-w-5xl mx-auto px-5 py-5 relative">
      <div className="flex items-center justify-between">
        <Logo />
        {/* Desktop: full inline nav. Hidden below sm — a signed-in user's
            Sources/Gallery links have nowhere else to live at that width, so
            the hamburger below is the only way to reach them on mobile. */}
        <div className="hidden sm:flex items-center gap-4">
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
          className="sm:hidden p-1.5"
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
          className="sm:hidden absolute left-0 right-0 top-full mx-5 mt-2 rounded-xl p-4 flex flex-col gap-3.5 z-20"
          style={{ background: T.card, border: `1px solid ${T.line}`, boxShadow: "0 12px 30px rgba(0,0,0,0.12)" }}
        >
          <Link to="/pricing" onClick={() => setMenuOpen(false)} style={{ ...fM, fontSize: 14, color: T.ink }}>Pricing</Link>
          {loading ? null : user ? (
            <>
              {loggedInLinks}
              <Link to="/account" onClick={() => setMenuOpen(false)} style={{ ...fM, fontSize: 14, color: T.ink }}>Account</Link>
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
  return (
    <section style={{ background: T.ink }}>
      <footer className="max-w-5xl mx-auto px-5 py-6 flex flex-wrap items-center justify-between gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded flex items-center justify-center" style={{ background: T.signal }}>
            <span style={{ ...fM, fontSize: 12, fontWeight: 600, color: "#fff" }}>/</span>
          </span>
          <span style={{ ...fM, fontSize: 12, color: "#7A828B" }}>slashloop.app — /loop for marketing</span>
        </div>
        <span style={{ ...fM, fontSize: 11, color: "#5D656E" }}>© 2026 · made with Claude Code, naturally</span>
      </footer>
    </section>
  );
}

export default function App() {
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
            <Route path="/login" element={<Login />} />
            <Route path="/account" element={<Account />} />
            <Route path="/settings/email" element={<EmailSettings />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/sources" element={<Sources />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/studio" element={<Studio />} />
            <Route path="/billing/success" element={<BillingSuccess />} />
            <Route path="/billing/cancel" element={<BillingCancel />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
      <Footer />
    </div>
  );
}
