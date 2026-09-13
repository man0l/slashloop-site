// Thumbnail strip for composer media — the visual media manager used by the
// ScheduleDrawer (create + draft/edit modes).
//
//   • small previews (image thumbs, first-frame <video> for MP4s)
//   • click a thumb → full-size lightbox (←/→ to flip, Download saves the
//     file via a blob so browsers don't navigate — falls back to opening the
//     URL when the cross-origin fetch is blocked)
//   • drag to reorder (live HTML5 reordering; a ↻ button covers dnd-less
//     environments)
//   • X overlay removes an item
//   • the "+" tile uploads picked files through adapter.uploadMedia(file)
//     (multipart → R2 → stable public URL); per-file busy state while the
//     upload is in flight; no direct-URL entry — uploads only.
//
// Reuse contract: theme in, rows out via onChange; the only adapter touchpoint
// is the uploadMedia(file) function passed as a prop.

import { useEffect, useRef, useState } from "react";

/** Blob-download so the browser saves instead of navigating. The media
 *  hosts (R2 public domain) send CORS headers — the client-side slideshow
 *  ZIP already relies on it — but any fetch failure falls back to a plain
 *  new-tab open, which always works. */
export async function downloadMedia(url, name) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 5_000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

export function mediaFileName(url, index) {
  let ext = "jpg";
  try {
    const match = /\.(\w{2,5})(?:$|\?)/.exec(new URL(url, "https://x.invalid").pathname);
    if (match) ext = match[1].toLowerCase();
  } catch {
    /* keep default */
  }
  return `slide-${index + 1}.${ext}`;
}

