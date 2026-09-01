import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { T, fD, fB, fM, fmt } from "../lib/theme.js";
import { SectionLabel, AlertBanner, IconButton, CloseIcon, Skeleton } from "../components/ui.jsx";
import WorkspaceSwitcher from "../components/WorkspaceSwitcher.jsx";
import { useAuth } from "../lib/auth.jsx";
import { useWorkspace } from "../lib/workspace.jsx";
import { useToast } from "../lib/toast.jsx";
import { listSources, createSource, refreshSource, dismissSuggestedSource, SourcesApiError } from "../lib/sources.js";
import { discoverSeeds, mineDiscoverSeedUntilDone, DiscoverApiError } from "../lib/discover.js";

const MAX_INPUTS = 8;

// Comma/newline separated — NOT spaces, because a keyword is allowed to be a
// phrase ("home sauna"), and space-splitting would shred it.
function parseInput(text) {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_INPUTS);
}

function normalize(sourceType, query) {
  return `${sourceType}:${query.toLowerCase().replace(/^[@#]+/, "")}`;
}

function seedLabel(s) {
  return s.sourceType === "hashtag" ? `#${s.query}` : s.sourceType === "creator" ? `@${s.query}` : s.query;
}

/**
 * Merge per-seed mine results into flat, ranked suggestion lists — a JS
 * mirror of the backend's aggregateDiscovery so the REST screen shows the
 * same ranking the MCP `discover` tool produces. Runs on every render of the
 * results (mines land one at a time), which is why it's a pure memo, not
 * state: incremental data in, ranked lists out.
 */
function aggregate(mines) {
  const verified = mines.filter((m) => m.verified);
  const totalSampled = verified.reduce((n, m) => n + m.sampleCount, 0);
  const seedKeys = new Set(mines.map((m) => normalize(m.seed.sourceType, m.seed.query)));

  const tags = new Map();
  for (const mine of verified) {
    for (const tag of mine.hashtags) {
      if (seedKeys.has(`hashtag:${tag.query}`)) continue;
      const acc = tags.get(tag.query) ?? { videoCount: 0, totalViews: 0, sampleCaption: "", topAvg: 0 };
      acc.videoCount += tag.videoCount;
      acc.totalViews += tag.videoCount * tag.avgViews;
      if (tag.sampleCaption && tag.avgViews > acc.topAvg) {
        acc.topAvg = tag.avgViews;
        acc.sampleCaption = tag.sampleCaption;
      }
      tags.set(tag.query, acc);
    }
  }
  const hashtags = [...tags.entries()]
    .map(([query, acc]) => ({
      sourceType: "hashtag",
      query,
      videoCount: acc.videoCount,
      avgViews: Math.round(acc.totalViews / acc.videoCount),
      sampleCaption: acc.sampleCaption,
    }))
    .sort((a, b) => b.videoCount - a.videoCount || b.avgViews - a.avgViews);

  const handles = new Map();
  for (const mine of verified) {
    for (const c of mine.creators) {
      if (seedKeys.has(`creator:${c.query}`)) continue;
      const acc = handles.get(c.query) ?? { videoCount: 0, views: [], followers: null, sampleCaption: "" };
      acc.videoCount += c.videoCount;
      acc.views.push(c.medianViews);
      acc.followers = Math.max(acc.followers ?? 0, c.followers ?? 0) || c.followers;
      if (!acc.sampleCaption) acc.sampleCaption = c.sampleCaption;
      handles.set(c.query, acc);
    }
  }
  const creators = [...handles.entries()]
    .map(([query, acc]) => {
      // Rounded midpoint for even counts — matches the backend's median()
      // exactly, so the screen and the MCP tool never disagree.
      const sorted = acc.views.sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const medianViews = sorted.length % 2 === 1
        ? sorted[mid]
        : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
      return {
        sourceType: "creator",
        query,
        videoCount: acc.videoCount,
        medianViews,
        followers: acc.followers,
        sampleCaption: acc.sampleCaption,
      };
    })
    .sort((a, b) => b.medianViews - a.medianViews || b.videoCount - a.videoCount);

  const soundMap = new Map();
  for (const mine of verified) {
    for (const sound of mine.sounds ?? []) {
      const acc = soundMap.get(sound.query) ?? { title: sound.title, author: sound.author, videoCount: 0, totalViews: 0 };
      acc.videoCount += sound.videoCount;
      acc.totalViews += sound.videoCount * sound.avgViews;
      if (sound.title && !acc.title) acc.title = sound.title;
      soundMap.set(sound.query, acc);
    }
  }
  const sounds = [...soundMap.entries()]
    .map(([query, acc]) => ({
      sourceType: "keyword",
      query: acc.title || query,
      videoCount: acc.videoCount,
      avgViews: Math.round(acc.totalViews / acc.videoCount),
      sampleCaption: acc.author ? `sound · ${acc.author}` : "sound",
      isSound: true,
    }))
    .sort((a, b) => b.videoCount - a.videoCount || b.avgViews - a.avgViews);

  return { hashtags, creators, sounds, totalSampled };
}

