// "Download all slides" — fetches the signed slide URLs the carousel already
// renders, zips them in the browser (jszip) and hands the user a .zip. No
// server round-trip: the images are packed client-side from the same URLs
// the <img> tags use.

import JSZip from "jszip";

// Content-Type -> extension; the zip entries need a real extension so OS
// previews work after extraction.
const EXT_BY_TYPE = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/avif", "avif"],
]);

function extFor(response, url) {
  const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (EXT_BY_TYPE.has(type)) return EXT_BY_TYPE.get(type);
  const match = /\.([a-z0-9]{3,5})(?:\?|$)/i.exec(url);
  return match ? match[1].toLowerCase() : "jpg";
}

/**
 * Zip every slide and trigger one browser download.
 * Best-effort per slide: whatever fetched successfully is packed; throws
 * only when nothing did, so one flaky CDN response doesn't kill the set.
 * Resolves with the number of slides packed.
 */
export async function downloadSlideshowZip(images, { fileName = "slides.zip" } = {}) {
  const zip = new JSZip();
  const results = await Promise.allSettled(
    (images ?? []).map(async (url, i) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ext = extFor(res, url);
      zip.file(`slide-${String(i + 1).padStart(2, "0")}.${ext}`, await res.blob());
    }),
  );
  const packed = results.filter((r) => r.status === "fulfilled").length;
  if (!packed) throw new Error("No slides could be downloaded.");
  const blob = await zip.generateAsync({ type: "blob" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(href);
  return packed;
}
