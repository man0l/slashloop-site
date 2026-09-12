// One gallery card + its "Analyze with Gemini" flow.
//
// The media (stored MP4 player, slide carousel, or the cover thumb) is NEVER
// covered by an overlay — videos and photo posts share one layout:
//   - media stage on top, with a small corner spinner while a download,
//     analysis, or recreation is in flight;
//   - one action row below it, identical for both types: download first
//     ("Download video" until the MP4 lands, "Download .zip" for the
//     displayed slide set), then "Analyze with Gemini" (until analyzed),
//     then the slideshow-only Recreate. Busy/failure states live inside
//     these buttons (spinner, "Retry download" with the error as tooltip).
// Hover only hydrates the card (lazy detail fetch); it never reveals or
// blocks anything.
// "View analysis →" opens AnalysisModal with the full details; key-moment
// chips seek the playing video.

import { useEffect, useRef, useState } from "react";
import { T, fB, fM, fmt, fmtAge, fmtTime } from "../lib/theme.js";
import { IconButton, WarningIcon, RefreshIcon, SparkleIcon, Spinner, DownloadIcon, ZipDownloadIcon } from "./ui.jsx";
import useVideoAnalysis from "../lib/useVideoAnalysis.js";
import { displayMediaUrl, displayMediaUrls } from "../lib/mediaUrl.js";
import { recreateSlideshow, getVideoDetail, friendlyFetchError } from "../lib/video.js";
import { downloadSlideshowZip } from "../lib/slideshowZip.js";
import AnalysisModal from "./AnalysisModal.jsx";
import CreatorChip from "./CreatorChip.jsx";
import HookTestPanel, { StartHookTestDialog } from "./HookTestPanel.jsx";

const thumbStyle = { width: "100%", aspectRatio: "9/16", background: "#E7E8E3" };

// Test statuses that still own the video — a won/closed test is archived and
// stops blocking a fresh "Test hooks" start (the server allows re-testing).
const ACTIVE_TEST_STATUSES = new Set(["setup", "picking", "posted"]);

function hookTestBadge(test) {
  const won = test.status === "won";
  const text = won ? ` ${test.winnerLabel ?? ""} won`.replace("  ", " ") : test.pickedCount > 0 ? ` ${test.pickedCount} picked` : " hook test";
  const title = won
    ? `Hook test won${test.winnerLabel ? ` — opening ${test.winnerLabel} beat the original` : ""}`
    : `Open AI hook test (${test.status})${test.pickedCount > 0 ? ` — ${test.pickedCount} picked` : ""}`;
  return { text, title };
}

function Slideshow({ images }) {
  const [i, setI] = useState(0);
  const n = images.length;
  if (!n) return null;
  const prev = (e) => { e.stopPropagation(); setI((x) => (x - 1 + n) % n); };
  const next = (e) => { e.stopPropagation(); setI((x) => (x + 1) % n); };

  return (
    <div className="relative" style={{ ...thumbStyle, background: "#111" }}>
      <img
        src={images[i]}
        alt=""
        style={{ ...thumbStyle, objectFit: "cover", display: "block" }}
      />
      {n > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous slide"
            onClick={prev}
            className="absolute left-1.5 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full"
            style={{ background: "rgba(20,24,29,0.7)", color: "#fff", ...fB, fontSize: 16 }}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={next}
            className="absolute right-1.5 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full"
            style={{ background: "rgba(20,24,29,0.7)", color: "#fff", ...fB, fontSize: 16 }}
          >
            ›
          </button>
          <span
            className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full px-2 py-0.5"
            style={{ ...fM, fontSize: 11, background: "rgba(20,24,29,0.75)", color: "#fff" }}
          >
            {i + 1}/{n}
          </span>
        </>
      )}
    </div>
  );
}

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