function evidenceFor(s, totalSampled) {
  // Probed seeds (any sourceType) carry their own probe stats — checked
  // FIRST, so a live #hashtag seed doesn't fall into the mined-hashtag
  // branch and print "Seen in undefined of N videos".
  if (s.sampleCount !== undefined) {
    return `Probed directly · ${s.sampleCount} videos found, top ${fmt(s.topViews)} views`;
  }
  if (s.isSound) {
    return `Heard in ${s.videoCount} of ${totalSampled} sampled videos · avg ${fmt(s.avgViews)} views`;
  }
  if (s.sourceType === "hashtag") {
    return `Seen in ${s.videoCount} of ${totalSampled} sampled videos · avg ${fmt(s.avgViews)} views`;
  }
  if (s.sourceType === "creator") {
    const followers = s.followers ? ` · ${fmt(s.followers)} followers` : "";
    return `${s.videoCount} sampled video${s.videoCount === 1 ? "" : "s"} · median ${fmt(s.medianViews)} views${followers}`;
  }
  return "";
}

function SuggestionCard({ suggestion, totalSampled, tracked, tracking, onTrack, onDismiss }) {
  const label = seedLabel(suggestion);
  return (
    <div className="rounded-lg p-4" style={{ border: `1px solid ${T.line}` }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div style={{ ...fB, fontSize: 14, fontWeight: 700 }}>{label}</div>
          <div style={{ ...fM, fontSize: 11, color: T.muted }}>{suggestion.sourceType}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => onTrack(suggestion)}
            disabled={tracked || tracking}
            className="shrink-0 rounded-md px-3 py-1.5"
            style={{
              ...fB, fontSize: 12, fontWeight: 600,
              background: tracked ? T.line : T.signal,
              color: tracked ? T.muted : "#fff",
              opacity: tracking ? 0.6 : 1,
            }}
          >
            {tracked ? "Tracked" : tracking ? "Tracking…" : "Track this"}
          </button>
          {!tracked && <IconButton icon={<CloseIcon />} label="Not interested" onClick={() => onDismiss(suggestion)} />}
        </div>
      </div>
      <p className="mt-2" style={{ ...fM, fontSize: 11, color: T.muted }}>{evidenceFor(suggestion, totalSampled)}</p>
      {suggestion.sampleCaption && (
        <p className="mt-1" style={{ ...fB, fontSize: 12, color: T.muted, fontStyle: "italic" }}>
          &ldquo;{suggestion.sampleCaption.length > 140 ? `${suggestion.sampleCaption.slice(0, 140)}…` : suggestion.sampleCaption}&rdquo;
        </p>
      )}
    </div>
  );
}

