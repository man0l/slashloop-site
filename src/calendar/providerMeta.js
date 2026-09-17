// Per-provider presentation metadata for calendar chips and connect buttons.
// Glyphs are two-letter chips (no icon dependency); accents are dark enough
// to carry white glyph text on light cards (site palette family).

export const PROVIDER_META = {
  tiktok: {
    label: "TikTok",
    accent: "#1A1D21",
    glyph: "TT",
    note: "Videos or photos; photos are pulled from a public URL.",
  },
  youtube: {
    label: "YouTube",
    accent: "#D93025",
    glyph: "YT",
    note: "Exactly one video per post.",
  },
  instagram: {
    label: "Instagram",
    accent: "#C13584",
    glyph: "IG",
    note: "Business/Creator account linked to a Facebook Page.",
  },
  threads: {
    label: "Threads",
    accent: "#14181D",
    glyph: "TH",
    note: "Text, photos, or video; 500 characters max.",
  },
};

export function providerMeta(provider) {
  return PROVIDER_META[provider] ?? { label: provider, accent: "#6E7681", glyph: provider.slice(0, 2).toUpperCase(), note: "" };
}
