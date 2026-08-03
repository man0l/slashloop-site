import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { T, fD, fB, fM } from "../lib/theme.js";
import { SectionLabel, AlertBanner, ConfirmDialog, IconButton, RefreshIcon, PauseIcon, PlayIcon, TrashIcon, WarningIcon } from "../components/ui.jsx";
import WorkspaceSwitcher from "../components/WorkspaceSwitcher.jsx";
import { useAuth } from "../lib/auth.jsx";
import { useWorkspace } from "../lib/workspace.jsx";
import { useToast } from "../lib/toast.jsx";
import { listSources, createSource, updateSource, deleteSource, refreshSource, getSource, SourcesApiError } from "../lib/sources.js";
import { getGallery } from "../lib/gallery.js";

const inputStyle = { ...fB, fontSize: 13, padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.line}`, background: T.card };
const SOURCE_TYPES = ["creator", "keyword", "hashtag"];

function SourceThumb({ src }) {
  const [failed, setFailed] = useState(false);
  const boxStyle = { width: 36, height: 48, borderRadius: 6, background: "#E7E8E3", flexShrink: 0 };

  if (!src || failed) {
    return <div style={boxStyle} />;
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

function NewSourceForm({ accessToken, workspaceId, onCreated }) {
  const { showToast } = useToast();
  const [sourceType, setSourceType] = useState("creator");
  const [query, setQuery] = useState("");
  const [videoLimit, setVideoLimit] = useState(20);
  const [status, setStatus] = useState("idle"); // idle | loading

  async function submit(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setStatus("loading");
    try {
      // TikTok only — the connector refuses reels/shorts today (no live
      // scraper for either), so the form never offers them.
      await createSource(accessToken, workspaceId, { platform: "tiktok", sourceType, query: query.trim(), videoLimit });
      setQuery("");
      showToast(`Now tracking ${query.trim()}.`, { type: "success" });
      onCreated();
    } catch (err) {
      showToast(err instanceof SourcesApiError ? err.message : "Couldn't create source.", { type: "error" });
    } finally {
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 mt-4">
      <label className="flex flex-col gap-1">
        <span style={{ ...fM, fontSize: 11, color: T.muted }}>TYPE</span>
        <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} style={inputStyle}>
          {SOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 flex-1 min-w-[180px]">
        <span style={{ ...fM, fontSize: 11, color: T.muted }}>
          {sourceType === "creator" ? "HANDLE" : sourceType === "hashtag" ? "HASHTAG" : "KEYWORD"}
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={sourceType === "creator" ? "@handle" : sourceType === "hashtag" ? "#tag" : "phrase"}
          style={inputStyle}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span style={{ ...fM, fontSize: 11, color: T.muted }}>VIDEO LIMIT</span>
        <input
          type="number"
          min={1}
          max={200}
          value={videoLimit}
          onChange={(e) => setVideoLimit(Number(e.target.value))}
          style={{ ...inputStyle, width: 90 }}
        />
      </label>
      <button
        type="submit"
        disabled={status === "loading"}
        style={{ ...fB, fontSize: 13, padding: "8px 16px", borderRadius: 8, background: T.signal, color: "#fff" }}
      >
        {status === "loading" ? "Adding…" : "Track source"}
      </button>
    </form>
  );
}

function SourceRow({ source, thumbUrl, issue, accessToken, workspaceId, onChanged }) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [busyAction, setBusyAction] = useState(null); // null | "refresh" | "toggle" | "delete"
  const [confirmDelete, setConfirmDelete] = useState(false);
  const busy = busyAction !== null;

  async function toggleActive() {
    setBusyAction("toggle");
    try {
      await updateSource(accessToken, workspaceId, source.id, { isActive: !source.isActive });
      onChanged();
    } catch (err) {
      showToast(err instanceof SourcesApiError ? err.message : "Couldn't update source.", { type: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  async function doRefresh() {
    setBusyAction("refresh");
    try {
      await refreshSource(accessToken, workspaceId, source.id);
      showToast("Refresh queued — new videos will show up shortly.", { type: "success" });
      onChanged();
    } catch (err) {
      showToast(err instanceof SourcesApiError ? err.message : "Couldn't queue refresh.", { type: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  async function doDelete() {
    setBusyAction("delete");
    try {
      await deleteSource(accessToken, workspaceId, source.id);
      setConfirmDelete(false);
      showToast(`Deleted ${source.query}.`, { type: "success" });
      onChanged();
    } catch (err) {
      showToast(err instanceof SourcesApiError ? err.message : "Couldn't delete source.", { type: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  // Row navigates to this source's gallery; clicks on an action button/link
  // inside it must not also trigger that navigation.
  function openGallery(e) {
    if (e.target.closest("button, a")) return;
    navigate(`/gallery?sourceId=${source.id}`);
  }

  return (
    <tr
      onClick={openGallery}
      className="cursor-pointer"
      style={{ borderTop: `1px solid ${T.line}` }}
      title="Open this source's gallery"
    >
      <td className="py-3 pr-4">
        <div className="flex items-center gap-3">
          <SourceThumb src={thumbUrl} />
          <div>
            <div style={{ ...fB, fontSize: 14 }}>{source.query}</div>
            <div style={{ ...fM, fontSize: 11, color: T.muted }}>{source.sourceType} · {source.platform}</div>
          </div>
        </div>
      </td>
      <td className="py-3 pr-4" style={{ ...fM, fontSize: 12, color: T.muted }}>{source.videoCount}</td>
      <td className="py-3 pr-4" style={{ ...fM, fontSize: 12, color: T.muted }}>
        {source.lastRefreshedAt ? new Date(source.lastRefreshedAt).toLocaleDateString() : "never"}
      </td>
      <td className="py-3 pr-4" style={{ ...fM, fontSize: 12, color: source.isActive ? T.teal : T.muted }}>
        <div className="flex items-center gap-1.5">
          <span>{busyAction === "toggle" ? "…" : source.isActive ? "active" : "paused"}</span>
          {issue?.errors?.length > 0 && (
            <IconButton
              icon={<WarningIcon />}
              label={`Last refresh (${new Date(issue.ranAt).toLocaleString()}): ${issue.errors.join(" · ")}`}
              danger
              onClick={() => {}}
            />
          )}
        </div>
      </td>
      <td className="py-3">
        <div className="flex items-center gap-1">
          <IconButton
            icon={<RefreshIcon />}
            label={busyAction === "refresh" ? "Refreshing…" : issue?.errors?.length > 0 ? "Retry — last refresh had errors" : "Refresh now"}
            disabled={busy}
            tone={issue?.errors?.length > 0 ? "#B3261E" : T.signal}
            onClick={doRefresh}
          />
          <IconButton
            icon={source.isActive ? <PauseIcon /> : <PlayIcon />}
            label={source.isActive ? "Pause tracking" : "Resume tracking"}
            disabled={busy}
            onClick={toggleActive}
          />
          <IconButton
            icon={<TrashIcon />}
            label="Delete source"
            disabled={busy}
            danger
            onClick={() => setConfirmDelete(true)}
          />
        </div>
      </td>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this source?"
        message={`Stops tracking "${source.query}" and removes it from Sources. Videos already scraped from it stay in your library.`}
        confirmLabel="Delete"
        danger
        busy={busyAction === "delete"}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={doDelete}
      />
    </tr>
  );
}

export default function Sources() {
  const { user, loading: authLoading, accessToken } = useAuth();
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const [sources, setSources] = useState(null);
  const [error, setError] = useState("");
  // sourceId -> thumbUrl of that source's single biggest outlier, used as its
  // representative image in the table (fetched separately since /api/sources
  // doesn't carry per-video data).
  const [topThumbs, setTopThumbs] = useState({});
  // sourceId -> { errors: string[], ranAt } from that source's most recent
  // refresh run, so a scrape failure (bad query, scoring error, timeout) is
  // visible in the row instead of only in server logs.
  const [refreshIssues, setRefreshIssues] = useState({});

  const load = useCallback(() => {
    if (!accessToken || !activeWorkspaceId) return;
    listSources(accessToken, activeWorkspaceId)
      .then(setSources)
      .catch((err) => setError(err instanceof SourcesApiError ? err.message : "Couldn't load sources."));
  }, [accessToken, activeWorkspaceId]);

  useEffect(() => {
    setSources(null);
    setError("");
    setTopThumbs({});
    setRefreshIssues({});
    load();
  }, [load]);

  useEffect(() => {
    if (!accessToken || !activeWorkspaceId || !sources?.length) return;
    let cancelled = false;
    Promise.all(
      sources.map((s) =>
        getGallery(accessToken, { workspaceId: activeWorkspaceId, sourceId: s.id, sortBy: "outlier_score", limit: 1 })
          .then((r) => [s.id, r.cards?.[0]?.thumbUrl ?? null])
          .catch(() => [s.id, null]),
      ),
    ).then((entries) => {
      if (!cancelled) setTopThumbs(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, activeWorkspaceId, sources]);

  useEffect(() => {
    if (!accessToken || !activeWorkspaceId || !sources?.length) return;
    let cancelled = false;
    Promise.all(
      sources.map((s) =>
        getSource(accessToken, activeWorkspaceId, s.id)
          .then((full) => {
            const run = full.refreshRuns?.[0];
            if (!run) return [s.id, null];
            // "(cosmetic only)" is the connector's own marker for notices that
            // aren't actual failures (e.g. thumbnail ingest deferred to stay
            // inside a time budget) — don't surface those as warnings.
            const errors = JSON.parse(run.errorsJson || "[]").filter((e) => !e.includes("(cosmetic only)"));
            return [s.id, errors.length ? { errors, ranAt: run.ranAt } : null];
          })
          .catch(() => [s.id, null]),
      ),
    ).then((entries) => {
      if (!cancelled) setRefreshIssues(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, activeWorkspaceId, sources]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/login?next=/sources" replace />;

  return (
    <section className="max-w-4xl mx-auto px-5 py-16">
      <SectionLabel>SOURCES</SectionLabel>
      <h1 className="mt-3" style={{ ...fD, fontWeight: 900, fontSize: 32, letterSpacing: -0.8 }}>
        Tracked sources
      </h1>

      <div className="mt-6">
        <WorkspaceSwitcher />
      </div>

      <div className="mt-8 rounded-xl p-6" style={{ background: T.card, border: `1px solid ${T.line}` }}>
        <div style={{ ...fM, fontSize: 11, letterSpacing: 2, color: T.muted }}>TRACK A NEW SOURCE</div>
        {activeWorkspaceId ? (
          <NewSourceForm accessToken={accessToken} workspaceId={activeWorkspaceId} onCreated={load} />
        ) : (
          <p className="mt-2" style={{ fontSize: 13, color: T.muted }}>
            {workspaceLoading ? "Loading workspaces…" : "Create a workspace above first."}
          </p>
        )}
      </div>

      <div className="mt-8">
        {error ? (
          <AlertBanner>{error}</AlertBanner>
        ) : !activeWorkspaceId ? null : sources === null ? (
          <p style={{ fontSize: 14, color: T.muted }}>Loading…</p>
        ) : sources.length === 0 ? (
          <p style={{ fontSize: 14, color: T.muted }}>No sources tracked yet in this workspace.</p>
        ) : (
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th className="text-left pb-2" style={{ ...fM, fontSize: 11, letterSpacing: 1, color: T.muted }}>SOURCE</th>
                <th className="text-left pb-2" style={{ ...fM, fontSize: 11, letterSpacing: 1, color: T.muted }}>VIDEOS</th>
                <th className="text-left pb-2" style={{ ...fM, fontSize: 11, letterSpacing: 1, color: T.muted }}>LAST REFRESH</th>
                <th className="text-left pb-2" style={{ ...fM, fontSize: 11, letterSpacing: 1, color: T.muted }}>STATUS</th>
                <th className="text-left pb-2" style={{ ...fM, fontSize: 11, letterSpacing: 1, color: T.muted }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <SourceRow
                  key={s.id}
                  source={s}
                  thumbUrl={topThumbs[s.id]}
                  issue={refreshIssues[s.id]}
                  accessToken={accessToken}
                  workspaceId={activeWorkspaceId}
                  onChanged={load}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
