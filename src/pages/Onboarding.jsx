import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { T, fD, fB, fM } from "../lib/theme.js";
import { SectionLabel, CTAButton, Spinner } from "../components/ui.jsx";
import { useAuth } from "../lib/auth.jsx";
import { useWorkspace } from "../lib/workspace.jsx";
import { useToast } from "../lib/toast.jsx";
import { listSources, createSource, refreshSource, SourcesApiError } from "../lib/sources.js";
import { track } from "../lib/analytics.js";

// The survey funnel replaces the old "land on Discover with a strip" first
// run: problem → solution → three questions → the answers become real setup
// (workspace named after the product, up to 3 sources tracked with first
// scrapes queued). Copy is condensed from the landing page's narrative — same
// traps, same outlier-score story, so the promise and the product agree.

const STORAGE_KEY = "slashloop:onboarding";
const MAX_TRACKED = 3; // free allowance territory — the backend enforces limits too

const TRAPS = [
  ["The scroll trap", "Two hours of “research”. 14 saved videos. 0 posts."],
  ["The views mirage", "What works for a 2M-follower creator works because of the 2M followers — not the concept."],
  ["The blank page", "“Post something today?” is not a content strategy."],
];

const STUCK_OPTIONS = [
  { value: "ideas", label: "No post ideas" },
  { value: "views", label: "I post, but views are flat" },
  { value: "installs", label: "Views, but no installs" },
  { value: "time", label: "No time to film" },
];

const STUCK_PAYOFF = {
  ideas: "A ranked feed of proven concepts beats a blank calendar.",
  views: "Formats that over-performed for accounts your size — not mega-account noise.",
  installs: "Every outlier ships with its hook extracted — the scroll-stopper that drives installs.",
  time: "The loop runs overnight through MCP. You wake up to ranked outliers.",
};

function parseNiche(text) {
  return text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
}

// @handle → creator source, #tag → hashtag source, anything else → keyword.
function classify(item) {
  if (item.startsWith("@")) return { sourceType: "creator", query: item.replace(/^@+/, "") };
  if (item.startsWith("#")) return { sourceType: "hashtag", query: item.replace(/^#+/, "") };
  return { sourceType: "keyword", query: item };
}

function loadAnswers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {}; // storage blocked (private mode & co.) — the funnel just won't resume
  }
}

function saveAnswers(answers) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
  } catch {
    /* best effort — see loadAnswers */
  }
}

function clearAnswers() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* best effort — see loadAnswers */
  }
}

