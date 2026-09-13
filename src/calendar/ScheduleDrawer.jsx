// Side drawer for creating, editing, and scheduling posts. Same reuse
// contract as CalendarView: adapter in, callbacks out, no app imports.
// Styling comes from the shared theme prop (./calendarTheme.js defaults =
// host palette).
//
// Modes:
//   create — composer; media via the upload strip (no direct URLs)
//   edit   — a scheduled group: edit caption/media, move the time, delete
//   draft  — a DRAFT group (possibly undated): same editing plus
//            "Save draft" (keeps it a draft) and "Schedule" (sets the date
//            and queues it — date required for undated drafts)

import { useEffect, useMemo, useState } from "react";
import { toLocalInputValue, fromLocalInputValue } from "./dates.js";
import { providerMeta } from "./providerMeta.js";
import { resolveTheme } from "./calendarTheme.js";
import { MediaThumbStrip } from "./MediaThumbStrip.jsx";

const STATE_KEY = { PUBLISHED: "published", PROCESSING: "processing", ERROR: "error", QUEUE: "queued", DRAFT: "draft" };

export function ScheduleDrawer({ adapter, theme: themeOverride, mode, group, initialDate, initialContent = "", initialMedia, onClose, onSaved, onError }) {
  const theme = resolveTheme(themeOverride);
  const [integrations, setIntegrations] = useState([]);
  const [content, setContent] = useState(group?.content ?? initialContent);
  const [mediaRows, setMediaRows] = useState((group?.media ?? initialMedia ?? []).map((m) => ({ ...m })));
  const [selected, setSelected] = useState(mode === "edit" || mode === "draft" ? (group?.posts ?? []).map((p) => p.provider) : []);
  // Undated drafts start with an empty datetime — a date is required to schedule.
  const [when, setWhen] = useState(
    group && group.publishDate
      ? toLocalInputValue(group.publishDate)
      : mode === "create"
        ? toLocalInputValue(Math.floor(nextRoundedQuarterHour(initialDate).getTime() / 1000))
        : "",
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    let alive = true;
    adapter
      .listIntegrations()
      .then(({ integrations: rows }) => {
        if (alive) setIntegrations(rows.filter((row) => !row.needsReconnect && !row.disabled));
      })
      .catch(onError);
    return () => {
      alive = false;
    };
  }, [adapter, onError]);

  const createSelection = useMemo(() => (mode === "create" ? selected : []), [mode, selected]);

  const input = {
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    borderRadius: 8,
    border: `1px solid ${theme.line}`,
    background: theme.card,
    color: theme.ink,
    outline: "none",
  };
  const ghostButton = {
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    padding: "7px 13px",
    borderRadius: 8,
    border: `1px solid ${theme.line}`,
    background: theme.card,
    color: theme.ink,
  };
  const ctaButton = {
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    fontWeight: 600,
    padding: "7px 13px",
    borderRadius: 8,
    background: theme.signal,
    border: `1px solid ${theme.signal}`,
    color: "#fff",
  };

  const publishDate = when ? fromLocalInputValue(when) : null;

  async function save() {
    setProblem(null);
    if (!content.trim() && !mediaRows.filter((row) => row.url).length) {
      return setProblem("Write a caption or add media first.");
    }
    if (mode === "create" && !createSelection.length) return setProblem("Pick at least one connected account.");
    if ((mode === "edit" || mode === "draft") && !when) return setProblem("Pick a date and time first.");
    const date = publishDate;
    if (mode !== "draft" && (date === null || !when)) return setProblem("Pick a date and time.");

    setBusy(true);
    try {
      let result;
      if (mode === "create") {
        result = await adapter.createGroup({
          integrationIds: createSelection,
          content: content.trim(),
          media: mediaRows.filter((row) => row.url),
          publishDate: date,
        });
      } else if (mode === "draft") {
        await adapter.updateGroup(group.groupId, { content: content.trim(), media: mediaRows.filter((row) => row.url) });
        if (date !== null) {
          await adapter.scheduleDraft(group.groupId, date);
          result = { scheduled: true, publishDate: date };
        } else {
          result = { draftSaved: true };
        }
      } else {
        await adapter.updateGroup(group.groupId, { content: content.trim(), media: mediaRows.filter((row) => row.url) });
        if (date !== null && date !== group.publishDate) await adapter.rescheduleGroup(group.groupId, date);
        result = { updated: true };
      }
      onSaved(result);
    } catch (err) {
      setProblem(err.message || "Something went wrong.");
      onError?.(err);
    } finally {
      setBusy(false);
    }
  }

  async function saveDraftOnly() {
    setProblem(null);
    setBusy(true);
    try {
      await adapter.updateGroup(group.groupId, { content: content.trim(), media: mediaRows.filter((row) => row.url) });
      onSaved({ draftSaved: true });
    } catch (err) {
      setProblem(err.message || "Could not save the draft.");
      onError?.(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!group) return;
    setBusy(true);
    try {
      await adapter.deleteGroup(group.groupId);
      onSaved({ deleted: true });
    } catch (err) {
      setProblem(err.message || "Could not delete this post.");
      onError?.(err);
    } finally {
      setBusy(false);
    }
  }

  const heading = mode === "create" ? "New scheduled post" : mode === "draft" ? "Draft" : "Scheduled post";

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col p-4 shadow-xl"
      style={{ background: theme.card, borderLeft: `1px solid ${theme.line}` }}
      data-testid="schedule-drawer"
      aria-label={heading}
    >
      <header className="flex items-center justify-between">
        <h3 style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 17, color: theme.ink }}>{heading}</h3>
        <button type="button" onClick={onClose} style={{ color: theme.muted }} className="rounded p-1 hover:opacity-70" aria-label="Close">
          ✕
        </button>
      </header>

      <div className="mt-4 flex flex-1 flex-col gap-4 overflow-y-auto">
        {mode !== "create" && (
          <div className="flex flex-col gap-1.5">
            {(group?.posts ?? []).map((post) => {
              const meta = providerMeta(post.provider);
              const state = theme.state[STATE_KEY[post.state] ?? "queued"];
              return (
                <div
                  key={post.id}
                  className="flex items-center justify-between rounded-md px-2.5 py-1.5"
                  style={{ border: `1px solid ${theme.line}`, background: theme.paper, fontFamily: "'Inter', sans-serif", fontSize: 13 }}
                >
                  <span className="flex items-center gap-2">
                    <span className="rounded-sm px-1 text-[10px] font-bold text-white" style={{ background: meta.accent, fontFamily: "'IBM Plex Mono', monospace" }}>
                      {meta.glyph}
                    </span>
                    <span style={{ color: theme.ink }}>{meta.label}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {post.releaseUrl && (
                      <a href={post.releaseUrl} target="_blank" rel="noreferrer" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: theme.signal }} className="underline">
                        Open
                      </a>
                    )}
                    <span
                      className="rounded-full border px-2 py-0.5 text-[10px]"
                      style={{ background: state.bg, borderColor: state.border, color: state.text, fontFamily: "'IBM Plex Mono', monospace" }}
                    >
                      {state.label}
                    </span>
                  </span>
                </div>
              );
            })}
            {(group?.posts ?? []).some((post) => post.error) && (
              <p className="rounded-md px-2.5 py-1.5" style={{ background: "#FDECEA", border: "1px solid #F3B5AE", color: "#7A1F17", fontFamily: "'Inter', sans-serif", fontSize: 12 }}>
                {(group?.posts ?? []).find((post) => post.error)?.error}
              </p>
            )}
          </div>
        )}

        <label className="flex flex-col gap-1" style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: theme.muted }}>
          Caption
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={4}
            maxLength={2000}
            style={{ ...input, padding: 8 }}
            onFocus={(event) => (event.target.style.borderColor = theme.signal)}
            onBlur={(event) => (event.target.style.borderColor = theme.line)}
            placeholder="What are you posting?"
            data-testid="caption-input"
          />
        </label>

        <div className="flex flex-col gap-1" style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: theme.muted }}>
          <span>Media — drag to reorder, ✕ removes, + uploads (stored in R2)</span>
          <MediaThumbStrip
            media={mediaRows}
            onChange={setMediaRows}
            uploadMedia={adapter.uploadMedia}
            theme={theme}
            onError={(err) => setProblem(err.message || "Upload failed.")}
          />
        </div>

        <label className="flex flex-col gap-1" style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: theme.muted }}>
          {mode === "draft" ? "Publish at (empty = stays a draft)" : "Publish at (your local time — stored as UTC)"}
          <input
            type="datetime-local"
            value={when}
            onChange={(event) => setWhen(event.target.value)}
            style={{ ...input, padding: "6px 8px", fontFamily: "'IBM Plex Mono', monospace" }}
            data-testid="when-input"
          />
        </label>

        {mode === "create" && (
          <div className="flex flex-col gap-1" style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: theme.muted }}>
            <span>Publish to</span>
            {integrations.length === 0 && <p style={{ fontSize: 12 }}>No connected accounts yet — connect one above the calendar.</p>}
            {integrations.map((integration) => {
              const meta = providerMeta(integration.provider);
              return (
                <label
                  key={integration.id}
                  className="flex items-center gap-2 rounded-md px-2.5 py-1.5"
                  style={{ border: `1px solid ${theme.line}`, background: theme.paper, fontSize: 13, color: theme.ink }}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(integration.id)}
                    onChange={(event) =>
                      setSelected((current) => (event.target.checked ? [...current, integration.id] : current.filter((id) => id !== integration.id)))
                    }
                  />
                  <span className="rounded-sm px-1 text-[10px] font-bold text-white" style={{ background: meta.accent, fontFamily: "'IBM Plex Mono', monospace" }}>
                    {meta.glyph}
                  </span>
                  <span>{integration.name || meta.label}</span>
                  <span style={{ fontSize: 12, color: theme.muted, fontFamily: "'IBM Plex Mono', monospace" }}>{integration.profile ? `@${integration.profile}` : ""}</span>
                </label>
              );
            })}
          </div>
        )}

        {problem && (
          <p className="rounded-md px-2.5 py-1.5" style={{ background: "#FDECEA", border: "1px solid #F3B5AE", color: "#7A1F17", fontFamily: "'Inter', sans-serif", fontSize: 12 }}>
            {problem}
          </p>
        )}
      </div>

      <footer className="mt-3 flex items-center justify-between gap-2 pt-3" style={{ borderTop: `1px solid ${theme.line}` }}>
        {group ? (
          <button type="button" onClick={remove} disabled={busy} style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#7A1F17" }} className="hover:opacity-70 disabled:opacity-50">
            Delete
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} style={ghostButton} className="hover:opacity-80">
            Cancel
          </button>
          {mode === "draft" && (
            <button type="button" onClick={saveDraftOnly} disabled={busy} style={ghostButton} className="hover:opacity-80 disabled:opacity-50" data-testid="save-draft">
              Save draft
            </button>
          )}
          <button type="button" onClick={save} disabled={busy} style={ctaButton} className="hover:opacity-90 disabled:opacity-50" data-testid="save-post">
            {busy ? "Saving…" : mode === "create" ? "Schedule" : mode === "draft" ? "Schedule" : "Save"}
          </button>
        </div>
      </footer>
    </aside>
  );
}

function nextRoundedQuarterHour(date) {
  const next = new Date(date);
  next.setSeconds(0, 0);
  next.setMinutes(Math.ceil(next.getMinutes() / 15) * 15);
  return next;
}
