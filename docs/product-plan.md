# slashloop — Research Findings & Draft Product Plan

_Drafted 2026-08-21 · revised 2026-08-21 — scraping stays **in-house** (own proxies +
workers); ScrapeCreators demoted to pattern donor · status: DRAFT · owner: @man0l_

Audience (locked): **app builders learning short-form video** — not pro creators.
They ship apps, want TikTok views → installs → earnings, and are beginners at content
but comfortable with CLI/agents. The product loop: **track niche → rank outliers →
brief → AI-render the video in a preset format → post → track results.**

---

## 1. Landscape findings

### 1.1 Outlier / research tools

| Tool | Coverage | Core | Gap vs slashloop |
|---|---|---|---|
| **Shortimize** | TT/IG/YT/FB/Snap, 10K+ accts, ~1h refresh, Slack/Discord alerts | Enterprise tracking; has an "App Founder" tier (validates niche) | Data only; no scoring-vs-baseline story, no creation |
| **1of10** | YouTube only | Outlier finder, AI title/thumbnail gen, niche explorer, Chrome ext | Wrong platform; no app-demo anything |
| **ViewStats** | YouTube only (MrBeast team) | Outliers, thumbnail search, alerts, collections, Discord | Same |
| **ViralFindr** | Instagram | Cheap search/downloads/favorites | Shallow |

Takeaway: nobody does baseline-adjusted outliers for short-form + creation. The
"App Founder" tier at Shortimize and Icon's pivot to human UGC both validate demand
from exactly our audience.

### 1.2 AI video generation

| Tool | What it does | Weak spot for our audience |
|---|---|---|
| **Arcads** | 1,000+ AI actors, avatars "show your app", emotion control, Video + Lip Sync APIs, ad presets | Performance-marketer DNA; no research grounding; no structured app-demo pipeline |
| **Creatify** | URL→video, batch 50 variations, industry templates, ad-account A/B | "Proven" = platform-wide templates, not *your niche*; paid-ads oriented |
| **Revid AI** | ⚠️ closest comp: trend detection → script → faceless/avatar render → auto-publish; API/MCP/CLI; $39/mo | Shallow trends (no baseline scoring); no app-demo format |
| **Icon** | Pivoted to human-filmed UGC, $1K/mo, 18 curated formats | Validates "format library as product core" — at agency pricing |
| **Crayo** | Link/upload → clips, split-screen, faceless brainrot | Editor toolbox, zero research |

Honest notes:
- **MCP/CLI is no longer a differentiator** — Revid ships it, ScrapeCreators ships it.
- "Trend → generate" exists (Revid). Our wedge is **baseline-adjusted outliers from
  your niche** + **app-on-a-phone as a first-class format**.

### 1.3 ScrapeCreators — pattern donor only

Raw social-data scraping API (36+ endpoints, 20+ platforms, transcripts, PAYG
credits, llms.txt/OpenAPI/Claude Code skill). **Not our backend.** Decision: scraping
stays in-house on our own proxies + workers — we've already invested there, and we
won't put the core loop behind a one-man upstream. We copy their playbook, not their
plumbing → steals in §2.

---

## 2. Worth stealing (pricing & distribution patterns)

### 2.1 Cache hits are free — "charge on miss, not on view"

Public data is shareable: one upstream fetch can serve many users. Two workspaces
tracking `#buildinpublic` should cost us one scrape, not two.

- Per-source content hash + TTL; refresh fetches only the delta (new video IDs +
  changed stats).
- Cross-workspace shared cache keyed by `(platform, source, window)`.
- **Deduct credits only when a scrape actually fires.** Market it as "smart refresh —
  you only pay for new data." Margin improves automatically as sources get popular;
  users feel generosity we get for free.
- Forced refresh on a fresh miss still charges (upstream was hit).

### 2.2 Booster packs (PAYG, no subscription)

Subscriptions punish irregular usage and add friction at the exact moment an agent
hits a wall ("out of credits" at 3am).

- Keep Free / Creator / Pro as-is.
- Add **one-time credit packs** (~$9 / $29 / $79), valid 12 months, no sub required,
  limits = current plan's limits, **manual refresh only** (scheduled refresh stays a
  subscriber perk).
- Slightly worse per-credit price than annual sub → no cannibalization.
- This is agent-commerce: Claude Code asks the user to approve a $10 pack without
  committing to $29/mo.

### 2.3 Render metering (required before generation ships)

- Renders cost ~$0.05–0.75/sec of model time → **$1–8 per finished 30s video**. They
  can never ride on analysis credits.
- Price per finished second or per render ("render packs"); show estimated cost
  **before** rendering (matches our "cost shown upfront" promise).
- Small monthly render allowance in Pro later, once real unit costs are known.

### 2.4 Agent distribution kit (stolen from ScrapeCreators)

| Artifact | What it is | What it buys |
|---|---|---|
| `llms.txt` | Machine-readable summary of slashloop (what it does, commands, pricing, doc links) at the public site root | LLMs asked "how do I research TikTok niches?" recommend us correctly |
| OpenAPI spec | Formal spec of the Pro-tier REST API | Any agent auto-learns our endpoints |
| Claude Code skill | Small `SKILL.md` teaching agents when/how to call the MCP tools (`track`, `scan`, `feed`, `brief`, `vault`) | "scan my niche" in plain English just works |

MCP alone isn't discovery. Our audience *is* Claude Code users; when a developer asks
their agent "find proven video ideas for my app," the agent should already know
slashloop exists and how to drive it. Distribution that costs nothing but docs.

