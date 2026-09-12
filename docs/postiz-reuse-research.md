# Reusing Postiz for multi-platform post scheduling on Cloudflare (Workers + D1)

Research on [gitroomhq/postiz-app](https://github.com/gitroomhq/postiz-app) (inspected 2026-09-12, shallow clone of `master`), to answer: what can we reuse for scheduling posts to TikTok / YouTube / Instagram (+ more later) **without Redis, Temporal, Postgres, or a Node server** — i.e. on a Cloudflare Worker + D1 (+ R2).

## TL;DR

- Postiz's **provider layer is exactly the part worth taking**: ~26k lines of self-contained TypeScript classes that encode each platform's OAuth, upload API, error taxonomy, and settings. It's the "API knowledge" that normally takes weeks of doc-reading per platform.
- Its scheduling engine (Temporal + Postgres/Prisma + NestJS + Redis leftovers) is **not worth taking** — and doesn't need to be. The pattern it evolved into (`postPending → checkPostStatus → finalizePost` with durable polling) ports 1:1 onto **Cloudflare cron trigger + D1 state machine** (simplest) or **Cloudflare Workflows** (if we want full durable pipelines later).
- **License stop-sign: Postiz is AGPL-3.0.** Copying its code into the `slashloop` worker makes that service AGPL-obligated (network copyleft → we'd have to offer source to users of slashloop.dev). Practical options: treat the provider files as **reference documentation and write our own thin clients** from the official platform APIs, or open-source the posting worker. Don't vendor the code into a closed worker.
- The real-world overhead is not infrastructure anyway: TikTok, Meta and Google all require registered developer apps + (for public posting) app review/audit. That part is unavoidable no matter what library we use.

## 1. What Postiz actually is (2026 architecture)

Monorepo, pnpm workspaces:

| Piece | Tech | Relevant? |
|---|---|---|
| `apps/frontend` | Next.js 16 + Mantine | No |
| `apps/backend` | NestJS + Prisma/Postgres + Redis (ratelimit/ioredis) | No |
| `apps/orchestrator` | **Temporal** workflows (they migrated off BullMQ cron-scanning) | No (pattern only) |
| `libraries/nestjs-libraries/src/integrations/social/*` | Plain TS classes over `fetch` | **Yes — the gold** |
| `apps/sdk`, `apps/extension`, AI agents (LangChain/Mastra), Stripe, plugs, analytics | — | No |

Scheduling flow today: user saves a post → backend writes Post rows → immediately starts a Temporal workflow that **sleeps (durable timer) until `publishDate`**, then posts, handles token refresh, polls processing statuses, sends notifications. There is no Redis queue scanning anymore (BullMQ/ioredis deps are leftovers from the old design).

## 2. The reusable core: the provider layer

Location: `libraries/nestjs-libraries/src/integrations/social/` + `integrations/social.abstract.ts` + `dtos/posts/providers-settings/*.dto.ts`

### 2.1 The provider contract (`social.integrations.interface.ts`, 227 lines)

```ts
interface SocialProvider {
  // metadata: identifier, name, scopes[], maxLength(), editor, dto, isBetweenSteps ...
  // auth:
  generateAuthUrl(): { url, state, codeVerifier };
  authenticate({ code, codeVerifier }): AuthTokenDetails;   // token exchange + profile fetch
  refreshToken(refreshToken): AuthTokenDetails;
  // validation:
  checkValidity(media, settings): string | true;
  // publishing lifecycle — the important design:
  postPending(...): PostResponse[];        // do the upload, return { status: 'pending', pendingData }
  checkStatus?  // checkPostStatus(accessToken, pendingData): 'pending' | 'ready' | 'completed'
  finalizePost(...);                        // remaining mutations (publish container, thumbnail, …)
}
```

Key insight: Postiz deliberately made publishing **non-blocking and resumable**: `postPending` starts an irreversible upload and returns opaque `pendingData`; the engine polls `checkPostStatus` with durable timers; `finalizePost` performs the last mutations with an explicit contract that a retry must never duplicate a post. This contract maps directly onto Cloudflare Workflows steps — and onto a D1 state machine (each check = one tick).

### 2.2 What each provider encodes (the part that's genuinely expensive to write from scratch)

Inspected in detail:

- **TikTok** (`tiktok.provider.ts`, 1209 lines): OAuth (`open.tiktokapis.com/v2/oauth/token`, PKCE-ish state, scopes list), chunked **FILE_UPLOAD** flow (init call → `upload_url` → PUT chunks with `Content-Range`, 5–64MB chunk rules, 10MB default), photos only via **PULL_FROM_URL**, `DIRECT_POST` vs `UPLOAD` semantics, privacy levels, duet/stitch/AIGC/brand toggles, status polling (`publish/status/fetch` → `PUBLISH_COMPLETE` / `SEND_TO_USER_INBOX` / `FAILED`), and a 25-case `handleErrors` string taxonomy (spam risk, rate limits, `reached_active_user_cap` → reconnect, unaudited-app → private posts only…).
- **YouTube** (`youtube.provider.ts`, 1037 lines): Google OAuth, **resumable upload session** (`uploadType=resumable`, `X-Upload-Content-Length` → `Location` URI), probe-with-`Content-Range: bytes */size` to resume at exact offset, thumbnail setting after upload, quota errors (`uploadLimitExceeded`), settings (title/tags/privacy/made-for-kids).
- **Instagram** (`instagram.provider.ts`, 1255 lines): Meta Graph (both `graph.facebook.com` and `graph.instagram.com` login variants), container flow (create container by **media URL** → poll `status_code` → `media_publish`), carousel/story/single, collaborators, audio config; no byte streaming needed.
- Plus facebook, threads, linkedin, pinterest, reddit, bluesky, x, mastodon, telegram, etc. — same shape (30+ providers, ~26k lines total).

### 2.3 Shared machinery worth mimicking (`social.abstract.ts`, 574 lines)

- `fetch()` wrapper: retry ×3 on 429/500/rate-limit with 5s backoff, then classify errors via the provider's `handleErrors` into **`RefreshToken` / `Disconnect` / `BadBody`** exceptions — the engine knows what to do with each (refresh token → retry; disconnect → notify user; bad body → fail post with human message). This error triad is a great idea, keep it.
- `mediaSize` / `mediaChunk` / `mediaStream`: HEAD for size, ranged GET for one chunk, stream for body — all with 206-status guards. On Workers these become 15 lines over R2 range reads.
- `checkScopes`, DTO validation, `maxLength`.

### 2.4 Node coupling (what blocks a direct copy anyway)

Even ignoring the license, the provider files need porting: `createReadStream`/`statSync` (local fs — replace with R2 range reads), `process.env` (Worker env bindings), undici `dispatcher` (SSRF guard — unnecessary on Workers), `sharp` (image resize — not available; do thumbnails client-side or via Cloudflare Images), `dayjs`/`Buffer` (fine on Workers), Temporal `setHeartbeatDetails` (delete). Roughly 5–10% of lines; the API logic is portable.

## 3. The license problem (read this before copying anything)

Postiz is **AGPL-3.0** (LICENSE + package.json `"license": "AGPL-3.0"`).

- AGPL §13 (network use): if slashloop's worker serves users and contains Postiz-derived code, we must offer that worker's complete source to those users.
- "We only borrowed the TikTok upload function" is still derivative work territory, especially since provider classes are pasted nearly verbatim with our edits.

Options, in order of recommendation:

1. **Read as documentation, write own clients.** The underlying knowledge (endpoints, params, chunking rules, error codes) comes from TikTok/Meta/Google public docs anyway — facts aren't copyrightable; expression is. Writing clean clients with our own naming/structure, using Postiz as a cross-check for gotchas (e.g. TikTok 206-handling, YouTube probe-before-resume, IG container expiry), gives us ~90% of the value with zero license risk. The files are short enough to "port with a rewrite" at maybe 200–350 lines per platform.
2. **Open-source the posting worker** (AGPL-compliant vendor). Only if we don't mind publishing slashloop backend logic.
3. Not viable: closed-source worker with vendored Postiz code.

Also fine: the *patterns* (state machine, error triad, pendingData, DTO shapes) are unprotectable ideas — design the same way.

## 4. Mapping Postiz → Cloudflare

| Postiz (Temporal/Postgres/NestJS) | Our replacement (Workers) |
|---|---|
| Temporal workflow sleeping until `publishDate` | **Cron trigger every minute** scanning D1 for due posts (or a Cloudflare Workflow per post — see §5) |
| Post/Submission rows (Prisma/Postgres) | `posts` + `integrations` tables in **D1** |
| Activity retries (Temporal retry policy) | `attempts` column + backoff in the cron handler (or Workflow step retries) |
| `postPending → checkPostStatus → finalizePost` polling loop with durable timers | Cron tick processes pending posts: re-check status, publish containers, finalize; state stored in D1 |
| Redis (state, redirects, ratelimit) | Not needed. OAuth `state` → signed cookie or short-lived D1 row |
| Local fs / ranged GET for media bytes | **R2** objects with range reads; streaming body into `fetch()` |
| `PULL_FROM_URL` media (TikTok photos, IG containers) | Public R2 URLs (or a serving route on our worker) |
| `refreshTokenWorkflow` per integration (`refreshCron`) | Daily cron: `SELECT … WHERE tokenExpiration < now + 2d` → refresh → update D1; on failure set `refreshNeeded=1` |
| NestJS controller OAuth routes | Worker routes `GET /oauth/:provider/start`, `GET /oauth/:provider/callback` |
| `handleErrors` string taxonomy | Port concept: map known error substrings → `refresh` / `reconnect` / `fail(msg)` / `retry` |

### Scheduling design (the "no Redis/Temporal" answer)

Two viable shapes, both Postiz-pattern-compatible:

**A. Cron + D1 state machine (recommended start, zero extra paid features)**

```
cron every 1 min:
  1. posts WHERE state='QUEUE' AND publishDate <= now  → state='PROCESSING'
  2. posts WHERE state='PROCESSING'                    → advance pending flow
     (checkPostStatus → finalizePost → PUBLISHED | attempts++ → back off | ERROR)
  3. integrations WHERE tokenExpiration < now+2d       → refreshToken
```

Post row carries `pendingData` JSON exactly like Postiz (TikTok `publishId`, YouTube `uploadUri`+`uploadedBytes`, IG `containers[]`). Each cron tick is idempotent because every platform step is guarded by the probe/check contract Postiz worked out. Concurrency naturally bounded by how many rows the tick processes. Worst-case publish latency = 1 minute (fine for social).

**B. Cloudflare Workflows** (if/when step retries + long polls get annoying in cron form): one Workflow instance per post — `step.sleepUntil(publishDate)`, upload step with `retry: {maxAttempts:3}`, poll loop `step.sleep(20s)`. This is the closest analogue to Postiz's `postWorkflowV1xx` (sleep → post → refresh-on-`RefreshToken` → notify → optional repeat with `intervalInDays` → child workflow). Caveats: an extra moving part (available on Free & Paid plans, so no license gate — but step CPU/duration limits still apply). It buys durable *wait*-ing, which we don't need until repeatable posts/analytics come in.

D1 schema sketch (mirrors Postiz, minus multi-tenant cruft):

```sql
CREATE TABLE integrations (
  id TEXT PRIMARY KEY, user_id TEXT, provider TEXT,         -- 'tiktok' | 'youtube' | 'instagram'
  internal_id TEXT, profile TEXT, name TEXT, picture TEXT,
  token TEXT, refresh_token TEXT, token_expires_at INTEGER, -- epoch s
  refresh_needed INTEGER DEFAULT 0, disabled INTEGER DEFAULT 0,
  UNIQUE (user_id, provider, internal_id)
);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  group_id TEXT,                       -- one user submission = N posts (one per platform)
  user_id TEXT, integration_id TEXT,
  state TEXT DEFAULT 'QUEUE',          -- QUEUE | PROCESSING | PUBLISHED | ERROR | DRAFT
  publish_date INTEGER,
  content TEXT, settings TEXT,         -- JSON: platform-specific DTO (privacy, duet, tags…)
  media TEXT,                          -- JSON: [{type, path(R2), alt, thumbnail}]
  pending_data TEXT,                   -- JSON: resumable-upload state (publishId / uploadUri / containers)
  release_id TEXT, release_url TEXT, error TEXT,
  attempts INTEGER DEFAULT 0, interval_days INTEGER,
  created_at INTEGER, updated_at INTEGER
);
CREATE INDEX idx_posts_due ON posts (state, publish_date);
```

Worker layout (target repo: `slashloop` worker at mcp.slashloop.dev):

```
src/social/
  types.ts          // PostDetails, MediaContent, PostResponse, PendingCheck (mirror the Postiz contract)
  abstract.ts       // providerFetch() w/ retry + error triad (RefreshTokenError / BadBodyError / ReconnectError)
  tiktok.ts  youtube.ts  instagram.ts   // register(): generateAuthUrl, authenticate, refreshToken,
                                        // postPending, checkPostStatus, finalizePost, checkValidity
  registry.ts       // provider map — "many more if I choose" = add file + entry
  engine.ts         // cron handler: due posts → PROCESSING → advance; token refresh scan
routes: /oauth/:provider/start | /callback | POST /posts (create group) | DELETE /posts/:id
```

### Workers runtime notes

- Byte uploads: TikTok streams chunk bodies (10MB) and YouTube resumes in batches — one 10–25MB buffer at a time fits Workers memory fine; `R2.get(key, { range })` gives the bytes; `fetch(url, { body: stream })` works (Workers fetch supports streaming request bodies).
Workers runtime limits (verified against developers.cloudflare.com/workers/platform/limits, 2026-09-12):

- Subrequests: 50/invocation (free), **10,000** (paid) — a 1GB TikTok video ≈ 100 PUTs, fine on paid even accounting for other calls; on free plan the 50-subrequest cap means keep uploads ≲ 400MB per post.
- **CPU time: 10ms (free) vs 30s for cron triggers on intervals < 1h (paid).** The engine's work is I/O-bound (uploads, API calls) so CPU is comfortable on paid, but 10ms on free is effectively too little for the engine tick — the cron design realistically assumes **Workers Paid ($5/mo)**.
- Wall clock per cron invocation: 15 min — plenty, but bound the batch size per tick (process N due posts, leave the rest for the next minute) so a pathological batch can't hit the cap mid-upload.
- Memory 128MB/isolate — one 10–25MB chunk buffer at a time fits easily.
- `Buffer`/Web streams available; `sharp` is not — do image transforms client-side (we already have the slideshow pipeline) or with Cloudflare Images/Workers AI if ever needed.
- Cron minimum interval is 1 minute, accuracy ±1 min, and config changes take up to 15 min to propagate after deploy (deploy-time caveat, not runtime).

## 5. The unavoidable part: platform app registration

Per-platform developer apps + review — Postiz can't help here, and their error strings show the pain (TikTok `unaudited_client_can_only_post_to_private_accounts`, `reached_active_user_cap`; YouTube `uploadLimitExceeded`; IG needs a Business/Creator account + Meta review for `instagram_content_publish`):

- **TikTok**: developer app, Content Posting API; unaudited apps can post only to private accounts until audited.
- **Instagram**: Meta app + IG Business/Creator account (linked FB Page for `graph.facebook.com` login); App Review for content publish scopes.
- **YouTube**: Google Cloud OAuth client + `youtube.upload` scope; API audit needed beyond default quota.

Plan for sandbox/test accounts during development.

## 6. Effort estimate

| Step | Scope |
|---|---|
| 1. Skeleton: D1 schema, engine cron, OAuth routes, registry | ~1–2 days |
| 2. TikTok client (rewrite, Postiz as reference) | ~1–2 days incl. dev app setup |
| 3. YouTube client | ~1–2 days |
| 4. Instagram client | ~1–2 days + Meta review lag |
| 5. Frontend: connect buttons + schedule UI on slashloop site | ~1–2 days |

Postiz saves roughly 60–70% of the "figure out each API" time; it cannot save the license-decision and app-review time.

## Appendix: files to consult when writing each client

- Contract: `libraries/nestjs-libraries/src/integrations/social/social.integrations.interface.ts`
- Fetch/retry/error-triad: `libraries/nestjs-libraries/src/integrations/social.abstract.ts`
- TikTok: `…/social/tiktok.provider.ts` + `dtos/posts/providers-settings/tiktok.dto.ts`
- YouTube: `…/social/youtube.provider.ts` + `youtube.settings.dto.ts`
- Instagram: `…/social/instagram.provider.ts` + `instagram.dto.ts`
- Engine pattern: `apps/orchestrator/src/workflows/post-workflows/post.workflow.v1.0.5.ts` (sleep→post→refresh→notify→repeat)
- Token refresh lifecycle: `libraries/nestjs-libraries/src/integrations/refresh.integration.service.ts`
- Data model: `libraries/nestjs-libraries/src/database/prisma/schema.prisma` (`Post`, `Integration`, `State`)
