import { useEffect, useRef, useState } from "react";
import { T, fD, fB, fM, fmt } from "../lib/theme.js";
import { CTAButton, GhostButton } from "../components/ui.jsx";
import { track } from "../lib/analytics.js";

const cta = (placement) => () => track("cta_click", { placement });

const SHOWCASE_URL = `${((import.meta.env.VITE_MCP_URL ?? "").trim() || "https://mcp.slashloop.dev").replace(/\/$/, "")}/api/showcase`;
// Live outlier shelf, pulled from the showcase endpoint (top outliers across
// tracked workspaces). Only R2-persisted thumbs are ever served, so cards
// can't rot when TikTok's signed URLs expire; anything expired is excluded
// server-side and never reaches this carousel.
function useShowcase() {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let live = true;
    fetch(SHOWCASE_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live && Array.isArray(d?.items)) setItems(d.items);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return items;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const Chevron = ({ dir }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir < 0 ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
  </svg>
);

function ShowcaseCard({ v }) {
  return (
    <a
      href={v.url}
      target="_blank"
      rel="noreferrer"
      className="rounded-xl overflow-hidden transition-transform hover:-translate-y-1 focus-visible:-translate-y-1 focus-visible:[outline-offset:-2px] shrink-0"
      style={{ background: T.ink, textDecoration: "none", width: 220, marginRight: 12, scrollSnapAlign: "start" }}
    >
      <div style={{ aspectRatio: "3/4", overflow: "hidden", background: "#0E1216" }}>
        <img src={v.thumb} alt={`${v.creator}, ${v.caption}`} loading="lazy" className="w-full h-full" style={{ objectFit: "cover", display: "block" }} />
      </div>
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate" style={{ ...fB, fontSize: 12, color: "#E8EAE6" }}>{v.creator}</span>
          <span className="rounded px-1.5 py-0.5 shrink-0" style={{ ...fM, fontSize: 12, fontWeight: 700, background: T.signal, color: "#fff" }}>
            {Math.round(v.score)}x
          </span>
        </div>
        <div className="truncate" style={{ ...fM, fontSize: 11, color: "#7A828B" }}>{v.caption}</div>
        <div className="flex items-center justify-between gap-2" style={{ ...fM, fontSize: 11, color: "#8A929B" }}>
          <span>{fmt(v.views)} views</span>
          {v.niche ? <span className="truncate">#{String(v.niche).replace(/^[@#]/, "")}</span> : null}
        </div>
      </div>
    </a>
  );
}

function LiveCounter({ items }) {
  if (!items?.length) return null;
  const niches = new Set(items.map((v) => v.niche).filter(Boolean));
  return (
    <p className="flex items-center justify-center gap-2 text-center" style={{ ...fM, fontSize: 12, fontWeight: 600, color: T.ink }}>
      <span className="rounded-full shrink-0" style={{ width: 7, height: 7, background: T.signal }} aria-hidden="true" />
      {items.length} live outliers across {niches.size} niche{niches.size === 1 ? "" : "s"} researchers are tracking now
    </p>
  );
}

function ShowcaseCarousel({ items }) {
  const trackRef = useRef(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const paused = useRef(false);
  const hovering = useRef(false);

  // Auto-advance until the visitor interacts; hover/focus holds it, and
  // reduced-motion visitors never get it (WCAG 2.2.2).
  useEffect(() => {
    if (!items?.length || prefersReducedMotion()) return;
    const id = setInterval(() => {
      const el = trackRef.current;
      if (!el || paused.current || hovering.current || document.hidden) return;
      const max = el.scrollWidth - el.clientWidth - 4;
      if (el.scrollLeft >= max) el.scrollTo({ left: 0, behavior: "smooth" });
      else el.scrollBy({ left: Math.min(480, el.clientWidth * 0.8), behavior: "smooth" });
    }, 3200);
    return () => clearInterval(id);
  }, [items]);

  // Page dots follow live layout: measured on resize, not read during render.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const sync = () => {
      const count = pageCount(el);
      const max = Math.max(1, el.scrollWidth - el.clientWidth);
      setPages(count);
      setPage(Math.round((el.scrollLeft / max) * Math.max(0, count - 1)));
    };
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync);
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      ro?.disconnect();
    };
  }, [items]);

  if (!items?.length) return null;
  const scrollBy = (dir) => {
    const el = trackRef.current;
    if (!el) return;
    paused.current = true;
    el.scrollBy({ left: dir * Math.min(480, el.clientWidth * 0.8), behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };
  const arrow = "rounded-full w-10 h-10 flex items-center justify-center transition-colors hover:bg-black/5";
  return (
    <div
      className="relative"
      role="region"
      aria-roledescription="carousel"
      aria-label="Live outliers"
      onPointerEnter={() => { hovering.current = true; }}
      onPointerLeave={() => { hovering.current = false; }}
      onFocus={() => { paused.current = true; }}
    >
      <div
        ref={trackRef}
        className="flex overflow-x-auto pt-1 pb-2"
        style={{ scrollSnapType: "x mandatory", scrollbarWidth: "thin", scrollbarColor: `${T.line} transparent` }}
        onPointerDown={() => {
          paused.current = true;
        }}
      >
        {items.map((v) => (
          <ShowcaseCard key={v.id} v={v} />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-center gap-3">
        <button type="button" aria-label="Previous outliers" onClick={() => scrollBy(-1)}
          className={arrow} style={{ background: T.card, color: T.ink, border: `1px solid ${T.line}` }}>
          <Chevron dir={-1} />
        </button>
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {Array.from({ length: pages }).map((_, i) => (
            <span key={i} className="rounded-full" style={{
              width: i === page ? 18 : 6, height: 6, transition: "width .25s cubic-bezier(.16,1,.3,1)",
              background: i === page ? T.signal : "#C9CCC5",
            }} />
          ))}
        </div>
        <button type="button" aria-label="Next outliers" onClick={() => scrollBy(1)}
          className={arrow} style={{ background: T.card, color: T.ink, border: `1px solid ${T.line}` }}>
          <Chevron dir={1} />
        </button>
      </div>
    </div>
  );
}

function pageCount(el) {
  if (!el || el.clientWidth <= 0) return 1;
  return Math.max(1, Math.ceil(el.scrollWidth / el.clientWidth));
}

function Showcase() {
  const items = useShowcase();
  return (
    <>
      <LiveCounter items={items} />
      <ShowcaseCarousel items={items} />
    </>
  );
}

/* Rotating word: app ↔ saas. Pure CSS, no JS timers. */
function Rotator() {
  return (
    <>
      <span className="sr-only">app</span>
      <span
        className="inline-block overflow-hidden align-bottom"
        style={{ height: "1.12em", verticalAlign: "bottom" }}
        aria-hidden="true"
      >
        <span className="rotator-inner" style={{ display: "inline-block", color: T.signal }}>
          <span style={{ display: "block", height: "1.12em", lineHeight: 1.12 }}>app</span>
          <span style={{ display: "block", height: "1.12em", lineHeight: 1.12 }}>saas</span>
        </span>
        <style>{`@keyframes rotatorSwap { 0%,42% { transform: translateY(0); } 50%,92% { transform: translateY(-1.12em); } 100% { transform: translateY(0); } } .rotator-inner { animation: rotatorSwap 4.5s cubic-bezier(.16,1,.3,1) infinite; } @media (prefers-reduced-motion: reduce) { .rotator-inner { animation: none; } }`}</style>
      </span>
    </>
  );
}

const TikTokIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-label="TikTok"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" /></svg>
);

const InstagramIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-label="Instagram"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.6" cy="6.4" r="1.4" fill="currentColor" stroke="none" /></svg>
);

const YouTubeIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-label="YouTube"><path d="M23 7.2s-.22-1.56-.9-2.25c-.86-.9-1.82-.9-2.26-.96C16.7 3.75 12 3.75 12 3.75s-4.7 0-7.84.24c-.44.05-1.4.06-2.26.96-.68.69-.9 2.25-.9 2.25S.75 9.03.75 10.87v1.71c0 1.84.25 3.68.25 3.68s.22 1.56.9 2.25c.86.9 1.99.87 2.5.96 1.8.18 7.6.24 7.6.24s4.71-.01 7.85-.25c.44-.05 1.4-.06 2.26-.96.68-.69.9-2.25.9-2.25s.25-1.84.25-3.68v-1.71c0-1.84-.25-3.67-.25-3.67zM9.75 14.85V8.65l6.27 3.1-6.27 3.1z" /></svg>
);

const ThreadsIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-label="Threads"><circle cx="12" cy="12" r="8.2" /><path d="M12 8.3a3.7 3.7 0 1 0 3.7 3.7c0-1.1-.9-1.9-1.9-1.9" /><path d="M18.9 10.8v7.4" strokeLinecap="round" /></svg>
);

