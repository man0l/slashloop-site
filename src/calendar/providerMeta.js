// Per-provider presentation metadata for calendar chips and connect buttons.
// Glyphs are minimal inline SVGs (no icon dependency) — swap freely.

export const PROVIDER_META = {
  tiktok: {
    label: "TikTok",
    accent: "#25F4EE",
    glyph: "TT",
    note: "Videos or photos; photos are pulled from a public URL.",
  },
  youtube: {
    label: "YouTube",
    accent: "#FF0000",
    glyph: "YT",
    note: "Exactly one video per post.",
  },
  instagram: {
    label: "Instagram",
    accent: "#E1306C",
    glyph: "IG",
    note: "Business/Creator account linked to a Facebook Page.",
  },
};

export function providerMeta(provider) {
  return PROVIDER_META[provider] ?? { label: provider, accent: "#8b8b8b", glyph: provider.slice(0, 2).toUpperCase(), note: "" };
}

/** Aggregate group state → chip styling. */
export const STATE_STYLES = {
  queued: { label: "Scheduled", chip: "bg-sky-500/15 text-sky-200 border-sky-500/40", dot: "bg-sky-400" },
  processing: { label: "Publishing…", chip: "bg-amber-500/15 text-amber-200 border-amber-500/40", dot: "bg-amber-400" },
  published: { label: "Published", chip: "bg-emerald-500/15 text-emerald-200 border-emerald-500/40", dot: "bg-emerald-400" },
  error: { label: "Failed", chip: "bg-rose-500/15 text-rose-200 border-rose-500/40", dot: "bg-rose-400" },
};

export function stateStyle(state) {
  return STATE_STYLES[state] ?? STATE_STYLES.queued;
}
