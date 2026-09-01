import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { T, fD, fB, fM, fmtAge } from "../lib/theme.js";
import { SectionLabel, AlertBanner, ConfirmDialog, IconButton, Modal, RefreshIcon, PauseIcon, PlayIcon, TrashIcon, WarningIcon, EditIcon, CloseIcon, Skeleton } from "../components/ui.jsx";
import WorkspaceSwitcher from "../components/WorkspaceSwitcher.jsx";
import FirstRunSteps from "../components/FirstRunSteps.jsx";
import { useAuth } from "../lib/auth.jsx";
import { useWorkspace } from "../lib/workspace.jsx";
import { useToast } from "../lib/toast.jsx";
import { listSources, createSource, updateSource, deleteSource, refreshSource, suggestSources, verifySuggestedSource, dismissSuggestedSource, SourcesApiError } from "../lib/sources.js";
import { refreshIssueFromSource } from "../lib/refreshLog.js";
import { displayMediaUrl } from "../lib/mediaUrl.js";

const inputStyle = { ...fB, fontSize: 13, padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.line}`, background: T.card };
const SOURCE_TYPES = ["creator", "keyword", "hashtag"];

function SourceThumb({ src }) {
  const [failed, setFailed] = useState(false);
  const boxStyle = { width: 36, height: 48, borderRadius: 6, background: "#E7E8E3", flexShrink: 0 };
  const url = displayMediaUrl(src);

  if (!url || failed) {
    return <div style={boxStyle} />;
  }

  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ ...boxStyle, objectFit: "cover", display: "block" }}
    />
  );
}

function NewSourceForm({ accessToken, workspaceId, onCreated }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [sourceType, setSourceType] = useState("creator");
  const [query, setQuery] = useState("");
  const [videoLimit, setVideoLimit] = useState(20);
  const [isSelf, setIsSelf] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | loading

  async function submit(e) {
    e.preventDefault();
    if (!query.trim() || status === "loading") return;
    setStatus("loading");
    const label = query.trim();
    try {
      // TikTok only — the connector refuses reels/shorts today (no live
      // scraper for either), so the form never offers them.
      const source = await createSource(accessToken, workspaceId, {
        platform: "tiktok",
        sourceType,
        query: label,
        videoLimit,
        isSelf: sourceType === "creator" && isSelf,
      });
      setQuery("");
      setIsSelf(false);
      setStatus("idle");

      // A newly tracked source with no videos yet just reads as broken
      // ("never" in LAST REFRESH) until someone notices and clicks Refresh —
      // this is what the MCP conversational flow already does by default
      // (create_source chained straight into refresh_source, see
      // .claude/skills/track/SKILL.md), the site just wasn't doing it too.
      // Queuing is fast, but it's still a second network hop the form
      // shouldn't block on — fire it and report via toast.
      showToast(
        sourceType === "creator" && isSelf
          ? `Tracking your account ${label} — first scrape queued.`
          : `Now tracking ${label} — first scrape queued.`,
        { type: "success" },
      );
      refreshSource(accessToken, workspaceId, source.id)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["sources", workspaceId] });
        })
        .catch((refreshErr) => {
          showToast(
            `The first scrape for ${label} didn't start: `
            + (refreshErr instanceof SourcesApiError ? refreshErr.message : "couldn't queue refresh.")
            + " Use Refresh to retry.",
            { type: "error" },
          );
        });
      onCreated(source.id);
    } catch (err) {
      showToast(err instanceof SourcesApiError ? err.message : "Couldn't create source.", { type: "error" });
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 mt-4">
      <label className="flex flex-col gap-1">
        <span style={{ ...fM, fontSize: 11, color: T.muted }}>TYPE</span>
        <select
          value={sourceType}
          onChange={(e) => {
            const next = e.target.value;
            setSourceType(next);
            if (next !== "creator") setIsSelf(false);
          }}
          style={inputStyle}
        >
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
      {sourceType === "creator" && (
        <label className="flex items-center gap-2 pb-2" style={{ ...fB, fontSize: 12, color: T.ink }}>
          <input
            type="checkbox"
            checked={isSelf}
            onChange={(e) => setIsSelf(e.target.checked)}
          />
          This is my account
        </label>
      )}
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
      onTracked(source.id);
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
    <Modal ariaLabel="Edit video limit" onClose={onCancel}>
      <div style={{ ...fB, fontSize: 15, fontWeight: 700, color: T.ink }}>Edit video limit</div>
      <p className="mt-2" style={{ ...fB, fontSize: 13, color: T.muted, lineHeight: 1.5 }}>
        Max videos pulled per refresh (1–200). The tracked query can't be changed here — delete and re-track to change that.
      </p>
      <input
        type="number"
        min={1}
        max={200}
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
    </Modal>
  );
}

