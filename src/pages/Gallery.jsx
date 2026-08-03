import { useCallback, useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { T, fD, fB, fM, fmt, fmtAge } from "../lib/theme.js";
import { SectionLabel } from "../components/ui.jsx";
import WorkspaceSwitcher from "../components/WorkspaceSwitcher.jsx";
import { useAuth } from "../lib/auth.jsx";
import { useWorkspace } from "../lib/workspace.jsx";
import { listSources } from "../lib/sources.js";
import { getGallery, GalleryApiError } from "../lib/gallery.js";

const selectStyle = { ...fB, fontSize: 13, padding: "7px 9px", borderRadius: 8, border: `1px solid ${T.line}`, background: T.card };
const PAGE_SIZE = 24;

const SORT_OPTIONS = [
  { value: "outlier_score", label: "Outlier score" },
  { value: "views", label: "Most views" },
  { value: "newest", label: "Newest" },
];

function Thumb({ src }) {
  const [failed, setFailed] = useState(false);
  const boxStyle = { width: "100%", aspectRatio: "9/16", background: "#E7E8E3" };

  if (!src || failed) {
    return (
      <div className="flex items-center justify-center" style={boxStyle}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="1.5" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 15l4.5-4.5a2 2 0 0 1 2.8 0L15 15" />
          <circle cx="8.5" cy="9" r="1.5" />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ ...boxStyle, objectFit: "cover", display: "block" }}
    />
  );
}

function Card({ card, index }) {
  return (
    <article
      className="relative rounded-lg overflow-hidden flex flex-col transition-transform duration-200 ease-out will-change-transform hover:-translate-y-1.5 hover:shadow-xl"
      style={{ border: `1px solid ${T.line}`, background: T.card }}
    >
      {index != null && (
        <span
          className="absolute top-2 left-2 flex items-center justify-center rounded-full"
          style={{ ...fM, fontSize: 11, fontWeight: 700, width: 22, height: 22, background: "rgba(20,24,29,0.75)", color: "#fff" }}
          title={`Video #${index} — reference this as "video ${index}"`}
        >
          {index}
        </span>
      )}
      <Thumb src={card.thumbUrl} />
      <div className="p-3 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2" style={{ ...fM, fontSize: 12, color: T.muted }}>
          <strong className="truncate" style={{ color: T.ink, maxWidth: "100%" }}>@{card.creatorHandle}</strong>
          <span className="whitespace-nowrap">{fmt(card.views)} views</span>
          {card.postedAt != null && (
            <span className="whitespace-nowrap" title={new Date(card.postedAt).toLocaleString()}>
              {fmtAge(card.postedAt)}
            </span>
          )}
          {card.outlierScore != null && (
            <span
              className="whitespace-nowrap rounded px-1.5 py-0.5"
              style={{ fontWeight: 700, color: T.signal, background: "#FFF0E8" }}
            >
              {card.outlierScore.toFixed(1)}x
            </span>
          )}
        </div>
        <p style={{ ...fB, fontSize: 13, color: T.ink, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", margin: 0 }}>
          {card.caption || <em>no caption</em>}
        </p>
        {card.mediaUrl && (
          <video controls playsInline preload="none" src={card.mediaUrl} style={{ width: "100%", borderRadius: 6, background: "#000" }} />
        )}
        <a href={card.url} target="_blank" rel="noreferrer" style={{ ...fM, fontSize: 11, color: T.muted }}>
          open on TikTok
        </a>
      </div>
    </article>
  );
}

export default function Gallery() {
  const { user, loading: authLoading, accessToken } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sources, setSources] = useState([]);
  // Seeded from ?sourceId= so a Sources-page row can deep-link straight into
  // its own gallery; kept in sync with the URL as the filter changes.
  const [sourceId, setSourceId] = useState(() => searchParams.get("sourceId") || "");
  const [sortBy, setSortBy] = useState("outlier_score");
  const [minOutlier, setMinOutlier] = useState(0);
  const [minViews, setMinViews] = useState(0);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!accessToken || !activeWorkspaceId) return;
    listSources(accessToken, activeWorkspaceId).then(setSources).catch(() => {});
  }, [accessToken, activeWorkspaceId]);

  // Any filter change resets to the first page of results.
  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [activeWorkspaceId, sourceId, sortBy, minOutlier, minViews]);

  function updateSourceId(id) {
    setSourceId(id);
    setSearchParams(id ? { sourceId: id } : {}, { replace: true });
  }

  const load = useCallback(() => {
    if (!accessToken || !activeWorkspaceId) return;
    setError("");
    getGallery(accessToken, { workspaceId: activeWorkspaceId, sourceId: sourceId || undefined, sortBy, minOutlier, minViews, limit })
      .then(setResult)
      .catch((err) => setError(err instanceof GalleryApiError ? err.message : "Couldn't load gallery."));
  }, [accessToken, activeWorkspaceId, sourceId, sortBy, minOutlier, minViews, limit]);

  useEffect(() => {
    load();
  }, [load]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/login?next=/gallery" replace />;

  const cards = result?.cards ?? [];

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
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={selectStyle}>
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ ...fM, fontSize: 11, color: T.muted }}>MIN OUTLIER</span>
          <select value={minOutlier} onChange={(e) => setMinOutlier(Number(e.target.value))} style={selectStyle}>
            {[0, 2, 5, 10, 25, 50, 100].map((v) => <option key={v} value={v}>{v === 0 ? "Any" : `≥ ${v}×`}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ ...fM, fontSize: 11, color: T.muted }}>MIN VIEWS</span>
          <select value={minViews} onChange={(e) => setMinViews(Number(e.target.value))} style={selectStyle}>
            {[0, 10000, 100000, 1000000, 10000000].map((v) => <option key={v} value={v}>{v === 0 ? "Any" : `≥ ${fmt(v)}`}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-8">
        {error ? (
          <p style={{ fontSize: 14, color: T.muted }}>{error}</p>
        ) : !activeWorkspaceId ? (
          <p style={{ fontSize: 14, color: T.muted }}>Create a workspace above first.</p>
        ) : !result ? (
          <p style={{ fontSize: 14, color: T.muted }}>Loading…</p>
        ) : cards.length === 0 ? (
          <p style={{ fontSize: 14, color: T.muted }}>{result.note || "No videos match these filters."}</p>
        ) : (
          <>
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
              {cards.map((c, i) => <Card key={c.id} card={c} index={i + 1} />)}
            </div>
            {cards.length >= limit && (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => setLimit((n) => n + PAGE_SIZE)}
                  style={{ ...fB, fontSize: 13, padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${T.ink}`, color: T.ink }}
                >
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
