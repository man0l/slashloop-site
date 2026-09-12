# POC plan: video → TikTok slideshow via Gemini cut-plan + ffmpeg frames + gpt-image-2.5-sunburst

Status: **implemented 2026-09-12 (variants A1+A2, B1, C1, D1) — not yet deployed.**
Workers-native variant also implemented (Stream as frame server — see "Workers path" below), same deploy-gate: needs a Stream-scoped `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_STREAM_TOKEN` on the CF worker.

## Workers path: Cloudflare Stream as the frame server (2026-09-12)

Pure-workerd alternative to the ffmpeg leg, stepped by the every-minute drain
tick (`api/jobs/analyze.ts`) so no tick exceeds the cheap-job budget:

- `src/lib/stream-frames.ts` — Stream client: `stream/copy` from the signed
  R2 URL (video bytes never pass through the Worker), `readyToStream` status
  (processing can take ~5 min), `thumbnails/thumbnail.jpg?time=<t>s&height=1080`
  per planned timestamp, delete (stops the ~$5/1000-min storage billing).
- `src/lib/recreate-video-stream.ts` — the state machine, persisted in the
  job's payloadJson: `plan` (Gemini from MP4 bytes — `uploadWithBuffer`,
  workerd-safe) → `copy` → `wait` → `slides` (one gpt-image recreation per
  tick, each slide straight to R2) → finalize (`stampRecreationKeys`) +
  Stream delete. Atomic `UPDATE..RETURNING` claim mirrors claimNextJob; a
  `stepAt` lease (90s) stops two tick isolates from advancing one job; failure
  mirrors the VPS money path (failJob → refund once terminal) and deletes the
  Stream copy.