const inputStyle = { ...fB, fontSize: 14, padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.line}`, background: T.card };

export default function Onboarding() {
  const { user, loading: authLoading, accessToken } = useAuth();
  const { activeWorkspaceId, loading: workspaceLoading, createWorkspace } = useWorkspace();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "";
  // Explicit re-run: /onboarding?again skips the "already tracking something"
  // guard so an onboarded account can walk the funnel again against its real
  // workspace (setup then tracks into what exists instead of bouncing to
  // /account). Nothing is deleted — re-entering the same niche just re-tracks.
  const again = params.has("again");
  usePreloadShots();

  // Same key the Sources/Discover/Login pages use, so the "already done?"
  // check and the post-setup invalidation ride the same cache.
  const sourcesQuery = useQuery({
    queryKey: ["sources", activeWorkspaceId],
    queryFn: ({ signal }) => listSources(accessToken, activeWorkspaceId, {}, signal),
    enabled: Boolean(user && accessToken && activeWorkspaceId),
  });

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(loadAnswers); // lazy init: resume mid-funnel after a refresh
  const [running, setRunning] = useState(false);
  // One-way latch: once setup has started, the completion guard below must
  // never fire again. It otherwise races the post-setup navigate() — router
  // transitions commit after urgent state updates, so the `finally`
  // setRunning(false) would re-render first, see the just-tracked sources,
  // and hijack the user to /account before the intended page lands.
  const [setupStarted, setSetupStarted] = useState(false);

  useEffect(() => {
    saveAnswers(answers);
  }, [answers]);

  // One GA event per screen arrival — this funnel lives or dies by step drop-off.
  useEffect(() => {
    track("onboarding_step", { step });
  }, [step]);

  const set = (patch) => setAnswers((prev) => ({ ...prev, ...patch }));

  if (authLoading || workspaceLoading || (Boolean(activeWorkspaceId) && sourcesQuery.isPending)) {
    return (
      <section className="flex items-center justify-center py-24" role="status" aria-label="Loading onboarding">
        <Spinner />
      </section>
    );
  }
  // Not signed in -> login first, come straight back here (keeping ?next and
  // ?again so the round-trip doesn't downgrade the request).
  if (!user) {
    const qs = new URLSearchParams(params).toString();
    const back = qs ? `/onboarding?${qs}` : "/onboarding";
    return <Navigate to={`/login?next=${encodeURIComponent(back)}`} replace />;
  }
  // Already tracking something -> onboarding did its job some other day.
  // setupStarted keeps this from firing during/after THIS session's setup;
  // ?again is the deliberate override.
  if (!again && !setupStarted && activeWorkspaceId && sourcesQuery.isSuccess && (sourcesQuery.data ?? []).length > 0) {
    return <Navigate to={next || "/account"} replace />;
  }

  async function runSetup() {
    setSetupStarted(true);
    setRunning(true);
    const items = parseNiche(answers.niche ?? "").slice(0, MAX_TRACKED);
    try {
      let wsId = activeWorkspaceId;
      if (!wsId) {
        const name = (answers.product ?? "").trim() || "My niche";
        try {
          const ws = await createWorkspace(name);
          wsId = ws.id;
        } catch (err) {
          showToast(err?.message || "Couldn't create the workspace — try again from the Sources page.", { type: "error" });
          return;
        }
      }
      // Track each parsed item; one failure must not sink the rest — the
      // Sources page can always add what missed. Mirrors Discover's
      // trackSuggestion: create is free, refresh queues the first scrape
      // without blocking.
      let tracked = 0;
      for (const item of items) {
        const { sourceType, query } = classify(item);
        try {
          const source = await createSource(accessToken, wsId, { platform: "tiktok", sourceType, query, videoLimit: 20 });
          tracked += 1;
          refreshSource(accessToken, wsId, source.id).catch(() => {
            showToast(`The first scrape for ${item} didn't start — use Refresh on the Sources page.`, { type: "error" });
          });
        } catch (err) {
          showToast(err instanceof SourcesApiError ? err.message : `Couldn't track ${item}.`, { type: "error" });
        }
      }
      if (tracked > 0) queryClient.invalidateQueries({ queryKey: ["sources", wsId] });
      track("onboarding_complete", { sources: tracked });
      clearAnswers();
      // Land where the proof is: tags tracked (with scrape status) on
      // Sources; outliers need scrape time, so the Gallery right after
      // setup would greet them with an empty grid. With nothing tracked,
      // Discover is where picking happens. An explicit ?next always wins.
      navigate(next || (tracked > 0 ? "/sources" : "/discover"));
    } finally {
      setRunning(false);
    }
  }

  const screens = [
    <ProblemScreen key="p" onNext={() => setStep(1)} />,
    <SolutionScreen key="s" onNext={() => setStep(2)} />,
    <ProductQuestion key="q1" value={answers.product ?? ""} onChange={(v) => set({ product: v })} onNext={() => setStep(3)} onBack={() => setStep(1)} />,
    <NicheQuestion key="q2" value={answers.niche ?? ""} onChange={(v) => set({ niche: v })} onNext={() => setStep(4)} onBack={() => setStep(2)} />,
    <StuckQuestion key="q3" value={answers.stuck ?? ""} onChange={(v) => set({ stuck: v })} onNext={() => setStep(5)} onBack={() => setStep(3)} />,
    <SetupScreen
      key="setup"
      answers={answers}
      hasWorkspace={Boolean(activeWorkspaceId)}
      running={running}
      onRun={runSetup}
      onBack={() => setStep(4)}
    />,
  ];

  return (
    <section className="max-w-2xl mx-auto px-5 py-16">
      <div className="flex items-center justify-between">
        <SectionLabel>ONBOARDING</SectionLabel>
        <button
          type="button"
          onClick={() => navigate("/discover")}
          style={{ ...fM, fontSize: 12, color: T.muted, textDecoration: "underline" }}
          data-testid="onboarding-skip"
        >
          Skip for now
        </button>
      </div>

      <div className="mt-4 flex items-center gap-1.5" aria-hidden="true">
        {screens.map((_, i) => (
          <span key={i} className="h-1 rounded-full transition-all" style={{ width: i === step ? 28 : 12, background: i <= step ? T.signal : T.line }} />
        ))}
      </div>

      {screens[step]}
    </section>
  );
}

