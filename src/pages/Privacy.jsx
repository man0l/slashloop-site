import { T, fD, fM } from "../lib/theme.js";

const H = ({ children }) => (
  <h2 className="mt-8" style={{ ...fD, fontWeight: 800, fontSize: 19, letterSpacing: -0.3 }}>
    {children}
  </h2>
);

const P = ({ children }) => (
  <p className="mt-3" style={{ ...fM, fontSize: 13.5, color: T.ink, lineHeight: 1.7 }}>
    {children}
  </p>
);

const LI = ({ children }) => (
  <li className="mt-1.5" style={{ ...fM, fontSize: 13.5, color: T.ink, lineHeight: 1.7 }}>
    {children}
  </li>
);

/** Privacy Policy — served at /privacy. GDPR-ready: controller identity,
 *  Art. 6 legal bases per purpose, rights procedure, breach notification,
 *  SCC-covered transfers, cookie consent, retention schedule, and the
 *  connected-accounts scheduler terms (TikTok / YouTube / Instagram OAuth,
 *  token storage, publishing on user direction). Scheduler-industry model
 *  (Hootsuite / Buffer): Account Data vs Content; platform terms take over
 *  once content leaves our service. */
export default function Privacy() {
  return (
    <section className="max-w-2xl mx-auto px-5 py-14">
      <p style={{ ...fM, fontSize: 12, color: T.muted }}>Last updated: September 17, 2026</p>
      <h1 className="mt-2" style={{ ...fD, fontWeight: 900, fontSize: 32, letterSpacing: -0.8 }}>
        Privacy Policy
      </h1>
      <P>
        Slashloop (“we”, “us”) is operated by Pazaruvai Umno Ltd., Bulgaria — the{" "}
        <strong>data controller</strong> for Account Data described below. Contact for all
        privacy matters (including GDPR requests): support@slashloop.dev. We respond within{" "}
        <strong>30 days</strong>.
      </P>

      <H>1. The two kinds of data we hold</H>
      <P>
        Following industry practice for social-media management tools, we distinguish:
      </P>
      <ul className="list-disc pl-5">
        <LI><strong>Account Data</strong> — information that identifies you and lets you use the service: name, email address, authentication identifiers (Supabase user id), plan and billing status, credit balance, and workspace membership.</LI>
        <LI><strong>Content</strong> — data you upload, track, or ask us to publish: tracked creators and hashtags, video metadata and scores, AI analyses, hooks and briefs, scheduled captions and media, and anything fetched from connected social accounts to display or publish.</LI>
      </ul>
      <P>
        We act as <strong>controller</strong> for Account Data and as <strong>processor</strong>{" "}
        for Content we handle on your behalf and at your direction. A data-processing addendum
        (DPA) reflecting this policy is available on request at support@slashloop.dev.
      </P>

      <H>2. Legal bases (GDPR Art. 6)</H>
      <P>We process personal data only on these bases, per purpose:</P>
      <ul className="list-disc pl-5">
        <LI><strong>Contract (Art. 6(1)(b))</strong> — account administration, workspaces, credit metering, publishing your scheduled posts, support replies.</LI>
        <LI><strong>Consent (Art. 6(1)(a))</strong> — OAuth connections to TikTok/YouTube/Instagram (granted in each platform's consent screen, withdrawable by disconnecting), analytics cookies (granted via the cookie banner, withdrawable anytime).</LI>
        <LI><strong>Legal obligation (Art. 6(1)(c))</strong> — invoices and tax records (kept 10 years under Bulgarian accounting law).</LI>
        <LI><strong>Legitimate interests (Art. 6(1)(f))</strong> — service security and abuse prevention, aggregated product analytics, and service emails about your account. Balanced against your rights; object anytime at support@slashloop.dev.</LI>
      </ul>
      <P>
        Providing Account Data is necessary to use the service; without it we cannot create or
        operate your account. OAuth scopes are optional per platform — declining only disables
        that platform's connection.
      </P>

      <H>3. Connected social accounts</H>
      <P>
        When you link a TikTok, YouTube, or Instagram account, you authorize us through that
        platform's official OAuth flow (legal basis: consent). We receive and store:
      </P>
      <ul className="list-disc pl-5">
        <LI>Profile identifiers: username / channel handle, display name, avatar URL, and the platform's internal account id.</LI>
        <LI>OAuth <strong>access tokens and refresh tokens</strong>, stored encrypted. Access tokens are short-lived (about 1 hour for YouTube, 24 hours for TikTok, ~60 days for Instagram) and refreshed automatically so scheduled posts can publish.</LI>
        <LI>Content you schedule: captions, settings, and media files you upload for publishing.</LI>
        <LI>Publishing results returned by the platform (post ids, URLs, error messages).</LI>
      </ul>
      <P>
        We access connected accounts <strong>only to provide the service you directed</strong> —
        listing your accounts, refreshing tokens, and publishing content you scheduled. We never
        post anything you did not schedule, and never use your accounts for our own purposes.
      </P>
      <P>
        <strong>Withdrawing consent:</strong> disconnect the account on the Calendar page (this
        deletes its tokens from our systems immediately), and additionally revoke at the
        platform side — Google account permissions (myaccount.google.com/permissions) for
        YouTube, TikTok authorized-app settings, or Facebook Business integrations for Instagram.
      </P>
      <P>
        Once content is published to a platform, it is governed by <strong>that platform's
        privacy policy and terms</strong> (TikTok, Google/YouTube, Meta), not this policy. Review
        them before connecting: we are not responsible for data once it leaves our service.
      </P>

      <H>4. Billing data</H>
      <P>
        Payments are processed by <strong>Stripe</strong> (legal basis: contract + legal
        obligation for invoicing). We never see or store full card numbers: Stripe gives us a
        customer id, subscription status, and invoice history, kept against your workspace for
        plan provisioning, credit top-ups, and tax records. Stripe's own privacy policy governs
        the payment data you enter on Stripe-hosted pages.
      </P>

      <H>5. Research, analytics, and AI processing</H>
      <ul className="list-disc pl-5">
        <LI>Public short-form video metadata (views, likes, captions, thumbnails) fetched via licensed scrapers for the sources you track (basis: contract — this is the research service).</LI>
        <LI>Media you upload is stored on Cloudflare R2 and, for scheduled video posts, re-encoded to strip metadata before publishing.</LI>
        <LI>Video analysis and brief generation run through AI providers (Google Gemini, OpenRouter) under data-processing agreements (basis: contract). <strong>No solely automated decisions with legal or similarly significant effect</strong> are made about you: scores and drafts are advisory, and nothing publishes without your scheduling action plus your review (TikTok drafts require your in-app release).</LI>
        <LI>Product analytics: a cookieless aggregate counter (no identifiers, basis: legitimate interests) plus Google Analytics 4, which sets cookies and runs <strong>only after you accept</strong> in the cookie banner (basis: consent) — see §7.</LI>
      </ul>

      <H>6. Subprocessors</H>
      <P>
        We use only processors bound by Art. 28 DPAs, and publish changes here before they take effect:
      </P>
      <ul className="list-disc pl-5">
        <LI>Supabase (EU) — authentication and primary database</LI>
        <LI>Cloudflare (EU) — hosting, Workers, D1 database, R2 media storage</LI>
        <LI>Stripe (EU/US, SCCs) — payments and subscriptions</LI>
        <LI>Google Gemini / OpenRouter (US, SCCs) — AI analysis and generation</LI>
        <LI>Apify (EU) — licensed TikTok data collection</LI>
        <LI>Resend (US, SCCs) — transactional email</LI>
        <LI>Vercel (EU) — frontend hosting</LI>
      </ul>

      <H>7. Cookies</H>
      <P>
        We use a strictly-necessary session cookie for sign-in, and <strong>analytics cookies
        (Google Analytics 4) only after you accept</strong> in the cookie banner (basis:
        consent). Rejecting analytics does not affect the service. You can withdraw consent
        anytime via the “Cookie settings” link in the footer, which re-opens the banner, or by
        blocking cookies in your browser (sign-in requires the session cookie).
      </P>

      <H>8. International transfers</H>
      <P>
        Primary data stays in the EU/EEA (Cloudflare Western Europe, Vercel EU, Supabase EU).
        Where a processor operates in the US (Stripe, Google, OpenRouter, Resend), transfers rely
        on the EU Standard Contractual Clauses plus supplementary safeguards, reviewed
        periodically. No transfers are made to any other third country.
      </P>

      <H>9. Retention schedule</H>
      <ul className="list-disc pl-5">
        <LI>OAuth tokens — deleted immediately on disconnect; refresh tokens of removed accounts are purged within 24 hours by an automated sweep.</LI>
        <LI>Uploaded media — per workspace retention settings (default 3 days for thumbnails and media), then auto-purged.</LI>
        <LI>Account Data and Content — while your account is active, plus 30 days in backups after deletion.</LI>
        <LI>Invoices and tax records — 10 years (Bulgarian accounting law).</LI>
        <LI>Security logs — 12 months.</LI>
      </ul>
      <P>
        Full deletion on request at support@slashloop.dev erases workspaces, integrations,
        tokens, and media, keeping only what tax law requires.
      </P>

      <H>10. Your GDPR rights</H>
      <P>
        Access, rectification, erasure, restriction, portability (machine-readable export),
        objection (including to legitimate-interests processing and any direct marketing), and
        withdrawing consent at any time without affecting prior lawful processing. Most Account
        Data is editable in-app; anything else — including full export or deletion — via
        support@slashloop.dev within 30 days. If unresolved, complain to the Commission for
        Personal Data Protection (CPDP, cpdp.bg) or your local supervisory authority.
      </P>

      <H>11. Security and breach notification</H>
      <P>
        TLS in transit, encryption at rest, managed secret stores, least-privilege access, and
        audit logging. If a breach is likely to risk your rights, we notify the CPDP without
        undue delay and within 72 hours of discovery, and inform affected users directly when
        required by Art. 34 GDPR.
      </P>

      <H>12. Children</H>
      <P>The service is for users 18 and older. We do not knowingly collect data from children; discovered accounts are removed.</P>

      <H>13. Changes</H>
      <P>
        Material changes are announced here and, for account holders, by email at least 14 days
        before taking effect. Continued use after that means you accept the revised policy; if
        you disagree, delete your account before the effective date.
      </P>
    </section>
  );
}
