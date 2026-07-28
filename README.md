# slashloop-site

Marketing + billing site for [slashloop](https://github.com/man0l/slashloop).
React + Vite + Tailwind + React Router. Deployed on Vercel.

Auth is Supabase, shared with the MCP server — signing in here and calling
the MCP's tools uses the same account. Checkout, the billing portal, and
credit-balance reads all happen through the MCP's `/api/billing/*` routes;
this site holds no Stripe key and no database connection of its own (see
`docs/stripe-implementation-plan.md` in the slashloop repo for why).

```bash
npm install
cp .env.example .env.local   # fill in the Supabase project + MCP URL below
npm run dev                  # local dev
npm run build                # production build -> dist/
```

## Env

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Same Supabase project as the MCP server |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/publishable key |
| `VITE_MCP_URL` | Deployed MCP server base URL (billing routes live under it) |

Vite only exposes env vars prefixed `VITE_` to the browser.

## Routes

| Path | Purpose |
|---|---|
| `/` | Marketing homepage |
| `/pricing` | Plans + checkout |
| `/login` | Supabase email/password sign in & sign up |
| `/account` | Plan, credit balance, billing portal link |
| `/billing/success` | Stripe Checkout return — polls for the webhook to land |
| `/billing/cancel` | Stripe Checkout cancel return |

`vercel.json` rewrites everything to `/index.html` so these survive a direct
load or refresh — required for Stripe's redirect back to `/billing/success`.

## Status

The billing UI (checkout button, account page, success polling) calls
`{VITE_MCP_URL}/api/billing/checkout|portal|status`. Those routes are Phase 2
of the MCP's billing rollout and don't exist on the deployment yet — calls
will fail with a friendly "not live yet" message until they ship. The UI is
built against the documented contract so it lights up as soon as they do.
