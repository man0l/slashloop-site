// Reusable month-grid calendar for scheduled social posts.
//
// Reuse contract: this component talks ONLY to its `adapter` (see
// ./adapter.js) and never to app state or a specific API. Styling is
// Tailwind — drop the folder into any Tailwind app and pass an adapter.
//
// Features (docs/postiz-reuse-research.md §6):
//   • month grid, Monday-start, local timezone (UTC epoch storage)
//   • one chip per scheduled group per day, colored by aggregate state
//   • HTML5 drag-and-drop reschedule (time of day preserved); a 409 while a
//     group is mid-publish rolls the chip back and reports via onError
//   • click a chip → edit drawer (status per platform, release links,
//     reschedule, delete); click an empty day → composer prefilled

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { monthGrid, isToday, formatTime, formatDayHeading, moveEpochToDay, dayStartEpoch, WEEKDAY_LABELS } from "./dates.js";
import { providerMeta, stateStyle } from "./providerMeta.js";
import { ScheduleDrawer } from "./ScheduleDrawer.jsx";

export function CalendarView({ adapter, initialDate = new Date(), onError, className = "" }) {
  const [cursor, setCursor] = useState({ year: initialDate.getFullYear(), month: initialDate.getMonth() });
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragOverIso, setDragOverIso] = useState(null);
  const [drawer, setDrawer] = useState(null); // {mode:'create', date} | {mode:'edit', group}
  const dragGroupRef = useRef(null);

  const weeks = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);

  const range = useMemo(() => {
    const first = weeks[0][0].date;
    const last = weeks[weeks.length - 1][6].date;
    return [dayStartEpoch(first), dayStartEpoch(last) + 86399];
  }, [weeks]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setGroups(await adapter.listGroups(range[0], range[1]));
    } catch (err) {
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }, [adapter, range[0], range[1], onError]);

  useEffect(() => {
    load();
  }, [load]);

  const byIso = useMemo(() => {
    const map = new Map();
    for (const group of groups) {
      const date = new Date(group.publishDate * 1000);
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      if (!map.has(iso)) map.set(iso, []);
      map.get(iso).push(group);
    }
    return map;
  }, [groups]);

  async function handleDrop(iso, cellDate) {
    setDragOverIso(null);
    const group = dragGroupRef.current;
    dragGroupRef.current = null;
    if (!group) return;

    const target = moveEpochToDay(group.publishDate, cellDate);
    if (target === group.publishDate) return;

    const previous = groups;
    setGroups((rows) => rows.map((row) => (row.groupId === group.groupId ? { ...row, publishDate: target } : row)));
    try {
      await adapter.rescheduleGroup(group.groupId, target);
      await load();
    } catch (err) {
      setGroups(previous); // chip rolls back — mid-publish (409) or API error
      onError?.(err);
    }
  }

  function navigate(delta) {
    setCursor(({ year, month }) => {
      const next = new Date(year, month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  return (
    <div className={`flex flex-col gap-3 ${className}`} data-testid="calendar">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-md border border-white/10 px-2.5 py-1 text-sm text-neutral-300 hover:bg-white/5"
            aria-label="Previous month"
          >
            ←
          </button>
          <h2 className="min-w-40 text-center text-lg font-semibold text-neutral-100">{formatDayHeading(cursor.year, cursor.month)}</h2>
          <button
            type="button"
            onClick={() => navigate(1)}
            className="rounded-md border border-white/10 px-2.5 py-1 text-sm text-neutral-300 hover:bg-white/5"
            aria-label="Next month"
          >
            →
          </button>
          <button
            type="button"
            onClick={() => setCursor({ year: new Date().getFullYear(), month: new Date().getMonth() })}
            className="ml-1 rounded-md border border-white/10 px-2.5 py-1 text-xs text-neutral-300 hover:bg-white/5"
          >
            Today
          </button>
        </div>
        <button
          type="button"
          onClick={() => setDrawer({ mode: "create", date: new Date() })}
          className="rounded-md bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-400"
        >
          New post
        </button>
      </header>

      <div className="grid grid-cols-7 gap-px text-center text-xs font-medium text-neutral-500">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-1">
            {label}
          </div>
        ))}
      </div>

      <div className={`grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-white/10 bg-white/5 ${loading ? "opacity-60" : ""}`} data-testid="calendar-grid">
        {weeks.flat().map((cell) => {
          const dayGroups = byIso.get(cell.iso) ?? [];
          return (
            <div
              key={cell.iso}
              data-day={cell.iso}
              onClick={() => setDrawer({ mode: "create", date: cell.date })}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverIso(cell.iso);
              }}
              onDragLeave={() => setDragOverIso((current) => (current === cell.iso ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                handleDrop(cell.iso, cell.date);
              }}
              className={`flex min-h-24 flex-col gap-1 border border-white/5 p-1.5 ${cell.inMonth ? "bg-neutral-950" : "bg-neutral-950/40"} ${
                dragOverIso === cell.iso ? "ring-2 ring-indigo-500/70" : ""
              } cursor-pointer`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                    isToday(cell.date) ? "bg-indigo-500 font-semibold text-white" : cell.inMonth ? "text-neutral-300" : "text-neutral-600"
                  }`}
                >
                  {cell.date.getDate()}
                </span>
              </div>
              {dayGroups.map((group) => (
                <GroupChip
                  key={group.groupId}
                  group={group}
                  onClick={(event) => {
                    event.stopPropagation();
                    setDrawer({ mode: "edit", group });
                  }}
                  onDragStart={(event) => {
                    dragGroupRef.current = group;
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", group.groupId);
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>

      {drawer && (
        <ScheduleDrawer
          adapter={adapter}
          mode={drawer.mode}
          group={drawer.group ?? null}
          initialDate={drawer.date ?? new Date()}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            load();
          }}
          onError={onError}
        />
      )}
    </div>
  );
}

function GroupChip({ group, onClick, onDragStart }) {
  const style = stateStyle(group.state);
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className={`flex w-full items-center gap-1 rounded border px-1.5 py-1 text-left text-[11px] leading-tight ${style.chip} cursor-grab active:cursor-grabbing`}
      title={group.content}
      data-group-id={group.groupId}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
      <span className="shrink-0 font-medium opacity-80">{formatTime(group.publishDate)}</span>
      <span className="flex shrink-0 gap-0.5">
        {group.posts.slice(0, 4).map((post) => (
          <span
            key={post.id}
            className="rounded-sm bg-black/30 px-0.5 text-[9px] font-bold"
            style={{ color: providerMeta(post.provider).accent }}
            title={providerMeta(post.provider).label}
          >
            {providerMeta(post.provider).glyph}
          </span>
        ))}
      </span>
      <span className="truncate">{group.content}</span>
    </button>
  );
}
