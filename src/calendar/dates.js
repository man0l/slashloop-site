// Calendar date math. Storage convention (same as the worker): epoch
// SECONDS in UTC. Rendering is always the viewer's local timezone — the
// month grid is built from local midnights, and the composer's
// datetime-local value converts back to UTC on save.

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Weeks (Mon-start) covering the given month: 5–6 rows of 7 days, each
 *  { date: Date (local midnight), inMonth, iso }. Trailing/leading days of
 *  neighboring months pad complete weeks. */
export function monthGrid(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - ((first.getDay() + 6) % 7)); // back to Monday

  const weeks = [];
  const cursor = new Date(gridStart);
  do {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push({
        date: new Date(cursor),
        inMonth: cursor.getMonth() === monthIndex,
        iso: toIsoDate(cursor),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  } while (cursor.getMonth() === monthIndex && weeks.length < 6);

  return weeks;
}

export function toIsoDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function isToday(date) {
  return toIsoDate(date) === toIsoDate(new Date());
}

/** Epoch seconds → 'YYYY-MM-DDTHH:mm' in the LOCAL timezone (the value
 *  <input type="datetime-local"> expects). */
export function toLocalInputValue(epochSeconds) {
  const date = new Date(epochSeconds * 1000);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${toIsoDate(date)}T${hh}:${mm}`;
}

/** 'YYYY-MM-DDTHH:mm' (local) → epoch seconds. */
export function fromLocalInputValue(value) {
  const epoch = new Date(value).getTime();
  return Number.isFinite(epoch) ? Math.floor(epoch / 1000) : null;
}

/** Local midnight of a calendar cell → epoch seconds, with the option to
 *  keep a specific time of day (drag-reschedule preserves the time). */
export function dayStartEpoch(date) {
  return Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 1000);
}

/** Move an epoch to another day while keeping its local time of day. */
export function moveEpochToDay(epochSeconds, targetDate) {
  const source = new Date(epochSeconds * 1000);
  const timeOfDay = source.getHours() * 3600 + source.getMinutes() * 60 + source.getSeconds();
  return dayStartEpoch(targetDate) + timeOfDay;
}

export function formatTime(epochSeconds) {
  return new Date(epochSeconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDayHeading(year, monthIndex) {
  return `${MONTH_LABELS[monthIndex]} ${year}`;
}
