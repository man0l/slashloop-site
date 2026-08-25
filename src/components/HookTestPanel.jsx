// The AI hook-test workspace, standalone from MCP: one modal that runs the
// whole loop against the connector's REST surface —
//
//   Start (StartHookTestDialog) → generate 4 openings (2cr)
//   Edit the lock               → insight + "same-in every video" chips,
//                                 hard constraints every re-roll obeys (free)
//   Pick                        → checkbox the winners, Save picks
//   Re-roll                     → discard drafts, regenerate under the lock (2cr)
//   Export                      → shot list markdown, copy or download
//   Close                       → archive as won/closed
//
// Server truth wins: the panel always fetches the open test itself, and any
// 409/404 from a mutation triggers a refetch instead of a blind retry.

import { useEffect, useRef, useState } from "react";
import { T, fB, fM, fmtAge } from "../lib/theme.js";
import { Modal, ConfirmDialog, AlertBanner, Spinner } from "./ui.jsx";
import {
  useOpenHookTest,
  useStartHookTest,
  useUpdateHookTestLock,
  usePickHookVersions,
  useRerollHooks,
  useCloseHookTest,
} from "../lib/useHookTests.js";
import { getShotlist, friendlyHookTestError } from "../lib/hookTests.js";

const OPEN_STATUSES = new Set(["setup", "picking", "posted"]);

const statusChipStyle = (status) => ({
  fontWeight: 700,
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 999,
  color: status === "won" ? "#0F7B6C" : status === "closed" ? "#6E7681" : "#7C5CFF",
  background: status === "won" ? "#EAF6F4" : status === "closed" ? "#EDEEF1" : "#F2EEFF",
});

function toMessage(err, fallback) {
  return typeof err === "object" && err !== null && err.message ? err.message : fallback;
}

/**
 * Entry point from an untested-but-analyzed gallery card: explains the 2-credit
 * cost, takes optional brand context, starts the test. A 409 means a test was
 * opened meanwhile — treated as success (onStarted opens the panel, which
 * loads whatever the server has).
 */
