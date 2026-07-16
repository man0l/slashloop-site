import React, { useEffect, useMemo, useRef, useState } from "react";

/* ─────────────────────────────────────────────────────────
   SLASHLOOP — landing page
   Tokens (shared with product UI):
   ink #14181D · paper #F1F2EF · signal #FF4D00 · teal #0F7B6C
   Type: Archivo (display) / Inter (body) / IBM Plex Mono (command)
   Signature: live terminal in the hero running /loop
   ───────────────────────────────────────────────────────── */

const T = {
  ink: "#14181D",
  paper: "#F1F2EF",
  card: "#FFFFFF",
  signal: "#FF4D00",
  teal: "#0F7B6C",
  muted: "#6E7681",
  line: "#E2E4DF",
};

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800;900&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
@keyframes blink { 0%,49% {opacity:1} 50%,100% {opacity:0} }
@keyframes rowIn { from {opacity:0; transform:translateY(6px)} to {opacity:1; transform:none} }
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
`;

const fD = { fontFamily: "'Archivo', sans-serif" };
const fB = { fontFamily: "'Inter', sans-serif" };
const fM = { fontFamily: "'IBM Plex Mono', monospace" };

const fmt = (n) =>
  n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(0) + "K" : n;

/* ── Hero terminal demo ──────────────────────────────── */

const CMD = "/track @buildinpublic #indiehackers tiktok,shorts";
const RESULTS = [
  { score: 27.4, hot: true, creator: "@solodev_sam", followers: 4200, views: 310000, hook: '"I built this in a weekend and it made $1,400 in week one"' },
  { score: 11.2, hot: true, creator: "@ship.daily", followers: 9800, views: 190000, hook: '"POV: your side project just got its first paying user"' },
  { score: 6.8, hot: false, creator: "@codewithnina", followers: 15100, views: 96000, hook: '"Nobody tells you this about launching on Product Hunt"' },
  { score: 1.3, hot: false, creator: "@techguru", followers: 2100000, views: 1200000, hook: "big account, normal day — filtered out of your feed", dim: true },
];

function HeroTerminal() {
  const [typed, setTyped] = useState(0);
  const [rows, setRows] = useState(0);
  useEffect(() => {
    if (typed < CMD.length) {
      const t = setTimeout(() => setTyped(typed + 1), 34);
      return () => clearTimeout(t);
    }
    if (rows < RESULTS.length) {
      const t = setTimeout(() => setRows(rows + 1), rows === 0 ? 550 : 380);
      return () => clearTimeout(t);
    }
  }, [typed, rows]);

  return (
    <div className="rounded-xl overflow-hidden shadow-2xl" style={{ background: T.ink, border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-center gap-1.5 px-4 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
          <span key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
        ))}
        <span className="ml-3" style={{ ...fM, fontSize: 11, color: "#7A828B" }}>slashloop — your niche, ranked by outlier score</span>
      </div>
      <div className="p-4 sm:p-5">
        <div style={{ ...fM, fontSize: 13, color: "#E8EAE6" }}>
          <span style={{ color: T.signal }}>❯</span> {CMD.slice(0, typed)}
          <span style={{ animation: "blink 1s step-end infinite", color: T.signal }}>▊</span>
        </div>
        {typed >= CMD.length && (
          <div className="mt-1" style={{ ...fM, fontSize: 11, color: "#7A828B" }}>
            scanning 2 sources · 3 platforms · ranking vs each creator's baseline…
          </div>
        )}
        <div className="mt-3 grid gap-2">
          {RESULTS.slice(0, rows).map((r, i) => (
            <div key={i} className="rounded-md px-3 py-2.5 flex items-center gap-3"
              style={{
                animation: "rowIn .35s ease both",
                background: r.dim ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
                opacity: r.dim ? 0.45 : 1,
              }}>
              <span className="rounded px-1.5 py-0.5 shrink-0"
                style={{ ...fM, fontSize: 12, fontWeight: 600, background: r.hot ? T.signal : "transparent", color: r.hot ? "#fff" : "#9AA3AC", border: r.hot ? "none" : "1px solid rgba(255,255,255,0.2)" }}>
                {r.score}x
              </span>
              <div className="min-w-0">
                <div className="truncate" style={{ ...fB, fontSize: 13, color: "#E8EAE6" }}>{r.hook}</div>
                <div style={{ ...fM, fontSize: 10, color: "#7A828B" }}>{r.creator} · {fmt(r.followers)} followers · {fmt(r.views)} views</div>
              </div>
            </div>
          ))}
        </div>
        {rows >= RESULTS.length && (
          <div className="mt-3" style={{ ...fM, fontSize: 11, color: T.teal, animation: "rowIn .35s ease both" }}>
            ✓ 3 proven hooks found. 0 hours of scrolling. <span style={{ color: "#7A828B" }}>run /brief to turn #1 into a 20-min film plan</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Small building blocks ───────────────────────────── */

function Cmd({ children }) {
  return (
    <span className="rounded px-1.5 py-0.5" style={{ ...fM, fontSize: "0.9em", background: "rgba(20,24,29,0.07)", color: T.ink }}>
      <span style={{ color: T.signal }}>/</span>{children}
    </span>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ ...fM, fontSize: 11, letterSpacing: 3, color: T.signal }}>{children}</div>
  );
}

function CTAButton({ big, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`rounded-md font-semibold transition-transform hover:-translate-y-0.5 ${big ? "px-6 py-3.5" : "px-4 py-2"}`}
      style={{ ...fB, fontSize: big ? 16 : 13, background: T.signal, color: "#fff", boxShadow: "0 6px 20px rgba(255,77,0,0.35)" }}>
      {children}
    </button>
  );
}

/* ── Waitlist form (in-memory) ───────────────────────── */

function Waitlist({ id }) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  if (done)
    return (
      <div className="rounded-md px-4 py-3 inline-flex items-center gap-2" style={{ background: "#E4F0ED", border: `1px solid ${T.teal}` }}>
        <span style={{ ...fM, fontSize: 13, color: T.teal }}>✓ you're in the loop.</span>
        <span style={{ ...fB, fontSize: 13, color: T.ink }}>Watch your inbox — early access ships in batches.</span>
      </div>
    );
  return (
    <div id={id} className="flex flex-col sm:flex-row gap-2 max-w-md">
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@yourapp.dev"
        className="flex-1 rounded-md px-4 py-3 outline-none"
        style={{ ...fM, fontSize: 14, background: T.card, border: `1.5px solid ${T.ink}`, color: T.ink }}
      />
      <CTAButton big onClick={() => email.includes("@") && setDone(true)}>
        Get early access →
      </CTAButton>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────── */

export default function App() {
  const scrollToJoin = () =>
    document.getElementById("join")?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <div style={{ background: T.paper, ...fB, color: T.ink }} className="min-h-screen">
      <style>{FONTS}</style>

      {/* Nav */}
      <header className="max-w-5xl mx-auto px-5 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded flex items-center justify-center" style={{ background: T.signal }}>
            <span style={{ ...fM, fontWeight: 600, fontSize: 15, color: "#fff" }}>/</span>
          </span>
          <span style={{ ...fD, fontWeight: 900, fontSize: 18, letterSpacing: -0.5 }}>slashloop</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden sm:inline" style={{ ...fM, fontSize: 12, color: T.muted }}>built in public, obviously</span>
          <CTAButton onClick={scrollToJoin}>Join waitlist</CTAButton>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-5 pt-10 pb-16 grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <SectionLabel>/LOOP FOR MARKETING</SectionLabel>
          <h1 className="mt-3" style={{ ...fD, fontWeight: 900, fontSize: "clamp(34px, 5vw, 52px)", lineHeight: 1.05, letterSpacing: -1.5 }}>
            You shipped the app.
            <br />
            Now ship the <span style={{ color: T.signal }}>content</span> that sells it.
          </h1>
          <p className="mt-5" style={{ fontSize: 17, lineHeight: 1.6, color: "#3A424B", maxWidth: 480 }}>
            slashloop watches TikTok, Reels & Shorts in your niche and flags the videos that
            over-performed the creator's own baseline — then hands you the hook, the format,
            and a brief you can film yourself or generate with AI. Proven concepts, not vibes.
          </p>
          <div className="mt-7">
            <Waitlist id="join" />
            <p className="mt-2.5" style={{ ...fM, fontSize: 11, color: T.muted }}>
              free while in beta · no card · web app + CLI + MCP for Claude Code
            </p>
          </div>
        </div>
        <HeroTerminal />
      </section>

      {/* Pain strip */}
      <section style={{ background: T.ink }}>
        <div className="max-w-5xl mx-auto px-5 py-14">
          <SectionLabel>THE INDIE HACKER TRAP</SectionLabel>
          <h2 className="mt-3" style={{ ...fD, fontWeight: 800, fontSize: "clamp(24px,3.5vw,34px)", color: "#fff", letterSpacing: -0.8, maxWidth: 640 }}>
            "Build in public," they said. So you opened your camera — or your AI video tool — and realized you had no idea what would actually work.
          </h2>
          <div className="mt-8 grid sm:grid-cols-3 gap-4">
            {[
              ["The scroll trap", "You 'research' TikTok for 2 hours, save 14 videos, and remember none of them on filming day."],
              ["The views mirage", "You copy what mega-creators post. It works for them because 2M people already follow them — not because the concept is good."],
              ["The blank page", "Your changelog is full. Your content calendar is a graveyard of 'post something today?' reminders."],
            ].map(([t, d]) => (
              <div key={t} className="rounded-lg p-5" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ ...fM, fontSize: 12, color: T.signal }}>{t}</div>
                <p className="mt-2" style={{ fontSize: 14, lineHeight: 1.55, color: "#B8BEC5" }}>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The insight */}
      <section className="max-w-5xl mx-auto px-5 py-16">
        <SectionLabel>THE OUTLIER SCORE</SectionLabel>
        <div className="mt-3 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <h2 style={{ ...fD, fontWeight: 800, fontSize: "clamp(24px,3.5vw,34px)", letterSpacing: -0.8 }}>
              Views lie. <span style={{ color: T.signal }}>Multipliers don't.</span>
            </h2>
            <p className="mt-4" style={{ fontSize: 16, lineHeight: 1.65, color: "#3A424B" }}>
              A 1.2M-view video from a 2M-follower account is a Tuesday. A 310K-view video from a
              4K-follower account is a <b>proven concept</b> — the algorithm pushed it on merit,
              not audience. slashloop scores every video against that creator's own baseline,
              so breakout ideas from small accounts surface instead of drowning under big-account noise.
            </p>
            <p className="mt-4" style={{ fontSize: 16, lineHeight: 1.65, color: "#3A424B" }}>
              Those are the concepts <i>you</i> can replicate with 0 followers — because they
              didn't need followers to win.
            </p>
          </div>
          <div className="rounded-xl p-6" style={{ background: T.card, border: `1px solid ${T.line}` }}>
            {[
              { label: "@techguru · 2.1M followers", views: 1200000, base: 900000, score: "1.3x", hot: false },
              { label: "@solodev_sam · 4.2K followers", views: 310000, base: 11300, score: "27.4x", hot: true },
            ].map((r) => (
              <div key={r.label} className="py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
                <div className="flex items-center justify-between">
                  <span style={{ ...fB, fontSize: 13, fontWeight: 600 }}>{r.label}</span>
                  <span className="rounded px-2 py-0.5" style={{ ...fM, fontSize: 14, fontWeight: 600, background: r.hot ? T.signal : "transparent", color: r.hot ? "#fff" : T.muted, border: r.hot ? "none" : `1px solid ${T.line}` }}>
                    {r.score}
                  </span>
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <span style={{ ...fM, fontSize: 9, color: T.muted, width: 60 }}>baseline</span>
                  <div className="h-1.5 rounded-full" style={{ width: `${(r.base / 1200000) * 100 * 0.7 + 2}%`, background: "#C9CCC5" }} />
                  <span style={{ ...fM, fontSize: 9, color: T.muted }}>{fmt(r.base)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span style={{ ...fM, fontSize: 9, color: r.hot ? T.signal : T.ink, width: 60 }}>this video</span>
                  <div className="h-1.5 rounded-full" style={{ width: `${(r.views / 1200000) * 100 * 0.7 + 2}%`, background: r.hot ? T.signal : T.ink }} />
                  <span style={{ ...fM, fontSize: 9 }}>{fmt(r.views)}</span>
                </div>
              </div>
            ))}
            <p className="mt-4" style={{ ...fM, fontSize: 11, color: T.muted }}>
              same feed, sorted by outlier score → the 4.2K account wins
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-5 pb-16">
        <SectionLabel>THREE COMMANDS TO A CONTENT PIPELINE</SectionLabel>
        <div className="mt-5 grid md:grid-cols-3 gap-4">
          {[
            {
              cmd: "track",
              title: "Point it at your niche",
              body: <>Competitor apps, hashtags, creators — across TikTok, Reels & Shorts. <Cmd>track</Cmd> once, it refreshes on schedule while you code.</>,
            },
            {
              cmd: "loop",
              title: "Read the ranked feed",
              body: <>Every new video lands in one feed sorted by outlier score. AI breaks down the hook, angle, format and why it popped — from the transcript, not guesswork.</>,
            },
            {
              cmd: "brief",
              title: "Create it in 20 minutes",
              body: <>Turn any outlier into a beat-by-beat brief with the hook adapted to <i>your</i> app. Film it on your phone — or feed the brief straight into Veo, Sora or HeyGen and let AI shoot it. Post, ship, repeat.</>,
            },
          ].map((s, i) => (
            <div key={s.cmd} className="rounded-xl p-6" style={{ background: T.card, border: `1px solid ${T.line}` }}>
              <div style={{ ...fM, fontSize: 16, fontWeight: 600 }}>
                <span style={{ color: T.signal }}>/</span>{s.cmd}
              </div>
              <div className="mt-2" style={{ ...fD, fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>{s.title}</div>
              <p className="mt-2" style={{ fontSize: 14, lineHeight: 1.6, color: "#3A424B" }}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Agents & MCP */}
      <section style={{ background: T.ink }}>
        <div className="max-w-5xl mx-auto px-5 py-16 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <SectionLabel>EVERY COMMAND IS ALSO A TOOL</SectionLabel>
            <h2 className="mt-3" style={{ ...fD, fontWeight: 800, fontSize: "clamp(24px,3.5vw,34px)", color: "#fff", letterSpacing: -0.8 }}>
              Your agents can run the <span style={{ color: T.signal }}>/loop</span> while you sleep
            </h2>
            <p className="mt-4" style={{ fontSize: 15, lineHeight: 1.65, color: "#B8BEC5" }}>
              slashloop isn't just a web app — it ships as an <b style={{ color: "#fff" }}>MCP server and a CLI</b>.
              Plug it into Claude Code and every command becomes a tool your agent can call:
              scan nightly, rank the outliers, draft the briefs, and drop them into your repo or Notion before you're awake.
            </p>
            <p className="mt-3" style={{ fontSize: 15, lineHeight: 1.65, color: "#B8BEC5" }}>
              You review content the way you review code: open the morning briefs, approve, create. The research loop
              runs itself — you just keep the taste.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {["web app", "CLI", "MCP · Claude Code", "cron-able", "agent-ready"].map((b) => (
                <span key={b} className="rounded-full px-3 py-1" style={{ ...fM, fontSize: 11, color: "#B8BEC5", border: "1px solid rgba(255,255,255,0.15)" }}>{b}</span>
              ))}
            </div>
          </div>
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="px-4 py-2.5" style={{ background: "rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.08)", ...fM, fontSize: 11, color: "#7A828B" }}>
              claude code — your repo
            </div>
            <div className="p-5" style={{ background: "#0E1216", ...fM, fontSize: 12.5, lineHeight: 1.9 }}>
              <div style={{ color: "#E8EAE6" }}><span style={{ color: T.signal }}>$</span> claude mcp add slashloop</div>
              <div style={{ color: "#7A828B" }}>✓ 6 tools registered: track, scan, feed, analyze, brief, vault</div>
              <div className="mt-2" style={{ color: "#E8EAE6" }}><span style={{ color: T.signal }}>❯</span> "every night: scan my niche, brief the top 2 outliers"</div>
              <div style={{ color: "#7A828B" }}>agent scheduled · nightly at 03:00</div>
              <div className="mt-2" style={{ color: T.teal }}>morning: 2 briefs waiting in /content/briefs</div>
              <div style={{ color: "#7A828B" }}>→ 27.4x founder-story format · → 11.2x first-paying-user POV</div>
            </div>
          </div>
        </div>
      </section>

      {/* Built for BIP */}
      <section style={{ background: T.card, borderTop: `1px solid ${T.line}`, borderBottom: `1px solid ${T.line}` }}>
        <div className="max-w-5xl mx-auto px-5 py-16">
          <SectionLabel>MADE FOR BUILD-IN-PUBLIC</SectionLabel>
          <h2 className="mt-3" style={{ ...fD, fontWeight: 800, fontSize: "clamp(24px,3.5vw,34px)", letterSpacing: -0.8 }}>
            Your unfair advantage: you can ship content like you ship code
          </h2>
          <div className="mt-8 grid sm:grid-cols-2 gap-x-10 gap-y-6">
            {[
              ["Launch-week hooks", "Pull the exact opening lines from outlier launch videos in your category and A/B them across your launch content."],
              ["Competitor radar", "Every viral video about a competing app lands in your feed pre-analyzed — steal the format before their next sprint."],
              ["Hook Vault", "A growing library of proven, spoken-on-camera hooks. Generate on-brand variations for your app in one command."],
              ["MRR-friendly", "Hard monthly cost caps on scraping + AI. See the estimated cost before every pull. No surprise bills eating your ramen budget."],
            ].map(([t, d]) => (
              <div key={t} className="flex gap-3">
                <span className="mt-1 shrink-0" style={{ ...fM, fontSize: 14, color: T.signal }}>/</span>
                <div>
                  <div style={{ ...fB, fontSize: 15, fontWeight: 600 }}>{t}</div>
                  <p className="mt-1" style={{ fontSize: 14, lineHeight: 1.6, color: "#3A424B" }}>{d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="max-w-5xl mx-auto px-5 py-16">
        <SectionLabel>FROM THE TIMELINE</SectionLabel>
        <div className="mt-5 grid md:grid-cols-3 gap-4">
          {[
            ["day 3 with slashloop: found a 19x outlier in the notes-app niche, reshot it for my app in one take, best performing post i've ever made. not even close.", "@marta_ships · building a journaling app"],
            ["it's basically 'git log' for your niche. my claude code agent runs /scan via MCP every night — i wake up to ranked outliers instead of doomscrolling FYP for 'research'.", "@devpavel · 2 apps, $3.1K MRR"],
            ["the caption-isn't-the-hook rule alone fixed my videos. turns out my hooks were never actually spoken in the first second. now they are.", "@nocode_nia · building in public since '24"],
          ].map(([q, a]) => (
            <div key={a} className="rounded-xl p-5 flex flex-col" style={{ background: T.ink }}>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: "#E8EAE6" }}>{q}</p>
              <div className="mt-4 pt-3" style={{ ...fM, fontSize: 11, color: "#7A828B", borderTop: "1px solid rgba(255,255,255,0.1)" }}>{a}</div>
            </div>
          ))}
        </div>
        <p className="mt-3" style={{ ...fM, fontSize: 10, color: T.muted }}>* beta-tester feedback, handles anonymized</p>
      </section>

      {/* Final CTA */}
      <section style={{ background: T.ink }}>
        <div className="max-w-5xl mx-auto px-5 py-20 text-center">
          <div style={{ ...fM, fontSize: 13, color: "#7A828B" }}>
            <span style={{ color: T.signal }}>❯</span> your next post is already viral. someone else made it.
          </div>
          <h2 className="mt-3" style={{ ...fD, fontWeight: 900, fontSize: "clamp(28px,4.5vw,44px)", color: "#fff", letterSpacing: -1 }}>
            Get in the <span style={{ color: T.signal }}>/loop</span>
          </h2>
          <p className="mt-3 mx-auto" style={{ fontSize: 16, color: "#B8BEC5", maxWidth: 460, lineHeight: 1.6 }}>
            Free during beta. Founding loopers keep beta pricing when it ends — and yes,
            we're building it in public too.
          </p>
          <div className="mt-7 flex justify-center">
            <Waitlist id="join-bottom" />
          </div>
        </div>
        <footer className="max-w-5xl mx-auto px-5 py-6 flex flex-wrap items-center justify-between gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded flex items-center justify-center" style={{ background: T.signal }}>
              <span style={{ ...fM, fontSize: 12, fontWeight: 600, color: "#fff" }}>/</span>
            </span>
            <span style={{ ...fM, fontSize: 12, color: "#7A828B" }}>slashloop.app — /loop for marketing</span>
          </div>
          <span style={{ ...fM, fontSize: 11, color: "#5D656E" }}>© 2026 · made with Claude Code, naturally</span>
        </footer>
      </section>
    </div>
  );
}
