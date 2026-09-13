// Side drawer for creating and editing scheduled posts. Same reuse contract
// as CalendarView: adapter in, callbacks out, no app imports.

import { useEffect, useMemo, useState } from "react";
import { toLocalInputValue, fromLocalInputValue } from "./dates.js";
import { providerMeta, stateStyle } from "./providerMeta.js";

export function ScheduleDrawer({ adapter, mode, group, initialDate, onClose, onSaved, onError }) {
  const [integrations, setIntegrations] = useState([]);
  const [content, setContent] = useState(group?.content ?? "");
  const [mediaRows, setMediaRows] = useState((group?.media ?? []).map((m) => ({ ...m })));
  const [selected, setSelected] = useState(
    mode === "edit" ? group.posts.map((p) => p.provider) : integrations.map((i) => i.id),
  );
  const [when, setWhen] = useState(toLocalInputValue(group?.publishDate ?? nextRoundedQuarterHour(initialDate)));
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
    () => mode === "create" ? selected : [],
    [mode, selected],
  );

  async function save() {
    setProblem(null);
    if (!content.trim()) return setProblem("Write a caption first.");
    if (mode === "create" && !createSelection.length) return setProblem("Pick at least one connected account.");

    const publishDate = fromLocalInputValue(when);
    if (publishDate === null) return setProblem("Pick a date and time.");

    setBusy(true);
    try {
      if (mode === "create") {
        await adapter.createGroup({
          integrationIds: createSelection,
          content: content.trim(),
          media: mediaRows.filter((row) => row.url),
          publishDate,
        });
      } else {
        await adapter.rescheduleGroup(group.groupId, publishDate);
      }
      onSaved();
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
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-white/10 bg-neutral-950 p-4 shadow-2xl"
      data-testid="schedule-drawer"
      aria-label={mode === "create" ? "New scheduled post" : "Scheduled post details"}
    >
      <header className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-neutral-100">{mode === "create" ? "New scheduled post" : "Scheduled post"}</h3>
        <button type="button" onClick={onClose} className="rounded p-1 text-neutral-400 hover:bg-white/5" aria-label="Close">
          ✕
        </button>
      </header>

      <div className="mt-4 flex flex-1 flex-col gap-4 overflow-y-auto">
        {mode === "edit" && (
          <div className="flex flex-col gap-1.5">
            {group.posts.map((post) => {
              const meta = providerMeta(post.provider);
              const style = stateStyle(
                post.state === "PUBLISHED" ? "published" : post.state === "PROCESSING" ? "processing" : post.state === "ERROR" ? "error" : "queued",
              );
              return (
                <div key={post.id} className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="rounded-sm bg-black/40 px-1 text-[10px] font-bold" style={{ color: meta.accent }}>
                      {meta.glyph}
                    </span>
                    <span className="text-neutral-300">{meta.label}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {post.releaseUrl && (
                      <a href={post.releaseUrl} target="_blank" rel="noreferrer" className="text-xs text-indigo-300 underline">
                        Open
                      </a>
                    )}
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${style.chip}`}>{style.label}</span>
                  </span>
                </div>
              );
            })}
            {group.posts.some((post) => post.error) && (
              <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-200">
                {group.posts.find((post) => post.error)?.error}
              </p>
            )}
          </div>
        )}

        <label className="flex flex-col gap-1 text-sm text-neutral-300">
          Caption
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={5}
            maxLength={2000}
            className="rounded-md border border-white/10 bg-white/5 p-2 text-sm text-neutral-100 outline-none focus:border-indigo-500/60"
            placeholder="What are you posting?"
            data-testid="caption-input"
          />
        </label>

        {mode === "create" && (
          <div className="flex flex-col gap-1 text-sm text-neutral-300">
            <span>Media URLs (optional — must be public links)</span>
            {mediaRows.map((row, index) => (
              <div key={index} className="flex gap-1">
                <input
                  value={row.url}
                  onChange={(event) =>
                    setMediaRows((rows) => rows.map((r, i) => (i === index ? { ...r, url: event.target.value, type: event.target.value.toLowerCase().includes(".mp4") ? "video" : "image" } : r)))
                  }
                  placeholder="https://…mp4 or image URL"
                  className="flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-neutral-100 outline-none focus:border-indigo-500/60"
                />
                <button type="button" onClick={() => setMediaRows((rows) => rows.filter((_, i) => i !== index))} className="px-2 text-neutral-500 hover:text-rose-300">
                  ✕
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setMediaRows((rows) => [...rows, { type: "image", url: "" }])} className="self-start text-xs text-indigo-300 hover:underline">
              + Add media
            </button>
          </div>
        )}

        <label className="flex flex-col gap-1 text-sm text-neutral-300">
          Publish at (your local time — stored as UTC)
          <input
            type="datetime-local"
            value={when}
            onChange={(event) => setWhen(event.target.value)}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500/60"
            data-testid="when-input"
          />
        </label>

        {mode === "create" && (
          <div className="flex flex-col gap-1 text-sm text-neutral-300">
            <span>Publish to</span>
            {integrations.length === 0 && <p className="text-xs text-neutral-500">No connected accounts yet — connect one above the calendar.</p>}
            {integrations.map((integration) => {
              const meta = providerMeta(integration.provider);
              return (
                <label key={integration.id} className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(integration.id)}
                    onChange={(event) =>
                      setSelected((current) => (event.target.checked ? [...current, integration.id] : current.filter((id) => id !== integration.id)))
                    }
                  />
                  <span className="rounded-sm bg-black/40 px-1 text-[10px] font-bold" style={{ color: meta.accent }}>
                    {meta.glyph}
                  </span>
                  <span className="text-neutral-200">{integration.name || meta.label}</span>
                  <span className="text-xs text-neutral-500">{integration.profile ? `@${integration.profile}` : ""}</span>
                </label>
              );
            })}
          </div>
        )}

        {problem && <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-200">{problem}</p>}
      </div>

      <footer className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
        {mode === "edit" ? (
          <button type="button" onClick={remove} disabled={busy} className="text-sm text-rose-300 hover:text-rose-200 disabled:opacity-50">
            Delete
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-neutral-300 hover:bg-white/5">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-md bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
            data-testid="save-post"
          >
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
