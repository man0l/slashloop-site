// Shared design tokens — kept in sync with the product UI.
// ink #14181D · paper #F1F2EF · signal #FF4D00 · teal #0F7B6C
export const T = {
  ink: "#14181D",
  paper: "#F1F2EF",
  card: "#FFFFFF",
  signal: "#FF4D00",
  teal: "#0F7B6C",
  muted: "#6E7681",
  line: "#E2E4DF",
};

export const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800;900&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
@keyframes blink { 0%,49% {opacity:1} 50%,100% {opacity:0} }
@keyframes rowIn { from {opacity:0; transform:translateY(6px)} to {opacity:1; transform:none} }
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
`;

export const fD = { fontFamily: "'Archivo', sans-serif" };
export const fB = { fontFamily: "'Inter', sans-serif" };
export const fM = { fontFamily: "'IBM Plex Mono', monospace" };

export const fmt = (n) =>
  n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(0) + "K" : n;
