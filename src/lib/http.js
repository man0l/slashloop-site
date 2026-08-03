// Shared fetch wrapper for the connector's JSON API at VITE_MCP_URL — same
// origin the MCP server serves from (mcp.slashloop.dev), same Supabase user
// as the MCP tools. Extracted out of api.js's billingFetch so
// workspaces.js/sources.js/gallery.js don't each re-implement auth headers
// and error shaping.

const MCP_URL = (import.meta.env.VITE_MCP_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch(path, { method = "GET", accessToken, body } = {}) {
  if (!MCP_URL) {
    throw new ApiError("VITE_MCP_URL is not set — see .env.example.", 0);
  }
  if (!accessToken) {
    throw new ApiError("Not signed in.", 401);
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
      throw new ApiError(
        "API endpoint not found — check VITE_MCP_URL points at the connector (mcp.slashloop.dev).",
        404,
      );
    }
    let payload;
    try { payload = await res.json(); } catch { /* not JSON */ }
    // Servers send a human `message` alongside the machine-readable `error`
    // code (e.g. "workspace_limit_reached") — prefer the former for display,
    // keep the code around for callers that want to branch on it.
    const detail = payload?.message || payload?.error || "";
    throw new ApiError(detail || `Request failed (${res.status})`, res.status, payload?.error);
  }

  return res.json();
}
