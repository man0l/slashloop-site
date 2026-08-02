import { useState } from "react";
import { T, fD, fB, fM } from "../lib/theme.js";
import { CTAButton } from "./ui.jsx";
import { createCheckoutSession, BillingApiError } from "../lib/api.js";

// 1 credit = $0.01 (src/lib/credits.ts in the slashloop repo) — the amount
// charged in cents becomes the credit grant 1:1, no separate price lookup.
const MIN_TOPUP = 10;
const MAX_TOPUP = 500;
const STEP = 5;

function clamp(n) {
  if (!Number.isFinite(n)) return MIN_TOPUP;
  return Math.min(MAX_TOPUP, Math.max(MIN_TOPUP, Math.round(n)));
}

/** Stepper input for a variable-amount credit top-up, $10 minimum. Shared by
 *  the Pricing and Account pages so both hit the same checkout flow. */
export default function CreditTopUp({ accessToken }) {
  const [amount, setAmount] = useState(MIN_TOPUP);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  async function topUp() {
    const dollars = clamp(amount);
    setAmount(dollars);
    setStatus("loading");
    setError("");
    try {
      const { url } = await createCheckoutSession(accessToken, { planKey: "pack", amountCents: dollars * 100 });
      window.location.href = url;
    } catch (err) {
      setStatus("error");
      setError(err instanceof BillingApiError ? err.message : "Something went wrong.");
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center rounded-md" style={{ border: `1.5px solid ${T.ink}` }}>
          <button
            type="button"
            onClick={() => setAmount((a) => clamp(a - STEP))}
            disabled={amount <= MIN_TOPUP}
            aria-label="Decrease amount"
            className="px-3 py-2 disabled:opacity-30"
            style={{ ...fB, fontSize: 18, fontWeight: 700, color: T.ink }}
          >
            −
          </button>
          <div className="flex items-baseline px-1" style={{ ...fD, fontWeight: 900, fontSize: 20 }}>
            <span>$</span>
            <input
              type="number"
              inputMode="numeric"
              min={MIN_TOPUP}
              max={MAX_TOPUP}
              step={STEP}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              onBlur={() => setAmount((a) => clamp(a))}
              className="text-center"
              style={{ ...fD, fontWeight: 900, fontSize: 20, width: 60, border: "none", outline: "none", background: "transparent" }}
            />
          </div>
          <button
            type="button"
            onClick={() => setAmount((a) => clamp(a + STEP))}
            disabled={amount >= MAX_TOPUP}
            aria-label="Increase amount"
            className="px-3 py-2 disabled:opacity-30"
            style={{ ...fB, fontSize: 18, fontWeight: 700, color: T.ink }}
          >
            +
          </button>
        </div>
        <CTAButton onClick={topUp} disabled={status === "loading"}>
          {status === "loading" ? "Redirecting…" : `Top up $${clamp(amount)} →`}
        </CTAButton>
      </div>
      <p className="mt-1.5" style={{ ...fM, fontSize: 11, color: T.muted }}>
        {(clamp(amount) * 100).toLocaleString()} credits · ${MIN_TOPUP} minimum · price excludes VAT
      </p>
      {status === "error" && (
        <p className="mt-2" style={{ ...fM, fontSize: 12, color: "#B3261E" }}>{error}</p>
      )}
    </div>
  );
}