export function StartHookTestDialog({ accessToken, workspaceId, videoId, onClose, onStarted }) {
  const startM = useStartHookTest();
  const [context, setContext] = useState("");
  const [error, setError] = useState(null);

  async function start() {
    setError(null);
    let res;
    try {
      res = await startM.mutateAsync({
        accessToken,
        workspaceId,
        videoId,
        brandContext: context.trim() || undefined,
      });
      onStarted(res);
    } catch (err) {
      const friendly = friendlyHookTestError(err);
      if (friendly.kind === "conflict") {
        // Someone/something already opened a test for this video — the panel
        // will show it; nothing was charged.
        onStarted(null);
        return;
      }
      setError(friendly.message);
    }
  }

  const busy = startM.isPending;

  return (
    <Modal ariaLabel="Start AI hook test" onClose={busy ? () => {} : onClose}>
      <div style={{ ...fB, fontSize: 15, fontWeight: 700, color: T.ink }}>Test hooks on this video</div>
      <p className="mt-2" style={{ ...fB, fontSize: 13, color: T.muted, lineHeight: 1.5 }}>
        Generates four alternative openings from this video's proven angle — one per type
        (recognition, specific number, contrarian, demo-first) — for you to pick from and shoot.{" "}
        <span style={{ fontWeight: 600, color: "#7C5CFF" }}>Costs 2 credits.</span>
      </p>
      <label className="mt-3 flex flex-col gap-1">
        <span style={{ ...fM, fontSize: 11, letterSpacing: 1, color: T.muted }}>CONTEXT FOR THE MODEL (OPTIONAL)</span>
        <textarea
          rows={3}
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="e.g. our product is a running app for beginners — avoid anything face-on-camera"
          className="rounded-md px-2 py-1.5"
          style={{ ...fB, fontSize: 13, border: `1px solid ${T.line}`, background: T.card, resize: "vertical" }}
        />
      </label>
      {error && (
        <div className="mt-3">
          <AlertBanner>{error}</AlertBanner>
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded-md px-3 py-1.5"
          style={{ ...fB, fontSize: 13, color: T.muted }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={start}
          disabled={busy}
          data-testid="start-hook-test-confirm"
          className="rounded-md px-3 py-1.5 font-semibold inline-flex items-center gap-1.5"
          style={{ ...fB, fontSize: 13, background: "#7C5CFF", color: "#fff", opacity: busy ? 0.6 : 1 }}
        >
          {busy && <Spinner />}
          {busy ? "Generating…" : "Generate 4 openings"}
        </button>
      </div>
    </Modal>
  );
}

function VersionRow({ v, checked, pickable, onToggle }) {
  return (
    <label
      data-testid={`hook-version-row-${v.label}`}
      className="flex items-start gap-2 rounded-md px-2 py-2"
      style={{
        border: `1px solid ${checked ? "#7C5CFF" : T.line}`,
        background: checked ? "#F9F7FF" : T.card,
        cursor: pickable ? "pointer" : "default",
        opacity: v.status === "discarded" ? 0.45 : 1,
      }}
    >
      <input
        type="checkbox"
        data-testid={`hook-version-check-${v.label}`}
        checked={checked}
        disabled={!pickable}
        onChange={onToggle}
        style={{ accentColor: "#7C5CFF", marginTop: 3 }}
      />
      <span
        className="flex items-center justify-center rounded shrink-0"
        style={{ ...fM, fontSize: 11, fontWeight: 700, width: 20, height: 20, background: "#14181D", color: "#fff" }}
      >
        {v.label}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span style={{ ...fB, fontSize: 13, fontWeight: 600, color: T.ink, overflowWrap: "anywhere" }}>{v.hookText}</span>
        {v.firstFrame && (
          <span style={{ ...fB, fontSize: 12, fontStyle: "italic", color: T.muted }}>
            First frame: {v.firstFrame}
          </span>
        )}
        {v.mechanism && (
          <span style={{ ...fB, fontSize: 12, color: T.muted }}>Why it works: {v.mechanism}</span>
        )}
        <span style={{ ...fM, fontSize: 10.5, color: T.muted }}>
          round {v.round} · {v.hookType.replaceAll("_", " ")} · {v.status}
        </span>
      </span>
    </label>
  );
}

function ShotlistSection({ accessToken, workspaceId, videoId }) {
  const [state, setState] = useState({ loading: false, markdown: null, error: null });
  const [copied, setCopied] = useState(false);

  async function load() {
    setState({ loading: true, markdown: null, error: null });
    try {
      const { markdown } = await getShotlist(accessToken, { workspaceId, videoId });
      setState({ loading: false, markdown, error: null });
    } catch (err) {
      setState({ loading: false, markdown: null, error: friendlyHookTestError(err).message });
    }
  }

  function copy() {
    navigator.clipboard?.writeText(state.markdown).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  }

  function download() {
    const blob = new Blob([state.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hook-test-${videoId.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      {!state.markdown && (
        <button
          type="button"
          onClick={load}
          disabled={state.loading}
          data-testid="shotlist-btn"
          className="self-start rounded-md px-3 py-1.5 font-semibold"
          style={{ ...fB, fontSize: 12.5, border: `1.5px solid ${T.ink}`, color: T.ink, background: "transparent", opacity: state.loading ? 0.5 : 1 }}
        >
          {state.loading ? "Building…" : "📄 Shot list"}
        </button>
      )}
      {state.error && <AlertBanner>{state.error}</AlertBanner>}
      {state.markdown && (
        <>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copy}
              data-testid="shotlist-copy"
              className="rounded-md px-2.5 py-1 font-semibold"
              style={{ ...fB, fontSize: 12, background: T.teal, color: "#fff" }}
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
            <button
              type="button"
              onClick={download}
              className="rounded-md px-2.5 py-1 font-semibold"
              style={{ ...fB, fontSize: 12, border: `1.5px solid ${T.ink}`, color: T.ink, background: "transparent" }}
            >
              Download .md
            </button>
            <button
              type="button"
              onClick={() => setState((s) => ({ ...s, markdown: null }))}
              style={{ ...fB, fontSize: 12, color: T.muted }}
            >
              hide
            </button>
          </div>
          <pre
            className="overflow-auto rounded-md p-2"
            style={{ ...fM, fontSize: 11, lineHeight: 1.5, maxHeight: 260, background: "#F7F8F5", border: `1px solid ${T.line}`, whiteSpace: "pre-wrap" }}
          >
            {state.markdown}
          </pre>
        </>
      )}
    </div>
  );
}

export default function HookTestPanel({ accessToken, workspaceId, videoId, onClose }) {
  const q = useOpenHookTest({ accessToken, workspaceId, videoId });
  const lockM = useUpdateHookTestLock();
  const pickM = usePickHookVersions();
  const rerollM = useRerollHooks();
  const closeM = useCloseHookTest();

  const test = q.data?.test ?? null;
  const versions = test?.versions ?? [];
  // New version ids (re-roll, next round) reset picks; test.id resets drafts.
  const versionSig = versions.map((v) => v.id).join(",");

  const [insightDraft, setInsightDraft] = useState("");
  const [chipsDraft, setChipsDraft] = useState([]);
  const [chipInput, setChipInput] = useState("");
  const [picks, setPicks] = useState(() => new Set());
  const insightDirty = useRef(false);
  const chipsDirty = useRef(false);
  const [banner, setBanner] = useState(null); // string
  const [confirmReroll, setConfirmReroll] = useState(false);
  const [confirmClose, setConfirmClose] = useState(null); // null | 'won' | 'closed'

  useEffect(() => {
    if (!test) return;
    // Server truth flows in unless the user is mid-edit on that field; the
    // dirty flags clear once their edit is accepted by the server.
    if (!insightDirty.current) setInsightDraft(test.insight ?? "");
    if (!chipsDirty.current) setChipsDraft(test.sameIn ?? []);
    setPicks(new Set(versions.filter((v) => v.status === "picked").map((v) => v.label)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test?.id, versionSig]);

  const isOpen = Boolean(test && OPEN_STATUSES.has(test.status));
  const serverPicked = versions.filter((v) => v.status === "picked").map((v) => v.label).sort();
  const picksChanged =
    JSON.stringify([...picks].sort()) !== JSON.stringify(serverPicked) && [...picks].some((l) => versions.some((v) => v.label === l));
  const busy = lockM.isPending || pickM.isPending || rerollM.isPending || closeM.isPending;

  function fail(err, fallback) {
    const friendly = friendlyHookTestError(err);
    setBanner(friendly.message);
    // The test moved under us (closed elsewhere, re-rolled elsewhere) —
    // resync instead of letting the user act on a stale copy.
    if (friendly.kind === "conflict" || friendly.kind === "notFound") q.refetch();
  }

  function togglePick(label) {
    setPicks((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  async function saveInsight() {
    if (!isOpen) return;
    const trimmed = insightDraft.trim();
    if (!trimmed || trimmed === test.insight) return;
    try {
      await lockM.mutateAsync({ accessToken, workspaceId, videoId, insight: trimmed, sameIn: undefined });
      insightDirty.current = false;
      setBanner(null);
    } catch (err) {
      insightDirty.current = false; // server value re-applies on refetch
      fail(err, "Couldn't save the insight.");
    }
  }

  async function saveChips(nextChips) {
    if (!isOpen) return;
    try {
      await lockM.mutateAsync({ accessToken, workspaceId, videoId, insight: undefined, sameIn: nextChips });
      chipsDirty.current = false;
      setChipInput("");
      setBanner(null);
    } catch (err) {
      fail(err, "Couldn't save the constants.");
    }
  }

  function commitChipInput() {
    const value = chipInput.trim().replace(/,+$/, "");
    if (!value) {
      setChipInput("");
      return;
    }
    const next = [...new Set([...chipsDraft, value])].slice(0, 8);
    setChipsDraft(next);
    chipsDirty.current = true;
    saveChips(next);
  }

  function removeChip(chip) {
    const next = chipsDraft.filter((c) => c !== chip);
    setChipsDraft(next);
    chipsDirty.current = true;
    saveChips(next);
  }

  async function savePicks() {
    try {
      await pickM.mutateAsync({ accessToken, workspaceId, videoId, picks: [...picks].sort() });
      setBanner(null);
    } catch (err) {
      fail(err, "Couldn't save your picks.");
    }
  }

  async function reroll() {
    setConfirmReroll(false);
    try {
      await rerollM.mutateAsync({ accessToken, workspaceId, videoId });
      setBanner(null);
    } catch (err) {
      fail(err, "The re-roll didn't go through.");
    }
  }

  async function closeAs(outcome) {
    setConfirmClose(null);
    try {
      await closeM.mutateAsync({ accessToken, workspaceId, videoId, outcome });
      onClose(); // nothing left to manage here — back to the list/gallery
    } catch (err) {
      fail(err, "Couldn't close the test.");
    }
  }

  const loading = q.isPending;
  const loadError = q.isError ? friendlyHookTestError(q.error) : null;

  return (
    <Modal
      ariaLabel="AI hook test"
      // Backdrop/Escape stay inert while a mutation is in flight — closing
      // mid-re-roll would orphan a generation the user already paid for.
      onClose={busy ? () => {} : onClose}
      panelClassName="max-w-lg"
      panelStyle={{ maxHeight: "88vh", overflowY: "auto" }}
    >
      <div data-testid="hook-test-panel">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <div style={{ ...fM, fontSize: 11, letterSpacing: 3, color: "#7C5CFF" }}>AI HOOK TEST</div>
            {test && (
              <div className="flex items-center gap-2">
                <span style={statusChipStyle(test.status)}>{test.status}</span>
                <span style={{ ...fM, fontSize: 11, color: T.muted }}>opened {fmtAge(Date.parse(test.createdAt))} ago</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="rounded p-1 hover:bg-black/5"
            style={{ ...fB, fontSize: 16, color: T.muted }}
          >
            ✕
          </button>
        </div>

        {loading && (
          <div className="mt-6 flex items-center justify-center gap-2" style={{ ...fB, fontSize: 13, color: T.muted }}>
            <Spinner /> Loading test…
          </div>
        )}

        {loadError && (
          <div className="mt-4 flex flex-col gap-2">
            <AlertBanner>{loadError.message}</AlertBanner>
            <button
              type="button"
              onClick={() => q.refetch()}
              className="self-start rounded-md px-3 py-1.5 font-semibold"
              style={{ ...fB, fontSize: 12.5, border: `1.5px solid ${T.ink}`, color: T.ink }}
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !loadError && !test && (
          <p className="mt-4" style={{ ...fB, fontSize: 13, color: T.muted }}>
            No hook test is open for this video. Start one from its gallery card.
          </p>
        )}

        {test && (
          <>
            {banner && (
              <div className="mt-3">
                <AlertBanner>{banner}</AlertBanner>
              </div>
            )}

            {rerollM.isPending ? (
              <div className="mt-6 flex flex-col items-center gap-2 py-8" style={{ ...fB, fontSize: 13, color: T.muted }}>
                <Spinner />
                Generating four new openings under your lock…
              </div>
            ) : (
              <>
                {/* ---- The lock ---- */}
                <fieldset disabled={!isOpen || busy} className="mt-4 flex flex-col gap-3" style={{ border: "none", margin: 0, padding: 0 }}>
                  <label className="flex flex-col gap-1">
                    <span style={{ ...fM, fontSize: 11, letterSpacing: 1, color: T.muted }}>
                      INSIGHT — WHAT MADE THE ORIGINAL WORK
                    </span>
                    <textarea
                      rows={2}
                      value={insightDraft}
                      onChange={(e) => {
                        insightDirty.current = true;
                        setInsightDraft(e.target.value);
                      }}
                      onBlur={saveInsight}
                      data-testid="hook-insight-input"
                      placeholder="One sentence naming the mechanism…"
                      className="rounded-md px-2 py-1.5"
                      style={{ ...fB, fontSize: 13, border: `1px solid ${T.line}`, background: T.card, resize: "vertical" }}
                    />
                    <span style={{ ...fB, fontSize: 11, color: T.muted }}>Saved on blur — every re-roll obeys this verbatim.</span>
                  </label>

                  <div className="flex flex-col gap-1">
                    <span style={{ ...fM, fontSize: 11, letterSpacing: 1, color: T.muted }}>
                      KEEP IN EVERY VERSION ({chipsDraft.length}/8)
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {chipsDraft.map((chip) => (
                        <span
                          key={chip}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5"
                          style={{ ...fB, fontSize: 12, color: T.teal, background: "#EAF6F4" }}
                        >
                          {chip}
                          {isOpen && (
                            <button
                              type="button"
                              onClick={() => removeChip(chip)}
                              aria-label={`Remove "${chip}"`}
                              style={{ color: T.teal, fontWeight: 700 }}
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                      {isOpen && chipsDraft.length < 8 && (
                        <input
                          value={chipInput}
                          onChange={(e) => setChipInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === ",") {
                              e.preventDefault();
                              commitChipInput();
                            }
                          }}
                          onBlur={() => chipInput.trim() && commitChipInput()}
                          data-testid="hook-chip-input"
                          placeholder="+ add constant, Enter"
                          className="rounded px-1.5 py-0.5"
                          style={{ ...fB, fontSize: 12, border: `1px dashed ${T.line}`, width: 170, background: T.card }}
                        />
                      )}
                    </div>
                  </div>

                  {test.stopRule && (
                    <p style={{ ...fB, fontSize: 11.5, color: T.muted, margin: 0 }}>
                      Stop rule: {test.stopRule}
                    </p>
                  )}
                </fieldset>

                {/* ---- Openings ---- */}
                <div className="mt-4 flex items-center justify-between">
                  <span style={{ ...fM, fontSize: 11, letterSpacing: 1, color: T.muted }}>
                    OPENINGS ({versions.filter((v) => v.status === "picked").length} picked)
                  </span>
                </div>
                <div className="mt-2 flex flex-col gap-2">
                  {versions.length === 0 && (
                    <p style={{ ...fB, fontSize: 12.5, color: T.muted }}>No openings yet.</p>
                  )}
                  {versions.map((v) => (
                    <VersionRow
                      key={v.id}
                      v={v}
                      checked={picks.has(v.label)}
                      pickable={isOpen && (v.status === "proposed" || v.status === "picked")}
                      onToggle={() => togglePick(v.label)}
                    />
                  ))}
                </div>

                {isOpen && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={savePicks}
                      disabled={!picksChanged || busy}
                      data-testid="save-picks"
                      className="rounded-md px-3 py-1.5 font-semibold"
                      style={{ ...fB, fontSize: 12.5, background: "#7C5CFF", color: "#fff", opacity: !picksChanged || busy ? 0.4 : 1 }}
                    >
                      {pickM.isPending ? "Saving…" : `Save picks (${picks.size})`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReroll(true)}
                      disabled={busy}
                      data-testid="reroll-hooks"
                      className="rounded-md px-3 py-1.5 font-semibold"
                      style={{ ...fB, fontSize: 12.5, border: `1.5px solid ${T.ink}`, color: T.ink, opacity: busy ? 0.4 : 1 }}
                    >
                      ⟳ Re-roll · 2cr
                    </button>
                  </div>
                )}
              </>
            )}

            {/* ---- Export + lifecycle ---- */}
            <ShotlistSection accessToken={accessToken} workspaceId={workspaceId} videoId={videoId} />

            {isOpen && !rerollM.isPending && (
              <div className="mt-4 flex items-center gap-3" style={{ borderTop: `1px solid ${T.line}`, paddingTop: 10 }}>
                <span style={{ ...fB, fontSize: 12, color: T.muted }}>Done with this test?</span>
                <button
                  type="button"
                  onClick={() => setConfirmClose("won")}
                  disabled={busy}
                  className="rounded-md px-2.5 py-1 font-semibold"
                  style={{ ...fB, fontSize: 12, background: T.teal, color: "#fff" }}
                >
                  🏆 Won
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClose("closed")}
                  disabled={busy}
                  className="rounded-md px-2.5 py-1"
                  style={{ ...fB, fontSize: 12, color: "#B3261E" }}
                >
                  Close without posting
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmReroll}
        title="Re-roll all openings?"
        message="Discards every current draft (picked ones included) and generates four new openings guided by your locked insight and constants. Costs 2 credits."
        confirmLabel="Re-roll · 2cr"
        busy={rerollM.isPending}
        onConfirm={reroll}
        onCancel={() => setConfirmReroll(false)}
      />
      <ConfirmDialog
        open={Boolean(confirmClose)}
        title={confirmClose === "won" ? "Mark this test won?" : "Close this test?"}
        message={
          confirmClose === "won"
            ? "Archives the test as won — a picked opening beat the original. You can find it later under closed tests."
            : "Archives the test without posting. You can find it later under closed tests."
        }
        confirmLabel={confirmClose === "won" ? "Won 🏆" : "Close test"}
        danger={confirmClose === "closed"}
        busy={closeM.isPending}
        onConfirm={() => closeAs(confirmClose)}
        onCancel={() => setConfirmClose(null)}
      />
    </Modal>
  );
}