- The plan prompt moved to `src/lib/slideshow-plan-prompt.ts` (TS constant —
  workerd cannot read prompts/*.md from disk; the .md was removed).
- Both executors race for the same MediaJob row: the VPS drainer claims
  `recreate` and runs ffmpeg; the CF drain steps video-mode rows only when
  Stream creds exist (`CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_STREAM_TOKEN` or
  a Stream-scoped `CLOUDFLARE_API_TOKEN`). No creds → rows stay queued for
  the VPS path. Because the whole-queue `*/1` drain cron is deliberately OFF
  (it raced Contabo for D1), the stepper got its own light trigger: the `*/2`
  cron hits `POST /api/jobs/video-recreate` (`src/cf/video-recreate-cron.ts`,
  registered in `src/cf/router.ts`) — one phase per job per tick, no other
  claims, no sweeps.
- Tests: `stream-frames.test.ts` (client contract, injected fetch) +
  `recreate-video-stream.test.ts` (full journey across ticks, fallback plan,
  interrupted-finalize, failure→refund→cleanup). 449/449 suite green; CF
  worker bundles clean (`wrangler deploy --dry-run`).
- Live Stream verification is blocked on a Stream-scoped token (wrangler's
  OAuth has no Stream scope — 401); the token must land as a CF worker var
  before the path activates.

## Results (POC run, 2026-09-12)

3 stored videos → 9 slides, total image-gen spend **$0.14** (~$0.014–0.017/slide):
- `0a3693ed` @noir3783 (13s, "PSL ratings") → 4 slides; Gemini caught the
  "fades look better bro" hook text at t=0.5 and the recreation dropped it.
- `415a38cf` @taylorlostit (16s, transformation) → 4 slides; the persistent
  "just a reminder that it is possible" overlay is gone from every slide.
- `d0886e8a` @pinkkoalas33 (10s meme) → 1 planned slide ("I'm genuinely
  terrified" removed); short clips under-delivering slides motivated the
  `planTimestamps` top-up added after this run.
All 9 slides eyeballed: no watermarks, no logos, no play buttons, no burned-in
text; scenes match the Gemini drawing briefs.

## Implementation map (what actually landed)

- `prompts/slideshow-plan.v1.md` (new) — the B1 cut-decision prompt.
- `src/lib/recreate-slideshow.ts` — `planVideoSlides` (reuses the analyze
  Gemini Files handle when fresh), `normalizeSlidePlan`, `fallbackIntervalPlan`,
  `planTimestamps` (min-3 top-up), `extractVideoFrames` (ffmpeg, 1080w JPEGs),
  `buildVideoSlidePrompt` (overlay-dropping), `recreateVideoSlideshow`, and the
  `recreateSlideshowForVideo` dispatcher branch (photo path untouched).
- `src/analysis/gemini-native.ts` — `callGeminiGenerate`/`isStaleFileError`
  exported, `uploadWithFileName` made public (same upload path as Analyze).
- `src/lib/video-service.ts` — endpoint accepts videos with a stored MP4
  (`no_media` error instead of `not_slideshow`); enqueue stamps `mode: video`.
- `src/lib/jobs.ts` — recreate timeout 240s → 420s; `enqueueRecreateJob` payload.
- `worker/Dockerfile` — ffmpeg added to the image.
- Site: `GalleryCard.jsx` — videos with recreations get the slides stage
  ("Video / Slides" toggle), zip button, and a "Make slideshow" action on
  stored MP4s; 8-minute client poll cap. `video.js` detail JSDoc updated.
- Tests: `recreate-slideshow.test.ts` (prompt/plan/timestamps), timeout
  assertion updated. slashloop 435 pass / 0 fail; site vitest 129 pass with
  only the known pre-existing Discover failures (full-suite runs are flaky in
  the WIP tree independent of these changes).

## Deploy requirements (pending)

1. **The prod worker has no `OPENROUTER_API_KEY` at all** (checked the running
   container) — even the photo-post recreate path fails with `not_configured`
   today. Add the key to the worker env on contabo (`/slashloop-worker/.env`,
   referenced by `/root/salonease/docker-compose.prod.yml`) and restart, or
   rebuild so the CI-baked secret lands. It IS set as a GitHub Actions secret.
2. Rebuild + redeploy the worker image (picks up ffmpeg + the video branch).
3. Vercel redeploy for the API + site.

## Idea

Turn a stored TikTok **video** into a photo-mode **slideshow**: Gemini (same model as
Analyze — `gemini-3.5-flash` via Files API) decides how many slides and where to cut,
ffmpeg extracts a keyframe per slide, then `gpt-image-2.5-sunburst` (OpenRouter)
recreates each frame with all burned-in overlays stripped: hooks, caption text,
TikTok watermark/logo, play buttons, any UI chrome.

## What already exists (roughly 70% of the plumbing is live)

| Piece | Where | State |
|---|---|---|
| `gpt-image-2.5-sunburst` slide restage | `slashloop/src/lib/recreate-slideshow.ts` → `generateOpenRouterImage({referenceUrl, quality:'low', 9:16})` | live for **photo posts** only |
| `POST /api/videos/:id/recreate` (2 credits, preauth → refund on fail) | `api/videos.ts` → `video-service.ts` `recreateSlideshowForWorkspace` | live, guarded by `isPhotoPost` |
| `recreate` MediaJob kind, 240s timeout, worker drain | `src/worker/process-job.ts:484`, `src/lib/jobs.ts:68` | live |
| Persisted recreations → R2 → `detail.recreationImages` | `media.ts` `persistRecreation` / `resolveRecreationUrls` | live |
| Card renders `recreationImages` as slides + zip download | `slashloop-site/src/components/GalleryCard.jsx` (`carouselImages`, `Slideshow`, `downloadSlideshowZip`) | live (WIP in tree) |
| Gemini video input | `src/analysis/gemini-native.ts`: upload stored MP4 to Files API, `gemini-3.5-flash`, JSON out; handle cached on the video row 40h (`liveGeminiFile`) | live for analyze |
| Stored MP4 → tmp file | `analysis/index.ts` `fetchStoredVideo(video.mediaKey, tmp)` | live |
| ffmpeg | — | **missing** (worker Dockerfile has no ffmpeg) |
| Slide-plan step for videos | — | **missing** |
| Recreate for videos | — | **missing** (`isPhotoPost` guard rejects) |
| Card: video showing recreated slides | — | small tweak needed |

## Target pipeline (wired variant)

```
video card (MP4 stored)
  → POST /recreate (preauth 2 credits, enqueue `recreate` job)
  → VPS worker:
      1. fetchStoredVideo(mediaKey) → tmp mp4
      2. Gemini slide-plan call (gemini-3.5-flash, reuse cached Files handle if fresh)
         new prompt prompts/slideshow-plan.v1.md →
         { slides: [{ tSec, description, overlayText }] }   // 4–8 slides
      3. ffmpeg: one JPEG per tSec
         ffmpeg -ss <t> -i tmp.mp4 -frames:v 1 -vf scale=1080:-2 -q:v 2 slide-N.jpg
      4. per frame → generateOpenRouterImage({ reference: frame, quality: 'low', 9:16 })
         prompt: recreate the scene cleanly; REMOVE all on-screen text/hooks,
         captions, watermarks, usernames, logos, play buttons, platform UI
      5. persistRecreation() → R2 + raw.recreationKeys/recreationModel
  → card polls detail → recreationImages render as slides → zip download works
```

## Variants

### A. Delivery shape

- **A1 — CLI proof (recommended stage 1).** Bun script in the `slashloop` repo
  (`_tmp_poc_video_slideshow.ts` style): takes videoIds, runs plan → ffmpeg →
  image-gen → persist, prints R2 URLs. No endpoint/UI/credits/queue changes, no
  Docker change for a first run (ffmpeg on the VPS host or local Windows ffmpeg).
  Half a day. Validates image quality before anything is wired.
- **A2 — Wire into prod queue (recommended stage 2, the real feature).** Pipeline
  above: relax the `isPhotoPost` guard to accept videos with a stored MP4, add the
  Gemini plan step + ffmpeg extraction inside the `recreate` job, bump job timeout,
  ffmpeg into `worker/Dockerfile`, small site tweaks. ~1–1.5 days after A1.
- **A3 — Client-side ffmpeg.wasm.** Browser downloads the MP4, extracts frames,
  uploads them for image-gen. No Docker change, but heavy browser work, a new
  frame-upload endpoint, poor mobile UX. Not recommended.

### B. How cut points are decided

- **B1 — Dedicated Gemini "slideshow plan" prompt (recommended).** Purpose-built
  call: pick 4–8 distinct, slideshow-worthy keyframes across the video
  (hook → payoff), one scene description each (feeds the image prompt), plus the
  overlay text found per frame (so we know what to drop). ~$0.001–0.002/video.
- **B2 — Reuse the existing Analyze output.** `analysisJson.shots[]` already has
  `timestampSec/description/onScreenText` — free when analysis exists, but shots
  are shot boundaries, not slideshow moments, and only exists for analyzed videos.
  Good fallback, weaker cuts.
- **B3 — Fixed-interval sampling.** N evenly spaced frames, no AI. Dumb, cheap;
  only as a smoke-test fallback.

### C. Frame transport into the image model

- **C1 — Inline data URL (recommended).** ffmpeg JPEG → base64 →
  `generateOpenRouterImage({ referenceUrl: 'data:image/jpeg;base64,…' })`. The
  OpenRouter call already forwards `image_url` verbatim. No extra storage, no
  orphaned objects.
- **C2 — Upload frames to R2, pass public URLs.** Matches the photo-post flow and
  keeps frames inspectable/debuggable, but every attempt leaves frame objects in
  the bucket.

### D. Card presentation once a video has recreations (A2 only)

- **D1 — Slides preview + toggle (recommended).** `carouselImages` currently only
  computes for `isSlideshow`; extend so a video with `recreationImages` offers a
  "view as slides / view video" toggle; zip button covers the slides.
- **D2 — Zip-only.** Card stays a video player; just add "Download recreated
  slides" when recreations exist. Smallest diff, least impressive demo.

## Recommendation

**A1 (CLI) → A2 (queue+UI), with B1 + C1 + D1.** Stage 1 exists to eyeball the
hard unknown — how well sunburst erases watermarks/hooks from real frames —
before any prod surface changes.

## Costs & limits

- Per video: Gemini plan ~$0.002 + N × gpt-image low. Photo flow already logs
  `costUsd` per slide — A1 prints real numbers; expect roughly $0.06–0.20 for 6
  slides.
- Credits: keep `recreateSlideshow: 2` for the POC; revisit (4?) once real slide
  counts settle.
- Recreate job timeout is 240s; video mode adds upload/poll (~20–60s) + ffmpeg
  (seconds) + N × ~15–25s gens → bump to ~420s for video-mode jobs or cap 6 slides.
- Gemini Files handle reuse (`liveGeminiFile`, 40h TTL) skips the re-upload when
  the video was analyzed recently; otherwise upload from the tmp MP4.

## Risks

- **Watermark/text removal quality is the main unknown** — TikTok watermarks are
  burned into pixels; sunburst usually paints over them but quality varies. A1
  exists to measure this. Strengthen the shared prompt line
  ("No TikTok UI, no watermarks, no platform chrome") with explicit
  remove-username/logo/play-button instructions.
- Dropping overlays also drops context (that's the point) — per-slide Gemini
  descriptions keep the recreation scene-accurate.
- Motion → stills: adjacent frames look alike; the plan prompt must demand
  distinct keyframes.
- Worker image change: one `apt-get install -y ffmpeg` line; needs the usual
  Docker rebuild + VPS redeploy. Both repos currently hold uncommitted WIP
  (multi-self accounts) — coordinate commits before the deploy.
- Keep the photo-post path untouched: `recreate-slideshow.test.ts` extended, not
  rewritten.

## Out of scope for the POC

Audio/music for the produced slideshow (TikTok adds sound at post time), batch
automation, MCP-tool surface, auto-posting to TikTok.

## Success criteria

- 2–3 test videos (talking-head, B-roll, text-heavy) each yield 4–8 slides in R2,
  rendered on the card, zippable.
- Slides visibly free of watermarks/logos/play buttons/burned-in text in the
  majority of frames (eyeball bar).
- Photo-post recreate still passes its tests.

## Files (expected)

Stage 1 (`slashloop`): `prompts/slideshow-plan.v1.md` (new),
`src/lib/recreate-slideshow.ts` (plan call + video-slide prompt + video branch),
`_tmp_poc_video_slideshow.ts` CLI.
Stage 2: `worker/Dockerfile` (+ffmpeg), `src/lib/video-service.ts` (guard relax +
mode), `src/lib/jobs.ts` (timeout), `api/videos.ts` (error mapping),
`slashloop-site`: `GalleryCard.jsx` (toggle), `src/lib/video.js` (types/copy),
tests both sides.

Deploy: worker image rebuild + VPS restart; Vercel redeploy (site + api).
