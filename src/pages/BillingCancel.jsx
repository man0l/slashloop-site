import { T, fD } from "../lib/theme.js";
import { SectionLabel, CTAButton } from "../components/ui.jsx";

// No API calls, no state changes — Stripe sends the user here on Checkout
// cancel, and nothing about their account changed.
export default function BillingCancel() {
  return (
    <section className="max-w-md mx-auto px-5 py-24 text-center">
      <SectionLabel>CHECKOUT CANCELED</SectionLabel>
      <h1 className="mt-3" style={{ ...fD, fontWeight: 900, fontSize: 30, letterSpacing: -0.8 }}>
        No charge made
      </h1>
      <p className="mt-3" style={{ fontSize: 14, lineHeight: 1.6, color: "#3A424B" }}>
        Your plan is unchanged. Come back to pricing whenever you're ready.
      </p>
      <div className="mt-6">
        <CTAButton big to="/pricing">Back to pricing →</CTAButton>
      </div>
    </section>
  );
}