/* ── Screens ─────────────────────────────────────────── */

function ProblemScreen({ onNext }) {
  return (
    <div data-testid="onboarding-problem">
      <h1 className="mt-6" style={{ ...fD, fontWeight: 900, fontSize: "clamp(26px,4vw,36px)", lineHeight: 1.1, letterSpacing: -0.8 }}>
        You shipped the app.
        <br />
        The content isn't shipping itself.
      </h1>
      <div className="mt-6 grid gap-3">
        {TRAPS.map(([t, d]) => (
          <div key={t} className="rounded-lg p-4" style={{ background: T.card, border: `1px solid ${T.line}` }}>
            <div style={{ ...fM, fontSize: 12, color: T.signal }}>{t}</div>
            <p className="mt-1.5 mb-0" style={{ fontSize: 14, lineHeight: 1.55, color: "#3A424B" }}>{d}</p>
          </div>
        ))}
      </div>
      <div className="mt-7 flex items-center gap-4">
        <CTAButton big onClick={onNext}>That's me →</CTAButton>
        <span style={{ ...fM, fontSize: 11, color: T.muted }}>takes ~30 seconds</span>
      </div>
    </div>
  );
}

/**
 * A real product screenshot with a browser-chrome frame — proof beats
 * promises in a funnel. A shimmer placeholder holds the frame's height
 * while the image streams in (and onError hides the whole figure), so the
 * layout never jumps and no broken-image icon can appear.
 */
