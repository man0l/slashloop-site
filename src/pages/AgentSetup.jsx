import { useState } from "react";
import { T, fD, fB, fM } from "../lib/theme.js";
import { SectionLabel, CTAButton, GhostButton } from "../components/ui.jsx";

// "Onboard your AI agent" — three copy-paste prompts a human hands to their
// agent (Claude Code, Cowork, ChatGPT…), in dependency order:
//
//   1. INSTALL — register the slashloop MCP server in the agent's client
//   2. CONNECT — sign in via OAuth so MCP tools run as the user's account
//   3. DEPLOY — fork + deploy this site against that same account
//
// Everything the agent needs is baked into the prompt text (URLs, env var
// names, route paths) so no tab-switching is required. Facts mirror
// public/llms.txt (MCP endpoint, OAuth flow), README (env + deploy), and
// src/lib/* (Supabase = same project as the MCP). Keep them in sync.

const MCP_URL = "https://mcp.slashloop.dev/mcp";
const SITE_URL = "https://slashloop.dev";

const INSTALL_PROMPT = `Onboard me onto slashloop's MCP server.

1. Register the slashloop MCP server at ${MCP_URL} in my MCP client:
   - Claude Code CLI: \`claude mcp add --transport http slashloop ${MCP_URL}\`
   - Claude Code plugin marketplace: \`/plugin marketplace add man0l/slashloop\`
   - Claude Desktop / Cowork / claude.ai: add "${MCP_URL}" as a custom connector (Settings → Connectors → Add custom connector).
2. List the available tools and confirm these exist: discover, create_source, get_feed, analyze_video, create_brief.
3. Run \`suggest_sources\` for my niche and show me the top 3 suggestions — do NOT track anything yet, just report.
4. Tell me my current credit balance if a tool exposes it, otherwise tell me to check ${SITE_URL}/account.

If the first tool call opens a sign-in + consent flow, walk me through it (that's step 2 of onboarding: OAuth).`;

const CONNECT_PROMPT = `Connect my slashloop account via OAuth so your MCP tools run as me.

1. Trigger any slashloop MCP tool — the server starts an OAuth sign-in + consent flow on first call. Open the URL it gives you.
2. Sign in with the SAME account I use on ${SITE_URL}/login (Google or GitHub via Supabase). This is what links MCP tool calls to my credit balance and workspaces — same Supabase project on both sides.
3. Approve the consent screen, then re-run the tool call to confirm it works.
4. Verify: call \`get_feed\` (reads are free, 0 credits) or list my sources, and report what you see. If you get 401/unauthorized, my token likely expired (Supabase tokens rotate hourly) — re-authenticate once and retry before reporting an error.
5. Tell me which account email is connected so I can confirm it's the right one.

Do not create workspaces or track sources during this step — connection check only.`;

const DEPLOY_PROMPT = `Deploy my own copy of the slashloop marketing + billing site (repo: man0l/slashloop-site, React + Vite + Tailwind + React Router, deployed on Vercel).

1. Fork or clone man0l/slashloop-site.
2. Set these three env vars (Vite only exposes VITE_-prefixed vars to the browser — exact names matter):
   - VITE_SUPABASE_URL = the same Supabase project URL the slashloop MCP server uses (sessions here must validate on the MCP's routes)
   - VITE_SUPABASE_ANON_KEY = that project's anon/publishable key
   - VITE_MCP_URL = the deployed MCP server base URL, no trailing slash (e.g. https://mcp.slashloop.dev — billing, sources, gallery and digest routes live under it)
   Local dev: \`cp .env.example .env.local\`, fill in, \`npm install && npm run dev\`.
3. Deploy to Vercel (production build is \`npm run build\` → dist/). vercel.json already rewrites everything to /index.html so /pricing, /login, /account and /billing/success survive direct loads — keep that rewrite.
4. Verify the deployment:
   - / loads the marketing homepage
   - /login signs in via Google/GitHub OAuth and lands on /onboarding (first run) or /account
   - /account shows plan + credit balance (reads {VITE_MCP_URL}/api/billing/status — if billing routes 404, the Stripe phase hasn't shipped server-side yet; the UI shows "not live yet" and that's expected)
   - /billing/success polls for the Stripe webhook after checkout
5. Report the deployed URL plus any env var that's missing or failing.

Do not commit secrets — env vars go in Vercel project settings / .env.local (gitignored), never in the repo.`;

