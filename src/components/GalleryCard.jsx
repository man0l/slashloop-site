// One gallery card + its "Analyze with Gemini" flow.
//
// Thumb stage:
//   - unexplored  -> hover reveals "Analyze with Gemini" over the thumbnail
//                    (always visible on touch/small screens, which have no hover)
//   - running     -> spinner overlay ("Analyzing…")
//   - analyzed    -> the stored video replaces the thumbnail (playable)
//   - failed      -> Sources-style row below the meta: warning icon + tooltip,
//                    retry icon when a retry can help (never for insufficient
//                    credits, which a retry would just re-charge)
//
// "View analysis →" opens AnalysisModal with the full details; key-moment
// chips seek the playing video.

import { useRef, useState } from "react";
import { T, fB, fM, fmt, fmtAge, fmtTime } from "../lib/theme.js";
import { IconButton, WarningIcon, RefreshIcon, SparkleIcon, Spinner } from "./ui.jsx";
import useVideoAnalysis from "../lib/useVideoAnalysis.js";
import AnalysisModal from "./AnalysisModal.jsx";

const thumbStyle = { width: "100%", aspectRatio: "9/16", background: "#E7E8E3" };

function Thumb({ src }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="flex items-center justify-center" style={thumbStyle}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="1.5" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 15l4.5-4.5a2 2 0 0 1 2.8 0L15 15" />
          <circle cx="8.5" cy="9" r="1.5" />
        </svg>
      </div>
    );
  }

  return (
    <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} style={{ ...thumbStyle, objectFit: "cover", display: "block" }} />
  );
}

