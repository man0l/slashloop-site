// indiestack AI-bot tracking, server-side. Bots are pre-filtered inside the
// package (user-agent + document paths only), so this middleware is a no-op
// pass-through for human traffic and static assets — the tracking call never
// even fires for them. websiteId is the site's public analytics token (the
// same data-site value in index.html), not a secret.
import { trackAIBotRequest, type AIBotOptions } from 'indiestack-ai-bots';
import { next } from '@vercel/functions';

type WaitUntil = { waitUntil: (p: Promise<unknown>) => void };

/** Factory so tests can inject `onEvent` instead of hitting the worker. */
export function createAIBotMiddleware(opts: AIBotOptions) {
  return async function middleware(request: Request, context: WaitUntil) {
    await trackAIBotRequest(request, context, opts);
    return next();
  };
}

export default createAIBotMiddleware({ websiteId: '3bbb58275fd1433cae14d4f7b36d575a' });

// Skip hashed build assets and images — bots requesting those tell us nothing,
// and the matcher keeps them from ever paying a middleware invocation.
// robots.txt / llms.txt / sitemap.xml are deliberately NOT excluded: crawler
// document fetches are exactly what we want to see.
export const config = {
  matcher: [
    '/((?!.*\\.(?:css|js|mjs|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp4|webm|mp3|pdf|zip|json)).*)',
  ],
};
