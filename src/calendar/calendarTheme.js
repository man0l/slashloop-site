// Calendar theme tokens — defaults mirror the site's src/lib/theme.js
// (ink #14181D · paper #F1F2EF · card #FFFFFF · signal #FF4D00 · teal
// #0F7B6C) so the module looks native without importing app code. Hosts
// can pass a `theme` prop to CalendarView to override any of them.

export const calendarTheme = {
  ink: "#14181D",
  paper: "#F1F2EF",
  card: "#FFFFFF",
  hover: "#F7F8F5",
  signal: "#FF4D00",
  teal: "#0F7B6C",
  muted: "#6E7681",
  line: "#E2E4DF",
  /** Group-state chips: light backgrounds + borders per state, matching the
   *  site's alert/banner conventions (error = AlertBanner red, published =
   *  teal, processing = amber, queued = neutral card). */
  state: {
    queued: { label: "Scheduled", bg: "#FFFFFF", border: "#E2E4DF", text: "#14181D", dot: "#6E7681" },
    processing: { label: "Publishing…", bg: "#FFF8E6", border: "#EAD39B", text: "#7A5B00", dot: "#D9A400" },
    published: { label: "Published", bg: "#E8F3F1", border: "#9FCFC8", text: "#0F7B6C", dot: "#0F7B6C" },
    error: { label: "Failed", bg: "#FDECEA", border: "#F3B5AE", text: "#7A1F17", dot: "#D9534F" },
  },
};

export function resolveTheme(overrides) {
  if (!overrides) return calendarTheme;
  const { state, ...rest } = overrides;
  return {
    ...calendarTheme,
    ...rest,
    state: { ...calendarTheme.state, ...(state ?? {}) },
  };
}
