import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { T, fD, fB, fM, fmt } from "../lib/theme.js";
import { SectionLabel, AlertBanner, Skeleton } from "../components/ui.jsx";
import WorkspaceSwitcher from "../components/WorkspaceSwitcher.jsx";
import { useAuth } from "../lib/auth.jsx";
import { useWorkspace } from "../lib/workspace.jsx";
import { useToast } from "../lib/toast.jsx";
import { listPosts, logPost, getWeeklyRetro, getBenchmark, StudioApiError } from "../lib/studio.js";
import { listSources, updateSource, SourcesApiError } from "../lib/sources.js";

const inputStyle = { ...fB, fontSize: 13, padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.line}`, background: T.card };

export default function Studio() {
  const { user, loading: authLoading, accessToken } = useAuth();
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [url, setUrl] = useState("");
  const [hookVariation, setHookVariation] = useState("");
  const [notes, setNotes] = useState("");

  const enabled = Boolean(accessToken && activeWorkspaceId);
  const retroQuery = useQuery({
    queryKey: ["studio-retro", activeWorkspaceId],
    queryFn: ({ signal }) => getWeeklyRetro(accessToken, activeWorkspaceId, signal),
    enabled,
  });
  const postsQuery = useQuery({
    queryKey: ["studio-posts", activeWorkspaceId],
    queryFn: ({ signal }) => listPosts(accessToken, activeWorkspaceId, signal),
    enabled,
  });
  const benchQuery = useQuery({
    queryKey: ["studio-bench", activeWorkspaceId],
    queryFn: ({ signal }) => getBenchmark(accessToken, activeWorkspaceId, signal),
    enabled,
  });
  const sourcesQuery = useQuery({
    queryKey: ["sources", activeWorkspaceId],
    queryFn: ({ signal }) => listSources(accessToken, activeWorkspaceId, {}, signal),
    enabled,
  });

  const logMutation = useMutation({
    mutationFn: () => logPost(accessToken, activeWorkspaceId, { url: url.trim(), hookVariation, notes }),
    onSuccess: () => {
      setUrl("");
      setHookVariation("");
      setNotes("");
      showToast("Post logged.", { type: "success" });
      queryClient.invalidateQueries({ queryKey: ["studio-posts", activeWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ["studio-retro", activeWorkspaceId] });
    },
    onError: (err) => {
      showToast(err instanceof StudioApiError ? err.message : "Couldn't log that post.", { type: "error" });
    },
  });

  async function markCompetitor(source, next) {
    try {
      await updateSource(accessToken, activeWorkspaceId, source.id, { isCompetitor: next, isSelf: next ? false : source.isSelf });
      queryClient.invalidateQueries({ queryKey: ["sources", activeWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ["studio-bench", activeWorkspaceId] });
    } catch (err) {
      showToast(err instanceof SourcesApiError ? err.message : "Couldn't update source.", { type: "error" });
    }
  }

  if (authLoading) {
    return (
      <section className="max-w-5xl mx-auto px-5 py-16">
        <SectionLabel>STUDIO</SectionLabel>
        <h1 className="mt-3" style={{ ...fD, fontWeight: 900, fontSize: 32, letterSpacing: -0.8 }}>Studio</h1>
        <div className="mt-8"><Skeleton style={{ height: 120, width: "100%" }} /></div>
      </section>
    );
  }
  if (!user) return <Navigate to="/login?next=/studio" replace />;

  const retro = retroQuery.data;
  const posts = postsQuery.data?.posts ?? [];
  const bench = benchQuery.data;
  const creators = (sourcesQuery.data ?? []).filter((s) => s.sourceType === "creator");

  return (
    <section className="max-w-5xl mx-auto px-5 py-16">
      <SectionLabel>STUDIO</SectionLabel>
      <h1 className="mt-3" style={{ ...fD, fontWeight: 900, fontSize: 32, letterSpacing: -0.8 }}>
        You vs the niche
      </h1>
      <p className="mt-2" style={{ ...fB, fontSize: 14, color: T.muted }}>
        Log what you posted, see this week’s retro, compare cadence to competitors.
      </p>

      <div className="mt-6"><WorkspaceSwitcher /></div>

      {!activeWorkspaceId && !workspaceLoading && (
        <p className="mt-8" style={{ ...fB, fontSize: 14, color: T.muted }}>Create a workspace above first.</p>
      )}

      {activeWorkspaceId && (
        <>
          <div className="mt-8 rounded-xl p-6" style={{ background: T.card, border: `1px solid ${T.line}` }}>
            <div style={{ ...fM, fontSize: 11, letterSpacing: 2, color: T.muted }}>THIS WEEK</div>
            {retroQuery.isError ? (
              <div className="mt-3"><AlertBanner>{retroQuery.error?.message || "Couldn't load retro."}</AlertBanner></div>
            ) : retroQuery.isPending ? (
              <Skeleton className="mt-3" style={{ height: 48, width: "80%" }} />
            ) : (
              <>
                <p className="mt-3" style={{ ...fB, fontSize: 16, fontWeight: 600, color: T.ink, margin: 0 }}>{retro.headline}</p>
                <p className="mt-2" style={{ ...fM, fontSize: 12, color: T.muted }}>
                  {retro.logged} logged · {retro.matched} matched
                  {retro.medianViews != null ? ` · your median ${fmt(Math.round(retro.medianViews))} views` : ""}
                  {retro.selfHandle ? ` · @${retro.selfHandle}` : ""}
                </p>
                {retro.rows?.length > 0 && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr style={{ ...fM, fontSize: 11, color: T.muted }}>
                          <th className="pb-2 font-normal">Posted</th>
                          <th className="pb-2 font-normal">Hook</th>
                          <th className="pb-2 font-normal">Views</th>
                          <th className="pb-2 font-normal">vs you</th>
                        </tr>
                      </thead>
                      <tbody>
                        {retro.rows.map((r) => (
                          <tr key={r.id} style={{ borderTop: `1px solid ${T.line}` }}>
                            <td className="py-2 pr-3" style={{ ...fB, fontSize: 13 }}>
                              <a href={r.url} target="_blank" rel="noreferrer" style={{ color: T.teal }}>{new Date(r.postedAt).toLocaleDateString()}</a>
                            </td>
                            <td className="py-2 pr-3" style={{ ...fB, fontSize: 13 }}>{r.hookVariation || "—"}</td>
                            <td className="py-2 pr-3" style={{ ...fB, fontSize: 13 }}>{r.views != null ? fmt(r.views) : r.matched ? "0" : "unmatched"}</td>
                            <td className="py-2" style={{ ...fB, fontSize: 13, color: r.vsMedian >= 1 ? T.teal : T.muted }}>
                              {r.vsMedian != null ? `${r.vsMedian.toFixed(1)}×` : "—"}
                              {r.remakeOf ? ` · @${r.remakeOf}` : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mt-8 rounded-xl p-6" style={{ background: T.card, border: `1px solid ${T.line}` }}>
            <div style={{ ...fM, fontSize: 11, letterSpacing: 2, color: T.muted }}>WATCHLIST</div>
            {benchQuery.isPending ? (
              <Skeleton className="mt-3" style={{ height: 80, width: "100%" }} />
            ) : benchQuery.isError ? (
              <div className="mt-3"><AlertBanner>{benchQuery.error?.message || "Couldn't load benchmark."}</AlertBanner></div>
            ) : (
              <>
                <p className="mt-3" style={{ ...fB, fontSize: 15, fontWeight: 600, margin: 0 }}>{bench.headline}</p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr style={{ ...fM, fontSize: 11, color: T.muted }}>
                        <th className="pb-2 font-normal">Creator</th>
                        <th className="pb-2 font-normal">7d posts</th>
                        <th className="pb-2 font-normal">30d</th>
                        <th className="pb-2 font-normal">Median views</th>
                        <th className="pb-2 font-normal">Median outlier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[bench.you, ...(bench.competitors ?? [])].filter(Boolean).map((c) => (
                        <tr key={c.sourceId} style={{ borderTop: `1px solid ${T.line}` }}>
                          <td className="py-2 pr-3" style={{ ...fB, fontSize: 13 }}>
                            @{c.handle}
                            {c.role === "you" && <span className="ml-2 rounded px-1.5 py-0.5" style={{ ...fM, fontSize: 10, fontWeight: 700, color: T.teal, background: "#EAF6F4" }}>You</span>}
                            {c.role === "competitor" && <span className="ml-2 rounded px-1.5 py-0.5" style={{ ...fM, fontSize: 10, fontWeight: 700, color: T.signal, background: "#FFF0E8" }}>Rival</span>}
                          </td>
                          <td className="py-2 pr-3" style={{ ...fB, fontSize: 13 }}>{c.postsLast7d}</td>
                          <td className="py-2 pr-3" style={{ ...fB, fontSize: 13 }}>{c.postsLast30d}</td>
                          <td className="py-2 pr-3" style={{ ...fB, fontSize: 13 }}>{fmt(c.medianViews)}</td>
                          <td className="py-2" style={{ ...fB, fontSize: 13 }}>{c.medianOutlier != null ? `${c.medianOutlier}×` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {creators.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {creators.filter((s) => !s.isSelf).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => markCompetitor(s, !s.isCompetitor)}
                    className="rounded-full px-3 py-1"
                    style={{
                      ...fM, fontSize: 11, fontWeight: 600,
                      color: s.isCompetitor ? T.signal : T.muted,
                      background: s.isCompetitor ? "#FFF0E8" : T.paper,
                      border: `1px solid ${s.isCompetitor ? T.signal : T.line}`,
                    }}
                  >
                    @{s.query.replace(/^@+/, "")} {s.isCompetitor ? "· rival" : "· mark rival"}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form
            className="mt-8 rounded-xl p-6"
            style={{ background: T.card, border: `1px solid ${T.line}` }}
            onSubmit={(e) => { e.preventDefault(); if (url.trim()) logMutation.mutate(); }}
          >
            <div style={{ ...fM, fontSize: 11, letterSpacing: 2, color: T.muted }}>LOG A POST</div>
            <label className="mt-3 flex flex-col gap-1">
              <span style={{ ...fM, fontSize: 11, color: T.muted }}>TIKTOK URL</span>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.tiktok.com/@you/video/…" style={inputStyle} />
            </label>
            <label className="mt-3 flex flex-col gap-1">
              <span style={{ ...fM, fontSize: 11, color: T.muted }}>HOOK VARIATION</span>
              <input value={hookVariation} onChange={(e) => setHookVariation(e.target.value)} placeholder="POV I built this in a weekend" style={inputStyle} />
            </label>
            <label className="mt-3 flex flex-col gap-1">
              <span style={{ ...fM, fontSize: 11, color: T.muted }}>NOTES</span>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" style={inputStyle} />
            </label>
            <button
              type="submit"
              disabled={logMutation.isPending || !url.trim()}
              className="mt-4 rounded-md px-4 py-2"
              style={{ ...fB, fontSize: 13, fontWeight: 600, background: T.signal, color: "#fff", opacity: logMutation.isPending || !url.trim() ? 0.6 : 1 }}
            >
              {logMutation.isPending ? "Saving…" : "Log post"}
            </button>
          </form>

          {posts.length > 0 && (
            <div className="mt-8">
              <div style={{ ...fM, fontSize: 11, letterSpacing: 2, color: T.muted }}>LOGGED</div>
              <ul className="mt-3 flex flex-col gap-2">
                {posts.map((p) => (
                  <li key={p.id} className="rounded-lg px-4 py-3" style={{ border: `1px solid ${T.line}`, background: T.card }}>
                    <a href={p.url} target="_blank" rel="noreferrer" style={{ ...fB, fontSize: 13, color: T.ink }}>{p.hookVariation || p.url}</a>
                    <div style={{ ...fM, fontSize: 11, color: T.muted }}>
                      {new Date(p.postedAt).toLocaleString()}
                      {p.views != null ? ` · ${fmt(p.views)} views` : ""}
                      {p.remakeOf ? ` · remake of @${p.remakeOf.creatorHandle}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
