// Reusable month-grid calendar for scheduled social posts.
//
// Reuse contract: this component talks ONLY to its `adapter` (see
// ./adapter.js) and never to app state or a specific API. Styling is driven
// by the `theme` prop (see ./calendarTheme.js — defaults mirror the host
// site's token palette: ink/paper/card/line/signal/teal), so dropping the
// folder into another app is a matter of passing its tokens.
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
import { providerMeta } from "./providerMeta.js";
import { resolveTheme } from "./calendarTheme.js";
import { ScheduleDrawer } from "./ScheduleDrawer.jsx";

export function CalendarView({ adapter, initialDate = new Date(), onError, theme: themeOverride, className = "" }) {
  const theme = resolveTheme(themeOverride);
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

  const navButton = {
    ...{ fontFamily: "'Inter', sans-serif", fontSize: 13 },
    padding: "5px 11px",
    borderRadius: 8,
    border: `1px solid ${theme.line}`,
    background: theme.card,
    color: theme.ink,
  };

  return (
    <div className={`flex flex-col gap-3 ${className}`} data-testid="calendar" style={{ color: theme.ink }}>
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate(-1)} style={navButton} className="hover:opacity-80" aria-label="Previous month">
            ←
          </button>
          <h2 className="min-w-40 text-center" style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 18, color: theme.ink }}>
            {formatDayHeading(cursor.year, cursor.month)}
          </h2>
          <button type="button" onClick={() => navigate(1)} style={navButton} className="hover:opacity-80" aria-label="Next month">
            →
          </button>
          <button
            type="button"
            onClick={() => setCursor({ year: new Date().getFullYear(), month: new Date().getMonth() })}
            style={{ ...navButton, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}
            className="hover:opacity-80"
          >
            Today
          </button>
        </div>
        <button
          type="button"
          onClick={() => setDrawer({ mode: "create", date: new Date() })}
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 600,
            padding: "7px 13px",
            borderRadius: 8,
            background: theme.signal,
            color: "#fff",
            border: `1px solid ${theme.signal}`,
          }}
          className="hover:opacity-90"
        >
          New post
        </button>
      </header>

      <div className="grid grid-cols-7 gap-px text-center" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: theme.muted }}>
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-1">
            {label}
          </div>
        ))}
      </div>

      <div
        className={`grid grid-cols-7 gap-px overflow-hidden rounded-lg border ${loading ? "opacity-60" : ""}`}
        style={{ borderColor: theme.line, background: theme.line }}
        data-testid="calendar-grid"
      >
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
              style={{
                background: cell.inMonth ? theme.card : theme.paper,
                outline: dragOverIso === cell.iso ? `2px solid ${theme.signal}` : "none",
                outlineOffset: dragOverIso === cell.iso ? "-2px" : undefined,
              }}
              className="flex min-h-24 cursor-pointer flex-col gap-1 p-1.5 transition-colors hover:brightness-[0.985]"
            >
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${isToday(cell.date) ? "font-semibold" : ""}`}
                  style={
                    isToday(cell.date)
                      ? { background: theme.signal, color: "#fff" }
                      : { color: cell.inMonth ? theme.ink : theme.muted }
                  }
                >
                  {cell.date.getDate()}
                </span>
              </div>
              {dayGroups.map((group) => (
                <GroupChip
                  key={group.groupId}
                  group={group}
                  theme={theme}
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
          theme={theme}
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

function GroupChip({ group, theme, onClick, onDragStart }) {
  const state = theme.state[group.state] ?? theme.state.queued;
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      style={{
        background: state.bg,
        border: `1px solid ${state.border}`,
        color: state.text,
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11,
      }}
      className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left leading-tight cursor-grab active:cursor-grabbing hover:brightness-[0.97]"
      title={group.content}
      data-group-id={group.groupId}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: state.dot }} />
      <span className="shrink-0 font-medium opacity-80">{formatTime(group.publishDate)}</span>
      <span className="flex shrink-0 gap-0.5">
        {group.posts.slice(0, 4).map((post) => (
          <span
            key={post.id}
            className="rounded-sm px-0.5 text-[9px] font-bold text-white"
            style={{ background: providerMeta(post.provider).accent }}
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
