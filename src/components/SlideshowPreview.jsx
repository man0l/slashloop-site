import { useEffect, useState } from "react";
import { T, fD } from "../lib/theme.js";
import { CloseIcon, Modal } from "./ui.jsx";

// SLA-808: in-page slideshow viewer for generated slides, instead of opening each image in a new tab.
// `slides` are the previewable slides only ({ url, overlayText?, index? }); `start` is a position in that list.
export default function SlideshowPreview({ title, slides, start = 0, onClose }) {
  const [at, setAt] = useState(() => Math.min(Math.max(start, 0), slides.length - 1));
  const last = slides.length - 1;
  const go = (n) => setAt(Math.min(Math.max(n, 0), last));
  useEffect(() => {
    function onKey(e) {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); setAt((n) => Math.min(n + 1, last)); }
      if (e.key === "ArrowLeft") { e.preventDefault(); setAt((n) => Math.max(n - 1, 0)); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [last]);
  if (!slides.length) return null;
  const slide = slides[at];
  const label = `Slide ${(slide.index ?? at) + 1}`;
  const navButton = "rounded-full border w-10 h-10 shrink-0 flex items-center justify-center text-lg font-bold hover:opacity-80 disabled:opacity-30";
  return <Modal ariaLabel={`${title || "Slideshow"} preview`} onClose={onClose} panelStyle={{ maxWidth: "min(32rem, 100%)", maxHeight: "95vh", padding: 16 }}>
    <div className="flex flex-col gap-3" style={{ maxHeight: "calc(95vh - 32px)" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0"><p className="truncate" style={{ ...fD, fontWeight: 800, fontSize: 16 }}>{title || "Slideshow"}</p><p className="text-xs" style={{ color: T.muted }} aria-live="polite">{label} · {at + 1} of {slides.length}</p></div>
        <div className="flex items-center gap-2 shrink-0"><a href={slide.url} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: T.muted }}>Open full size</a><button type="button" aria-label="Close preview" onClick={onClose} className="rounded-md p-1 hover:bg-black/5"><CloseIcon /></button></div>
      </div>
      <div className="flex items-center gap-2 min-h-0">
        <button type="button" aria-label="Previous slide" disabled={at === 0} onClick={() => go(at - 1)} className={navButton} style={{ borderColor: T.line, background: T.card, color: T.ink }}>‹</button>
        <div className="flex-1 min-w-0 rounded-lg overflow-hidden flex items-center justify-center" style={{ background: T.paper, border: `1px solid ${T.line}`, aspectRatio: "9/16", maxHeight: "calc(95vh - 190px)" }}>
          <img key={slide.url} src={slide.url} alt={slide.overlayText || `Generated ${label.toLowerCase()}`} className="w-full h-full object-contain" />
        </div>
        <button type="button" aria-label="Next slide" disabled={at === last} onClick={() => go(at + 1)} className={navButton} style={{ borderColor: T.line, background: T.card, color: T.ink }}>›</button>
      </div>
      {slides.length > 1 && <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Slides">{slides.map((s, n) => <button key={s.index ?? n} type="button" aria-label={`Show slide ${(s.index ?? n) + 1}`} aria-current={n === at ? "true" : undefined} onClick={() => go(n)} className="shrink-0 rounded-md overflow-hidden" style={{ width: 40, aspectRatio: "9/16", border: `2px solid ${n === at ? T.teal : T.line}`, background: T.paper }}><img src={s.url} alt="" loading="lazy" className="w-full h-full object-cover" /></button>)}</div>}
    </div>
  </Modal>;
}
