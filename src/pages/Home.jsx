import { useCallback, useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { T, fD, fB, fM, fmt } from "../lib/theme.js";
import { SectionLabel, CTAButton, GhostButton } from "../components/ui.jsx";

const SHOWCASE_URL = `${((import.meta.env.VITE_MCP_URL ?? "").trim() || "https://mcp.slashloop.dev").replace(/\/$/, "")}/api/showcase`;
// Live outlier shelf — pulled from the showcase endpoint (top outliers across
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

function ShowcaseCard({ v }) {
  return (
    <a
      href={v.url}
      target="_blank"
      rel="noreferrer"
      className="rounded-xl overflow-hidden transition-transform hover:-translate-y-1 snap-start shrink-0"
      style={{ background: T.ink, textDecoration: "none", width: 220, marginRight: 12 }}
    >
      <div style={{ aspectRatio: "3/4", overflow: "hidden", background: "#0E1216" }}>
        <img src={v.thumb} alt={`${v.creator} — ${v.caption}`} loading="lazy" className="w-full h-full" style={{ objectFit: "cover", display: "block" }} />
      </div>
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate" style={{ ...fB, fontSize: 12, color: "#E8EAE6" }}>{v.creator}</span>
          <span className="rounded px-1.5 py-0.5 shrink-0" style={{ ...fM, fontSize: 12, fontWeight: 700, background: T.signal, color: "#fff" }}>
            {Math.round(v.score)}x
          </span>
        </div>
        <div className="truncate" style={{ ...fM, fontSize: 11, color: "#7A828B" }}>{v.caption}</div>
        <div className="flex items-center justify-between gap-2" style={{ ...fM, fontSize: 10, color: "#5D656E" }}>
          <span>{fmt(v.views)} views</span>
          {v.niche ? <span className="truncate">#{String(v.niche).replace(/^[@#]/, "")}</span> : null}
        </div>
      </div>
    </a>
  );
}

function ShowcaseCarousel() {
  const items = useShowcase();
  const autoplay = useRef(Autoplay({ delay: 2800, stopOnInteraction: true }));
  const [viewportRef, embla] = useEmblaCarousel(
    { loop: true, align: "start", dragFree: false },
    [autoplay.current],
  );
  const [selected, setSelected] = useState(0);
  const onSelect = useCallback(() => {
    if (embla) setSelected(embla.selectedScrollSnap());
  }, [embla]);
  useEffect(() => {
    if (!embla) return;
    onSelect();
    embla.on("select", onSelect);
    embla.on("reInit", onSelect);
    return () => {
      embla.off("select", onSelect);
      embla.off("reInit", onSelect);
    };
  }, [embla, onSelect]);
  if (!items) return null;
  if (!items.length) return null;
  const pages = embla ? embla.scrollSnapList().length : 0;
  return (
    <div className="relative">
      <div ref={viewportRef} className="overflow-hidden pb-2">
        <div className="flex" style={{ touchAction: "pan-y" }}>
        {items.map((v) => (
          <ShowcaseCard key={v.id} v={v} />
        ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-center gap-3">
        <button type="button" aria-label="Previous outliers" onClick={() => embla && embla.scrollPrev()}
          className="rounded-full w-9 h-9 flex items-center justify-center"
          style={{ background: T.card, color: T.ink, border: `1px solid ${T.line}` }}>‹</button>
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {Array.from({ length: pages }).map((_, i) => (
            <span key={i} className="rounded-full" style={{
              width: i === selected ? 18 : 6, height: 6, transition: "width .25s ease",
              background: i === selected ? T.signal : "#C9CCC5",
            }} />
          ))}
        </div>
        <button type="button" aria-label="Next outliers" onClick={() => embla && embla.scrollNext()}
          className="rounded-full w-9 h-9 flex items-center justify-center"
          style={{ background: T.card, color: T.ink, border: `1px solid ${T.line}` }}>›</button>
      </div>
    </div>
  );
}

/* Rotating word: app ↔ saas. Pure CSS, no JS timers. */
function Rotator() {
  return (
    <span
      className="inline-block overflow-hidden align-bottom"
      style={{ height: "1.12em", verticalAlign: "bottom" }}
      aria-label="app or saas"
    >
      <span className="rotator-inner" style={{ display: "inline-block", color: T.signal }}>
        <span style={{ display: "block", height: "1.12em", lineHeight: 1.12 }}>app</span>
        <span style={{ display: "block", height: "1.12em", lineHeight: 1.12 }}>saas</span>
      </span>
      <style>{`@keyframes rotatorSwap { 0%,42% { transform: translateY(0); } 50%,92% { transform: translateY(-1.12em); } 100% { transform: translateY(0); } } .rotator-inner { animation: rotatorSwap 4.5s ease-in-out infinite; }`}</style>
    </span>
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
        claude code — tracking outliers while you sleep
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
          <div className="mt-2" style={{ fontSize: 12, color: T.teal, animation: "rowIn .35s ease both" }}>
            ✓ tracked. nightly refresh + morning briefs, zero scrolling.
          </div>
        )}
      </div>
    </div>
  );
}

const STEPS = [  {
    n: "01",
    title: "Track creators & hashtags",
    body: "Point slashloop at the creators and hashtags in your niche. It refreshes on schedule while you build.",
  },
  {
    n: "02",
    title: "Hunt the outliers",
    body: "Every video is scored against its creator's own baseline — 27x from a 4K account beats 1.3x from 2M followers, every time.",
  },
  {
    n: "03",
    title: "Spin 20 variants",
    body: "Run experiments on what works: generate twenty variations of a proven hook, keep the winners, kill the rest.",
  },
  {
    n: "04",
    title: "Schedule everywhere",
    body: "Queue the winners to all your accounts at once — drafts land ready to post.",
  },
];

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-5 pt-12 pb-10 text-center">
        <SectionLabel>LOOP FOR APP MARKETING</SectionLabel>
        <h1 className="mt-3 mx-auto" style={{ ...fD, fontWeight: 900, fontSize: "clamp(32px, 5vw, 54px)", lineHeight: 1.08, letterSpacing: -1.5, maxWidth: 800 }}>
          Clone viral TikTok slideshows.
          <br />
          Get paying customers for your <Rotator />.
        </h1>
        <p className="mt-5 mx-auto" style={{ fontSize: 17, lineHeight: 1.6, color: "#3A424B", maxWidth: 560 }}>
          Find what's already viral, remake it for your product, post it everywhere.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <CTAButton big to="/pricing">See pricing →</CTAButton>
          <GhostButton to="/login">Sign in</GhostButton>
        </div>
        <p className="mt-2.5" style={{ ...fM, fontSize: 11, color: T.muted }}>
          free tier · no card to start
        </p>
      </section>

      {/* Live outlier examples */}
      <section className="max-w-5xl mx-auto px-5 pb-14">
        <ShowcaseCarousel />
        <p className="mt-3 text-center" style={{ ...fM, fontSize: 11, color: T.muted }}>
          live outliers researchers are tracking now — scores vs each creator's own baseline
        </p>
      </section>

      {/* Process */}
      <section style={{ background: T.ink }}>
        <div className="max-w-5xl mx-auto px-5 py-14">
          <SectionLabel>THE PROCESS</SectionLabel>
          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-xl p-5" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ ...fM, fontSize: 12, fontWeight: 700, color: T.signal }}>{s.n}</div>
                <div className="mt-1.5" style={{ ...fD, fontSize: 16, fontWeight: 800, color: "#fff" }}>{s.title}</div>
                <p className="mt-2" style={{ fontSize: 13.5, lineHeight: 1.6, color: "#B8BEC5" }}>{s.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex items-start justify-center gap-6" aria-label="Post to TikTok, Instagram, YouTube and Threads">
            {PLATFORMS.map(({ label, Icon }) => (
              <span key={label} className="flex flex-col items-center gap-1.5" style={{ color: "#7A828B" }}>
                <Icon />
                <span style={{ ...fM, fontSize: 10 }}>{label}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Agentic first */}
      <section className="max-w-5xl mx-auto px-5 py-14 grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <SectionLabel>AGENTIC FIRST</SectionLabel>
          <h2 className="mt-3" style={{ ...fD, fontWeight: 800, fontSize: "clamp(24px,3.5vw,34px)", letterSpacing: -0.8 }}>
            Your coding agent hunts outliers <span style={{ color: T.signal }}>while you sleep</span>
          </h2>
          <p className="mt-4" style={{ fontSize: 15, lineHeight: 1.65, color: "#3A424B" }}>
            Slashloop is an MCP server plus a Claude Code skill — track, scan, brief and
            schedule without opening a tab. Three copy-paste prompts and your agent is onboarded.
          </p>
          <div className="mt-5">
            <CTAButton to="/agent-setup">Onboard your agent →</CTAButton>
          </div>
        </div>
        <AgenticTerminal />
      </section>

      {/* Final CTA */}
      <section className="max-w-5xl mx-auto px-5 py-16 text-center">
        <h2 style={{ ...fD, fontWeight: 900, fontSize: "clamp(26px,4vw,38px)", letterSpacing: -1 }}>
          Your next post is already viral. <span style={{ color: T.signal }}>Someone else made it.</span>
        </h2>
        <div className="mt-6 flex justify-center">
          <CTAButton big to="/pricing">Get in the /loop →</CTAButton>
        </div>
      </section>
    </>
  );
}
