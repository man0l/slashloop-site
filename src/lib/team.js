// Client for the team roster endpoints (/api/workspaces/:id/members on the
// connector at VITE_MCP_URL). A workspace owner invites teammates by email;
// each teammate keeps their own Google login and gets full access to every
// workspace they're invited to (no roles yet — membership is the only gate).

import { apiFetch, ApiError } from "./http.js";

export const TeamApiError = ApiError;

/** GET /api/workspaces/:id/members -> { members: [{ id, email, createdAt }] } */
export function listWorkspaceMembers(accessToken, workspaceId, signal) {
  return apiFetch(`/api/workspaces/${workspaceId}/members`, { accessToken, signal });
}

/** POST /api/workspaces/:id/members { email } -> { id, email, createdAt } */
export function inviteWorkspaceMember(accessToken, workspaceId, email) {
  return apiFetch(`/api/workspaces/${workspaceId}/members`, {
    method: "POST",
    accessToken,
    body: { email },
  });
}

/** DELETE /api/workspaces/:id/members?email=… -> { ok: true } */
export function removeWorkspaceMember(accessToken, workspaceId, email) {
  return apiFetch(
    `/api/workspaces/${workspaceId}/members?email=${encodeURIComponent(email)}`,
    { method: "DELETE", accessToken },
  );
}

/**
 * POST /api/workspaces?action=invite-all { email }
 * -> { email, workspaces: [{ id, name, status }] }
 * One invite covering every workspace the caller owns; the teammate signs up
 * with that email and all of them appear in their switcher.
 */
export function inviteToAllWorkspaces(accessToken, email) {
  return apiFetch(`/api/workspaces?action=invite-all`, {
    method: "POST",
    accessToken,
    body: { email },
  });
}
