// Relative time in the browser's locale/timezone: "just now", "1 hour ago", "3 days ago".
export function timeAgo(value) {
  const seconds = (Date.now() - new Date(value).getTime()) / 1000;
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return "just now";
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  let amount = seconds / 60;
  for (const [step, unit] of [[60, "minute"], [24, "hour"], [30, "day"], [12, "month"], [Number.POSITIVE_INFINITY, "year"]]) {
    if (amount < step) return rtf.format(-Math.floor(amount), unit);
    amount /= step;
  }
  return "";
}
