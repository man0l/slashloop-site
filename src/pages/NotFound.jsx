import { T, fD, fM } from "../lib/theme.js";
import { SectionLabel, CTAButton } from "../components/ui.jsx";

/** Catch-all route — without it unknown paths render an empty gap between
 *  the header and footer. */
export default function NotFound() {
  return (
    <section className="max-w-md mx-auto px-5 py-24 text-center">
      <SectionLabel>404</SectionLabel>
      <h1 className="mt-3" style={{ ...fD, fontWeight: 900, fontSize: 30, letterSpacing: -0.8 }}>
        Nothing tracked here
      </h1>
      <p className="mt-3" style={{ ...fM, fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
        This page doesn't exist — the link may be old or mistyped.
      </p>
      <div className="mt-6 flex justify-center">
        <CTAButton to="/">Back to home →</CTAButton>
      </div>
    </section>
  );
}
