// Side drawer for creating and editing scheduled posts. Same reuse contract
// as CalendarView: adapter in, callbacks out, no app imports. Styling comes
// from the shared theme prop (./calendarTheme.js defaults = host palette).

import { useEffect, useMemo, useState } from "react";
import { toLocalInputValue, fromLocalInputValue } from "./dates.js";
import { providerMeta } from "./providerMeta.js";
import { resolveTheme } from "./calendarTheme.js";

const STATE_KEY = { PUBLISHED: "published", PROCESSING: "processing", ERROR: "error", QUEUE: "queued" };

export function ScheduleDrawer({ adapter, theme: themeOverride, mode, group, initialDate, initialContent = "", initialMedia, onClose, onSaved, onError }) {
  const theme = resolveTheme(themeOverride);
  const [integrations, setIntegrations] = useState([]);
  const [content, setContent] = useState(group?.content ?? initialContent);
  const [mediaRows, setMediaRows] = useState((group?.media ?? initialMedia ?? []).map((m) => ({ ...m })));
  const [selected, setSelected] = useState(
    mode === "edit" ? group.posts.map((p) => p.provider) : [],
  );
  const [when, setWhen] = useState(
    toLocalInputValue(
      group?.publishDate ?? Math.floor(nextRoundedQuarterHour(initialDate).getTime() / 1000),
    ),
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

  const createSelection = useMemo(
    () => (mode === "create" ? selected : []),
    [mode, selected],
  );

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

  async function save() {
    setProblem(null);
    if (!content.trim()) return setProblem("Write a caption first.");
    if (mode === "create" && !createSelection.length) return setProblem("Pick at least one connected account.");

    const publishDate = fromLocalInputValue(when);
    if (publishDate === null) return setProblem("Pick a date and time.");

    setBusy(true);
    try {
      let result;
      if (mode === "create") {
        result = await adapter.createGroup({
          integrationIds: createSelection,
          content: content.trim(),
          media: mediaRows.filter((row) => row.url),
          publishDate,
        });
      } else {
        await adapter.rescheduleGroup(group.groupId, publishDate);
      }
      onSaved(result);
    } catch (err) {
      setProblem(err.message || "Something went wrong.");
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
      onSaved();
    } catch (err) {
      setProblem(err.message || "Could not delete this post.");
      onError?.(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col p-4 shadow-xl"
      style={{ background: theme.card, borderLeft: `1px solid ${theme.line}` }}
      data-testid="schedule-drawer"
      aria-label={mode === "create" ? "New scheduled post" : "Scheduled post details"}
    >
      <header className="flex items-center justify-between">
        <h3 style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 17, color: theme.ink }}>
          {mode === "create" ? "New scheduled post" : "Scheduled post"}
        </h3>
        <button type="button" onClick={onClose} style={{ color: theme.muted }} className="rounded p-1 hover:opacity-70" aria-label="Close">
          ✕
        </button>
      </header>

      <div className="mt-4 flex flex-1 flex-col gap-4 overflow-y-auto">
        {mode === "edit" && (
          <div className="flex flex-col gap-1.5">
            {group.posts.map((post) => {
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
            {group.posts.some((post) => post.error) && (
              <p className="rounded-md px-2.5 py-1.5" style={{ background: "#FDECEA", border: "1px solid #F3B5AE", color: "#7A1F17", fontFamily: "'Inter', sans-serif", fontSize: 12 }}>
                {group.posts.find((post) => post.error)?.error}
              </p>
            )}
          </div>
        )}

        <label className="flex flex-col gap-1" style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: theme.muted }}>
          Caption
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={5}
            maxLength={2000}
            style={{ ...input, padding: 8 }}
            onFocus={(event) => (event.target.style.borderColor = theme.signal)}
            onBlur={(event) => (event.target.style.borderColor = theme.line)}
            placeholder="What are you posting?"
            data-testid="caption-input"
          />
        </label>

        {mode === "create" && (
          <div className="flex flex-col gap-1" style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: theme.muted }}>
            <span>Media URLs (optional — must be public links)</span>
            {mediaRows.map((row, index) => (
              <div key={index} className="flex gap-1">
                <input
                  value={row.url}
                  onChange={(event) =>
                    setMediaRows((rows) => rows.map((r, i) => (i === index ? { ...r, url: event.target.value, type: event.target.value.toLowerCase().includes(".mp4") ? "video" : "image" } : r)))
                  }
                  placeholder="https://…mp4 or image URL"
                  style={{ ...input, flex: 1, fontSize: 12, padding: "6px 8px", fontFamily: "'IBM Plex Mono', monospace" }}
                />
                <button type="button" onClick={() => setMediaRows((rows) => rows.filter((_, i) => i !== index))} style={{ color: theme.muted }} className="px-2 hover:text-red-500">
                  ✕
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setMediaRows((rows) => [...rows, { type: "image", url: "" }])} style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: theme.signal }} className="self-start hover:underline">
              + Add media
            </button>
          </div>
        )}

        <label className="flex flex-col gap-1" style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: theme.muted }}>
          Publish at (your local time — stored as UTC)
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
        {mode === "edit" ? (
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
          <button type="button" onClick={save} disabled={busy} style={ctaButton} className="hover:opacity-90 disabled:opacity-50" data-testid="save-post">
            {busy ? "Saving…" : mode === "create" ? "Schedule" : "Save time"}
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