function SeedChip({ seed, result }) {
  // NOTE: no eager object literal here — "probing" means result is undefined,
  // and a { error: result.error } literal reads it anyway and crashes the
  // page the moment the first seed chip renders (before any probe resolves).
  const state = !result ? "probing" : result.error ? "error" : result.verified ? "live" : "dead";
  const note = state === "live" ? `${result.sampleCount} videos`
    : state === "probing" ? "Probing…"
    : state === "error" ? "failed"
    : "no content";
  return (
    <span
      className="rounded-full px-3 py-1.5 inline-flex items-center gap-2"
      style={{ border: `1px solid ${T.line}`, background: T.card }}
    >
      <span style={{ ...fB, fontSize: 12, fontWeight: 600, color: T.ink }}>{seedLabel(seed)}</span>
      {seed.alreadyTracked && <span style={{ ...fM, fontSize: 10, color: T.teal }}>tracked</span>}
      <span style={{ ...fM, fontSize: 10, color: state === "live" ? T.teal : T.muted }}>{note}</span>
    </span>
  );
}

export default function Discover() {
  const { user, loading: authLoading, accessToken } = useAuth();
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [input, setInput] = useState("");
  const [status, setStatus] = useState("idle"); // idle | expanding | probing | done | error
  const [seeds, setSeeds] = useState([]);
  const [results, setResults] = useState({}); // seedKey -> { seed, verified, sampleCount, topViews, hashtags, creators, error }
  const [errorMsg, setErrorMsg] = useState("");
  const [credits, setCredits] = useState({ charged: 0, remaining: null });
  const [dismissed, setDismissed] = useState(new Set()); // this session — mined tags come back fresh each run
  const [trackedHere, setTrackedHere] = useState(new Set()); // tracked without waiting for the list to revalidate
  const [trackingKey, setTrackingKey] = useState(null);

  // Tracked-source keys, for filtering suggestions the workspace already
  // tracks (the backend filters AI seeds this way too — this covers the mined
  // hashtags/creators, which no seed-level check can know).
  const sourcesQuery = useQuery({
    queryKey: ["sources", activeWorkspaceId],
    queryFn: ({ signal }) => listSources(accessToken, activeWorkspaceId, {}, signal),
    enabled: Boolean(accessToken && activeWorkspaceId) && !workspaceLoading,
  });
  const trackedKeys = useMemo(() => {
    const keys = new Set(trackedHere);
    for (const s of sourcesQuery.data ?? []) keys.add(normalize(s.sourceType, s.query));
    return keys;
  }, [sourcesQuery.data, trackedHere]);

  async function runDiscover(e) {
    e.preventDefault();
    const keywords = parseInput(input);
    if (keywords.length === 0 || status === "expanding" || status === "probing") return;

    setStatus("expanding");
    setErrorMsg("");
    setSeeds([]);
    setResults({});
    setCredits({ charged: 0, remaining: null });
    try {
      const expanded = await discoverSeeds(accessToken, activeWorkspaceId, keywords);
      setSeeds(expanded.seeds);
      setCredits((c) => ({ charged: c.charged + expanded.creditsCharged, remaining: expanded.creditsRemaining }));

      if (expanded.seeds.length === 0) {
        setStatus("done");
        return;
      }

      // One probe at a time. The connector queues each scrape and returns
      // immediately; we poll that job. Firing six POSTs at once used to
      // wedge D1 (concurrent Prisma on one Worker isolate) so chips never
      // resolved.
      setStatus("probing");
      for (const seed of expanded.seeds) {
        try {
          const r = await mineDiscoverSeedUntilDone(accessToken, activeWorkspaceId, seed);
          setCredits((c) => ({ charged: c.charged + r.creditsCharged, remaining: r.creditsRemaining }));
          setResults((prev) => ({
            ...prev,
            [normalize(seed.sourceType, seed.query)]: {
              seed,
              verified: r.verified,
              sampleCount: r.sampleCount,
              topViews: r.topViews,
              hashtags: r.hashtags,
              creators: r.creators,
              sounds: r.sounds ?? [],
              error: !r.ok ? r.error : undefined,
            },
          }));
        } catch (err) {
          setResults((prev) => ({
            ...prev,
            [normalize(seed.sourceType, seed.query)]: {
              seed, verified: false, sampleCount: 0, topViews: 0, hashtags: [], creators: [], sounds: [],
              error: err instanceof DiscoverApiError ? err.message : "Probe failed.",
            },
          }));
        }
      }
      setStatus((s) => (s === "probing" ? "done" : s));
    } catch (err) {
      setErrorMsg(err instanceof DiscoverApiError ? err.message : "Couldn't expand those keywords.");
      setStatus("error");
    }
  }

  async function trackSuggestion(s) {
    const key = normalize(s.sourceType, s.query);
    setTrackingKey(key);
    try {
      const source = await createSource(accessToken, activeWorkspaceId, {
        platform: "tiktok",
        sourceType: s.sourceType,
        query: s.query,
        videoLimit: 20,
      });
      setTrackedHere((prev) => new Set(prev).add(key));
      showToast(`Now tracking ${seedLabel(s)} — first scrape queued.`, { type: "success" });
      // Same shape as the Sources page: creating is free, the first scrape is
      // a queued refresh fired without blocking the button.
      refreshSource(accessToken, activeWorkspaceId, source.id)
        .then(() => queryClient.invalidateQueries({ queryKey: ["sources", activeWorkspaceId] }))
        .catch(() => {
          showToast(`The first scrape for ${seedLabel(s)} didn't start — use Refresh on the Sources page.`, { type: "error" });
        });
    } catch (err) {
      showToast(err instanceof SourcesApiError ? err.message : "Couldn't track this source.", { type: "error" });
    } finally {
      setTrackingKey(null);
    }
  }

  function dismissSuggestion(s) {
    const key = normalize(s.sourceType, s.query);
    setDismissed((prev) => new Set(prev).add(key));
    // Server-side record too — future suggest_sources runs (and AI seed
    // expansion) won't re-propose it. Mined tags aren't AI-seeded, so for
    // those this dismissal lives in the session set above.
    dismissSuggestedSource(accessToken, activeWorkspaceId, s).catch(() => {});
  }

  const mines = useMemo(() => Object.values(results), [results]);
  const { hashtags, creators, sounds, totalSampled } = useMemo(() => aggregate(mines), [mines]);

  // Dismissed cards vanish; tracked ones stay put showing "Tracked" — seeing
  // what you just acted on beats it silently disappearing.
  const visible = (list) => list.filter((s) => !dismissed.has(normalize(s.sourceType, s.query)));
  // Seeds the user typed (or AI proposed) that actually have content — the
  // most literal "track what you searched for" suggestion.
  const liveSeeds = mines
    .filter((m) => m.verified && !m.seed.alreadyTracked)
    .map((m) => ({ sourceType: m.seed.sourceType, query: m.seed.query, sampleCount: m.sampleCount, topViews: m.topViews }));
  const seedSuggestions = visible(liveSeeds);
  const hashtagSuggestions = visible(hashtags);
  const creatorSuggestions = visible(creators);
  const soundSuggestions = visible(sounds);
  const probingCount = seeds.length - mines.length;
  const anySuggestions = seedSuggestions.length + hashtagSuggestions.length + creatorSuggestions.length + soundSuggestions.length > 0;

  if (authLoading) {
    return (
      <section className="max-w-4xl mx-auto px-5 py-16">
        <SectionLabel>DISCOVER</SectionLabel>
        <h1 className="mt-3" style={{ ...fD, fontWeight: 900, fontSize: 32, letterSpacing: -0.8 }}>Find sources to track</h1>
        <div className="mt-8 flex flex-col gap-2">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} style={{ height: 64 }} />)}
        </div>
      </section>
    );
  }
  if (!user) return <Navigate to="/login?next=/discover" replace />;

  return (
    <section className="max-w-4xl mx-auto px-5 py-16">
      <SectionLabel>DISCOVER</SectionLabel>
      <h1 className="mt-3" style={{ ...fD, fontWeight: 900, fontSize: 32, letterSpacing: -0.8 }}>
        Find sources to track
      </h1>

      <div className="mt-6">
        <WorkspaceSwitcher />
      </div>

      <form onSubmit={runDiscover} className="mt-8 rounded-xl p-6" style={{ background: T.card, border: `1px solid ${T.line}` }}>
        {/* First-run strip — the wizard collapsed to one sentence per step,
            taught by doing instead of a modal tour. Only for workspaces that
            track nothing and haven't searched yet. */}
        {status === "idle" && sourcesQuery.isSuccess && (sourcesQuery.data ?? []).length === 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg px-3 py-2.5" style={{ background: "#F9F7FF", border: `1px dashed #7C5CFF` }} data-testid="first-run-steps">
            <span style={{ ...fB, fontSize: 12, fontWeight: 700, color: "#7C5CFF" }}>Start here</span>
            <span style={{ ...fB, fontSize: 12, color: T.ink }}>① Describe your niche below</span>
            <span style={{ ...fB, fontSize: 12, color: T.ink }}>② Track 2–3 of the suggestions — your free allowance</span>
            <span style={{ ...fB, fontSize: 12, color: T.ink }}>③ Watch your outliers land in the Gallery</span>
          </div>
        )}
        <div style={{ ...fM, fontSize: 11, letterSpacing: 2, color: T.muted }}>DESCRIBE YOUR NICHE</div>
        {activeWorkspaceId ? (
          <>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={"home sauna, #saunatok, @coldplungequeen…"}
              rows={2}
              className="mt-3 w-full"
              style={{ ...fB, fontSize: 13, padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.line}`, background: T.card, resize: "vertical" }}
            />
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p style={{ ...fM, fontSize: 11, color: T.muted, lineHeight: 1.6 }}>
                Separate terms with commas or newlines — #hashtags and @handles work too (up to {MAX_INPUTS}).<br />
                AI expansion 3 credits + ~1.5 credits per sampled video; empty probes are refunded.
              </p>
              <button
                type="submit"
                disabled={status === "expanding" || status === "probing"}
                className="shrink-0 rounded-md px-3 py-1.5 self-start"
                style={{
                  ...fB, fontSize: 13, fontWeight: 600,
                  background: T.signal, color: "#fff",
                  opacity: status === "expanding" || status === "probing" ? 0.6 : 1,
                }}
              >
                {status === "expanding" ? "Thinking…" : status === "probing" ? `Probing${probingCount > 0 ? ` ${probingCount}` : ""}…` : "Discover sources"}
              </button>
            </div>
          </>
        ) : (
          <p className="mt-2" style={{ fontSize: 13, color: T.muted }}>
            {workspaceLoading ? "Loading workspaces…" : "Create a workspace above first."}
          </p>
        )}
      </form>

      {status === "error" && (
        <div className="mt-4"><AlertBanner>{errorMsg}</AlertBanner></div>
      )}

      {(status === "probing" || status === "done") && seeds.length > 0 && (
        <div className="mt-6">
          <div style={{ ...fM, fontSize: 11, letterSpacing: 2, color: T.muted }}>
            SEEDS{status === "probing" ? ` — ${probingCount} still probing` : ""}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {seeds.map((seed) => (
              <SeedChip key={normalize(seed.sourceType, seed.query)} seed={seed} result={results[normalize(seed.sourceType, seed.query)]} />
            ))}
          </div>
        </div>
      )}

      {(status === "probing" || status === "done") && (
        <div className="mt-8 flex flex-col gap-8">
          {/* The activation loop's exit: something tracked -> the feed is
              filling and the Gallery is where the outliers land. Shown for
              the rest of the session once the first track happens. */}
          {trackedHere.size > 0 && (
            <div
              className="flex flex-col gap-3 rounded-lg px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              style={{ background: "#FFF8EF", border: `1px solid ${T.line}` }}
              data-testid="feed-populating"
            >
              <p style={{ ...fB, fontSize: 13, color: T.ink, margin: 0 }}>
                Your feed is populating — outliers usually land within minutes of the first scrape.
              </p>
              <Link
                to="/gallery"
                className="shrink-0 rounded-md px-3 py-1.5 font-semibold text-center transition-transform hover:-translate-y-0.5"
                style={{ ...fB, fontSize: 12.5, background: T.signal, color: "#fff" }}
                data-testid="open-gallery-cta"
              >
                Open the Gallery →
              </Link>
            </div>
          )}
          {!anySuggestions && status === "done" && (
            <p style={{ ...fB, fontSize: 13, color: T.muted }}>
              Nothing trackable found — every seed came back empty. Try broader or different terms.
            </p>
          )}
          {seedSuggestions.length > 0 && (
            <div>
              <div style={{ ...fM, fontSize: 11, letterSpacing: 2, color: T.muted }}>PROBED SEEDS — LIVE</div>
              <div className="mt-3 grid gap-3">
                {seedSuggestions.map((s) => (
                  <SuggestionCard
                    key={normalize(s.sourceType, s.query)}
                    suggestion={s}
                    totalSampled={totalSampled}
                    tracked={trackedKeys.has(normalize(s.sourceType, s.query))}
                    tracking={trackingKey === normalize(s.sourceType, s.query)}
                    onTrack={trackSuggestion}
                    onDismiss={dismissSuggestion}
                  />
                ))}
              </div>
            </div>
          )}
          {hashtagSuggestions.length > 0 && (
            <div>
              <div style={{ ...fM, fontSize: 11, letterSpacing: 2, color: T.muted }}>HASHTAGS MINED FROM SAMPLES</div>
              <div className="mt-3 grid gap-3">
                {hashtagSuggestions.map((s) => (
                  <SuggestionCard
                    key={normalize(s.sourceType, s.query)}
                    suggestion={s}
                    totalSampled={totalSampled}
                    tracked={trackedKeys.has(normalize(s.sourceType, s.query))}
                    tracking={trackingKey === normalize(s.sourceType, s.query)}
                    onTrack={trackSuggestion}
                    onDismiss={dismissSuggestion}
                  />
                ))}
              </div>
            </div>
          )}
          {soundSuggestions.length > 0 && (
            <div>
              <div style={{ ...fM, fontSize: 11, letterSpacing: 2, color: T.muted }}>SOUNDS MINED FROM SAMPLES</div>
              <div className="mt-3 grid gap-3">
                {soundSuggestions.map((s) => (
                  <SuggestionCard
                    key={`sound:${s.query}`}
                    suggestion={s}
                    totalSampled={totalSampled}
                    tracked={trackedKeys.has(normalize(s.sourceType, s.query))}
                    tracking={trackingKey === normalize(s.sourceType, s.query)}
                    onTrack={trackSuggestion}
                    onDismiss={dismissSuggestion}
                  />
                ))}
              </div>
            </div>
          )}
          {creatorSuggestions.length > 0 && (
            <div>
              <div style={{ ...fM, fontSize: 11, letterSpacing: 2, color: T.muted }}>CREATORS MINED FROM SAMPLES</div>
              <div className="mt-3 grid gap-3">
                {creatorSuggestions.map((s) => (
                  <SuggestionCard
                    key={normalize(s.sourceType, s.query)}
                    suggestion={s}
                    totalSampled={totalSampled}
                    tracked={trackedKeys.has(normalize(s.sourceType, s.query))}
                    tracking={trackingKey === normalize(s.sourceType, s.query)}
                    onTrack={trackSuggestion}
                    onDismiss={dismissSuggestion}
                  />
                ))}
              </div>
            </div>
          )}
          {status === "done" && credits.remaining != null && (
            <p style={{ ...fM, fontSize: 11, color: T.muted }}>
              {credits.charged} credit{credits.charged === 1 ? "" : "s"} charged · {credits.remaining} remaining
            </p>
          )}
        </div>
      )}
    </section>
  );
}