function Shot({ src, caption, maxHeight = 280 }) {
  const [state, setState] = useState("loading"); // loading | ok | error
  return (
    <figure className="mt-6 mb-0">
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.line}`, boxShadow: "0 12px 30px rgba(20,24,29,0.14)" }}>
        <div className="flex items-center gap-1.5 px-3 py-2" style={{ background: T.ink, borderBottom: `1px solid ${T.line}` }}>
          {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
            <span key={c} className="w-2 h-2 rounded-full" style={{ background: c }} />
          ))}
          <span className="ml-2 truncate" style={{ ...fM, fontSize: 10, color: "#7A828B" }}>slashloop.dev{src.replace("/screens/", "/").replace(/\.[a-z]+$/, "")}</span>
        </div>
        {state === "loading" && (
          <div className="animate-pulse" style={{ height: maxHeight, background: "#E7E8E3" }} aria-hidden="true" />
        )}
        {state !== "error" && (
          <img
            src={src}
            alt={caption}
            onLoad={() => setState("ok")}
            onError={() => setState("error")}
            className={`block w-full ${state === "ok" ? "" : "hidden"}`}
            style={{ maxHeight, objectFit: "cover", objectPosition: "top", background: T.paper }}
          />
        )}
      </div>
      <figcaption className="mt-2" style={{ ...fM, fontSize: 11, color: T.muted }}>{caption}</figcaption>
    </figure>
  );
}

// Warm the screenshot cache while the user reads screen 1 — by the time
// they reach the proof, it's local.
function usePreloadShots() {
  useEffect(() => {
    for (const src of ["/screens/gallery.jpg", "/screens/discover.jpg"]) {
      const img = new Image();
      img.src = src;
    }
  }, []);
}

function SolutionScreen({ onNext }) {
  return (
    <div data-testid="onboarding-solution">
      <h1 className="mt-6" style={{ ...fD, fontWeight: 900, fontSize: "clamp(26px,4vw,36px)", lineHeight: 1.1, letterSpacing: -0.8 }}>
        Views lie. <span style={{ color: T.signal }}>Multipliers don't.</span>
      </h1>
      <p className="mt-4 mb-0" style={{ fontSize: 15.5, lineHeight: 1.6, color: "#3A424B" }}>
        A 310K-view video from a 4K-follower account is a <b>proven concept</b> — the algorithm pushed it on merit.
        1.2M views from a 2M account is just a Tuesday. slashloop scores every video in your niche against the
        creator's own baseline, so concepts you can replicate <i>at 0 followers</i> rise to the top.
      </p>
      <Shot
        src="/screens/gallery.jpg"
        caption="the real feed — every card scored vs its creator's baseline"
      />
      <div className="mt-7">
        <CTAButton big onClick={onNext}>Set up my loop →</CTAButton>
      </div>
    </div>
  );
}

function QuestionShell({ kicker, title, help, children, onNext, onBack, nextLabel = "Next →" }) {
  return (
    <div>
      <div className="mt-6" style={{ ...fM, fontSize: 12, color: T.muted }}>{kicker}</div>
      <h1 className="mt-2" style={{ ...fD, fontWeight: 900, fontSize: "clamp(24px,3.5vw,32px)", letterSpacing: -0.8 }}>{title}</h1>
      {help && <p className="mt-3 mb-0" style={{ fontSize: 14, lineHeight: 1.6, color: "#3A424B" }}>{help}</p>}
      {children}
      <div className="mt-7 flex items-center gap-4">
        <CTAButton big onClick={onNext}>{nextLabel}</CTAButton>
        <button type="button" onClick={onBack} style={{ ...fM, fontSize: 12, color: T.muted, textDecoration: "underline" }}>
          ← Back
        </button>
      </div>
    </div>
  );
}

function ProductQuestion({ value, onChange, onNext, onBack }) {
  return (
    <QuestionShell
      kicker="QUESTION 1 OF 3"
      title="What are we shipping?"
      help="Names your workspace — that's all."
      onNext={onNext}
      onBack={onBack}
      nextLabel={value.trim() ? `Set up ${value.trim()} →` : "Next →"}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onNext(); }}
        placeholder="e.g. Sauna Tracker"
        autoFocus
        className="mt-5 w-full max-w-md"
        style={inputStyle}
        data-testid="onboarding-product-input"
      />
    </QuestionShell>
  );
}

function NicheQuestion({ value, onChange, onNext, onBack }) {
  const parsed = parseNiche(value);
  const items = parsed.slice(0, MAX_TRACKED);
  const overflow = parsed.length - items.length;
  return (
    <QuestionShell
      kicker="QUESTION 2 OF 3"
      title="Who's already winning in your niche?"
      help={`Keywords, #hashtags or @handles — we track up to ${MAX_TRACKED} now and queue their first scrapes.`}
      onNext={onNext}
      onBack={onBack}
      nextLabel="Track them →"
    >
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={"home sauna, #saunatok, @coldplungequeen"}
        rows={2}
        autoFocus
        className="mt-5 w-full"
        style={{ ...inputStyle, resize: "vertical" }}
        data-testid="onboarding-niche-input"
      />
      <Shot src="/screens/discover.jpg" caption="type your niche — slashloop finds and verifies the sources" maxHeight={180} />
      {items.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {items.map((item) => {
            const { sourceType, query } = classify(item);
            const label = sourceType === "hashtag" ? `#${query}` : sourceType === "creator" ? `@${query}` : item;
            return (
              <span key={item} className="rounded-full px-3 py-1" style={{ ...fM, fontSize: 11, border: `1px solid ${T.line}`, background: T.card }} data-testid="niche-chip">
                {label}
                <span style={{ color: T.muted }}> · {sourceType}</span>
              </span>
            );
          })}
          {overflow > 0 && (
            <span style={{ ...fM, fontSize: 11, color: T.muted }}>+{overflow} more — add them later on Discover</span>
          )}
        </div>
      )}
    </QuestionShell>
  );
}

