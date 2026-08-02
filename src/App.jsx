import { Link, Route, Routes } from "react-router-dom";
import { T, fD, fM, FONTS } from "./lib/theme.js";
import { CTAButton, GhostButton } from "./components/ui.jsx";
import { useAuth } from "./lib/auth.jsx";
import Home from "./pages/Home.jsx";
import Pricing from "./pages/Pricing.jsx";
import Login from "./pages/Login.jsx";
import Account from "./pages/Account.jsx";
import Sources from "./pages/Sources.jsx";
import Gallery from "./pages/Gallery.jsx";
import BillingSuccess from "./pages/BillingSuccess.jsx";
import BillingCancel from "./pages/BillingCancel.jsx";

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

function Nav() {
  const { user, loading } = useAuth();
  return (
    <header className="max-w-5xl mx-auto px-5 py-5 flex items-center justify-between">
      <Logo />
      <div className="flex items-center gap-3">
        <Link to="/pricing" className="hidden sm:inline" style={{ ...fM, fontSize: 13, color: T.ink }}>
          Pricing
        </Link>
        {loading ? null : user ? (
          <>
            <Link to="/sources" className="hidden sm:inline" style={{ ...fM, fontSize: 13, color: T.ink }}>
              Sources
            </Link>
            <Link to="/gallery" className="hidden sm:inline" style={{ ...fM, fontSize: 13, color: T.ink }}>
              Gallery
            </Link>
            <CTAButton to="/account">Account</CTAButton>
          </>
        ) : (
          <>
            <GhostButton to="/login">Sign in</GhostButton>
            <CTAButton to="/pricing">Get started</CTAButton>
          </>
        )}
      </div>
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
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/account" element={<Account />} />
        <Route path="/sources" element={<Sources />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/billing/success" element={<BillingSuccess />} />
        <Route path="/billing/cancel" element={<BillingCancel />} />
      </Routes>
      <Footer />
    </div>
  );
}