/**
 * Per-row thumb + last-refresh warning. Carried on GET /api/sources now —
 * the page used to fire gallery-data?limit=1 and /sources?id= per row
 * (N+1, ~2s each, and enough concurrent D1 queries to stall the Worker).
 */
function useSourceRowData(source) {
  return {
    thumbUrl: source.thumbUrl ?? null,
    issue: refreshIssueFromSource(source),
    issueUnavailable: false,
  };
}

/**
 * Shared state + handlers behind a source's row — the desktop table row and
 * the mobile card render this the same underlying entity in different DOM
 * shapes (a <tr> can't have a <div> sibling in a <tbody>, so they can't be
 * the same component), but neither should re-derive the actions themselves.
 *
 * Each action only disables its own button (busyAction), not its siblings —
 * pausing one row shouldn't make refreshing it impossible.
 */
function useSourceRowActions(source, accessToken, workspaceId) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [busyAction, setBusyAction] = useState(null); // null | "refresh" | "toggle" | "delete" | "edit" | "self"
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingLimit, setEditingLimit] = useState(false);

  function invalidateRow() {
    queryClient.invalidateQueries({ queryKey: ["sources", workspaceId] });
    queryClient.invalidateQueries({ queryKey: ["gallery", workspaceId] });
  }

  const toggleMutation = useMutation({
    mutationFn: () => updateSource(accessToken, workspaceId, source.id, { isActive: !source.isActive }),
    // Optimistic flip: the switch reflects the tap instantly; the server
    // confirms (or the cache rolls back) a moment later.
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["sources", workspaceId] });
      const previous = queryClient.getQueryData(["sources", workspaceId]);
      queryClient.setQueryData(["sources", workspaceId], (list) =>
        (list ?? []).map((s) => (s.id === source.id ? { ...s, isActive: !s.isActive } : s)),
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["sources", workspaceId], context.previous);
      showToast(err instanceof SourcesApiError ? err.message : "Couldn't update source.", { type: "error" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["sources", workspaceId] }),
  });

  async function saveVideoLimit(newLimit) {
    setBusyAction("edit");
    try {
      await updateSource(accessToken, workspaceId, source.id, { videoLimit: newLimit });
      setEditingLimit(false);
      showToast(`Video limit updated to ${newLimit}.`, { type: "success" });
      queryClient.invalidateQueries({ queryKey: ["sources", workspaceId] });
    } catch (err) {
      showToast(err instanceof SourcesApiError ? err.message : "Couldn't update video limit.", { type: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  async function toggleActive() {
    setBusyAction("toggle");
    try {
      await toggleMutation.mutateAsync();
    } catch {
      // onError already showed the toast.
    } finally {
      setBusyAction(null);
    }
  }

  async function toggleSelf() {
    if (source.sourceType !== "creator") return;
    setBusyAction("self");
    try {
      await updateSource(accessToken, workspaceId, source.id, { isSelf: !source.isSelf });
      showToast(
        source.isSelf ? "No longer marked as your account." : `Marked ${source.query} as your account.`,
        { type: "success" },
      );
      invalidateRow();
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
      invalidateRow();
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
      queryClient.invalidateQueries({ queryKey: ["sources", workspaceId] });
    } catch (err) {
      showToast(err instanceof SourcesApiError ? err.message : "Couldn't delete source.", { type: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  return {
    busyAction, confirmDelete, setConfirmDelete, editingLimit, setEditingLimit,
    saveVideoLimit, toggleActive, toggleSelf, doRefresh, doDelete,
  };
}

/** The four per-row action icon buttons — identical on desktop and mobile. */
function SourceRowActions({ source, issue, busyAction, doRefresh, toggleActive, toggleSelf, setEditingLimit, setConfirmDelete }) {
  return (
    <div className="flex items-center gap-1">
      <IconButton
        icon={<RefreshIcon />}
        label={busyAction === "refresh" ? "Refreshing…" : issue?.errors?.length > 0 ? "Retry — last refresh had errors" : "Refresh now"}
        disabled={busyAction === "refresh"}
        tone={issue?.errors?.length > 0 ? "#B3261E" : T.signal}
        onClick={doRefresh}
      />
      <IconButton
        icon={source.isActive ? <PauseIcon /> : <PlayIcon />}
        label={busyAction === "toggle" ? "Updating…" : source.isActive ? "Pause tracking" : "Resume tracking"}
        disabled={busyAction === "toggle"}
        onClick={toggleActive}
      />
      {source.sourceType === "creator" && (
        <button
          type="button"
          onClick={toggleSelf}
          disabled={busyAction === "self"}
          className="rounded px-1.5 py-0.5"
          style={{
            ...fM, fontSize: 11, fontWeight: 700,
            color: source.isSelf ? T.teal : T.muted,
            background: source.isSelf ? "#EAF6F4" : "transparent",
            border: `1px solid ${source.isSelf ? T.teal : T.line}`,
            opacity: busyAction === "self" ? 0.6 : 1,
          }}
          title={source.isSelf ? "This is your account — click to unmark" : "Mark as your account"}
        >
          {source.isSelf ? "You" : "Me"}
        </button>
      )}
      <IconButton
        icon={<EditIcon />}
        label={`Edit video limit (currently ${source.videoLimit})`}
        disabled={busyAction === "edit"}
        onClick={() => setEditingLimit(true)}
      />
      <IconButton
        icon={<TrashIcon />}
        label={busyAction === "delete" ? "Deleting…" : "Delete source"}
        disabled={busyAction === "delete"}
        danger
        onClick={() => setConfirmDelete(true)}
      />
    </div>
  );
}

function SourceIssueBadge({ issue, issueUnavailable }) {
  // Unlike a thumbnail, silently dropping the refresh-issue fetch would
  // render a failing source as perfectly healthy — surface it as a muted
  // warning instead of the red one.
  if (issueUnavailable) {
    return <IconButton icon={<WarningIcon />} label="Couldn't load last refresh status." onClick={() => {}} />;
  }
  if (issue?.errors?.length > 0) {
    return (
      <IconButton
        icon={<WarningIcon />}
        label={`Last refresh (${new Date(issue.ranAt).toLocaleString()}): ${issue.errors.join(" · ")}`}
        danger
        onClick={() => {}}
      />
    );
  }
  return null;
}

function SourceRow({ source, accessToken, workspaceId }) {
  const navigate = useNavigate();
  const {
    busyAction, confirmDelete, setConfirmDelete, editingLimit, setEditingLimit,
    saveVideoLimit, toggleActive, toggleSelf, doRefresh, doDelete,
  } = useSourceRowActions(source, accessToken, workspaceId);
  const { thumbUrl, issue, issueUnavailable } = useSourceRowData(source);

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
            <div className="flex items-center gap-2">
              <span style={{ ...fB, fontSize: 14 }}>{source.query}</span>
              {source.isSelf && (
                <span className="rounded px-1.5 py-0.5" style={{ ...fM, fontSize: 10, fontWeight: 700, color: T.teal, background: "#EAF6F4" }}>You</span>
              )}
            </div>
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
          <SourceIssueBadge issue={issue} issueUnavailable={issueUnavailable} />
        </div>
      </td>
      <td className="py-3">
        <SourceRowActions
          source={source} issue={issue} busyAction={busyAction}
          doRefresh={doRefresh} toggleActive={toggleActive} toggleSelf={toggleSelf}
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
function SourceCard({ source, accessToken, workspaceId }) {
  const navigate = useNavigate();
  const {
    busyAction, confirmDelete, setConfirmDelete, editingLimit, setEditingLimit,
    saveVideoLimit, toggleActive, toggleSelf, doRefresh, doDelete,
  } = useSourceRowActions(source, accessToken, workspaceId);
  const { thumbUrl, issue, issueUnavailable } = useSourceRowData(source);

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
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate" style={{ ...fB, fontSize: 14 }}>{source.query}</span>
            {source.isSelf && (
              <span className="shrink-0 rounded px-1.5 py-0.5" style={{ ...fM, fontSize: 10, fontWeight: 700, color: T.teal, background: "#EAF6F4" }}>You</span>
            )}
          </div>
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
          <SourceIssueBadge issue={issue} issueUnavailable={issueUnavailable} />
        </span>
      </div>

      <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${T.line}` }}>
        <SourceRowActions
          source={source} issue={issue} busyAction={busyAction}
          doRefresh={doRefresh} toggleActive={toggleActive} toggleSelf={toggleSelf}
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

function SourceRowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-3" style={{ borderTop: `1px solid ${T.line}` }}>
      <Skeleton style={{ width: 36, height: 48, borderRadius: 6 }} />
      <div className="flex flex-col gap-2 grow">
        <Skeleton style={{ height: 14, width: "40%" }} />
        <Skeleton style={{ height: 11, width: "24%" }} />
      </div>
      <Skeleton style={{ height: 11, width: 80 }} />
    </div>
  );
}

export default function Sources() {
  const { user, loading: authLoading, accessToken } = useAuth();
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const queryClient = useQueryClient();

  const sourcesQuery = useQuery({
    queryKey: ["sources", activeWorkspaceId],
    queryFn: ({ signal }) => listSources(accessToken, activeWorkspaceId, {}, signal),
    enabled: Boolean(accessToken && activeWorkspaceId),
    // Reloading the list after an action keeps the current rows on screen
    // while it revalidates; switching workspaces swaps to skeletons.
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey[1] === activeWorkspaceId ? prev : undefined,
  });
  const sources = sourcesQuery.data ?? [];

  // A tracked suggestion / new source joins the list; the id just seeds row
  // data immediately (the queries pick it up by key once the row mounts).
  function onCreated() {
    queryClient.invalidateQueries({ queryKey: ["sources", activeWorkspaceId] });
  }

  if (authLoading) {
    return (
      <section className="max-w-4xl mx-auto px-5 py-16">
        <SectionLabel>SOURCES</SectionLabel>
        <h1 className="mt-3" style={{ ...fD, fontWeight: 900, fontSize: 32, letterSpacing: -0.8 }}>
          Tracked sources
        </h1>
        <div className="mt-6"><Skeleton style={{ height: 38, width: 260 }} /></div>
        <div className="mt-8 flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, i) => <SourceRowSkeleton key={i} />)}
        </div>
      </section>
    );
  }
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

      <FirstRunSteps />

      <div className="mt-8 rounded-xl p-6" style={{ background: T.card, border: `1px solid ${T.line}` }}>
        <div style={{ ...fM, fontSize: 11, letterSpacing: 2, color: T.muted }}>TRACK A NEW SOURCE</div>
        {activeWorkspaceId ? (
          <NewSourceForm accessToken={accessToken} workspaceId={activeWorkspaceId} onCreated={onCreated} />
        ) : (
          <p className="mt-2" style={{ fontSize: 13, color: T.muted }}>
            {workspaceLoading ? "Loading workspaces…" : "Create a workspace above first."}
          </p>
        )}
      </div>

      {activeWorkspaceId && (
        <SuggestedSourcesPanel accessToken={accessToken} workspaceId={activeWorkspaceId} onTracked={onCreated} />
      )}

      <div className="mt-8">
        {sourcesQuery.isError ? (
          <AlertBanner
            action={
              <button
                type="button"
                onClick={() => sourcesQuery.refetch()}
                className="shrink-0 rounded-md px-2 py-1"
                style={{ ...fB, fontSize: 12, fontWeight: 600, color: "#7A1F17", textDecoration: "underline" }}
              >
                Retry
              </button>
            }
          >
            {sourcesQuery.error?.message || "Couldn't load sources."}
          </AlertBanner>
        ) : !activeWorkspaceId ? null : sourcesQuery.isPending ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }, (_, i) => <SourceRowSkeleton key={i} />)}
          </div>
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
                    accessToken={accessToken}
                    workspaceId={activeWorkspaceId}
                  />
                ))}
              </tbody>
            </table>

            <div className="sm:hidden flex flex-col gap-3">
              {sources.map((s) => (
                <SourceCard
                  key={s.id}
                  source={s}
                  accessToken={accessToken}
                  workspaceId={activeWorkspaceId}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
