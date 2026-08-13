import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { T, fD, fB, fM, fmtAge } from "../lib/theme.js";
import { SectionLabel, AlertBanner, ConfirmDialog, IconButton, RefreshIcon, PauseIcon, PlayIcon, TrashIcon, WarningIcon, EditIcon, CloseIcon } from "../components/ui.jsx";
import WorkspaceSwitcher from "../components/WorkspaceSwitcher.jsx";
import { useAuth } from "../lib/auth.jsx";
import { useWorkspace } from "../lib/workspace.jsx";
import { useToast } from "../lib/toast.jsx";
import { listSources, createSource, updateSource, deleteSource, refreshSource, getSource, suggestSources, verifySuggestedSource, dismissSuggestedSource, SourcesApiError } from "../lib/sources.js";
import { getGallery } from "../lib/gallery.js";
import { parseRefreshFailures } from "../lib/refreshLog.js";

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
      const source = await createSource(accessToken, workspaceId, { platform: "tiktok", sourceType, query: query.trim(), videoLimit });
      setQuery("");

      // A newly tracked source with no videos yet just reads as broken
      // ("never" in LAST REFRESH) until someone notices and clicks Refresh —
      // this is what the MCP conversational flow already does by default
      // (create_source chained straight into refresh_source, see
      // .claude/skills/track/SKILL.md), the site just wasn't doing it too.
      try {
        await refreshSource(accessToken, workspaceId, source.id);
        showToast(`Now tracking ${query.trim()} — first scrape queued.`, { type: "success" });
      } catch (refreshErr) {
        showToast(
          `Tracking ${query.trim()}, but the first scrape didn't start: `
          + (refreshErr instanceof SourcesApiError ? refreshErr.message : "couldn't queue refresh.")
          + " Use Refresh to retry.",
          { type: "error" },
        );
      }
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

/**
 * AI-seeded suggestions, seeded from this workspace's biggest outliers, then
 * checked one at a time against real TikTok data. Seeding is one fast AI
 * call — candidates show up immediately as "checking" cards; each one then
 * flips to a real suggestion (or drops out) the moment its own verification
 * scrape resolves, rather than the whole panel blocking on the slowest of
 * them (a real Apify scrape can take anywhere from a few seconds to well
 * over a minute).
 */
// How long a verified-but-untouched suggestion sits before it's treated as
// a quiet rejection on its own, without waiting for the batch to be
// abandoned (a new run, closing the panel, or navigating away). Long enough
// to actually read the card and decide; short enough that just not acting
// on it doesn't take forever to "count".
const IMPLICIT_REJECT_AFTER_MS = 60_000;

function rowKey(row) {
  return `${row.sourceType}:${row.query}`;
}