export function MediaThumbStrip({ media, onChange, uploadMedia, theme, onError }) {
  const [uploading, setUploading] = useState(0);
  const [dragIndex, setDragIndex] = useState(null);
  const [viewer, setViewer] = useState(null); // index into media, or null
  const fileInput = useRef(null);

  // Escape closes the lightbox; ←/→ flip through the set.
  useEffect(() => {
    if (viewer === null) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setViewer(null);
      if (event.key === "ArrowLeft") setViewer((current) => (current === null ? current : (current - 1 + media.length) % media.length));
      if (event.key === "ArrowRight") setViewer((current) => (current === null ? current : (current + 1) % media.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer, media.length]);

  function removeAt(index) {
    setViewer((current) => {
      if (current === null) return current;
      if (media.length === 1) return null;
      return Math.min(current, media.length - 2);
    });
    onChange(media.filter((_, i) => i !== index));
  }

  function move(from, to) {
    if (from === to || from < 0 || to < 0 || from >= media.length || to >= media.length) return;
    const next = media.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
    setDragIndex(null);
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    setUploading((n) => n + files.length);
    for (const file of files) {
      try {
        const { url, type } = await uploadMedia(file);
        onChange((current) => [...current, { type: type === "video" ? "video" : "image", url }]);
      } catch (err) {
        onError?.(err);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="media-strip">
      {media.map((item, index) => (
        <div
          key={`${item.url}-${index}`}
          draggable
          onDragStart={() => setDragIndex(index)}
          onDragOver={(event) => {
            event.preventDefault();
            if (dragIndex !== null && dragIndex !== index) {
              move(dragIndex, index);
              setDragIndex(index);
            }
          }}
          onDragEnd={() => setDragIndex(null)}
          onDrop={(event) => event.preventDefault()}
          onClick={() => setViewer(index)}
          className="group relative h-20 w-14 shrink-0 cursor-grab overflow-hidden rounded-md active:cursor-grabbing"
          style={{
            border: `1px solid ${theme.line}`,
            opacity: dragIndex === index ? 0.5 : 1,
            background: theme.paper,
          }}
          title={item.type === "video" ? "Video (click to preview, drag to reorder)" : "Image (click to preview, drag to reorder)"}
          data-media-index={index}
        >
          {item.type === "video" ? (
            <video src={item.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
          ) : (
            <img src={item.url} alt={`media ${index + 1}`} loading="lazy" className="h-full w-full object-cover" />
          )}
          {item.type === "video" && (
            <span
              className="absolute bottom-0.5 left-0.5 rounded-sm px-1 text-[9px] font-bold text-white"
              style={{ background: "rgba(0,0,0,0.6)", fontFamily: "'IBM Plex Mono', monospace" }}
            >
              MP4
            </span>
          )}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              removeAt(index);
            }}
            aria-label={`Remove media ${index + 1}`}
            title="Remove"
            className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white hover:opacity-85"
            style={{ background: "rgba(20,24,29,0.75)" }}
          >
            ✕
          </button>
        </div>
      ))}

      {/* Nudge buttons keep reordering possible where HTML5 dnd is not. */}
      {media.length > 1 && (
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => move(0, media.length - 1)}
            aria-label="Move first media to end"
            title="Rotate media order"
            className="rounded border px-1 text-[10px] hover:opacity-70"
            style={{ borderColor: theme.line, color: theme.muted }}
          >
            ↻
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        disabled={uploading > 0}
        aria-label="Upload media"
        title="Upload images (JPG/PNG/WebP ≤20MB) or videos (MP4/MOV ≤95MB)"
        className="flex h-20 w-14 shrink-0 items-center justify-center rounded-md border border-dashed text-lg hover:opacity-80 disabled:opacity-60"
        style={{ borderColor: theme.line, color: theme.muted, background: theme.card }}
        data-testid="upload-media"
      >
        {uploading > 0 ? <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10 }}>{uploading}…</span> : "+"}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
        multiple
        hidden
        onChange={(event) => handleFiles(event.target.files)}
      />

      {viewer !== null && media[viewer] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(10,12,15,0.88)" }}
          onClick={() => setViewer(null)}
          data-testid="media-viewer"
          role="dialog"
          aria-label={`Media ${viewer + 1} of ${media.length}`}
        >
          <div className="relative flex max-h-[90vh] max-w-[92vw] flex-col items-center gap-3" onClick={(event) => event.stopPropagation()}>
            {media[viewer].type === "video" ? (
              <video src={media[viewer].url} controls autoPlay playsInline className="max-h-[75vh] max-w-[90vw] rounded-lg" />
            ) : (
              <img
                src={media[viewer].url}
                alt={`media ${viewer + 1} full size`}
                className="max-h-[75vh] max-w-[90vw] rounded-lg object-contain"
                data-testid="media-viewer-img"
              />
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setViewer((current) => (current - 1 + media.length) % media.length)}
                disabled={media.length < 2}
                aria-label="Previous media"
                className="rounded-md px-3 py-1.5 text-sm text-white hover:opacity-80 disabled:opacity-40"
                style={{ background: "rgba(255,255,255,0.12)", fontFamily: "'Inter', sans-serif" }}
              >
                ←
              </button>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "rgba(255,255,255,0.8)" }}>
                {viewer + 1} / {media.length}
              </span>
              <button
                type="button"
                onClick={() => setViewer((current) => (current + 1) % media.length)}
                disabled={media.length < 2}
                aria-label="Next media"
                className="rounded-md px-3 py-1.5 text-sm text-white hover:opacity-80 disabled:opacity-40"
                style={{ background: "rgba(255,255,255,0.12)", fontFamily: "'Inter', sans-serif" }}
              >
                →
              </button>
              <button
                type="button"
                onClick={() => downloadMedia(media[viewer].url, mediaFileName(media[viewer].url, viewer))}
                data-testid="media-download"
                className="rounded-md px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
                style={{ background: theme.signal, fontFamily: "'Inter', sans-serif" }}
              >
                Download
              </button>
              <button
                type="button"
                onClick={() => setViewer(null)}
                aria-label="Close preview"
                className="rounded-md px-3 py-1.5 text-sm text-white hover:opacity-80"
                style={{ background: "rgba(255,255,255,0.12)", fontFamily: "'Inter', sans-serif" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
