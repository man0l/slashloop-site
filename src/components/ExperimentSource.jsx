import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { T } from "../lib/theme.js";
import { getGallery } from "../lib/gallery.js";
import { displayMediaUrl, displayMediaUrls } from "../lib/mediaUrl.js";
import SlideshowPreview from "./SlideshowPreview.jsx";

// SLA-886: show an experiment's source slides inline instead of a bare "Original N" link.
export default function ExperimentSource({ accessToken, workspaceId, videoId, title }) {
  const [previewAt, setPreviewAt] = useState(null);
  const { data } = useQuery({
    queryKey: ["experiment-source", workspaceId, videoId],
    queryFn: ({ signal }) => getGallery(accessToken, { workspaceId, videoId, limit: 1 }, signal),
    enabled: Boolean(accessToken && workspaceId && videoId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const card = data?.cards?.find((c) => c.id === videoId) ?? data?.cards?.[0];
  const slides = displayMediaUrls(card?.slideshowImages).map((url, index) => ({ url, index }));
  const cover = displayMediaUrl(card?.thumbUrl);
  if (slides.length) {
    return <div className="basis-full flex gap-2 overflow-x-auto pb-1" role="group" aria-label={`${title} source slides`}>
      {slides.map((s, n) => <button key={s.url} type="button" aria-label={`Preview ${title} slide ${n + 1}`} onClick={() => setPreviewAt(n)} className="shrink-0 rounded-md overflow-hidden hover:opacity-80" style={{ width: 64, aspectRatio: "9/16", border: `1px solid ${T.line}`, background: T.card }}>
        <img src={s.url} alt="" loading="lazy" className="w-full h-full object-cover" />
      </button>)}
      {previewAt !== null && <SlideshowPreview title={title} slides={slides} start={previewAt} onClose={() => setPreviewAt(null)} />}
    </div>;
  }
  if (!cover) return null;
  return <div className="basis-full"><img src={cover} alt={`${title} cover`} loading="lazy" className="rounded-md object-cover" style={{ width: 64, aspectRatio: "9/16", border: `1px solid ${T.line}` }} /></div>;
}
