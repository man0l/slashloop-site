import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { T, fD, fB, fM } from "../lib/theme.js";
import { SectionLabel, CTAButton, GhostButton, Skeleton } from "../components/ui.jsx";
import CreditTopUp from "../components/CreditTopUp.jsx";
import FirstRunSteps from "../components/FirstRunSteps.jsx";
import { useAuth } from "../lib/auth.jsx";
import { getBillingStatus, createPortalSession } from "../lib/api.js";

export default function Account() {
  const { user, loading, accessToken, signOut } = useAuth();
  const [portalStatus, setPortalStatus] = useState("idle");

  const billingQuery = useQuery({
    queryKey: ["billing", accessToken],
    queryFn: () => getBillingStatus(accessToken),
    enabled: Boolean(accessToken),
    retry: 0,
  });
  const billing = billingQuery.data ?? null;

  if (loading) {
    return (
      <section className="max-w-2xl mx-auto px-5 py-16">
        <SectionLabel>ACCOUNT</SectionLabel>
        <h1 className="mt-3" style={{ ...fD, fontWeight: 900, fontSize: 32, letterSpacing: -0.8 }}>
          Account
        </h1>
        <div className="mt-8 rounded-xl p-6" style={{ background: T.card, border: `1px solid ${T.line}` }}>
          <Skeleton style={{ height: 11, width: 80 }} />
          <Skeleton className="mt-3" style={{ height: 24, width: 140 }} />
          <Skeleton className="mt-4" style={{ height: 40, width: "100%" }} />
        </div>
      </section>
    );
  }
  if (!user) return <Navigate to="/login?next=/account" replace />;

  async function openPortal() {
    setPortalStatus("loading");
    try {
      const { url } = await createPortalSession(accessToken);
      window.location.href = url;
    } catch {
      setPortalStatus("error");
    }
  }

  return (
    <section className="max-w-2xl mx-auto px-5 py-16">
      <SectionLabel>ACCOUNT</SectionLabel>
      <h1 className="mt-3" style={{ ...fD, fontWeight: 900, fontSize: 32, letterSpacing: -0.8 }}>
        {user.email}
      </h1>

      <FirstRunSteps />

      <div className="mt-8 rounded-xl p-6" style={{ background: T.card, border: `1px solid ${T.line}` }}>
        <div style={{ ...fM, fontSize: 11, letterSpacing: 2, color: T.muted }}>PLAN</div>
        {billingQuery.isError ? (
          <p className="mt-2" style={{ fontSize: 14, color: T.muted }}>
            {billingQuery.error?.message || "Couldn't load billing status."}{" "}
            <button
              type="button"
              onClick={() => billingQuery.refetch()}
              style={{ ...fB, fontSize: 13, color: T.signal, textDecoration: "underline" }}
            >
              Retry
            </button>
          </p>
        ) : !billing ? (
          <div className="mt-3 flex flex-col gap-2">
            <Skeleton style={{ height: 24, width: 140 }} />
            <Skeleton style={{ height: 40, width: "100%" }} />
          </div>
        ) : (
          <>
            <div className="mt-1 flex items-baseline gap-2">
              <span style={{ ...fD, fontWeight: 800, fontSize: 22, textTransform: "capitalize" }}>{billing.planKey}</span>
              {billing.billingStatus && billing.billingStatus !== "active" && (
                <span className="rounded px-2 py-0.5" style={{ ...fM, fontSize: 11, background: "#FDECEA", color: "#B3261E" }}>
                  {billing.billingStatus}
                </span>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4" style={{ ...fM, fontSize: 13 }}>
              <div>
                <div style={{ color: T.muted, fontSize: 11 }}>PLAN CREDITS</div>
                <div className="mt-1" style={{ fontSize: 18, fontWeight: 600 }}>{billing.planCredits}</div>
              </div>
              <div>
                <div style={{ color: T.muted, fontSize: 11 }}>PACK CREDITS</div>
                <div className="mt-1" style={{ fontSize: 18, fontWeight: 600 }}>{billing.packCredits}</div>
              </div>
            </div>
            {billing.periodEnd && (
              <p className="mt-3" style={{ ...fM, fontSize: 12, color: T.muted }}>
                Renews {new Date(billing.periodEnd).toLocaleDateString()}
              </p>
            )}
          </>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <GhostButton to="/pricing">Change plan</GhostButton>
          <GhostButton to="/settings/email">Email settings</GhostButton>
          <CTAButton onClick={openPortal} disabled={portalStatus === "loading"}>
            {portalStatus === "loading" ? "Opening…" : "Manage billing"}
          </CTAButton>
        </div>

        <div className="mt-6 pt-6" style={{ borderTop: `1px solid ${T.line}` }}>
          <div style={{ ...fM, fontSize: 11, letterSpacing: 2, color: T.muted }}>TOP UP CREDITS</div>
          <div className="mt-2">
            <CreditTopUp accessToken={accessToken} />
          </div>
        </div>

        {portalStatus === "error" && (
          <p className="mt-2" style={{ ...fM, fontSize: 12, color: "#B3261E" }}>
            Couldn't open the billing portal. Try again shortly.
          </p>
        )}
      </div>

      <button
        onClick={signOut}
        className="mt-6"
        style={{ ...fB, fontSize: 13, color: T.muted, textDecoration: "underline" }}
      >
        Sign out
      </button>
    </section>
  );
}
