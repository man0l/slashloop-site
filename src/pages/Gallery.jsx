import { useEffect, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { T, fD, fB, fM, fmt } from "../lib/theme.js";
import { SectionLabel, AlertBanner, Skeleton, Spinner } from "../components/ui.jsx";
import WorkspaceSwitcher from "../components/WorkspaceSwitcher.jsx";
import { useAuth } from "../lib/auth.jsx";
import { useWorkspace } from "../lib/workspace.jsx";
import { listSources } from "../lib/sources.js";
import { getGallery } from "../lib/gallery.js";
import GalleryCard from "../components/GalleryCard.jsx";

const selectStyle = { ...fB, fontSize: 13, padding: "7px 9px", borderRadius: 8, border: `1px solid ${T.line}`, background: T.card };
const PAGE_SIZE = 24;

const SORT_OPTIONS = [
  { value: "outlier_score", label: "Outlier score" },
  { value: "views", label: "Most views" },
  { value: "newest", label: "Newest" },
];

function GallerySkeletonGrid() {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="rounded-lg" style={{ border: `1px solid ${T.line}`, background: T.card }}>
          <Skeleton style={{ aspectRatio: "9/16", width: "100%", borderRadius: "8px 8px 0 0" }} />
          <div className="flex flex-col gap-2 p-3">
            <Skeleton style={{ height: 12, width: "60%" }} />
            <Skeleton style={{ height: 14, width: "90%" }} />
            <Skeleton style={{ height: 14, width: "40%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Gallery() {
  const { user, loading: authLoading, accessToken } = useAuth();
  const { activeWorkspaceId, setActiveWorkspaceId } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  // Seeded from ?sourceId= so a Sources-page row can deep-link straight into
  // its own gallery; kept in sync with the URL as the filter changes.
  const [sourceId, setSourceId] = useState(() => searchParams.get("sourceId") || "");
  // ?video=<id> — deep link from the digest email: filter the gallery down
  // to exactly that video (not highlight-in-crowd; the email talked about
  // one outlier, the landing view shows one outlier). Kept in the URL like
  // sourceId so a refresh or share preserves it; "Show all" clears it.
  const [videoFilter, setVideoFilter] = useState(() => searchParams.get("video") || "");
  const [sortBy, setSortBy] = useState("outlier_score");
  const [minOutlier, setMinOutlier] = useState(0);
  const [minViews, setMinViews] = useState(0);
  const [analyzedBy, setAnalyzedBy] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  // The filter-select options; shared with the Sources page via the
  // ['sources', workspaceId] cache, so navigating between the two doesn't
  // refetch it.
  const sourcesQuery = useQuery({
    queryKey: ["sources", activeWorkspaceId],
    queryFn: ({ signal }) => listSources(accessToken, activeWorkspaceId, {}, signal),
    enabled: Boolean(accessToken && activeWorkspaceId),
  });
  const sources = sourcesQuery.data ?? [];

  const filters = { sourceId: sourceId || undefined, videoId: videoFilter || undefined, sortBy, minOutlier, minViews, analyzedBy: analyzedBy || undefined };

  const galleryQuery = useQuery({
    queryKey: ["gallery", activeWorkspaceId, filters, limit],
    queryFn: ({ signal }) => getGallery(accessToken, { workspaceId: activeWorkspaceId, ...filters, limit }, signal),
    enabled: Boolean(accessToken && activeWorkspaceId),
    // Filter/sort/page changes keep the previous cards on screen (dimmed)
    // while the new results load; switching workspaces does NOT — showing
    // workspace A's videos under workspace B's header reads as a bug.
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey[1] === activeWorkspaceId ? prev : undefined,
  });

  // ?workspace=<id> — the digest link is self-contained: switch to the
  // owning workspace before the filtered view loads. One-shot; ownership is
  // still enforced server-side by /api/gallery-data (requireOwnedWorkspace).
  const appliedWorkspaceLink = useRef(false);
  useEffect(() => {
    if (appliedWorkspaceLink.current) return;
    const ws = searchParams.get("workspace");
    if (!ws) return;
    appliedWorkspaceLink.current = true;
    if (ws !== activeWorkspaceId) setActiveWorkspaceId(ws);
    const next = new URLSearchParams(searchParams);
    next.delete("workspace");
    setSearchParams(next, { replace: true });
  }, [searchParams, activeWorkspaceId, setActiveWorkspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  function syncUrl({ sourceId: sid, video }) {
    const params = {};
    if (sid) params.sourceId = sid;
    if (video) params.video = video;
    setSearchParams(params, { replace: true });
  }

  function updateVideoFilter(id) {
    setVideoFilter(id);
    setLimit(PAGE_SIZE);
    syncUrl({ sourceId, video: id });
  }

  function updateSourceId(id) {
    setSourceId(id);
    setLimit(PAGE_SIZE);
    syncUrl({ sourceId: id, video: videoFilter });
  }

  function updateFilter(setter) {
    return (value) => {
      setter(value);
      setLimit(PAGE_SIZE);
    };
  }

  if (authLoading) {
    // Keep the shell mounted — a blank page while auth resolves is what made
    // this page feel blocking. The heading and filters render immediately;
    // only the data region waits.
    return (
      <section className="max-w-6xl mx-auto px-5 py-16">
        <SectionLabel>GALLERY</SectionLabel>
        <h1 className="mt-3" style={{ ...fD, fontWeight: 900, fontSize: 32, letterSpacing: -0.8 }}>
          Outlier gallery
        </h1>
        <div className="mt-6"><Skeleton style={{ height: 38, width: 260 }} /></div>
        <div className="mt-14"><GallerySkeletonGrid /></div>
      </section>
    );
  }
  if (!user) return <Navigate to="/login?next=/gallery" replace />;

  const result = galleryQuery.data;
  const cards = result?.cards ?? [];
  const busy = galleryQuery.isFetching || sourcesQuery.isFetching;
  const dimmed = galleryQuery.isPlaceholderData || (galleryQuery.isFetching && cards.length > 0);

  return (
    <section className="max-w-6xl mx-auto px-5 py-16">
      <SectionLabel>GALLERY</SectionLabel>
      <h1 className="mt-3" style={{ ...fD, fontWeight: 900, fontSize: 32, letterSpacing: -0.8 }}>
        Outlier gallery
      </h1>

      <div className="mt-6">
        <WorkspaceSwitcher />
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span style={{ ...fM, fontSize: 11, color: T.muted }}>SOURCE</span>
          <select value={sourceId} onChange={(e) => updateSourceId(e.target.value)} style={selectStyle}>
            <option value="">All sources</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.query}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ ...fM, fontSize: 11, color: T.muted }}>SORT</span>
          <select value={sortBy} onChange={(e) => updateFilter(setSortBy)(e.target.value)} style={selectStyle}>
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ ...fM, fontSize: 11, color: T.muted }}>MIN OUTLIER</span>
          <select value={minOutlier} onChange={(e) => updateFilter(setMinOutlier)(Number(e.target.value))} style={selectStyle}>
            {[0, 2, 5, 10, 25, 50, 100].map((v) => <option key={v} value={v}>{v === 0 ? "Any" : `≥ ${v}×`}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ ...fM, fontSize: 11, color: T.muted }}>MIN VIEWS</span>
          <select value={minViews} onChange={(e) => updateFilter(setMinViews)(Number(e.target.value))} style={selectStyle}>
            {[0, 10000, 100000, 1000000, 10000000].map((v) => <option key={v} value={v}>{v === 0 ? "Any" : `≥ ${fmt(v)}`}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ ...fM, fontSize: 11, color: T.muted }}>ANALYZED BY</span>
          <select value={analyzedBy} onChange={(e) => updateFilter(setAnalyzedBy)(e.target.value)} style={selectStyle}>
            <option value="">Any</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </label>
        {busy && (
          <span className="self-center px-1" title="Loading…" aria-label="Loading">
            <Spinner />
          </span>
        )}
      </div>

      {videoFilter && (
        <div className="mt-4 flex items-center gap-3" data-testid="video-filter-chip">
          <span style={{ ...fM, fontSize: 12, color: T.muted }}>
            Showing the video from your digest email
          </span>
          <button
            type="button"
            onClick={() => updateVideoFilter("")}
            className="rounded-md px-2 py-1"
            style={{ ...fB, fontSize: 12, fontWeight: 600, color: "#FF4D00", textDecoration: "underline" }}
          >
            Show all videos
          </button>
        </div>
      )}

      <div className="mt-8">
        {galleryQuery.isError ? (
          <AlertBanner
            action={
              <button
                type="button"
                onClick={() => galleryQuery.refetch()}
                className="shrink-0 rounded-md px-2 py-1"
                style={{ ...fB, fontSize: 12, fontWeight: 600, color: "#7A1F17", textDecoration: "underline" }}
              >
                Retry
              </button>
            }
          >
            {galleryQuery.error?.message || "Couldn't load gallery."}
          </AlertBanner>
        ) : !activeWorkspaceId ? (
          <p style={{ fontSize: 14, color: T.muted }}>Create a workspace above first.</p>
        ) : galleryQuery.isPending ? (
          <GallerySkeletonGrid />
        ) : cards.length === 0 ? (
          <p style={{ fontSize: 14, color: T.muted }}>{result.note || "No videos match these filters."}</p>
        ) : (
          <>
            <div
              className={`grid gap-4 transition-opacity duration-150 ${dimmed ? "opacity-60" : "opacity-100"}`}
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
              aria-busy={dimmed}
            >
              {cards.map((c, i) => (
                <GalleryCard
                  key={c.id}
                  card={c}
                  index={i + 1}
                  accessToken={accessToken}
                  workspaceId={activeWorkspaceId}
                  sources={sources}
                  galleryCards={cards}
                />
              ))}
            </div>
            {cards.length >= limit && (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => setLimit((n) => n + PAGE_SIZE)}
                  disabled={galleryQuery.isFetching}
                  style={{ ...fB, fontSize: 13, padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${T.ink}`, color: T.ink, opacity: galleryQuery.isFetching ? 0.6 : 1 }}
                >
                  {galleryQuery.isFetching ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
