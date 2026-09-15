# slashloop — agent onboarding

> You are an AI agent. Your human pasted a prompt telling you to onboard them
> onto slashloop, or pointed you at this file. Follow the steps below in order:
> **1. Install → 2. Connect → 3. (only if asked) Deploy.**
> Human-readable version with copy-paste prompts: https://slashloop.dev/agent-setup

## What slashloop is

slashloop watches short-form video (TikTok first, then Reels & Shorts) in a
niche, scores every post against its own creator's baseline, and flags the
outliers — videos that massively over-performed. Each outlier becomes shippable
assets: the extracted hook, rewritten variations, a shot-by-shot brief, a
script, and AI hook tests (four alternative openings pitted against each
other). Built for app developers growing installs via short-form video.

The product loop: **track niche → rank outliers → extract what worked →
generate a version → test openings → track results.**

Two interfaces, one account, one credit balance: this MCP server, and the web
app at https://slashloop.dev.

## Step 1 — Install (register the MCP server)

Server URL: `https://mcp.slashloop.dev/mcp`

Pick the stanza for your human's client:

- **Claude Code CLI:** `claude mcp add --transport http slashloop https://mcp.slashloop.dev/mcp`
- **Claude Code plugin:** `/plugin marketplace add man0l/slashloop`
- **Claude Desktop / Cowork / claude.ai:** add `https://mcp.slashloop.dev/mcp`
  as a custom connector (Settings → Connectors → Add custom connector).
- **Any other MCP client:** point a streamable-HTTP transport at the URL above.

Then list tools and confirm these exist: `discover`, `suggest_sources`,
`create_source`, `refresh_source`, `get_feed`, `analyze_video`,
`extract_hook`, `create_brief`, `start_hook_test`.

Then run `suggest_sources` for the human's niche and report the top 3. **Do
NOT track, create, or spend anything yet** — report only. If the first call
opens a sign-in + consent flow, that is Step 2: walk the human through it.

## Step 2 — Connect (OAuth, run tools as the human)

1. Any tool call starts the OAuth sign-in + consent flow on first use. Give the
   human the URL and have them sign in with the SAME account they use at
   https://slashloop.dev/login (Google or GitHub via Supabase). Site and MCP
   share one Supabase project — that shared identity is what links tool calls
   to their credits and workspaces.
2. After consent, re-run the tool call to confirm it works.
3. Verify with a free read: `get_feed` costs 0 credits. Report what you see
   (sources, feed items) and state which account email is connected so the
   human can confirm it's the right one.
4. On 401/unauthorized mid-session: Supabase access tokens rotate hourly. Ask
   the human to re-authenticate once and retry before reporting an error.

Do not create workspaces or track sources in this step — connection check only.

## Tool guide (by job, after connecting)

- **Find sources:** `discover`, `suggest_sources` — keyword-driven suggestions
  the human can approve for tracking.
- **Track a niche:** `create_source` (hashtags, creators, keywords),
  `refresh_source`, `list_due_sources`, `delete_source`.
- **Read results (free):** `get_feed`, `get_outlier_summary`, `get_benchmark`,
  `get_video`, `get_video_transcript`, `search_library`.
- **Remake material:** `analyze_video` (why it worked), `extract_hook`,
  `generate_hook_variations`, `create_brief`, `generate_script`.
- **AI hook tests:** `start_hook_test` → `pick_hook_versions` →
  `reroll_hooks` → `export_shotlist` → `close_hook_test` (name the `winner`).
- **Keep it running:** boards (`save_to_board`), idea queue (`create_idea`,
  `list_ideas`), `get_weekly_retro`, `get_digest`.

The money rule: **reading is always free; every spending tool states its cost
before it charges, and failed calls refund automatically.** Never spend without
telling the human the cost first.

## Costs (1 credit = $0.01)

- Browse feed, sources, boards, ideas, settings: free
- Refresh a source / discover search: ~1.5 credits per video fetched
- Analyze a video: 5 credits
- Extract hook / variations / brief / script: 2 credits each
- Start or re-roll a hook test: 2 credits

Plans: Free ($0, 300 credits/mo, 2 sources, manual refresh) · Creator
($29/mo, 3,000 credits/mo, 10 sources, weekly refresh) · Pro ($79/mo, 10,000
credits/mo, 30 sources, daily refresh, alerts, API access). PAYG top-ups from
$10. Checkout: https://slashloop.dev/pricing · balance/portal:
https://slashloop.dev/account.

## The overnight loop (the thing to offer once set up)

> "Every night: scan my niche, brief the top 2 outliers, drop them in
> /content/briefs."

The agent runs the loop; the human reviews briefs like code in the morning.
Scheduled refresh is a paid-plan perk — on Free, offer manual/cron-driven runs
the human approves instead.

## Step 3 — Deploy (only if the human asks for their own copy of the site)

Repo: `man0l/slashloop-site` — React + Vite + Tailwind + React Router,
deployed on Vercel. Production build: `npm run build` → `dist/`.

1. Fork or clone the repo.
2. Set exactly these env vars (Vite only exposes `VITE_`-prefixed vars —
   names must match):
   - `VITE_SUPABASE_URL` — same Supabase project URL the MCP server uses
   - `VITE_SUPABASE_ANON_KEY` — that project's anon/publishable key
   - `VITE_MCP_URL` — MCP base URL, no trailing slash
     (e.g. `https://mcp.slashloop.dev`)
   Local dev: `cp .env.example .env.local`, fill in, `npm install && npm run dev`.
3. Deploy to Vercel. Keep the `vercel.json` SPA rewrite (`/(.*)` →
   `/index.html`) — `/pricing`, `/login`, `/account`, `/billing/success` break
   on direct load without it.
4. Verify: `/` loads · `/login` OAuth lands on `/onboarding` (first run) or
   `/account` · `/account` shows plan + credits (a 404 on
   `/api/billing/status` means Stripe hasn't shipped server-side — expected,
   the UI says "not live yet") · `/billing/success` polls for the webhook.
5. Report the deployed URL. Never commit secrets — env goes in Vercel project
   settings / gitignored `.env.local`, never in the repo.

## Key web surfaces (for pointing the human at)

- Login: https://slashloop.dev/login
- Onboarding funnel: https://slashloop.dev/onboarding
- Discover / Sources / Gallery: https://slashloop.dev/discover ·
  https://slashloop.dev/sources · https://slashloop.dev/gallery
- Hook tests / Studio: https://slashloop.dev/tests ·
  https://slashloop.dev/studio
- Pricing / Account: https://slashloop.dev/pricing ·
  https://slashloop.dev/account