export default function GalleryCard({ card, index, accessToken, workspaceId }) {
  const { phase, detail, error, busy, hydrate, analyze, retry } = useVideoAnalysis({
    accessToken,
    workspaceId,
    videoId: card.id,
  });
  const videoRef = useRef(null);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const handled = phase === "done";
  const working = phase === "checking" || phase === "queued" || phase === "running";
  const ready = phase === "idle" || phase === "prompt";
  const failed = phase === "failed";

  const analysis = detail?.analysis?.data;
  const mediaUrl = detail?.mediaUrl ?? card.mediaUrl;
  const keyMoments = Array.isArray(analysis?.keyMoments) ? analysis.keyMoments : [];

  // Why this video couldn't be scraped (Apify etc.) — the connector attaches a
  // fetchError to cards that have no stored media. Only surface it while there
  // is genuinely no video to play; once media appears the icon falls away.
  const scrapeError = card.fetchError && !mediaUrl ? card.fetchError : null;

  function seekAndPlay(sec) {
    setShowAnalysis(false);
    const v = videoRef.current;
    if (v && typeof sec === "number" && Number.isFinite(sec)) {
      v.currentTime = sec;
      v.play?.().catch(() => {});
    }
  }

  return (
    <article
      className="group relative flex flex-col rounded-lg transition-transform duration-200 ease-out will-change-transform hover:-translate-y-1.5 hover:shadow-xl"
      style={{ border: `1px solid ${T.line}`, background: T.card }}
      onMouseEnter={hydrate}
      onFocus={hydrate}
    >
      {index != null && (
        <span
          className="absolute top-2 left-2 z-10 flex items-center justify-center rounded-full"
          style={{ ...fM, fontSize: 11, fontWeight: 700, width: 22, height: 22, background: "rgba(20,24,29,0.75)", color: "#fff" }}
          title={`Video #${index} — reference this as "video ${index}"`}
        >
          {index}
        </span>
      )}

      {/* Thumb stage — once the media is downloaded (signed mediaUrl present)
          the playable video replaces the thumbnail; the thumbnail is only a
          placeholder for videos whose storage copy isn't available yet. */}
      <div className="relative overflow-hidden rounded-t-lg">
        {mediaUrl ? (
          <video
            ref={videoRef}
            src={mediaUrl}
            controls
            playsInline
            preload="metadata"
            style={{ ...thumbStyle, objectFit: "cover", display: "block", background: "#000" }}
          />
        ) : (
          <Thumb src={card.thumbUrl} />
        )}

        {ready && (
          <div
            className="absolute inset-0 flex items-center justify-center transition-opacity opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            style={{ background: "rgba(20,24,29,0.30)" }}
          >
            <button
              type="button"
              onClick={analyze}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition-transform hover:-translate-y-0.5"
              style={{ ...fB, fontSize: 12, background: "#fff", color: T.ink, boxShadow: "0 4px 16px rgba(0,0,0,0.25)" }}
            >
              <SparkleIcon />
              Analyze with Gemini
            </button>
          </div>
        )}

        {working && (
          <div className="absolute inset-0 z-10 flex items-center justify-center" style={{ background: "rgba(20,24,29,0.45)" }}>
            <div className="flex flex-col items-center gap-1.5 text-white" style={{ ...fB, fontSize: 12 }}>
              <Spinner />
              {phase === "checking" ? "Checking…" : "Analyzing…"}
            </div>
          </div>
        )}
      </div>

      <div className="flex grow flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2" style={{ ...fM, fontSize: 12, color: T.muted }}>
          <strong className="truncate" style={{ color: T.ink, maxWidth: "100%" }}>@{card.creatorHandle}</strong>
          <span className="whitespace-nowrap">{fmt(card.views)} views</span>
          {card.postedAt != null && (
            <span className="whitespace-nowrap" title={new Date(card.postedAt).toLocaleString()}>
              {fmtAge(card.postedAt)}
            </span>
          )}
          {card.outlierScore != null && (
            <span className="whitespace-nowrap rounded px-1.5 py-0.5" style={{ fontWeight: 700, color: T.signal, background: "#FFF0E8" }}>
              {card.outlierScore.toFixed(1)}x
            </span>
          )}
          {scrapeError && (
            <IconButton icon={<WarningIcon />} label={scrapeError.message} danger onClick={() => {}} />
          )}
        </div>

        <p style={{ ...fB, fontSize: 13, color: T.ink, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", margin: 0 }}>
          {card.caption || <em>no caption</em>}
        </p>

        {/* Scrape failure — mirrors the connector gallery's note, so the card
            says why there's no video instead of silently showing a thumbnail. */}
        {scrapeError && (
          <p style={{ ...fB, fontSize: 12, color: "#B3261E", margin: 0 }}>
            Couldn't scrape this video — {scrapeError.message}
          </p>
        )}

        {/* Failure — the Sources-list error pattern: warning icon + tooltip with
            the description; retry icon only when a retry can actually help. */}
        {failed && error && (
          <div className="flex items-center gap-0.5" style={{ alignSelf: "flex-end" }}>
            <IconButton icon={<WarningIcon />} label={error.message} danger onClick={() => {}} />
            {error.retryable && (
              <IconButton icon={<RefreshIcon />} label="Retry — last analysis failed" tone="#B3261E" disabled={busy} onClick={retry} />
            )}
          </div>
        )}

        {/* Analysis summary + entry into the full details */}
        {handled && analysis && (
          <div className="flex flex-col gap-1.5 rounded-md px-2 py-1.5" style={{ background: "#FFF8EF", border: `1px solid ${T.line}` }}>
            {analysis.hook?.text && (
              <p
                style={{
                  ...fB,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: T.ink,
                  margin: 0,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {analysis.hook.text}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-1.5" style={{ ...fM, fontSize: 11, color: T.muted }}>
              {analysis.overallAssessment?.viralityScore != null && (
                <span className="rounded px-1.5 py-0.5" style={{ color: T.signal, background: "#FFF0E8" }}>
                  {analysis.overallAssessment.viralityScore}/10 virality
                </span>
              )}
              {analysis.overallAssessment?.replicability && (
                <span className="rounded px-1.5 py-0.5" style={{ color: T.teal, background: "#EAF6F4" }}>
                  {analysis.overallAssessment.replicability}
                </span>
              )}
              {detail?.analysis?.model && <span className="truncate">{detail.analysis.model}</span>}
            </div>
            {keyMoments.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {keyMoments.slice(0, 4).map((m, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => seekAndPlay(m.timestampSec)}
                    title={m.subjectAction || "jump to moment"}
                    className="rounded px-1.5 py-0.5 transition-opacity hover:opacity-80"
                    style={{ ...fM, fontSize: 11, background: T.ink, color: "#fff" }}
                  >
                    {fmtTime(m.timestampSec)} · {m.role}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowAnalysis(true)}
              className="self-start font-semibold underline decoration-dotted underline-offset-2"
              style={{ ...fB, fontSize: 12, color: T.teal }}
            >
              View analysis →
            </button>
          </div>
        )}

        <a href={card.url} target="_blank" rel="noreferrer" style={{ ...fM, fontSize: 11, color: T.muted }}>
          open on TikTok
        </a>
      </div>

      {showAnalysis && detail?.analysis && (
        <AnalysisModal detail={detail} onClose={() => setShowAnalysis(false)} onSeek={seekAndPlay} />
      )}
    </article>
  );
}
