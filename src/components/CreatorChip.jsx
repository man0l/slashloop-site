// Handle + "Track" on a gallery card, with a hover preview of that creator's
// already-scraped outliers and last 5 videos.

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { T, fB, fM, fmt } from "../lib/theme.js";
import { useToast } from "../lib/toast.jsx";
import { createSource, refreshSource, SourcesApiError } from "../lib/sources.js";
import { getCreatorPreview, isCreatorPreview } from "../lib/gallery.js";
import { normalizeCreatorHandle, previewFromGalleryCards, trackedCreatorSource } from "../lib/creator.js";
import { displayMediaUrl } from "../lib/mediaUrl.js";

const OPEN_DELAY_MS = 180;
const CLOSE_DELAY_MS = 160;

function PreviewThumb({ video }) {
  const [failed, setFailed] = useState(false);
  const box = { width: 36, height: 48, borderRadius: 4, background: "#E7E8E3", flexShrink: 0 };
  const src = displayMediaUrl(video.thumbUrl);

  const inner = !src || failed ? (
    <div style={box} />
  ) : (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ ...box, objectFit: "cover", display: "block" }}
    />
  );

  const label = [
    video.outlierScore != null ? `${video.outlierScore.toFixed(1)}x` : null,
    video.views != null ? `${fmt(video.views)} views` : null,
  ].filter(Boolean).join(" · ");

  return (
    <a
      href={video.url}
      target="_blank"
      rel="noreferrer"
      title={label || video.caption || "Open on TikTok"}
      className="relative block overflow-hidden"
      style={box}
      onClick={(e) => e.stopPropagation()}
    >
      {inner}
      {video.outlierScore != null && (
        <span
          className="absolute bottom-0 inset-x-0 text-center"
          style={{ ...fM, fontSize: 8, fontWeight: 700, color: "#fff", background: "rgba(20,24,29,0.75)", lineHeight: "12px" }}
        >
          {video.outlierScore.toFixed(1)}x
        </span>
      )}
    </a>
  );
}

function ThumbRow({ label, videos, empty }) {
  return (
    <div>
      <div style={{ ...fM, fontSize: 9, letterSpacing: 1.2, color: T.muted, marginBottom: 4 }}>{label}</div>
      {videos.length === 0 ? (
        <p style={{ ...fB, fontSize: 11, color: T.muted, margin: 0 }}>{empty}</p>
      ) : (
        <div className="flex gap-1">
          {videos.map((v) => <PreviewThumb key={v.id} video={v} />)}
        </div>
      )}
    </div>
  );
}

function PreviewBody({ preview, handle, tracked, tracking, onTrack }) {
  const stats = [
    preview.videoCount != null ? `${preview.videoCount} video${preview.videoCount === 1 ? "" : "s"}` : null,
    preview.outlierCount != null ? `${preview.outlierCount} outlier${preview.outlierCount === 1 ? "" : "s"}` : null,
    preview.followers ? `${fmt(preview.followers)} followers` : null,
    preview.medianViews ? `median ${fmt(Math.round(preview.medianViews))}` : null,
  ].filter(Boolean);

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate" style={{ ...fB, fontSize: 13, fontWeight: 700, color: T.ink }}>@{handle}</div>
          {stats.length > 0 && (
            <div style={{ ...fM, fontSize: 10, color: T.muted, marginTop: 2, lineHeight: 1.4 }}>
              {stats.join(" · ")}
            </div>
          )}
        </div>
        <TrackButton tracked={tracked} tracking={tracking} onTrack={onTrack} />
      </div>
      <div className="mt-3 flex flex-col gap-2.5">
        <ThumbRow
          label="OUTLIERS"
          videos={preview.outliers ?? []}
          empty="No scored outliers yet."
        />
        <ThumbRow
          label="LAST 5"
          videos={preview.recent ?? []}
          empty="No other videos from this creator in your library."
        />
      </div>
    </>
  );
}

function TrackButton({ tracked, tracking, onTrack }) {
  if (tracked) {
    const sourceId = tracked.id;
    const style = {
      ...fB, fontSize: 11, fontWeight: 600,
      padding: "2px 7px",
      borderRadius: 6,
      background: T.line,
      color: T.muted,
      whiteSpace: "nowrap",
    };
    if (sourceId) {
      return (
        <Link
          to={`/gallery?sourceId=${sourceId}`}
          onClick={(e) => e.stopPropagation()}
          style={style}
        >
          Tracked
        </Link>
      );
    }
    return <span style={style}>Tracked</span>;
  }

  return (
    <button
      type="button"
      onClick={onTrack}
      disabled={tracking}
      title="Track this creator"
      style={{
        ...fB, fontSize: 11, fontWeight: 600,
        padding: "2px 7px",
        borderRadius: 6,
        background: T.signal,
        color: "#fff",
        whiteSpace: "nowrap",
        opacity: tracking ? 0.6 : 1,
      }}
    >
      {tracking ? "Tracking…" : "Track"}
    </button>
  );
}