function SuggestedSourcesPanel({ accessToken, workspaceId, onTracked }) {
  const { showToast } = useToast();
  const [status, setStatus] = useState("idle"); // idle | seeding | verifying | done | error
  const [rows, setRows] = useState([]); // [{ sourceType, query, rationale, state: checking|verified|discarded, dismissed?, suggestion?, error? }]
  const [seedMeta, setSeedMeta] = useState(null); // { rawCandidateCount, alreadyTrackedCount, alreadyDismissedCount }
  const [errorMsg, setErrorMsg] = useState("");
  const [creditsRemaining, setCreditsRemaining] = useState(null);
  const [creditsCharged, setCreditsCharged] = useState(0);
  const [trackedQueries, setTrackedQueries] = useState(new Set());
  const [trackingQuery, setTrackingQuery] = useState(null);

  // Kept in sync with state so the abandon-a-batch paths below (a fresh run,
  // closing the panel, or navigating away) can read the latest rows/tracked
  // set without capturing a stale closure.
  const rowsRef = useRef(rows);
  const trackedRef = useRef(trackedQueries);
  useEffect(() => { rowsRef.current = rows; }, [rows]);
  useEffect(() => { trackedRef.current = trackedQueries; }, [trackedQueries]);

  // rowKey -> setTimeout id, for the idle-rejection timers started below.
  const timersRef = useRef({});

  function clearImplicitRejectTimer(key) {
    clearTimeout(timersRef.current[key]);
    delete timersRef.current[key];
  }

  function clearAllImplicitRejectTimers() {
    Object.keys(timersRef.current).forEach(clearImplicitRejectTimer);
  }

  // Starts the idle clock the moment a suggestion is verified — the same
  // "seen it, didn't act on it" rule as abandoning the whole batch, just
  // without requiring the batch to actually be abandoned first. Canceled if
  // the row gets tracked or explicitly dismissed before it fires.
  function scheduleImplicitReject(row) {
    const key = rowKey(row);
    clearImplicitRejectTimer(key);
    timersRef.current[key] = setTimeout(() => {
      delete timersRef.current[key];
      const current = rowsRef.current.find((r) => rowKey(r) === key);
      if (!current || current.dismissed || trackedRef.current.has(row.query)) return;
      dismissSuggestedSource(accessToken, workspaceId, row).catch(() => {});
    }, IMPLICIT_REJECT_AFTER_MS);
  }

  // Flip "verifying" -> "done" once every row has left "checking", so the
  // header can stop saying "Checking N candidates…".
  useEffect(() => {
    if (status === "verifying" && rows.length > 0 && rows.every((r) => r.state !== "checking")) {
      setStatus("done");
    }
  }, [status, rows]);

  // A suggestion the user saw and didn't track is a rejection just as much
  // as an explicit "×" click — it shouldn't keep coming back either. Called
  // whenever a batch is being abandoned: a fresh run, closing the panel, or
  // leaving the page. Still-"checking" rows are left alone — there's no
  // suggestion to judge yet. Already-explicitly-dismissed rows are skipped
  // (redundant, though harmless — dismissSuggestedSource is idempotent).
  function persistUnactionedAsRejected(rowsSnapshot, trackedSnapshot) {
    rowsSnapshot
      .filter((r) => r.state !== "checking" && !r.dismissed && !trackedSnapshot.has(r.query))
      .forEach((r) => { dismissSuggestedSource(accessToken, workspaceId, r).catch(() => {}); });
  }

  // Covers navigating away from the page entirely with suggestions still on
  // screen — same "seen it, didn't track it" rule as closing the panel.
  useEffect(() => {
    return () => {
      clearAllImplicitRejectTimers();
      persistUnactionedAsRejected(rowsRef.current, trackedRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSuggest() {
    clearAllImplicitRejectTimers();
    persistUnactionedAsRejected(rows, trackedQueries);
    setStatus("seeding");
    setErrorMsg("");
    setRows([]);
    setSeedMeta(null);
    setCreditsCharged(0);
    setTrackedQueries(new Set());
    try {
      const seed = await suggestSources(accessToken, workspaceId);
      setSeedMeta(seed);
      setCreditsRemaining(seed.creditsRemaining);
      setCreditsCharged(seed.creditsCharged);

      if (seed.candidates.length === 0) {
        setStatus("done");
        return;
      }

      setRows(seed.candidates.map((c) => ({ ...c, state: "checking" })));
      setStatus("verifying");

      // Fire one verify call per candidate — don't await them together.
      // Each row updates itself the instant its own call resolves. Matched
      // by sourceType+query, not array index — a dismissed row stays in the
      // array (just hidden), so indices never shift out from under an
      // in-flight call.
      seed.candidates.forEach((candidate) => {
        verifySuggestedSource(accessToken, workspaceId, candidate)
          .then((r) => {
            setCreditsRemaining(r.creditsRemaining);
            setCreditsCharged((prev) => prev + r.creditsCharged);
            setRows((prev) => prev.map((row) => (row.sourceType !== candidate.sourceType || row.query !== candidate.query ? row : {
              ...row,
              state: r.verified ? "verified" : "discarded",
              suggestion: r.verified ? r.suggestion : undefined,
              error: !r.ok ? r.error : undefined,
            })));
            if (r.verified) scheduleImplicitReject(candidate);
          })
          .catch((err) => {
            setRows((prev) => prev.map((row) => (row.sourceType !== candidate.sourceType || row.query !== candidate.query ? row : {
              ...row,
              state: "discarded",
              error: err instanceof SourcesApiError ? err.message : "Couldn't verify this candidate.",
            })));
          });
      });
    } catch (err) {
      setErrorMsg(err instanceof SourcesApiError ? err.message : "Couldn't generate suggestions.");
      setStatus("error");
    }
  }

  async function trackSuggestion(s) {
    clearImplicitRejectTimer(rowKey(s));
    setTrackingQuery(s.query);
    try {
      const source = await createSource(accessToken, workspaceId, { platform: "tiktok", sourceType: s.sourceType, query: s.query, videoLimit: 20 });
      try {
        await refreshSource(accessToken, workspaceId, source.id);
      } catch {
        // Source is tracked either way; the row's own Refresh button covers a retry.
      }
      setTrackedQueries((prev) => new Set(prev).add(s.query));
      showToast(`Now tracking ${s.query} — first scrape queued.`, { type: "success" });
      onTracked();
    } catch (err) {
      showToast(err instanceof SourcesApiError ? err.message : "Couldn't track this source.", { type: "error" });
    } finally {
      setTrackingQuery(null);
    }
  }

  // Not interested in this one — hides it now (regardless of whether its own
  // verification is still in flight) and remembers the choice server-side,
  // so a future "Suggest sources" run for this workspace won't propose it
  // again either.
  async function dismissRow(row) {
    clearImplicitRejectTimer(rowKey(row));
    setRows((prev) => prev.map((r) => (r.sourceType !== row.sourceType || r.query !== row.query ? r : { ...r, dismissed: true })));
    try {
      await dismissSuggestedSource(accessToken, workspaceId, row);
    } catch (err) {
      showToast(
        err instanceof SourcesApiError ? err.message : "Couldn't save that — it may show up again next time.",
        { type: "error" },
      );
    }
  }

  // Closes the whole panel back to its idle state. Suggest sources still
  // works right after — it's a fresh run, not a disabled button.
  function closeAll() {
    clearAllImplicitRejectTimers();
    persistUnactionedAsRejected(rows, trackedQueries);
    setStatus("idle");
    setRows([]);
    setSeedMeta(null);
    setErrorMsg("");
    setCreditsCharged(0);
    setTrackedQueries(new Set());
  }

  const checkingCount = rows.filter((r) => r.state === "checking").length;
  const discardedCount = (seedMeta?.alreadyTrackedCount ?? 0) + (seedMeta?.alreadyDismissedCount ?? 0)
    + rows.filter((r) => r.state === "discarded").length;
  const visibleRows = rows.filter((r) => r.state !== "discarded" && !r.dismissed);

  return (
    <div className="mt-8 rounded-xl p-6" style={{ background: T.card, border: `1px solid ${T.line}` }}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div style={{ ...fM, fontSize: 11, letterSpacing: 2, color: T.muted }}>AI SUGGESTIONS</div>
          <p className="mt-1" style={{ ...fB, fontSize: 13, color: T.muted, lineHeight: 1.5, maxWidth: 480 }}>
            Seeded from this workspace's biggest outliers, then checked against real TikTok data — a suggestion only
            stays up if that check actually found videos. A suggestion you don't track — dismissed, or just left
            untouched for a minute — won't come back on future runs.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {status !== "idle" && (
            <IconButton icon={<CloseIcon />} label="Close suggestions" onClick={closeAll} />
          )}
          <button
            type="button"
            onClick={runSuggest}
            disabled={status === "seeding" || status === "verifying"}
            className="shrink-0 rounded-md px-3 py-1.5"
            style={{ ...fB, fontSize: 13, fontWeight: 600, background: T.signal, color: "#fff", opacity: status === "seeding" || status === "verifying" ? 0.6 : 1 }}
          >
            {status === "seeding" ? "Thinking…" : status === "verifying" ? "Checking…" : "Suggest sources"}
          </button>
        </div>
      </div>

      {status === "error" && (
        <div className="mt-4">
          <AlertBanner>{errorMsg}</AlertBanner>
        </div>
      )}

      {(status === "verifying" || status === "done") && (
        <div className="mt-4">
          {status === "verifying" && (
            <p className="mb-3" style={{ ...fM, fontSize: 11, color: T.muted }}>
              Checking {checkingCount} of {rows.length} candidate{rows.length === 1 ? "" : "s"} against real TikTok data…
            </p>
          )}
          {visibleRows.length === 0 ? (
            <p style={{ ...fB, fontSize: 13, color: T.muted }}>
              {seedMeta?.rawCandidateCount ?? 0} candidate{(seedMeta?.rawCandidateCount ?? 0) === 1 ? "" : "s"} proposed, none
              survived verification (already tracked, previously dismissed, or no real content found).
            </p>
          ) : (
            <div className="grid gap-3">
              {visibleRows.map((row) => {
                const label = row.sourceType === "hashtag" ? `#${row.query}` : row.sourceType === "creator" ? `@${row.query}` : row.query;
                const tracked = trackedQueries.has(row.query);
                const s = row.suggestion;
                return (
                  <div key={`${row.sourceType}:${row.query}`} className="rounded-lg p-4" style={{ border: `1px solid ${T.line}` }}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div style={{ ...fB, fontSize: 14, fontWeight: 700 }}>{label}</div>
                        <div style={{ ...fM, fontSize: 11, color: T.muted }}>{row.sourceType}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {row.state === "checking" ? (
                          <span style={{ ...fM, fontSize: 11, color: T.muted }}>Checking…</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => trackSuggestion(row)}
                            disabled={tracked || trackingQuery === row.query}
                            className="shrink-0 rounded-md px-3 py-1.5"
                            style={{
                              ...fB, fontSize: 12, fontWeight: 600,
                              background: tracked ? T.line : T.signal,
                              color: tracked ? T.muted : "#fff",
                              opacity: trackingQuery === row.query ? 0.6 : 1,
                            }}
                          >
                            {tracked ? "Tracked" : trackingQuery === row.query ? "Tracking…" : "Track this"}
                          </button>
                        )}
                        {!tracked && (
                          <IconButton icon={<CloseIcon />} label="Not interested" onClick={() => dismissRow(row)} />
                        )}
                      </div>
                    </div>
                    <p className="mt-2" style={{ ...fB, fontSize: 13, color: T.ink, lineHeight: 1.5 }}>{row.rationale}</p>
                    {s && (
                      <>
                        <p className="mt-2" style={{ ...fM, fontSize: 11, color: T.muted }}>
                          Verified: {s.verifiedVideoCount} video{s.verifiedVideoCount === 1 ? "" : "s"} found · top sample{" "}
                          {s.sampleViews.toLocaleString()} views
                        </p>
                        {s.sampleCaption && (
                          <p className="mt-1" style={{ ...fB, fontSize: 12, color: T.muted, fontStyle: "italic" }}>
                            &ldquo;{s.sampleCaption.length > 140 ? `${s.sampleCaption.slice(0, 140)}…` : s.sampleCaption}&rdquo;
                          </p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {status === "done" && discardedCount > 0 && (
            <p className="mt-3" style={{ ...fM, fontSize: 11, color: T.muted }}>
              {discardedCount} candidate{discardedCount === 1 ? "" : "s"} didn't pan out (already tracked, previously dismissed, or no real content found).
            </p>
          )}
          {status === "done" && (
            <p className="mt-3" style={{ ...fM, fontSize: 11, color: T.muted }}>
              {creditsCharged} credit{creditsCharged === 1 ? "" : "s"} charged · {creditsRemaining} remaining
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Edits videoLimit only — the tracked query/handle is what a source IS, not
 * a setting, so changing it here would silently start tracking something
 * else under the same row. Delete and re-track for that instead.
 */
function EditVideoLimitDialog({ open, initialValue, busy, onCancel, onSave }) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  if (!open) return null;
  const valid = Number.isInteger(value) && value >= 1 && value <= 200;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(20,24,29,0.45)" }}
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit video limit"
        className="w-full max-w-sm rounded-lg p-5"
        style={{ background: T.card, border: `1px solid ${T.line}`, boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ ...fB, fontSize: 15, fontWeight: 700, color: T.ink }}>Edit video limit</div>
        <p className="mt-2" style={{ ...fB, fontSize: 13, color: T.muted, lineHeight: 1.5 }}>
          Max videos pulled per refresh (1–200). The tracked query can't be changed here — delete and re-track to change that.
        </p>
        <input
          type="number"
          min={1}
          max={200}
          autoFocus
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          style={{ ...inputStyle, width: "100%", marginTop: 12 }}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md px-3 py-1.5"
            style={{ ...fB, fontSize: 13, color: T.muted }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(value)}
            disabled={busy || !valid}
            className="rounded-md px-3 py-1.5"
            style={{ ...fB, fontSize: 13, fontWeight: 600, background: T.signal, color: "#fff", opacity: busy || !valid ? 0.6 : 1 }}
          >
            {busy ? "…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Shared state + handlers behind a source's row — the desktop table row and
 * the mobile card render this the same underlying entity in different DOM
 * shapes (a <tr> can't have a <div> sibling in a <tbody>, so they can't be
 * the same component), but neither should re-derive the actions themselves.
 */
function useSourceRowActions(source, accessToken, workspaceId, onChanged) {
  const { showToast } = useToast();
  const [busyAction, setBusyAction] = useState(null); // null | "refresh" | "toggle" | "delete" | "edit"
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingLimit, setEditingLimit] = useState(false);
  const busy = busyAction !== null;

  async function saveVideoLimit(newLimit) {
    setBusyAction("edit");
    try {
      await updateSource(accessToken, workspaceId, source.id, { videoLimit: newLimit });
      setEditingLimit(false);
      showToast(`Video limit updated to ${newLimit}.`, { type: "success" });
      onChanged();
    } catch (err) {
      showToast(err instanceof SourcesApiError ? err.message : "Couldn't update video limit.", { type: "error" });
    } finally {
      setBusyAction(null);
    }
  }

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
      onChanged(source.id);
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

  return {
    busyAction, busy, confirmDelete, setConfirmDelete, editingLimit, setEditingLimit,
    saveVideoLimit, toggleActive, doRefresh, doDelete,
  };
}

/** The four per-row action icon buttons — identical on desktop and mobile. */
function SourceRowActions({ source, issue, busyAction, busy, doRefresh, toggleActive, setEditingLimit, setConfirmDelete }) {
  return (
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
        icon={<EditIcon />}
        label={`Edit video limit (currently ${source.videoLimit})`}
        disabled={busy}
        onClick={() => setEditingLimit(true)}
      />
      <IconButton
        icon={<TrashIcon />}
        label="Delete source"
        disabled={busy}
        danger
        onClick={() => setConfirmDelete(true)}
      />
    </div>
  );
}

function SourceRow({ source, thumbUrl, issue, accessToken, workspaceId, onChanged }) {
  const navigate = useNavigate();
  const {
    busyAction, busy, confirmDelete, setConfirmDelete, editingLimit, setEditingLimit,
    saveVideoLimit, toggleActive, doRefresh, doDelete,
  } = useSourceRowActions(source, accessToken, workspaceId, onChanged);

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
      <td
        className="py-3 pr-4"
        style={{ ...fM, fontSize: 12, color: T.muted }}
        title={source.lastRefreshedAt ? new Date(source.lastRefreshedAt).toLocaleString() : undefined}
      >
        {source.lastRefreshedAt ? fmtAge(new Date(source.lastRefreshedAt).getTime()) : "never"}
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
        <SourceRowActions
          source={source} issue={issue} busyAction={busyAction} busy={busy}
          doRefresh={doRefresh} toggleActive={toggleActive}
          setEditingLimit={setEditingLimit} setConfirmDelete={setConfirmDelete}
        />
      </td>
      <EditVideoLimitDialog
        open={editingLimit}
        initialValue={source.videoLimit}
        busy={busyAction === "edit"}
        onCancel={() => setEditingLimit(false)}
        onSave={saveVideoLimit}
      />
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

/**
 * Mobile equivalent of SourceRow — same entity, same actions (via the same
 * hook), stacked into a card instead of table columns, since a 5-column
 * table with 4 icon actions has nowhere to go on a phone-width screen.
 */
function SourceCard({ source, thumbUrl, issue, accessToken, workspaceId, onChanged }) {
  const navigate = useNavigate();
  const {
    busyAction, busy, confirmDelete, setConfirmDelete, editingLimit, setEditingLimit,
    saveVideoLimit, toggleActive, doRefresh, doDelete,
  } = useSourceRowActions(source, accessToken, workspaceId, onChanged);

  function openGallery(e) {
    if (e.target.closest("button, a")) return;
    navigate(`/gallery?sourceId=${source.id}`);
  }

  return (
    <div
      onClick={openGallery}
      className="rounded-lg p-4"
      style={{ border: `1px solid ${T.line}`, background: T.card }}
    >
      <div className="flex items-center gap-3">
        <SourceThumb src={thumbUrl} />
        <div className="min-w-0 flex-1">
          <div className="truncate" style={{ ...fB, fontSize: 14 }}>{source.query}</div>
          <div style={{ ...fM, fontSize: 11, color: T.muted }}>{source.sourceType} · {source.platform}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5" style={{ ...fM, fontSize: 12, color: T.muted }}>
        <span>{source.videoCount} video{source.videoCount === 1 ? "" : "s"}</span>
        <span title={source.lastRefreshedAt ? new Date(source.lastRefreshedAt).toLocaleString() : undefined}>
          {source.lastRefreshedAt ? fmtAge(new Date(source.lastRefreshedAt).getTime()) : "never"}
        </span>
        <span className="flex items-center gap-1.5" style={{ color: source.isActive ? T.teal : T.muted }}>
          {busyAction === "toggle" ? "…" : source.isActive ? "active" : "paused"}
          {issue?.errors?.length > 0 && (
            <IconButton
              icon={<WarningIcon />}
              label={`Last refresh (${new Date(issue.ranAt).toLocaleString()}): ${issue.errors.join(" · ")}`}
              danger
              onClick={() => {}}
            />
          )}
        </span>
      </div>

      <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${T.line}` }}>
        <SourceRowActions
          source={source} issue={issue} busyAction={busyAction} busy={busy}
          doRefresh={doRefresh} toggleActive={toggleActive}
          setEditingLimit={setEditingLimit} setConfirmDelete={setConfirmDelete}
        />
      </div>

      <EditVideoLimitDialog
        open={editingLimit}
        initialValue={source.videoLimit}
        busy={busyAction === "edit"}
        onCancel={() => setEditingLimit(false)}
        onSave={saveVideoLimit}
      />
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
    </div>
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
  // ids we've already fetched thumb/issue data for — so re-loading the list
  // after one row's action (refresh, edit, ...) doesn't refetch every other
  // row's thumb + refresh-issue data too. Only ids new to the list, or an
  // id explicitly passed to load() as "this row changed", get (re)fetched.
  const fetchedRowIds = useRef(new Set());

  const loadRowData = useCallback((ids) => {
    if (!accessToken || !activeWorkspaceId || ids.length === 0) return;
    ids.forEach((id) => fetchedRowIds.current.add(id));

    ids.forEach((id) => {
      getGallery(accessToken, { workspaceId: activeWorkspaceId, sourceId: id, sortBy: "outlier_score", limit: 1 })
        .then((r) => setTopThumbs((prev) => ({ ...prev, [id]: r.cards?.[0]?.thumbUrl ?? null })))
        .catch(() => {});

      getSource(accessToken, activeWorkspaceId, id)
        .then((full) => {
          const run = full.refreshRuns?.[0];
          const job = full.lastRefreshJob;

          // A refusal (insufficient credits, Apify cap breach) never
          // reaches the point where a RefreshRun row gets written — so a
          // source can fail every attempt and `refreshRuns` stays empty.
          // If the last refresh JOB is a failure and it's more recent than
          // the last refresh RUN (or there is no run at all), that refusal
          // is the real story, not whatever the last successful run said.
          if (job?.status === "failed" && (!run || new Date(job.createdAt) > new Date(run.ranAt))) {
            setRefreshIssues((prev) => ({ ...prev, [id]: { errors: [job.lastError || "Refresh failed."], ranAt: job.createdAt } }));
            return;
          }

          if (!run) {
            setRefreshIssues((prev) => ({ ...prev, [id]: null }));
            return;
          }
          // errorsJson is the run's whole log, including bookkeeping the
          // connector keeps for support ("Refresh policy: mode=incremental
          // limit=5", "Already known: 1/3 results were existing videos").
          // Only the failures belong in the UI — see src/lib/refreshLog.js.
          const errors = parseRefreshFailures(run.errorsJson);
          setRefreshIssues((prev) => ({ ...prev, [id]: errors.length ? { errors, ranAt: run.ranAt } : null }));
        })
        .catch(() => {});
    });
  }, [accessToken, activeWorkspaceId]);

  // Pass a sourceId when only that one row changed (refresh, edit, ...) so
  // its thumb/issue get refetched without touching every other row; omit it
  // for a full reload (initial load, workspace switch, new source tracked)
  // — any id not yet fetched picks up row data automatically.
  const load = useCallback((affectedId) => {
    if (!accessToken || !activeWorkspaceId) return;
    listSources(accessToken, activeWorkspaceId)
      .then((list) => {
        setSources(list);
        const ids = affectedId
          ? [affectedId]
          : list.map((s) => s.id).filter((id) => !fetchedRowIds.current.has(id));
        loadRowData(ids);
      })
      .catch((err) => setError(err instanceof SourcesApiError ? err.message : "Couldn't load sources."));
  }, [accessToken, activeWorkspaceId, loadRowData]);

  useEffect(() => {
    setSources(null);
    setError("");
    setTopThumbs({});
    setRefreshIssues({});
    fetchedRowIds.current = new Set();
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

      {activeWorkspaceId && (
        <SuggestedSourcesPanel accessToken={accessToken} workspaceId={activeWorkspaceId} onTracked={load} />
      )}

      <div className="mt-8">
        {error ? (
          <AlertBanner>{error}</AlertBanner>
        ) : !activeWorkspaceId ? null : sources === null ? (
          <p style={{ fontSize: 14, color: T.muted }}>Loading…</p>
        ) : sources.length === 0 ? (
          <p style={{ fontSize: 14, color: T.muted }}>No sources tracked yet in this workspace.</p>
        ) : (
          <>
            {/* Desktop: table. A 5-column table with 4 icon actions per row
                has nowhere to go on a phone screen, so mobile gets its own
                stacked-card layout below instead of a squeezed/scrolling
                table. */}
            <table className="hidden sm:table w-full" style={{ borderCollapse: "collapse" }}>
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

            <div className="sm:hidden flex flex-col gap-3">
              {sources.map((s) => (
                <SourceCard
                  key={s.id}
                  source={s}
                  thumbUrl={topThumbs[s.id]}
                  issue={refreshIssues[s.id]}
                  accessToken={accessToken}
                  workspaceId={activeWorkspaceId}
                  onChanged={load}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
