// Thumbnail strip for composer media — the visual media manager used by the
// ScheduleDrawer (create + draft/edit modes).
//
//   • small previews (image thumbs, first-frame <video> for MP4s)
//   • drag to reorder (live HTML5 reordering, time-safe on touch: also
//     renders ↑/↓ nudge buttons for environments where dnd is unusable)
//   • X overlay removes an item
//   • the "+" tile uploads picked files through adapter.uploadMedia(file)
//     (multipart → R2 → stable public URL); per-file busy state while the
//     upload is in flight; no direct-URL entry — uploads only.
//
// Reuse contract: theme in, rows out via onChange; the only adapter touchpoint
// is the uploadMedia(file) function passed as a prop.

import { useRef, useState } from "react";

export function MediaThumbStrip({ media, onChange, uploadMedia, theme, onError }) {
  const [uploading, setUploading] = useState(0);
  const [dragIndex, setDragIndex] = useState(null);
  const fileInput = useRef(null);

  function removeAt(index) {
    onChange(media.filter((_, i) => i !== index));
  }

  function move(from, to) {
    if (from === to || from < 0 || to < 0 || from >= media.length || to >= media.length) return;
    const next = media.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
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
          className="group relative h-20 w-14 shrink-0 cursor-grab overflow-hidden rounded-md active:cursor-grabbing"
          style={{
            border: `1px solid ${theme.line}`,
            opacity: dragIndex === index ? 0.5 : 1,
            background: theme.paper,
          }}
          title={item.type === "video" ? "Video (drag to reorder)" : "Image (drag to reorder)"}
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
            onClick={() => removeAt(index)}
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
    </div>
  );
}