export default function GalleryCard({ card, index, accessToken, workspaceId, sources, galleryCards, highlighted }) {
  const { phase, detail, error, busy, hydrate, analyze, retry, downloadPhase, downloadError, downloading, download } = useVideoAnalysis({
    accessToken,
    workspaceId,
    videoId: card.id,
  });
  const videoRef = useRef(null);
  const autoFetchStarted = useRef(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  // Hook-test surfaces. `startOpen` is the paid entry dialog (only offered for
  // analyzed videos with no open test — server truth via card.analyzedBy /
  // card.hookTest, never hover-hydration state); `testOpen` is the full panel.
  const [startOpen, setStartOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [showRecreated, setShowRecreated] = useState(true);
  const [recreatePhase, setRecreatePhase] = useState("idle"); // idle | running | failed
  const [recreateError, setRecreateError] = useState(null);
  const [recreationOverride, setRecreationOverride] = useState(null);
  const recreateTimer = useRef(null);
  // "Download .zip" — packs the displayed slide set client-side.
  const [zipState, setZipState] = useState("idle"); // idle | zipping | failed

  const handled = phase === "done";
  const working = phase === "checking" || phase === "queued" || phase === "running";
  const ready = phase === "idle" || phase === "prompt";
  const failed = phase === "failed";

  const analysis = detail?.analysis?.data;
  const slideshowImages = displayMediaUrls(detail?.slideshowImages ?? card.slideshowImages);
  const recreationImages = displayMediaUrls(recreationOverride ?? detail?.recreationImages ?? card.recreationImages);
  const isSlideshow = Boolean(detail?.isSlideshow ?? card.isSlideshow) || slideshowImages.length > 0;
  const recreating = recreatePhase === "running" || detail?.recreateJob?.status === "queued" || detail?.recreateJob?.status === "running";
  // Slides shown: recreated deck when it exists and is selected, else the
  // original slides. Videos with recreations join in — "Original" falls back
  // to the stored player (slideshowImages is empty there), "Recreated" flips
  // the stage to the AI slide deck.
  const carouselImages = showRecreated && recreationImages.length > 0 ? recreationImages : slideshowImages;
  const mediaUrl = isSlideshow ? null : displayMediaUrl(detail?.mediaUrl ?? card.mediaUrl);
  const thumbUrl = displayMediaUrl(card.thumbUrl);
  const keyMoments = Array.isArray(analysis?.keyMoments) ? analysis.keyMoments : [];
  const zipName = `${showRecreated && recreationImages.length > 0 ? "recreated-slides" : "slides"}-${String(card.id).slice(0, 8)}.zip`;

  // Why this video couldn't be scraped (Apify etc.) — the connector attaches a
  // fetchError to cards that have no stored media. Only surface it while there
  // is genuinely no video or slideshow to play; once media appears the icon falls away.
  const scrapeError = card.fetchError && !mediaUrl && slideshowImages.length === 0 ? card.fetchError : null;

  useEffect(() => () => { if (recreateTimer.current) clearInterval(recreateTimer.current); }, []);

  async function startRecreate() {
    if (recreating) return;
    setRecreatePhase("running");
    setRecreateError(null);
    try {
      await recreateSlideshow(accessToken, { workspaceId, videoId: card.id });
    } catch (err) {
      setRecreateError(friendlyFetchError(err));
      setRecreatePhase("failed");
      return;
    }
    const started = Date.now();
    if (recreateTimer.current) clearInterval(recreateTimer.current);
    recreateTimer.current = setInterval(async () => {
      // Video recreations add a Gemini slide plan (upload + poll) on top of the
      // image gens and can run ~7 min server-side — poll past that, not past
      // the photo-only 4 min.
      if (Date.now() - started > 8 * 60 * 1000) {
        clearInterval(recreateTimer.current);
        setRecreateError({ kind: "failure", retryable: true, message: "Recreation is still running — tap retry." });
        setRecreatePhase("failed");
        return;
      }
      try {
        const d = await getVideoDetail(accessToken, { workspaceId, videoId: card.id });
        if (d.recreationImages?.length) {
          clearInterval(recreateTimer.current);
          setRecreationOverride(d.recreationImages);
          setRecreatePhase("idle");
          setShowRecreated(true);
        }
        if (d.recreateJob?.status === "failed") {
          clearInterval(recreateTimer.current);
          setRecreateError({ kind: "failure", retryable: true, message: d.recreateJob.lastError || "Recreation failed." });
          setRecreatePhase("failed");
        }
      } catch { /* keep polling */ }
    }, 4000);
  }

  // Photo posts have no Download button — pull every slide from the watch
  // page as soon as the card mounts so the carousel is what the user sees.
  useEffect(() => {
    if (!isSlideshow || slideshowImages.length > 0) return;
    if (downloadPhase !== "idle") return;
    if (autoFetchStarted.current) return;
    autoFetchStarted.current = true;
    download();
  }, [isSlideshow, slideshowImages.length, downloadPhase, download]);

  function seekAndPlay(sec) {
    setShowAnalysis(false);
    const v = videoRef.current;
    if (v && typeof sec === "number" && Number.isFinite(sec)) {
      v.currentTime = sec;
      v.play?.().catch(() => {});
    }
  }

  async function downloadZip() {
    if (zipState === "zipping" || carouselImages.length === 0) return;
    setZipState("zipping");
    try {
      await downloadSlideshowZip(carouselImages, { fileName: zipName });
      setZipState("idle");
    } catch {
      setZipState("failed");
    }
  }

  return (
    <article
      id={`gallery-card-${card.id}`}
      data-highlighted={highlighted || undefined}
      className="group relative flex flex-col rounded-lg transition-transform duration-200 ease-out will-change-transform hover:-translate-y-1.5 hover:shadow-xl has-[[data-creator-preview=open]]:z-20"
      style={{
        border: `1px solid ${highlighted ? T.signal : T.line}`,
        boxShadow: highlighted ? "0 0 0 2px #FF4D00" : undefined,
        background: T.card,
      }}
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

      {/* Media stage — never covered by a curtain. Videos show the stored
          player, slideshows the carousel, everything else the cover thumb;
          work in progress is a small corner spinner so the preview stays
          visible (same treatment for both videos and slideshows). */}
      <div className="relative overflow-hidden rounded-t-lg">
        {carouselImages.length > 0 ? (
          <Slideshow images={carouselImages} />
        ) : mediaUrl ? (
          <video
            ref={videoRef}
            src={mediaUrl}
            controls
            playsInline
            preload="metadata"
            style={{ ...thumbStyle, objectFit: "cover", display: "block", background: "#000" }}
          />
        ) : (
          <Thumb src={thumbUrl} />
        )}

        {(downloading || phase === "queued" || phase === "running" || recreating) && (
          <div
            aria-hidden="true"
            className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full"
            style={{ background: "rgba(20,24,29,0.7)", color: "#fff" }}
          >
            <Spinner />
          </div>
        )}
      </div>

      <div className="flex grow flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2" style={{ ...fM, fontSize: 12, color: T.muted }}>
          <CreatorChip
            handle={card.creatorHandle}
            accessToken={accessToken}
            workspaceId={workspaceId}
            sources={sources}
            galleryCards={galleryCards}
          />
          {card.isSelf && (
            <span className="whitespace-nowrap rounded px-1.5 py-0.5" style={{ fontWeight: 700, color: T.teal, background: "#EAF6F4" }}>
              You
            </span>
          )}
          {card.hookTest && (() => {
            const { text, title } = hookTestBadge(card.hookTest);
            return (
              <button
                type="button"
                onClick={() => setTestOpen(true)}
                className="whitespace-nowrap rounded px-1.5 py-0.5 transition-opacity hover:opacity-80"
                style={{
                  fontWeight: 600,
                  color: card.hookTest.status === "won" ? "#0F7B6C" : "#7C5CFF",
                  background: card.hookTest.status === "won" ? "#EAF6F4" : "#F2EEFF",
                  cursor: "pointer",
                }}
                title={title}
                data-testid="hook-test-badge"
              >
                🧪{text}
              </button>
            );
          })()}
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

        {/* One action row for every card type — download first, then
            analyze, then the slideshow-only extras. Videos without a stored
            MP4 and slideshows whose slides are still loading keep the same
            layout, with the busy state living inside the buttons (never as a
            curtain over the media). */}
        <div className="flex flex-wrap items-center gap-2">
          {!isSlideshow && !mediaUrl && (
            downloadPhase === "failed" ? (
              <button
                type="button"
                onClick={download}
                title={downloadError?.message || "Download failed."}
                className="self-start inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition-transform hover:-translate-y-0.5"
                style={{ ...fB, fontSize: 12, background: "#fff", color: T.ink, border: `1px solid ${T.line}` }}
              >
                <RefreshIcon />
                Retry download
              </button>
            ) : (
              <button
                type="button"
                onClick={download}
                disabled={downloading}
                className="self-start inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition-transform hover:-translate-y-0.5 disabled:opacity-70"
                style={{ ...fB, fontSize: 12, background: "#fff", color: T.ink, border: `1px solid ${T.line}` }}
              >
                <DownloadIcon />
                {downloading ? "Downloading…" : "Download video"}
              </button>
            )
          )}
          {carouselImages.length > 0 ? (
            <button
              type="button"
              onClick={downloadZip}
              disabled={zipState === "zipping"}
              aria-label={zipState === "failed" ? "Couldn't download slides — tap to retry" : "Download all slides as ZIP"}
              title={zipState === "failed" ? "Couldn't download the slides — tap to retry" : "Zip the displayed slide set (original or recreated, whichever is showing)"}
              aria-busy={zipState === "zipping"}
              className="self-start inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition-transform hover:-translate-y-0.5 disabled:opacity-70"
              style={{ ...fB, fontSize: 12, background: "#fff", color: T.ink, border: `1px solid ${T.line}` }}
            >
              {zipState === "zipping" ? <Spinner /> : zipState === "failed" ? <WarningIcon /> : <ZipDownloadIcon />}
              {zipState === "zipping" ? "Zipping…" : "Download .zip"}
            </button>
          ) : isSlideshow && downloadPhase === "failed" ? (
            <button
              type="button"
              onClick={download}
              title={downloadError?.message || "Could not load slides"}
              className="self-start inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition-transform hover:-translate-y-0.5"
              style={{ ...fB, fontSize: 12, background: "#fff", color: T.ink, border: `1px solid ${T.line}` }}
            >
              <RefreshIcon />
              Retry download
            </button>
          ) : isSlideshow && (
            <button
              type="button"
              disabled
              className="self-start inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold disabled:opacity-70"
              style={{ ...fB, fontSize: 12, background: "#fff", color: T.ink, border: `1px solid ${T.line}` }}
            >
              <Spinner />
              Downloading…
            </button>
          )}
          {ready && (
            <button
              type="button"
              onClick={analyze}
              className="self-start inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition-transform hover:-translate-y-0.5"
              style={{ ...fB, fontSize: 12, background: T.ink, color: "#fff" }}
            >
              <SparkleIcon />
              Analyze with Gemini
            </button>
          )}
          {/* Recreate: photo posts restage their stored slides; videos with a
              stored MP4 become slideshows (Gemini plans the cuts, ffmpeg
              extracts the frames, gpt-image recreates them without overlays). */}
          {!working && (isSlideshow ? slideshowImages.length > 0 : Boolean(mediaUrl)) && (
            <button
              type="button"
              onClick={startRecreate}
              disabled={recreating}
              title="Costs 2 credits. Gemini picks the cuts, gpt-image-2.5-sunburst recreates them without overlays."
              className="self-start inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition-transform hover:-translate-y-0.5 disabled:opacity-70"
              style={{ ...fB, fontSize: 12, background: "#fff", color: T.ink, border: `1px solid ${T.line}` }}
            >
              <SparkleIcon />
              {recreating ? "Recreating…" : recreationImages.length ? (isSlideshow ? "Recreate again" : "Recreate as slideshow again") : isSlideshow ? "Recreate slideshow" : "Make slideshow"}
            </button>
          )}
        </div>
        {recreationImages.length > 0 && (
          <div className="flex items-center gap-1.5" style={{ ...fM, fontSize: 11, color: T.muted }}>
            <button type="button" onClick={() => setShowRecreated(false)} style={{ fontWeight: showRecreated ? 400 : 700, color: showRecreated ? T.muted : T.ink }}>
              {isSlideshow ? "Original" : "Video"}
            </button>
            <span>/</span>
            <button type="button" onClick={() => setShowRecreated(true)} style={{ fontWeight: showRecreated ? 700 : 400, color: showRecreated ? T.ink : T.muted }}>
              {isSlideshow ? "Recreated" : "Slides"}
            </button>
          </div>
        )}
        {recreatePhase === "failed" && recreateError && (
          <button
            type="button"
            onClick={startRecreate}
            title={recreateError.message}
            className="self-start inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold"
            style={{ ...fB, fontSize: 12, background: "#fff", color: "#B3261E", border: "1px solid #B3261E" }}
          >
            Retry recreate
          </button>
        )}
        {(mediaUrl || isSlideshow) && (phase === "queued" || phase === "running") && (
          <div className="flex items-center gap-1.5" style={{ ...fB, fontSize: 12, color: T.muted }}>
            <Spinner />
            Analyzing…
          </div>
        )}

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
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowAnalysis(true)}
                className="font-semibold underline decoration-dotted underline-offset-2"
                style={{ ...fB, fontSize: 12, color: T.teal }}
              >
                View analysis →
              </button>
              <IconButton
                icon={<RefreshIcon />}
                label="Re-analyze this video"
                disabled={busy}
                onClick={retry}
              />
            </div>
          </div>
        )}

        {/* Hook-test entry — keyed off server truth from the gallery payload
            (analyzedBy / hookTest), so it doesn't depend on hover hydration.
            Analyzed + no ACTIVE test -> offer the paid start (an archived
            won/closed test doesn't block a fresh one); tested -> the badge
            above is the way in. */}
        {card.analyzedBy != null && !(card.hookTest && ACTIVE_TEST_STATUSES.has(card.hookTest.status)) && (
          <button
            type="button"
            onClick={() => setStartOpen(true)}
            data-testid="start-hook-test"
            className="self-start rounded-md px-2.5 py-1.5 font-semibold transition-transform hover:-translate-y-0.5"
            style={{ ...fB, fontSize: 12, border: "1.5px solid #7C5CFF", color: "#7C5CFF", background: "transparent" }}
          >
            🧪 Test hooks on this video · 2cr
          </button>
        )}

        <a href={card.url} target="_blank" rel="noreferrer" style={{ ...fM, fontSize: 11, color: T.muted }}>
          open on TikTok
        </a>
      </div>

      {showAnalysis && detail?.analysis && (
        <AnalysisModal detail={detail} onClose={() => setShowAnalysis(false)} onSeek={seekAndPlay} />
      )}

      {startOpen && (
        <StartHookTestDialog
          accessToken={accessToken}
          workspaceId={workspaceId}
          videoId={card.id}
          onClose={() => setStartOpen(false)}
          // Success AND "already open" (409) both land here — the panel shows
          // whichever test the server has.
          onStarted={() => {
            setStartOpen(false);
            setTestOpen(true);
          }}
        />
      )}
      {testOpen && (
        <HookTestPanel
          accessToken={accessToken}
          workspaceId={workspaceId}
          videoId={card.id}
          onClose={() => setTestOpen(false)}
        />
      )}
    </article>
  );
}
