import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { T, fD, fM } from "../lib/theme.js";
import { SectionLabel, CTAButton } from "../components/ui.jsx";
import { useAuth } from "../lib/auth.jsx";
import { getBillingStatus } from "../lib/api.js";

const POLL_MS = 1500;
const MAX_ATTEMPTS = 20; // ~30s

/**
 * Webhook often beats this redirect. First poll may already show creator/pro —
 * treat that as done. Pack top-ups keep planKey; watch packCredits rise.
 */
function isProvisioned(status, baseline) {
  if (!status) return false;
  const key = String(status.planKey || "").toLowerCase();
  if (key === "creator" || key === "pro") {
    const bs = String(status.billingStatus || "").toLowerCase();
    return !bs || bs === "active" || bs === "past_due";
  }
  if (baseline && status.planKey !== baseline.planKey) return true;
  if (
    baseline &&
    typeof status.packCredits === "number" &&
    status.packCredits > baseline.packCredits
  ) {
    return true;
  }
  if (typeof status.planCredits === "number" && status.planCredits >= 3000) return true;
  return false;
}

export default function BillingSuccess() {
  const { user, loading, accessToken } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState("polling"); // polling | done | timeout
  const [snapshot, setSnapshot] = useState(null);
  const [lastError, setLastError] = useState("");
  const attempts = useRef(0);
  const baseline = useRef(null);
  const lastStatus = useRef(null);
  const finished = useRef(false);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    function finish(nextPhase, status) {
      if (finished.current || cancelled) return;
      finished.current = true;
      if (status) {
        lastStatus.current = status;
        setSnapshot(status);
      }
      setPhase(nextPhase);
      if (nextPhase === "done") {
        setTimeout(() => {
          if (!cancelled) navigate("/account", { replace: true });
        }, 1800);
      }
    }

    async function poll() {
      try {
        const status = await getBillingStatus(accessToken);
        if (cancelled) return;
        lastStatus.current = status;
        setSnapshot(status);
        setLastError("");

        if (baseline.current === null) {
          baseline.current = {
            planKey: status.planKey,
            packCredits: status.packCredits ?? 0,
          };
        }

        if (isProvisioned(status, baseline.current)) {
          finish("done", status);
          return;
        }
      } catch (err) {
        if (!cancelled) {
          setLastError(err?.message || "Could not reach billing status");
        }
      }

      attempts.current += 1;
      if (attempts.current >= MAX_ATTEMPTS) {
        if (isProvisioned(lastStatus.current, baseline.current)) {
          finish("done", lastStatus.current);
          return;
        }
        try {
          const status = await getBillingStatus(accessToken);
          if (isProvisioned(status, baseline.current || status)) {
            finish("done", status);
            return;
          }
          lastStatus.current = status;
          setSnapshot(status);
        } catch {
          /* keep timeout */
        }
        if (!cancelled && !finished.current) setPhase("timeout");
        return;
      }
      if (!cancelled) setTimeout(poll, POLL_MS);
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [accessToken, navigate]);

  if (loading) return null;
  if (!user) return <Navigate to="/login?next=/billing/success" replace />;

  const planLabel = snapshot?.planKey
    ? String(snapshot.planKey).charAt(0).toUpperCase() + String(snapshot.planKey).slice(1)
    : null;

  return (
    <section className="max-w-md mx-auto px-5 py-24 text-center">
      <SectionLabel>
        {phase === "done" ? "YOU'RE UPGRADED" : phase === "timeout" ? "PAYMENT RECEIVED" : "ONE MOMENT"}
      </SectionLabel>
      <h1 className="mt-3" style={{ ...fD, fontWeight: 900, fontSize: 30, letterSpacing: -0.8 }}>
        {phase === "done"
          ? "Payment confirmed"
          : phase === "timeout"
            ? "You're set — open Account"
            : "Provisioning your plan…"}
      </h1>
      <p className="mt-3" style={{ fontSize: 14, lineHeight: 1.6, color: "#3A424B" }}>
        {phase === "polling" &&
          "Stripe confirmed payment. Syncing credits — usually under a few seconds."}
        {phase === "done" && (
          <>
            Your credits are ready
            {planLabel ? (
              <>
                {" "}
                — <strong>{planLabel}</strong>
                {typeof snapshot?.planCredits === "number"
                  ? ` · ${(snapshot.planCredits + (snapshot.packCredits ?? 0)).toLocaleString()} credits`
                  : ""}
              </>
            ) : null}
            . Taking you to your account…
          </>
        )}
        {phase === "timeout" && (
          <>
            Stripe has your payment. Open <strong>Account</strong> to see your plan and credits left
            (hard-refresh if this tab was open during checkout).
            {snapshot?.planKey ? (
              <>
                {" "}
                Last status: <strong>{planLabel}</strong>
                {typeof snapshot.planCredits === "number"
                  ? ` · ${(snapshot.planCredits + (snapshot.packCredits ?? 0)).toLocaleString()} credits`
                  : ""}
                .
              </>
            ) : null}
          </>
        )}
      </p>
      {phase === "polling" && (
        <div className="mt-6 flex justify-center">
          <span style={{ ...fM, fontSize: 20, color: T.signal, animation: "blink 1s step-end infinite" }}>
            ●
          </span>
        </div>
      )}
      {lastError && phase === "polling" && (
        <p className="mt-4" style={{ ...fM, fontSize: 11, color: T.muted }}>
          Retrying… ({lastError})
        </p>
      )}
      {(phase === "timeout" || phase === "done") && (
        <div className="mt-6">
          <CTAButton big to="/account">
            Go to account →
          </CTAButton>
        </div>
      )}
      {phase === "polling" && (
        <div className="mt-8">
          <CTAButton to="/account">Skip to account →</CTAButton>
        </div>
      )}
    </section>
  );
}