const PLATFORMS = [
  { label: "TikTok", Icon: TikTokIcon },
  { label: "Instagram", Icon: InstagramIcon },
  { label: "YouTube", Icon: YouTubeIcon },
  { label: "Threads", Icon: ThreadsIcon },
];

/* ── Agentic terminal: tracking outliers from the agent ── */

const TRACK_CMD = "/track @competitor #niche";
const TRACK_ROWS = [
  { score: "27.4x", hot: true, text: "@solodev_sam · 4.2K followers · 310K views" },
  { score: "11.2x", hot: true, text: "@ship.daily · 9.8K followers · 190K views" },
  { score: "1.3x", hot: false, text: "@techguru · 2.1M followers · 1.2M views" },
];

function AgenticTerminal() {
  const [typed, setTyped] = useState(0);
  const [rows, setRows] = useState(0);
  const [started, setStarted] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || started) return;
    if (prefersReducedMotion()) {
      setTyped(TRACK_CMD.length);
      setRows(TRACK_ROWS.length);
      setStarted(true);
      return;
    }
    // No IntersectionObserver (old browsers, JSDOM tests): start right away.
    if (typeof IntersectionObserver === "undefined") {
      setStarted(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [started]);
  useEffect(() => {
    if (!started) return;
    if (typed < TRACK_CMD.length) {
      const t = setTimeout(() => setTyped(typed + 1), 40);
      return () => clearTimeout(t);
    }
    if (rows < TRACK_ROWS.length) {
      const t = setTimeout(() => setRows(rows + 1), 420);
      return () => clearTimeout(t);
    }
  }, [started, typed, rows]);

  return (
    <div ref={boxRef} className="rounded-xl overflow-hidden" style={{ background: "#0E1216", border: "1px solid rgba(255,255,255,0.1)" }}>
      <div className="px-4 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", ...fM, fontSize: 11, color: "#7A828B" }}>
        claude code, tracking outliers while you sleep
      </div>
      <div className="p-5" style={{ ...fM, fontSize: 13, lineHeight: 1.9 }}>
        <div style={{ color: "#E8EAE6" }}>
          <span style={{ color: T.signal }}>❯</span> {TRACK_CMD.slice(0, typed)}
          <span style={{ animation: "blink 1s step-end infinite", color: T.signal }}>▊</span>
        </div>
        <div className="mt-2 grid gap-1.5">
          {TRACK_ROWS.slice(0, rows).map((r, i) => (
            <div key={i} className="flex items-center gap-2.5" style={{ animation: "rowIn .35s ease both", opacity: r.hot ? 1 : 0.5 }}>
              <span className="rounded px-1.5 py-0.5 shrink-0"
                style={{ ...fM, fontSize: 11, fontWeight: 700, background: r.hot ? T.signal : "transparent", color: r.hot ? "#fff" : "#9AA3AC", border: r.hot ? "none" : "1px solid rgba(255,255,255,0.2)" }}>
                {r.score}
              </span>
              <span className="truncate" style={{ fontSize: 12, color: "#B8BEC5" }}>{r.text}</span>
            </div>
          ))}
        </div>
        {rows >= TRACK_ROWS.length && (
          <div className="mt-2" style={{ fontSize: 12, color: "#2BA88F", animation: "rowIn .35s ease both" }}>
            ✓ tracked. nightly refresh + morning briefs, zero scrolling.
          </div>
        )}
      </div>
    </div>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Track creators & hashtags",
    body: "Point slashloop at the creators and hashtags in your niche. It refreshes on schedule while you build.",
  },
  {
    n: "02",
    title: "Hunt the outliers",
    body: "Every video is scored against its creator's own baseline. 27x from a 4K account beats 1.3x from 2M followers, every time.",
  },
  {
    n: "03",
    title: "Spin 12 variants",
    body: "Run experiments on what works: generate up to twelve variations of a proven hook, keep the winners, kill the rest.",
  },
  {
    n: "04",
    title: "Schedule everywhere",
    body: "Queue the winners to all your accounts at once. Drafts land ready to post.",
  },
];

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-5 pt-12 pb-10 text-center">
        <h1 className="mx-auto" style={{ ...fD, fontWeight: 900, fontSize: "clamp(32px, 5vw, 54px)", lineHeight: 1.08, letterSpacing: "-0.028em", maxWidth: 800, textWrap: "balance" }}>
          Remake viral TikTok slideshows.
          <br />
          Get paying customers for your <Rotator />.
        </h1>
        <p className="mt-5 mx-auto" style={{ fontSize: 17, lineHeight: 1.6, color: "#3A424B", maxWidth: 560 }}>
          Find what's already viral, remake it for your product, post it everywhere.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <CTAButton big to="/login" onClick={cta("hero_start")}>Start free →</CTAButton>
          <GhostButton to="/pricing" onClick={cta("hero_pricing")}>See pricing</GhostButton>
        </div>
        <p className="mt-2.5" style={{ ...fM, fontSize: 11, color: T.muted }}>
          free tier · no card to start · posts land as drafts, nothing goes public without you
        </p>
      </section>

      {/* Live outlier examples */}
      <section className="max-w-5xl mx-auto px-5 pb-14">
        <Showcase />
        <p className="mt-3 text-center" style={{ ...fM, fontSize: 11, color: T.muted }}>
          scores vs each creator's own baseline, refreshed as researchers track more
        </p>
      </section>

      {/* Process */}
      <section style={{ background: T.ink }}>
        <div className="max-w-5xl mx-auto px-5 py-14">
          <h2 style={{ ...fD, fontWeight: 800, fontSize: "clamp(22px,3vw,30px)", letterSpacing: "-0.025em", color: "#fff" }}>
            How the loop runs
          </h2>
          {/* The order is the point, so the steps keep their numbers; a shared
              hairline reads as one loop instead of four separate cards. */}
          <ol className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10">
            {STEPS.map((s) => (
              <li key={s.n} className="pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.14)" }}>
                <div style={{ ...fM, fontSize: 12, fontWeight: 700, color: T.signal }}>{s.n}</div>
                <h3 className="mt-2" style={{ ...fD, fontSize: 17, fontWeight: 800, color: "#fff" }}>{s.title}</h3>
                <p className="mt-2" style={{ fontSize: 14, lineHeight: 1.6, color: "#B8BEC5" }}>{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-12 flex items-start justify-center gap-6" role="img" aria-label="Post to TikTok, Instagram, YouTube and Threads">
            {PLATFORMS.map(({ label, Icon }) => (
              <span key={label} className="flex flex-col items-center gap-1.5" style={{ color: "#8A929B" }}>
                <Icon />
                <span style={{ ...fM, fontSize: 11 }}>{label}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Agentic first */}
      <section className="max-w-5xl mx-auto px-5 py-14 grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <h2 style={{ ...fD, fontWeight: 800, fontSize: "clamp(24px,3.5vw,34px)", letterSpacing: "-0.025em", textWrap: "balance" }}>
            Your coding agent hunts outliers <span style={{ color: T.signalText }}>while you sleep</span>
          </h2>
          <p className="mt-4" style={{ fontSize: 15, lineHeight: 1.65, color: "#3A424B" }}>
            Slashloop is an MCP server plus a Claude Code skill. Track, scan, brief and
            schedule without opening a tab. Three copy-paste prompts and your agent is onboarded. <a href="/agent-setup" className="underline underline-offset-4" style={{ color: T.signalText, fontWeight: 600 }}>Agent setup</a>.
          </p>
        </div>
        <AgenticTerminal />
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-5 pb-16">
        <h2 style={{ ...fD, fontWeight: 800, fontSize: "clamp(22px,3vw,30px)", letterSpacing: "-0.025em" }}>
          Asked before you ask
        </h2>
        <div className="mt-5 flex flex-col gap-2.5">
          {[
            ["Will it post garbage to my accounts?", "No. Everything lands as a draft first. TikTok drafts wait in your inbox, and nothing on any platform goes public without your tap. The scheduler only publishes what you scheduled, when you scheduled it."],
            ["I can't film. I have no time. Does this still work?", "Yes, that is exactly who slideshows are for. There is nothing to film: pick a viral outlier, generate the slide images with AI straight from the brief, and post the carousel. Researchers report a first publishable deck in about 20 minutes, camera never involved."],
            ["What exactly is an outlier score?", "Views divided by that creator's own median. A 27x from a 4K account means the idea won on merit, not audience, which is why you can replicate it from zero. A 1.3x from 2M followers is just a Tuesday."],
            ["Which platforms can I post to?", "TikTok, Instagram, YouTube Shorts, and Threads, from one calendar. Instagram needs a Business or Creator account linked to a Facebook Page. TikTok uploads start as private drafts until TikTok reviews the integration."],
            ["What does $1 get me?", "About 100 credits on the Creator plan ($29 for 3,000 a month). That covers roughly 65 refreshed videos, 20 full video analyses, 50 briefs and hook variations, or 10 AI slide images. Browsing, scheduling posts, and boards are free. Monthly credits refill; packs never expire."],
            ["What does it cost?", "Start free: 300 credits ($3.00) a month, no card. Credits are worth $0.01 each. Paid plans add credits and workspaces; one-off credit packs never expire. Every scrape and analysis shows its cost before and after, so there are no surprise bills."],
            ["How does the agent part work?", "Slashloop is an MCP server with a Claude Code skill. Your agent tracks niches, scans nightly, drafts briefs, and queues posts while you sleep. Three copy-paste prompts onboard it: see Agent setup."],
          ].map(([q, a]) => (
            <details key={q} className="group rounded-xl" style={{ background: T.card, border: "1px solid " + T.line }}>
              <summary className="flex items-center justify-between gap-4 px-5 py-4 list-none rounded-xl [&::-webkit-details-marker]:hidden" style={{ fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                {q}
                <svg className="shrink-0 transition-transform duration-200 group-open:rotate-180" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: T.muted }}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </summary>
              <p className="px-5 pb-4" style={{ fontSize: 14, lineHeight: 1.65, color: "#3A424B", maxWidth: "68ch" }}>{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-5xl mx-auto px-5 py-16 text-center">
        <h2 className="mx-auto" style={{ ...fD, fontWeight: 900, fontSize: "clamp(26px,4vw,38px)", letterSpacing: "-0.026em", maxWidth: 760, textWrap: "balance" }}>
          Your next post is already viral. <span style={{ color: T.signalText }}>Someone else made it.</span>
        </h2>
        <div className="mt-6 flex justify-center">
          <CTAButton big to="/login" onClick={cta("final_cta")}>Start free →</CTAButton>
        </div>
      </section>
    </>
  );
}
