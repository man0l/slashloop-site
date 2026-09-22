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

/** Terms of Use — served at /terms. Covers research + scheduler, plans and
 *  credits billing via Stripe, and the connected-accounts publishing terms
 *  (user responsibility, platform compliance, drafts behavior), following the
 *  scheduler-industry standard (Buffer / Hootsuite) adapted to Slashloop. */
export default function Terms() {
  return (
    <section className="max-w-2xl mx-auto px-5 py-14">
      <p style={{ ...fM, fontSize: 12, color: T.muted }}>Last updated: September 22, 2026</p>
      <h1 className="mt-2" style={{ ...fD, fontWeight: 900, fontSize: 32, letterSpacing: -0.8 }}>
        Terms of Use
      </h1>
      <P>
        These terms form an agreement between you and Pazaruvai Umno Ltd. (“Slashloop”, “we”)
        for the use of slashloop.dev, the short-form video research product, and the
        connected-accounts scheduler for TikTok, YouTube, and Instagram. By creating an
        account or using the service you accept these terms. Contact: support@slashloop.dev.
      </P>

      <H>1. The service</H>
      <P>
        Slashloop helps creators research short-form video (tracking creators and hashtags,
        outlier scoring, AI video analysis, hooks and briefs) and schedule posts to social
        accounts they connect. Research reads are provided as-is for creative guidance; publishing
        acts strictly on content and schedules you define.
      </P>

      <H>2. Eligibility and accounts</H>
      <ul className="list-disc pl-5">
        <LI>You must be 18 or older, and have authority to bind your company if you accept on its behalf.</LI>
        <LI>Accounts use Supabase sign-in (Google or GitHub). You are responsible for keeping your credentials confidential and for everything done under your account — notify us immediately at support@slashloop.dev if it is compromised.</LI>
      </ul>

      <H>3. Plans, credits, and billing</H>
      <ul className="list-disc pl-5">
        <LI><strong>Plans.</strong> Free ($0, 300 credits/month), Creator ($29/month), Pro ($79/month); annual billing gives 2 months free. Plan credits refill each billing period and do not roll over.</LI>
        <LI><strong>Credit packs.</strong> One-off top-ups land in the same balance and <strong>never expire</strong>.</LI>
        <LI><strong>Processing.</strong> Stripe processes all payments; by subscribing you also accept Stripe's terms. Prices exclude VAT where applicable; EU VAT is collected via Stripe Tax where required.</LI>
        <LI><strong>Changes and cancellation.</strong> Cancel anytime from the Account page — you keep paid access until the period ends. Consumed credits and elapsed subscription time are non-refundable. We may change prices with 30 days' notice; changes apply from your next renewal.</LI>
        <LI><strong>Credits have no cash value</strong>, are non-transferable, and are a usage allowance, not a deposit.</LI>
      </ul>

      <H>4. Connected accounts and publishing</H>
      <ul className="list-disc pl-5">
        <LI><strong>Your direction.</strong> We publish only content you composed and scheduled, to accounts you connected, at times you chose. OAuth tokens are used solely for listing accounts, refreshing sessions, and publishing your scheduled posts.</LI>
        <LI><strong>Drafts.</strong> TikTok uploads from unaudited developer apps land as <strong>drafts/private posts</strong> in your TikTok inbox for you to review and release — nothing goes public without your action in TikTok. Instagram requires a Business/Creator account linked to a Facebook Page; YouTube uploads respect the privacy setting you choose per post.</LI>
        <LI><strong>Your responsibility.</strong> You own your content and are solely responsible for it: rights to music, footage, faces, and brands; truthfulness of claims; and compliance with each platform's terms and community guidelines (TikTok, YouTube, Meta) as well as applicable law (advertising disclosure, copyright, defamation).</LI>
        <LI><strong>Platform limits.</strong> Publishing depends on third-party platforms: their rate limits, review states, outages, or policy enforcement can delay or block posts. We surface platform errors in the calendar but are not liable for platform-side refusals.</LI>
        <LI><strong>Disconnect anytime.</strong> Removing an account stops all future publishing from it and deletes its tokens immediately; already-published posts stay live on the platform under that platform's terms.</LI>
      </ul>

      <H>5. Acceptable use</H>
      <P>You must not, and must not allow others to:</P>
      <ul className="list-disc pl-5">
        <LI>Spam, mislead, impersonate, harass, or post unlawful, infringing, or hateful content through connected accounts.</LI>
        <LI>Share accounts to evade platform enforcement, resell access, or use the service to build a competing scraping/publishing product.</LI>
        <LI>Probe, overload, or bypass the service's authentication, metering, or rate limits.</LI>
      </ul>
      <P>We may throttle, suspend, or terminate accounts that breach these terms or trigger platform enforcement against our developer apps.</P>

      <H>6. Your content, our license, and data protection</H>
      <P>
        You retain all rights in content you upload or schedule. You grant us a limited,
        revocable license to store, re-encode (metadata scrub), and transmit that content
        to the platforms you selected, solely to provide the service. AI-generated analyses,
        hooks, and briefs are provided for inspiration without any accuracy warranty.
      </P>
      <P>
        Personal-data handling is governed by our Privacy Policy (incorporated here by
        reference): we are controller for Account Data and processor for Content handled on
        your behalf; a data-processing addendum is available on request at
        support@slashloop.dev. By connecting a social account you confirm you have the
        authority to grant the requested permissions for that account.
      </P>
      <P>
        We measure site usage to operate and improve the service: an aggregate cookieless
        counter and <strong>Google Analytics 4</strong> run for all visitors. Google Analytics
        sets cookies only if you accept them in the cookie banner — otherwise it measures
        usage without cookies. Details and your choices are in the Privacy Policy (§5 and §7).
      </P>

      <H>7. Termination</H>
      <P>
        Either side may end this agreement: you by deleting your account (export first —
        deletion is permanent), us with 14 days' notice for convenience or immediately for
        breach or non-payment. On termination, scheduled unpublished posts are cancelled and
        tokens deleted; paid plan access runs to the end of the billing period.
      </P>

      <H>8. Disclaimers and liability</H>
      <P>
        The service is provided “as is” without warranties of any kind. To the maximum extent
        permitted by law, our aggregate liability is limited to the fees you paid in the 12
        months before the claim, and we are not liable for indirect losses — including reach,
        revenue, or account standing on third-party platforms.
      </P>

      <H>9. Changes and governing law</H>
      <P>
        We may update these terms with 14 days' notice posted here; material billing changes
        follow §3 notice periods. These terms are governed by the laws of Bulgaria, and disputes
        go to the courts of Sofia, without prejudice to mandatory EU consumer protections.
      </P>
    </section>
  );
}