export default function CreatorChip({
  handle,
  accessToken,
  workspaceId,
  sources,
  galleryCards,
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const key = normalizeCreatorHandle(handle);
  const tracked = trackedCreatorSource(sources, key);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [tracking, setTracking] = useState(false);
  const openTimer = useRef(null);
  const closeTimer = useRef(null);

  const fallback = previewFromGalleryCards(key, galleryCards);

  const previewQuery = useQuery({
    queryKey: ["creator-preview", workspaceId, key],
    queryFn: ({ signal }) => getCreatorPreview(accessToken, { workspaceId, creatorHandle: key }, signal),
    enabled: Boolean((hovered || open) && accessToken && workspaceId && key),
    staleTime: 60_000,
    retry: 1,
  });

  const apiPreview = isCreatorPreview(previewQuery.data) ? previewQuery.data : null;
  const preview = apiPreview ?? fallback;
  const trackedFromApi = apiPreview?.trackedSourceId
    ? { id: apiPreview.trackedSourceId, sourceType: "creator", query: key }
    : null;
  const trackedNow = tracked ?? trackedFromApi;

  function clearTimers() {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
  }

  function onEnter() {
    setHovered(true);
    clearTimeout(closeTimer.current);
    openTimer.current = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  }

  function onLeave() {
    setHovered(false);
    clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }

  useEffect(() => () => clearTimers(), []);

  function toggleFromKeyboard(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen((v) => !v);
    }
    if (e.key === "Escape") setOpen(false);
  }

  function onHandleClick() {
    // Desktop hover already reveals the preview; a click would dismiss it.
    // Touch has no hover, so tap toggles.
    if (hovered) return;
    setOpen((v) => !v);
  }

  async function onTrack(e) {
    e.preventDefault();
    e.stopPropagation();
    if (trackedNow || tracking || !key || key === "unknown") return;
    setTracking(true);
    const label = `@${key}`;
    try {
      const source = await createSource(accessToken, workspaceId, {
        platform: "tiktok",
        sourceType: "creator",
        query: label,
        videoLimit: 20,
      });
      showToast(`Now tracking ${label} — first scrape queued.`, { type: "success" });
      queryClient.setQueryData(["sources", workspaceId], (list) =>
        list ? [source, ...list.filter((s) => s.id !== source.id)] : [source],
      );
      refreshSource(accessToken, workspaceId, source.id)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["sources", workspaceId] });
          queryClient.invalidateQueries({ queryKey: ["gallery", workspaceId] });
          queryClient.invalidateQueries({ queryKey: ["creator-preview", workspaceId, key] });
        })
        .catch((refreshErr) => {
          showToast(
            `The first scrape for ${label} didn't start: `
            + (refreshErr instanceof SourcesApiError ? refreshErr.message : "couldn't queue refresh.")
            + " Use Refresh on Sources to retry.",
            { type: "error" },
          );
        });
    } catch (err) {
      showToast(err instanceof SourcesApiError ? err.message : "Couldn't track this creator.", { type: "error" });
    } finally {
      setTracking(false);
    }
  }

  if (!key) return null;

  return (
    <span
      className="relative inline-flex items-center gap-1.5 min-w-0"
      data-creator-preview={open ? "open" : undefined}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) onLeave();
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`@${key} creator preview`}
        onClick={onHandleClick}
        onKeyDown={toggleFromKeyboard}
        className="truncate font-semibold"
        style={{
          ...fM, fontSize: 12, color: T.ink, maxWidth: "100%", background: "none", padding: 0,
          textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 2,
        }}
      >
        @{key}
      </button>
      {key !== "unknown" && (
        <TrackButton tracked={trackedNow} tracking={tracking} onTrack={onTrack} />
      )}

      {open && (
        <div
          role="dialog"
          aria-label={`@${key} creator preview`}
          className="absolute left-0 top-full z-30 mt-1.5 w-64 rounded-lg p-3 shadow-xl"
          style={{ background: T.card, border: `1px solid ${T.line}` }}
        >
          <PreviewBody
            preview={preview}
            handle={key}
            tracked={trackedNow}
            tracking={tracking}
            onTrack={onTrack}
          />
        </div>
      )}
    </span>
  );
}
