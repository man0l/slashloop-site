// Client for the MCP server's billing routes (docs/stripe-implementation-plan.md
// §5 in the slashloop repo). All three are Phase 2 work and don't exist on the
// MCP deployment yet — calls here will 404 until that ships. That's expected,
// not a bug in this client.

const MCP_URL = (import.meta.env.VITE_MCP_URL ?? "").replace(/\/$/, "");

export class BillingApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "BillingApiError";
    this.status = status;
  }
}

async function billingFetch(path, { method = "GET", accessToken, body } = {}) {
  if (!MCP_URL) {
    throw new BillingApiError("VITE_MCP_URL is not set — see .env.example.", 0);
  }
  if (!accessToken) {
    throw new BillingApiError("Not signed in.", 401);
  }

  const res = await fetch(`${MCP_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new BillingApiError(
        "Billing isn't live on the server yet. Try again once Stripe checkout ships.",
        404,
      );
    }
    let detail = "";
    try { detail = (await res.json())?.error ?? ""; } catch { /* not JSON */ }
    throw new BillingApiError(detail || `Request failed (${res.status})`, res.status);
  }

  return res.json();
}

/** POST /api/billing/checkout -> { url }. planKey: "creator" | "pro". interval: "month" | "year". */
export function createCheckoutSession(accessToken, { planKey, interval } = {}) {
  return billingFetch("/api/billing/checkout", {
    method: "POST",
    accessToken,
    body: { planKey, interval },
  });
}

/** POST /api/billing/portal -> { url } */
export function createPortalSession(accessToken) {
  return billingFetch("/api/billing/portal", { method: "POST", accessToken });
}

/** GET /api/billing/status -> { planKey, planCredits, packCredits, periodEnd, billingStatus } */
export function getBillingStatus(accessToken) {
  return billingFetch("/api/billing/status", { accessToken });
}
