import { useState } from "react";
import { T, fD, fB, fM } from "../lib/theme.js";
import { SectionLabel, CTAButton, GhostButton } from "../components/ui.jsx";
import CreditTopUp from "../components/CreditTopUp.jsx";
import { useAuth } from "../lib/auth.jsx";
import { createCheckoutSession, BillingApiError } from "../lib/api.js";

const PLANS = [
  {
    key: "free",
    name: "Free",
    monthly: 0,
    annual: 0,
    credits: "300",
    sources: "2",
    gates: ["Manual refresh only", "1 seat"],
  },
  {
    key: "creator",
    name: "Creator",
    monthly: 29,
    annual: 290,
    credits: "3,000",
    sources: "10",
    gates: ["Scheduled weekly refresh", "1 seat"],
    highlight: true,
  },
  {
    key: "pro",
    name: "Pro",
    monthly: 79,
    annual: 790,
    credits: "10,000",
    sources: "30",
    gates: ["Scheduled daily refresh", "Alerts", "Direct API access"],
  },
];

const CREDIT_TABLE = [
  ["Browse feed, sources, boards, ideas, settings", "Free"],
  ["Refresh a source / discover search", "1.5 credits per video"],
  ["Analyze a video", "5 credits"],
  ["Extract hook / generate variations / create brief", "2 credits"],
];

function PlanCard({ plan, interval }) {
  const { user, accessToken } = useAuth();
  const [status, setStatus] = useState("idle"); // idle | loading | error
  const [error, setError] = useState("");

  const price = interval === "year" ? plan.annual : plan.monthly;
  const priceLabel = plan.key === "free" ? "$0" : `$${price}`;
  const period = plan.key === "free" ? "" : interval === "year" ? "/yr" : "/mo";

  async function upgrade() {
    setStatus("loading");
    setError("");
    try {
      const { url } = await createCheckoutSession(accessToken, { planKey: plan.key, interval });
      window.location.href = url;
    } catch (err) {
      setStatus("error");
      setError(err instanceof BillingApiError ? err.message : "Something went wrong.");
    }
  }

  return (
    <div
      className="rounded-xl p-6 flex flex-col"
      style={{
        background: T.card,
        border: plan.highlight ? `2px solid ${T.signal}` : `1px solid ${T.line}`,
        boxShadow: plan.highlight ? "0 12px 30px rgba(255,77,0,0.15)" : "none",
      }}
    >
      {plan.highlight && (
        <div style={{ ...fM, fontSize: 10, letterSpacing: 2, color: T.signal, fontWeight: 600 }}>MOST POPULAR</div>
      )}
      <div className="mt-1" style={{ ...fD, fontWeight: 800, fontSize: 20 }}>{plan.name}</div>
      <div className="mt-3 flex items-baseline gap-1">
        <span style={{ ...fD, fontWeight: 900, fontSize: 36 }}>{priceLabel}</span>
        <span style={{ ...fM, fontSize: 13, color: T.muted }}>{period}</span>
      </div>
      <div className="mt-1" style={{ ...fM, fontSize: 12, color: T.muted }}>
        {plan.credits} credits/mo · {plan.sources} sources
      </div>
      <ul className="mt-5 space-y-2 flex-1">
        {plan.gates.map((g) => (
          <li key={g} className="flex items-start gap-2" style={{ fontSize: 14, color: "#3A424B" }}>
            <span style={{ color: T.teal }}>✓</span>{g}
          </li>
        ))}
      </ul>
      <div className="mt-6">
        {plan.key === "free" ? (
          <GhostButton to={user ? "/account" : "/login"}>
            {user ? "You're on Free" : "Start free"}
          </GhostButton>
        ) : !user ? (
          <CTAButton big to={`/login?next=/pricing`}>Sign in to upgrade</CTAButton>
        ) : (
          <CTAButton big onClick={upgrade} disabled={status === "loading"}>
            {status === "loading" ? "Redirecting…" : `Upgrade to ${plan.name} →`}
          </CTAButton>
        )}
        {status === "error" && (
          <p className="mt-2" style={{ ...fM, fontSize: 12, color: "#B3261E" }}>{error}</p>
        )}
      </div>
    </div>
  );
}

function BuyMoreCredits() {
  const { user, accessToken } = useAuth();

  return (
    <div
      className="mt-8 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5"
      style={{ background: T.card, border: `1px solid ${T.line}` }}
    >
      <div>
        <div style={{ ...fM, fontSize: 11, letterSpacing: 2, color: T.signal }}>NEED MORE CREDITS?</div>
        <h2 className="mt-2" style={{ ...fD, fontWeight: 800, fontSize: 22, letterSpacing: -0.5 }}>
          Top up anytime
        </h2>
        <p className="mt-1.5" style={{ fontSize: 14, lineHeight: 1.55, color: "#3A424B", maxWidth: 420 }}>
          Buy credits without a subscription bump — they go into the same balance and never expire
          while your account is active.
        </p>
      </div>
      <div className="shrink-0">
        {!user ? (
          <CTAButton big to="/login?next=/pricing">Sign in to buy →</CTAButton>
        ) : (
          <CreditTopUp accessToken={accessToken} />
        )}
      </div>
    </div>
  );
}

export default function Pricing() {
  const [interval, setInterval_] = useState("month");

  return (
    <section className="max-w-5xl mx-auto px-5 py-16">
      <SectionLabel>PRICING</SectionLabel>
      <h1 className="mt-3" style={{ ...fD, fontWeight: 900, fontSize: "clamp(30px,4.5vw,44px)", letterSpacing: -1 }}>
        Pay for what you scrape, not a seat.
      </h1>
      <p className="mt-3" style={{ fontSize: 16, lineHeight: 1.6, color: "#3A424B", maxWidth: 560 }}>
        Every plan includes the full toolset. Credits meter the parts that cost us real money —
        scraping and AI analysis. Reading your feed, boards, and ideas is always free.
      </p>

      <div className="mt-7 inline-flex rounded-md p-1" style={{ background: "rgba(20,24,29,0.06)" }}>
        {["month", "year"].map((iv) => (
          <button
            key={iv}
            onClick={() => setInterval_(iv)}
            className="rounded px-4 py-1.5 transition-colors"
            style={{
              ...fB,
              fontSize: 13,
              fontWeight: 600,
              background: interval === iv ? T.ink : "transparent",
              color: interval === iv ? "#fff" : T.ink,
            }}
          >
            {iv === "month" ? "Monthly" : "Annual · 2 months free"}
          </button>
        ))}
      </div>

      <div className="mt-6 grid md:grid-cols-3 gap-5">
        {PLANS.map((p) => (
          <PlanCard key={p.key} plan={p} interval={interval} />
        ))}
      </div>

      <BuyMoreCredits />

      <div className="mt-16">
        <SectionLabel>WHAT A CREDIT BUYS</SectionLabel>
        <div className="mt-4 rounded-xl overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
          {CREDIT_TABLE.map(([action, cost], i) => (
            <div
              key={action}
              className="flex items-center justify-between px-5 py-3.5"
              style={{ background: i % 2 ? T.card : "rgba(20,24,29,0.02)", borderTop: i ? `1px solid ${T.line}` : "none" }}
            >
              <span style={{ fontSize: 14, color: T.ink }}>{action}</span>
              <span style={{ ...fM, fontSize: 13, fontWeight: 600, color: T.teal }}>{cost}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