---

## 3. Moat — where defensibility actually accrues

The data layer is commoditized; nobody wins by scraping better. Compounding assets,
in order of how fast they accumulate:

1. **Baseline dataset** — per-creator view history over months; can't be bought,
   powers the score nobody else computes.
2. **Results loop** — own-account tracking links outlier → remake → outcome. The only
   dataset anywhere connecting "proven concept" to "did my remake work." Feeds
   marketing (success stories) and product priors (which formats win per niche).
3. **Format engine** — curated beat-sheets validated against outlier data; craft +
   feedback loop, not scrapable.
4. **Workflow lock-in** — vaults, boards, briefs, workspaces accumulate the user's
   content IP.

---

## 4. Roadmap draft

### Phase 0 — Quick wins

**0.1 Onboarding wizard — "first outlier in <2 min"** _(site repo)_
- Step 1: app name/store link + category chips (AI · productivity · devtools ·
  games · health …).
- Step 2: 2–3 suggested sources from **static curated lists per category** (V1 = a
  constants file; swap to the existing discover-search later). User can swap any
  before starting.
- Step 3: track them — this *is* the free tier's 2-source allowance, chosen well —
  then redirect to the Gallery while the feed populates.
- Why: activation = seeing a 27x outlier in *your* niche within one session, and it
  teaches the "source" concept by doing instead of explaining.

**0.2 "Film this today" CTA on every Gallery card** _(site repo)_
- Primary button on each card: `[ Film this today → ]`; analyze/re-analyze/open
  become secondary.
- Tap: brief exists → open it. Else show cost (2 credits) → generate → open: hook
  rewritten for *their* app + beat-by-beat shots, ready to shoot tonight.
- Why: the card should answer the filmmaker's question ("what do I film today"),
  not the researcher's ("what over-performed?"). Collapses outlier → script to one tap.

**0.3 Weekly outlier digest email** _(main repo)_
- Cron + Resend/Postmark over data refreshes already compute. Email: "3 breakouts in
  your niche this week" — score, hook line, thumbnail, deep link to the card (CTA
  waiting there).
- **Free tier included** — it's the retention engine, not a paid feature. Pro Alerts
  stay real-time; digest = weekly "the loop is still running." Different jobs.

**0.4 Agent distribution kit** _(llms.txt → site repo; spec + skill → main repo)_
- Build §2.4: llms.txt at the site root, OpenAPI spec, Claude Code skill.

### Phase 1 — Own-account tracking + smart refresh (moat starts)
- [ ] Track own account as a source → personal baseline, "your video vs the outlier
      it came from."
- [ ] Delta-based refresh + shared cache; charge on miss only (§2.1).
- [ ] Booster PAYG packs (§2.2).

### Phase 2 — Format engine v1: `hook → reaction → app demo`
- [ ] Format = structured beat-sheet with slots (spoken hook adapted from outlier;
      reaction segment; demo segments mapped to user's app moments). Versioned,
      individually priced.
- [ ] App asset capture flow: guided screen-recording checklist (portrait, which
      screens, clean status bar) + app-store screenshot pull. Assets reusable across
      renders. ← the unglamorous moat; everyone else does this badly.
- [ ] Brief compiles to machine-renderable spec (beats, timestamps, VO lines,
      asset-slot mapping).

### Phase 3 — Render pipeline
- [ ] Reaction/talking-head via third-party generation APIs (HeyGen / Arcads Lip
      Sync / Veo-Kling via fal or Replicate). No homegrown models.
- [ ] Render N=2–3 variants differing only in hook (cheap A/B where it matters).
- [ ] Render packs / per-second metering with pre-render cost estimate (§2.3).
- [ ] Bake in TikTok AI-content disclosure labeling.

### Phase 4 — Results loop + format expansion
- [ ] Post-tracking: log remake performance → "remake of a 27x outlier did 6x your
      baseline · hook B won." Format-level success rates per niche.
- [ ] Expand formats by evidence: talking-head-holding-phone → comment-response →
      POV skit → feature listicle. Each added because outlier data shows it winning
      in app/dev TikTok (doubles as marketing).
- [ ] Monetization flags: 60s+ (Creativity Program eligible), faceless-friendly,
      low-production tags.
- [ ] Niche packs: one-click curated source sets per category (generalizes the
      wizard's Phase 0 lists).
- [ ] Chrome extension (outlier score while scrolling TikTok) — validated by 1of10
      and ViewStats, do last.

## 5. Explicit non-goals
- **Outsourcing scraping to third-party APIs** — infra stays in-house (own proxies +
  workers). No upstream dependency for the core loop.
- Multi-seat/teams, 10K-account tracking, white-label, creator payouts (Shortimize's game)
- Homegrown video models (rent via APIs)
- Paid-ads machinery: ad-account integrations, CTV, Meta specs (Creatify's game)
- Human done-for-you UGC (Icon's lane; maybe a high-tier upsell much later)
- Becoming a data API ourselves

## 6. Open questions
- Render unit costs with real prompts before setting pack prices?
- Does scheduled-refresh-as-subscriber-perk hold up once agents are the main users?
- Who curates the per-category starter source lists (Phase 0.1), and what's the
  refresh cadence before they go stale?

## Positioning line
> **Your niche's proven outliers, rendered into app videos while you sleep.**
> Research depth upstream (baselines nobody else computes) · preset formats midstream
> (hook → reaction → app demo) · rented models downstream — on infra we own.