const STEPS = [
  {
    n: "01",
    id: "install",
    title: "Install the MCP",
    body: "Registers mcp.slashloop.dev in the agent's client and proves the tools load. Nothing tracked, nothing spent.",
    prompt: INSTALL_PROMPT,
  },
  {
    n: "02",
    id: "connect",
    title: "Connect via OAuth",
    body: "First tool call opens sign-in + consent. Same Supabase account as the site, so credits and workspaces carry over.",
    prompt: CONNECT_PROMPT,
  },
  {
    n: "03",
    id: "deploy",
    title: "Deploy the site",
    body: "Forks slashloop-site, sets the three VITE_ vars, ships to Vercel. The agent verifies every route after deploy.",
    prompt: DEPLOY_PROMPT,
  },
];

function PromptCard({ step }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(step.prompt);
    } catch {
      // Clipboard API blocked (permissions, insecure context) — the
      // textarea fallback below still lets the user select + copy manually.
      setCopied(false);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="rounded-xl p-6 flex flex-col"
      style={{ background: T.card, border: `1px solid ${T.line}` }}
      data-testid={`agent-step-${step.id}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div style={{ ...fM, fontSize: 11, letterSpacing: 2, color: T.signal }}>STEP {step.n}</div>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-md px-3 py-1.5 transition-colors"
          style={{ ...fM, fontSize: 12, fontWeight: 600, background: copied ? T.teal : T.ink, color: "#fff" }}
        >
          {copied ? "✓ Copied" : "Copy prompt"}
        </button>
      </div>
      <h2 className="mt-2" style={{ ...fD, fontWeight: 800, fontSize: 22, letterSpacing: -0.5 }}>
        {step.title}
      </h2>
      <p className="mt-1.5 mb-0" style={{ fontSize: 14, lineHeight: 1.6, color: "#3A424B" }}>
        {step.body}
      </p>
      <pre
        className="mt-4 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap"
        style={{ ...fM, fontSize: 12, lineHeight: 1.65, background: T.ink, color: "#E8EAE6" }}
      >
        {step.prompt}
      </pre>
    </div>
  );
}

export default function AgentSetup() {
  return (
    <>
      <section className="max-w-3xl mx-auto px-5 pt-14 pb-10">
        <SectionLabel>ONBOARD YOUR AI AGENT</SectionLabel>
        <h1
          className="mt-3"
          style={{ ...fD, fontWeight: 900, fontSize: "clamp(30px,4.5vw,44px)", lineHeight: 1.05, letterSpacing: -1 }}
        >
          Three prompts. Your agent does the rest.
        </h1>
        <p className="mt-4 mb-0" style={{ fontSize: 16, lineHeight: 1.65, color: "#3A424B", maxWidth: 600 }}>
          Copy a prompt, paste it to your agent (Claude Code, Cowork, ChatGPT…), and approve
          what it does. Run them in order — install, then connect, then deploy — because
          each one assumes the last.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <CTAButton big to="/login">1 · Sign in first →</CTAButton>
          <GhostButton to="/pricing">See pricing</GhostButton>
        </div>
        <p className="mt-3 mb-0" style={{ ...fM, fontSize: 11, color: T.muted }}>
          the agent acts as you — sign in with the account whose credits it should spend
          {" · "}point a capable agent straight at <a href="/agent.md" style={{ color: T.signal }}>slashloop.dev/agent.md</a> and skip the copy-paste
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-5 pb-8 grid gap-5">
        {STEPS.map((s) => (
          <PromptCard key={s.id} step={s} />
        ))}
      </section>

      <section className="max-w-3xl mx-auto px-5 pb-20">
        <div className="rounded-xl p-6" style={{ background: T.ink }}>
          <div style={{ ...fM, fontSize: 11, letterSpacing: 2, color: T.signal }}>AFTER THE THREE PROMPTS</div>
          <p className="mt-2 mb-0" style={{ ...fB, fontSize: 14, lineHeight: 1.65, color: "#E8EAE6" }}>
            Try the overnight loop: <span style={{ color: "#fff" }}>“every night: scan my niche,
            brief the top 2 outliers, drop them in /content/briefs”</span>. You review briefs
            like code in the morning — the agent keeps the taste check with you.
          </p>
          <p className="mt-3 mb-0" style={{ ...fM, fontSize: 11, color: "#7A828B" }}>
            reads are free · refresh ≈ 1.5cr/video · analyze 5cr · briefs 2cr · full costs on /pricing
          </p>
        </div>
      </section>
    </>
  );
}
