import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { T, fD, fB, fM, fmt } from "../lib/theme.js";
import { SectionLabel, AlertBanner, Skeleton } from "../components/ui.jsx";
import WorkspaceSwitcher from "../components/WorkspaceSwitcher.jsx";
import { useAuth } from "../lib/auth.jsx";
import { useWorkspace } from "../lib/workspace.jsx";
import { useToast } from "../lib/toast.jsx";
import { getWeeklyRetro, getBenchmark, StudioApiError } from "../lib/studio.js";
import { refreshSource, SourcesApiError } from "../lib/sources.js";

export default function Studio() {
  const { user, loading: authLoading, accessToken } = useAuth();
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const enabled = Boolean(accessToken && activeWorkspaceId);
  const retroQuery = useQuery({
    queryKey: ["studio-retro", activeWorkspaceId],
    queryFn: ({ signal }) => getWeeklyRetro(accessToken, activeWorkspaceId, signal),
    enabled,
  });
  const benchQuery = useQuery({
    queryKey: ["studio-bench", activeWorkspaceId],
    queryFn: ({ signal }) => getBenchmark(accessToken, activeWorkspaceId, signal),
    enabled,
  });

  // The only write Studio offers: pull the self source's feed again. There is
  // no post log to type into — an empty retro is either "track your account"
  // or "resync it", both resolved by the tracker itself.
  const resyncMutation = useMutation({
    mutationFn: () => refreshSource(accessToken, activeWorkspaceId, retro.selfSourceId),
    onSuccess: () => {
      showToast("Resync queued — new posts will land in the retro when it finishes.", { type: "success" });
      queryClient.invalidateQueries({ queryKey: ["studio-retro", activeWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ["sources", activeWorkspaceId] });
    },
    onError: (err) => {
      showToast(err instanceof SourcesApiError ? err.message : "Couldn't queue the resync.", { type: "error" });
    },
  });

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
  const bench = benchQuery.data;

  return (
    <section className="max-w-5xl mx-auto px-5 py-16">
      <SectionLabel>STUDIO</SectionLabel>
      <h1 className="mt-3" style={{ ...fD, fontWeight: 900, fontSize: 32, letterSpacing: -0.8 }}>
        Your week
      </h1>
      <p className="mt-2" style={{ ...fB, fontSize: 14, color: T.muted }}>
        Read straight off your tracked feed — nothing to log by hand. Resync your account and Studio keeps score.
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
            ) : retro.needsAccount ? (
              <>
                <p className="mt-3" style={{ ...fB, fontSize: 15, color: T.muted, margin: 0 }}>{retro.headline}</p>
                <a
                  href="/sources"
                  className="mt-4 inline-block rounded-md px-4 py-2"
                  style={{ ...fB, fontSize: 13, fontWeight: 600, background: T.signal, color: "#fff" }}
                >
                  Go to Sources
                </a>
              </>
            ) : (
              <>
                <p className="mt-3" style={{ ...fB, fontSize: 16, fontWeight: 600, color: T.ink, margin: 0 }}>{retro.headline}</p>
                <p className="mt-2" style={{ ...fM, fontSize: 12, color: T.muted }}>
                  {retro.rows?.length ?? 0} this week
                  {retro.medianViews != null ? ` · your median ${fmt(Math.round(retro.medianViews))} views` : ""}
                  {retro.selfHandle ? ` · @${retro.selfHandle}` : ""}
                  {retro.needsResync && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        onClick={() => resyncMutation.mutate()}
                        disabled={resyncMutation.isPending}
                        style={{ ...fM, fontSize: 12, fontWeight: 700, color: T.teal, textDecoration: "underline", opacity: resyncMutation.isPending ? 0.6 : 1 }}
                      >
                        {resyncMutation.isPending ? "Queuing…" : "Resync your account"}
                      </button>
                    </>
                  )}
                </p>
                {retro.rows?.length > 0 && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr style={{ ...fM, fontSize: 11, color: T.muted }}>
                          <th className="pb-2 font-normal">Posted</th>
                          <th className="pb-2 font-normal">Caption</th>
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
                            <td className="py-2 pr-3" style={{ ...fB, fontSize: 13 }}>{r.caption || "—"}</td>
                            <td className="py-2 pr-3" style={{ ...fB, fontSize: 13 }}>{fmt(r.views)}</td>
                            <td className="py-2" style={{ ...fB, fontSize: 13, color: r.vsMedian >= 1 ? T.teal : T.muted }}>
                              {r.vsMedian != null ? `${r.vsMedian.toFixed(1)}×` : "—"}
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
            <div style={{ ...fM, fontSize: 11, letterSpacing: 2, color: T.muted }}>YOU VS THE NICHE</div>
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
                      {[bench.you, ...(bench.creators ?? [])].filter(Boolean).map((c) => (
                        <tr key={c.sourceId} style={{ borderTop: `1px solid ${T.line}` }}>
                          <td className="py-2 pr-3" style={{ ...fB, fontSize: 13 }}>
                            @{c.handle}
                            {c.role === "you" && <span className="ml-2 rounded px-1.5 py-0.5" style={{ ...fM, fontSize: 10, fontWeight: 700, color: T.teal, background: "#EAF6F4" }}>You</span>}
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
          </div>
        </>
      )}
    </section>
  );
}
