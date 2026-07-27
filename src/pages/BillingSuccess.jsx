import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { T, fD, fM } from "../lib/theme.js";
import { SectionLabel, CTAButton } from "../components/ui.jsx";
import { useAuth } from "../lib/auth.jsx";
import { getBillingStatus } from "../lib/api.js";

const POLL_MS = 2000;
const MAX_ATTEMPTS = 15; // ~30s — the webhook usually lands well before this.

// Grants nothing here. Stripe's webhook is the only thing that upgrades the
// workspace (docs/stripe-implementation-plan.md §5); this page only watches
// for that to land, because the redirect back from Checkout can beat it.
export default function BillingSuccess() {
  const { user, loading, accessToken } = useAuth();
  const [phase, setPhase] = useState("polling"); // polling | done | timeout
  const attempts = useRef(0);
  const startedPlan = useRef(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    async function poll() {
      try {
        const status = await getBillingStatus(accessToken);
        if (startedPlan.current === null) startedPlan.current = status.planKey;
        if (cancelled) return;
        if (status.planKey !== startedPlan.current) {
          setPhase("done");
          return;
        }
      } catch {
        // Swallow — most likely the billing routes aren't live yet. Keep
        // polling until MAX_ATTEMPTS rather than surfacing a scary error
        // on what should be a celebratory page.
      }
      attempts.current += 1;
      if (attempts.current >= MAX_ATTEMPTS) {
        if (!cancelled) setPhase("timeout");
        return;
      }
      if (!cancelled) setTimeout(poll, POLL_MS);
    }

    poll();
    return () => { cancelled = true; };
  }, [accessToken]);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <section className="max-w-md mx-auto px-5 py-24 text-center">
      <SectionLabel>{phase === "done" ? "YOU'RE UPGRADED" : "ONE MOMENT"}</SectionLabel>
      <h1 className="mt-3" style={{ ...fD, fontWeight: 900, fontSize: 30, letterSpacing: -0.8 }}>
        {phase === "done" ? "Payment confirmed" : "Provisioning your plan…"}
      </h1>
      <p className="mt-3" style={{ fontSize: 14, lineHeight: 1.6, color: "#3A424B" }}>
        {phase === "polling" && "Stripe just told us — we're syncing your credits now. This is usually instant."}
        {phase === "done" && "Your credits are ready."}
        {phase === "timeout" && "This is taking longer than usual. Your payment went through — the credits will land within a few minutes. Check your account page shortly."}
      </p>
      {phase === "polling" && (
        <div className="mt-6 flex justify-center">
          <span style={{ ...fM, fontSize: 20, color: T.signal, animation: "blink 1s step-end infinite" }}>●</span>
        </div>
      )}
      {phase !== "polling" && (
        <div className="mt-6">
          <CTAButton big to="/account">Go to account →</CTAButton>
        </div>
      )}
    </section>
  );
}