function StuckQuestion({ value, onChange, onNext, onBack }) {
  return (
    <QuestionShell kicker="QUESTION 3 OF 3" title="Where are you stuck right now?" onNext={onNext} onBack={onBack} nextLabel="Almost there →">
      <div className="mt-5 grid sm:grid-cols-2 gap-2.5">
        {STUCK_OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className="rounded-lg px-4 py-3 text-left transition-colors"
              style={{
                ...fB, fontSize: 14, fontWeight: selected ? 600 : 400,
                background: selected ? T.ink : T.card,
                color: selected ? "#fff" : T.ink,
                border: selected ? `1.5px solid ${T.ink}` : `1px solid ${T.line}`,
              }}
              data-testid={`stuck-${opt.value}`}
              aria-pressed={selected}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </QuestionShell>
  );
}

function SetupScreen({ answers, hasWorkspace, running, onRun, onBack }) {
  const items = parseNiche(answers.niche ?? "").slice(0, MAX_TRACKED);
  const payoff = STUCK_PAYOFF[answers.stuck] ?? "Your feed starts filling within minutes of the first scrape.";
  return (
    <div data-testid="onboarding-setup">
      <div className="mt-6" style={{ ...fM, fontSize: 12, color: T.muted }}>YOUR SETUP</div>
      <h1 className="mt-2" style={{ ...fD, fontWeight: 900, fontSize: "clamp(24px,3.5vw,32px)", letterSpacing: -0.8 }}>
        Your /loop is 10 seconds away.
      </h1>
      <div className="mt-5 rounded-xl p-5 flex flex-col gap-3" style={{ background: T.card, border: `1px solid ${T.line}` }}>
        <SummaryRow ok label={hasWorkspace ? "Using your existing workspace" : `Workspace "${(answers.product ?? "").trim() || "My niche"}" — created`} />
        <SummaryRow
          ok={items.length > 0}
          label={items.length > 0
            ? `${items.length} source${items.length > 1 ? "s" : ""} tracked — first scrapes queued`
            : "No sources yet — pick some on Discover"}
        />
        <SummaryRow ok label="Feed ranked against each creator's own baseline" />
      </div>
      <p className="mt-4 mb-0" style={{ fontSize: 14, lineHeight: 1.6, color: "#3A424B" }}>{payoff}</p>
      <p className="mt-2 mb-0" style={{ ...fM, fontSize: 11, color: T.muted }}>
        your next post is already viral — someone else made it. let's catch it early.
      </p>
      <div className="mt-6 flex items-center gap-4">
        <CTAButton big onClick={onRun} disabled={running}>
          {running ? "Setting up…" : "Enter the /loop →"}
        </CTAButton>
        {!running && (
          <button type="button" onClick={onBack} style={{ ...fM, fontSize: 12, color: T.muted, textDecoration: "underline" }}>
            ← Back
          </button>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ ok, label }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="w-4 h-4 rounded-full shrink-0 inline-flex items-center justify-center"
        style={{ background: ok ? T.teal : T.line, color: "#fff", ...fM, fontSize: 10 }}
        aria-hidden="true"
      >
        ✓
      </span>
      <span style={{ ...fB, fontSize: 13.5, color: T.ink }} data-testid="setup-row">{label}</span>
    </div>
  );
}
