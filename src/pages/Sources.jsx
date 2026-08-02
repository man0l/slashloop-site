import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { T, fD, fB, fM } from "../lib/theme.js";
import { SectionLabel } from "../components/ui.jsx";
import WorkspaceSwitcher from "../components/WorkspaceSwitcher.jsx";
import { useAuth } from "../lib/auth.jsx";
import { useWorkspace } from "../lib/workspace.jsx";
import { listSources, createSource, updateSource, deleteSource, refreshSource, SourcesApiError } from "../lib/sources.js";

const inputStyle = { ...fB, fontSize: 13, padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.line}`, background: T.card };
const SOURCE_TYPES = ["creator", "keyword", "hashtag"];

function NewSourceForm({ accessToken, workspaceId, onCreated }) {
  const [sourceType, setSourceType] = useState("creator");
  const [query, setQuery] = useState("");
  const [videoLimit, setVideoLimit] = useState(20);
  const [status, setStatus] = useState("idle"); // idle | loading | error
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setStatus("loading");
    setError("");
    try {
      // TikTok only — the connector refuses reels/shorts today (no live
      // scraper for either), so the form never offers them.
      await createSource(accessToken, workspaceId, { platform: "tiktok", sourceType, query: query.trim(), videoLimit });
      setQuery("");
      setStatus("idle");
      onCreated();
    } catch (err) {
      setStatus("error");
      setError(err instanceof SourcesApiError ? err.message : "Couldn't create source.");
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
      {error && <p style={{ ...fM, fontSize: 12, color: "#B3261E" }}>{error}</p>}
    </form>
  );
}

function SourceRow({ source, accessToken, workspaceId, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rowError, setRowError] = useState("");

  async function toggleActive() {
    setBusy(true);
    setRowError("");
    try {
      await updateSource(accessToken, workspaceId, source.id, { isActive: !source.isActive });
      onChanged();
    } catch (err) {
      setRowError(err instanceof SourcesApiError ? err.message : "Couldn't update source.");
    } finally {
      setBusy(false);
    }
  }

  async function doRefresh() {
    setBusy(true);
    setRowError("");
    try {
      await refreshSource(accessToken, workspaceId, source.id);
      onChanged();
    } catch (err) {
      setRowError(err instanceof SourcesApiError ? err.message : "Couldn't queue refresh.");
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    setBusy(true);
    setRowError("");
    try {
      await deleteSource(accessToken, workspaceId, source.id);
      onChanged();
    } catch (err) {
      setRowError(err instanceof SourcesApiError ? err.message : "Couldn't delete source.");
      setBusy(false);
    }
  }

  return (
    <tr style={{ borderTop: `1px solid ${T.line}` }}>
      <td className="py-3 pr-4">
        <div style={{ ...fB, fontSize: 14 }}>{source.query}</div>
        <div style={{ ...fM, fontSize: 11, color: T.muted }}>{source.sourceType} · {source.platform}</div>
        {rowError && <div style={{ ...fM, fontSize: 11, color: "#B3261E" }}>{rowError}</div>}
      </td>
      <td className="py-3 pr-4" style={{ ...fM, fontSize: 12, color: T.muted }}>{source.videoCount}</td>
      <td className="py-3 pr-4" style={{ ...fM, fontSize: 12, color: T.muted }}>
        {source.lastRefreshedAt ? new Date(source.lastRefreshedAt).toLocaleDateString() : "never"}
      </td>
      <td className="py-3 pr-4" style={{ ...fM, fontSize: 12, color: source.isActive ? T.teal : T.muted }}>
        {source.isActive ? "active" : "paused"}
      </td>
      <td className="py-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={doRefresh} style={{ ...fM, fontSize: 11, color: T.signal }}>refresh</button>
          <button type="button" disabled={busy} onClick={toggleActive} style={{ ...fM, fontSize: 11, color: T.ink }}>
            {source.isActive ? "pause" : "resume"}
          </button>
          {!confirmDelete ? (
            <button type="button" disabled={busy} onClick={() => setConfirmDelete(true)} style={{ ...fM, fontSize: 11, color: T.muted }}>
              delete
            </button>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={doDelete} style={{ ...fM, fontSize: 11, color: "#B3261E" }}>
                confirm delete
              </button>
              <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)} style={{ ...fM, fontSize: 11, color: T.muted }}>
                cancel
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function Sources() {
  const { user, loading: authLoading, accessToken } = useAuth();
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const [sources, setSources] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!accessToken || !activeWorkspaceId) return;
    listSources(accessToken, activeWorkspaceId)
      .then(setSources)
      .catch((err) => setError(err instanceof SourcesApiError ? err.message : "Couldn't load sources."));
  }, [accessToken, activeWorkspaceId]);

  useEffect(() => {
    setSources(null);
    setError("");
    load();
  }, [load]);

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
          <p style={{ fontSize: 14, color: T.muted }}>{error}</p>
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
                <SourceRow key={s.id} source={s} accessToken={accessToken} workspaceId={activeWorkspaceId} onChanged={load} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
